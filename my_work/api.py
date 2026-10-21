"""Dashboard data built from ERPNext's existing ToDo, Task and Workflow Action records.

Display only: reads are scoped here by the reporting line, and every link still opens the record
under ERPNext's own permissions (items a viewer cannot open are shown without a link).
"""

import hashlib
import html

import frappe
from frappe.model.workflow import get_workflow, is_transition_condition_satisfied
from frappe.utils import add_days, getdate, today

from my_work.hierarchy import get_team_users, is_work_manager
from my_work.settings import is_enabled

TASK_CLOSED = ("Completed", "Cancelled", "Template")


def check_enabled():
	if not is_enabled():
		frappe.throw(frappe._("My Work is disabled. Enable it in My Work Settings."), title=frappe._("Disabled"))


@frappe.whitelist()
def get_dashboard():
	check_enabled()
	user = frappe.session.user
	approvals = get_pending_approvals()

	my_todos = get_open_todos({"allocated_to": user, "reference_type": ("!=", "Task")})
	my_tasks = get_open_tasks([user])
	by_me = get_open_todos({"assigned_by": user, "allocated_to": ("!=", user)})

	data = {
		"cards": {
			"my_todos": len(my_todos),
			"my_todos_overdue": sum(t.is_overdue for t in my_todos),
			"my_tasks": len(my_tasks),
			"my_tasks_overdue": sum(t.is_overdue for t in my_tasks),
			"approvals": len(approvals),
			"by_me_open": len(by_me),
			"by_me_overdue": sum(t.is_overdue for t in by_me),
		},
		"my_todos": with_open_flag(my_todos[:15]),
		"my_tasks": with_open_flag(my_tasks[:15]),
		"approvals": approvals,
		"by_me": with_open_flag(by_me[:15]),
		"team": None,
		"team_scope": None,
	}

	# Work Managers track the whole company; everyone else, System Managers included,
	# tracks only their own reporting line.
	data["team_scope"] = "company" if is_work_manager(user) else "reporting_line"
	if team_users := get_team_users(user):
		data["team"], team_overdue = get_team_summary(team_users)
		data["team_overdue"] = with_open_flag(team_overdue)

	return data


@frappe.whitelist()
def get_member_items(member):
	"""Open To-Dos and Tasks on one team member, for the dashboard's team drill-down."""
	check_enabled()
	user = frappe.session.user
	if member != user and member not in get_team_users(user):
		frappe.throw(frappe._("{0} is not in your team.").format(member), frappe.PermissionError)
	return {
		"name": frappe.utils.get_fullname(member),
		"todos": with_open_flag(get_open_todos({"allocated_to": member, "reference_type": ("!=", "Task")}, limit=50)),
		"tasks": with_open_flag(get_open_tasks([member])[:50]),
	}


def with_open_flag(items):
	"""Mark which items the current user can open under ERPNext's standard permissions."""
	for r in items:
		# ERPNext leaves ToDos open when their document is deleted; point those at the ToDo itself.
		# Checking existence first also avoids "not found" messages from loading a missing doc.
		if r.open_doctype != "ToDo" and not frappe.db.exists(r.open_doctype, r.open_name):
			r.missing_reference = f"{r.open_doctype} {r.open_name}"
			if r.get("reference_type"):
				r.open_doctype, r.open_name = "ToDo", r.name
				r.route = f"/app/todo/{r.name}"
			else:
				r.can_open = False
				continue
		r.can_open = bool(frappe.has_permission(r.open_doctype, "read", doc=r.open_name))
	return items


def get_open_todos(filters, limit=None):
	"""Open ToDos with an is_overdue flag (ToDo.date is the due date)."""
	rows = frappe.get_all(
		"ToDo",
		filters={"status": "Open", **filters},
		fields=[
			"name",
			"description",
			"date",
			"priority",
			"allocated_to",
			"assigned_by",
			"reference_type",
			"reference_name",
		],
		order_by="date is null, date asc, creation desc",
		limit=limit,
	)
	return [decorate_todo(r) for r in rows]


def clean_text(value, length=140):
	"""Plain text for display: no tags, no HTML entities, single-spaced, trimmed at a word.

	Some ERPNext text is stored HTML-escaped once or more (e.g. "&lt;div&gt;..." or "&amp;apos;"),
	so strip and decode repeatedly until the text stops changing. The page escapes the result
	again when it renders it, so decoding here is safe.
	"""
	text = value or ""
	for _ in range(5):
		cleaned = html.unescape(frappe.utils.strip_html(text))
		if cleaned == text:
			break
		text = cleaned
	text = " ".join(text.split())
	return text if len(text) <= length else text[:length].rsplit(" ", 1)[0] + "…"


def decorate_todo(r):
	r.subject = clean_text(r.description) or r.name
	r.due_date = r.date
	r.is_overdue = int(bool(r.date and getdate(r.date) < getdate(today())))
	r.assignee_name = frappe.utils.get_fullname(r.allocated_to)
	r.assigner_name = frappe.utils.get_fullname(r.assigned_by) if r.assigned_by else ""
	if r.reference_type and r.reference_name:
		r.open_doctype, r.open_name = r.reference_type, r.reference_name
	else:
		r.open_doctype, r.open_name = "ToDo", r.name
	r.route = f"/app/{frappe.scrub(r.open_doctype).replace('_', '-')}/{r.open_name}"
	return r


def get_open_tasks(users):
	"""Open ERPNext Tasks assigned (via ToDo) to any of `users`."""
	if not users:
		return []
	task = frappe.qb.DocType("Task")
	todo = frappe.qb.DocType("ToDo")
	rows = (
		frappe.qb.from_(task)
		.join(todo)
		.on((todo.reference_type == "Task") & (todo.reference_name == task.name))
		.select(
			task.name,
			task.subject,
			task.status,
			task.priority,
			task.project,
			task.exp_end_date.as_("due_date"),
			todo.allocated_to,
			todo.assigned_by,
		)
		.where(todo.status == "Open")
		.where(todo.allocated_to.isin(users))
		.where(task.status.notin(TASK_CLOSED))
		.orderby(task.exp_end_date)
	).run(as_dict=True)
	for r in rows:
		r.is_overdue = int(
			r.status == "Overdue" or bool(r.due_date and getdate(r.due_date) < getdate(today()))
		)
		r.subject = clean_text(r.subject) or r.name
		r.assignee_name = frappe.utils.get_fullname(r.allocated_to)
		r.assigner_name = frappe.utils.get_fullname(r.assigned_by) if r.assigned_by else ""
		r.open_doctype, r.open_name = "Task", r.name
		r.route = f"/app/task/{r.name}"
	rows.sort(key=lambda r: (-r.is_overdue, r.due_date or getdate("9999-12-31")))
	return rows


@frappe.whitelist()
def get_pending_approvals():
	"""Workflow documents the current user can act on right now.

	Starts from Frappe's open Workflow Actions (already restricted to the user's roles), then
	keeps only documents whose current state still offers this user a transition they may take.
	Documents still in the workflow's starting state (Draft) are not yet submitted, so are skipped.
	"""
	user = frappe.session.user
	actions = frappe.get_list(
		"Workflow Action",
		filters={"status": "Open"},
		fields=["name", "reference_doctype", "reference_name", "workflow_state", "creation"],
		order_by="creation asc",
		limit_page_length=0,
	)

	# Every approve/reject closes the old Workflow Action and opens new ones, so the set of open
	# actions changes. Reuse the cached result only while that set is exactly the same.
	fingerprint = hashlib.sha1("|".join(sorted(a.name for a in actions)).encode()).hexdigest()
	cache_key = f"my_work:approvals:{user}"
	cached = frappe.cache.get_value(cache_key)
	if cached and cached.get("fingerprint") == fingerprint:
		return cached["result"]

	active = set(frappe.get_all("Workflow", filters={"is_active": 1}, pluck="document_type"))
	roles = set(frappe.get_roles(user))

	seen, result = set(), []
	for a in actions:
		key = (a.reference_doctype, a.reference_name)
		if key in seen or a.reference_doctype not in active:
			continue
		seen.add(key)
		if not frappe.db.exists(a.reference_doctype, a.reference_name):
			continue
		doc = frappe.get_doc(a.reference_doctype, a.reference_name)
		if not frappe.has_permission(doc=doc, ptype="read", user=user):
			continue
		workflow = get_workflow(doc.doctype)
		state = doc.get(workflow.workflow_state_field)
		if state != a.workflow_state:
			continue  # stale action: document has moved on
		if workflow.states and state == workflow.states[0].state:
			continue  # still in the starting state (e.g. Draft): not yet submitted for approval
		allowed = [
			t.action
			for t in workflow.transitions
			if t.state == state
			and t.allowed in roles
			and (t.allow_self_approval or doc.owner != user)
			and is_transition_condition_satisfied(t, doc)
		]
		if not allowed:
			continue
		result.append(
			{
				"doctype": doc.doctype,
				"name": doc.name,
				"title": clean_text(doc.get_title()) or doc.name,
				"state": state,
				"actions": list(dict.fromkeys(allowed)),
				"requested_by": frappe.utils.get_fullname(doc.owner),
				"waiting_since": a.creation,
				"route": f"/app/{frappe.scrub(doc.doctype).replace('_', '-')}/{doc.name}",
			}
		)

	# Expiry only covers role or permission changes, which do not touch Workflow Actions.
	frappe.cache.set_value(
		cache_key, {"fingerprint": fingerprint, "result": result}, expires_in_sec=600
	)
	return result


def get_team_summary(users):
	since = add_days(today(), -30)
	todo_stats = frappe.db.sql(
		"""
		select allocated_to as user,
			sum(status = 'Open' and ifnull(reference_type, '') != 'Task') as open_todos,
			sum(status = 'Open' and ifnull(reference_type, '') != 'Task' and date < %(today)s) as overdue_todos,
			sum(status = 'Closed' and modified >= %(since)s) as closed_30d
		from `tabToDo`
		where allocated_to in %(users)s
		group by allocated_to
		""",
		{"users": users, "today": today(), "since": since},
		as_dict=True,
	)
	stats = {r.user: r for r in todo_stats}

	tasks = get_open_tasks(users)
	task_open, task_overdue = {}, {}
	for t in tasks:
		task_open[t.allocated_to] = task_open.get(t.allocated_to, 0) + 1
		task_overdue[t.allocated_to] = task_overdue.get(t.allocated_to, 0) + t.is_overdue

	employees = {
		e.user_id: e
		for e in frappe.get_all(
			"Employee",
			filters={"user_id": ("in", users)},
			fields=["user_id", "employee_name", "department", "designation"],
		)
	}
	summary = []
	for u in set(users):
		e = employees.get(u) or frappe._dict()
		s = stats.get(u) or frappe._dict()
		summary.append(
			{
				"user": u,
				"name": e.employee_name or frappe.utils.get_fullname(u),
				"department": e.department,
				"designation": e.designation,
				"open_todos": int(s.open_todos or 0),
				"open_tasks": task_open.get(u, 0),
				"overdue": int(s.overdue_todos or 0) + task_overdue.get(u, 0),
				"closed_30d": int(s.closed_30d or 0),
			}
		)
	summary.sort(key=lambda r: (-r["overdue"], -(r["open_todos"] + r["open_tasks"]), r["name"] or ""))

	overdue_items = [t for t in tasks if t.is_overdue] + [
		t
		for t in get_open_todos(
			{"allocated_to": ("in", users), "reference_type": ("!=", "Task"), "date": ("<", today())},
			limit=20,
		)
	]
	return summary, overdue_items[:25]
