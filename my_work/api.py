import frappe
from frappe.utils import add_days, today

from my_work.permissions import get_subordinate_users, is_admin

OPEN = ["Open", "In Progress", "On Hold"]
CLOSED = ["Completed", "Approved", "Rejected"]
ITEM_FIELDS = [
	"name",
	"subject",
	"item_type",
	"status",
	"priority",
	"due_date",
	"is_overdue",
	"assigned_to",
	"assigned_to_name",
	"assigned_by_name",
]


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def assignable_users(doctype, txt, searchfield, start, page_len, filters):
	"""Active desk users with access to My Work, from any department."""
	like = f"%{txt}%"
	return frappe.db.sql(
		"""
		select u.name, concat_ws(' - ', u.full_name, e.department)
		from `tabUser` u
		left join `tabEmployee` e on e.user_id = u.name and e.status = 'Active'
		where u.enabled = 1 and u.user_type = 'System User'
			and u.name not in ('Administrator', 'Guest')
			and exists (select 1 from `tabHas Role` r where r.parent = u.name and r.parenttype = 'User'
				and r.role in ('My Work User', 'My Work Manager', 'System Manager'))
			and (u.name like %(like)s or u.full_name like %(like)s or ifnull(e.department, '') like %(like)s)
		order by u.full_name
		limit %(start)s, %(page_len)s
		""",
		{"like": like, "start": int(start), "page_len": int(page_len)},
	)


@frappe.whitelist()
def get_dashboard():
	user = frappe.session.user
	week_end = add_days(today(), 7)

	def items(filters, limit=10):
		return frappe.get_all(
			"Work Item",
			filters=filters,
			fields=ITEM_FIELDS,
			order_by="is_overdue desc, due_date asc",
			limit=limit,
		)

	def count(filters):
		return frappe.db.count("Work Item", filters)

	mine = {"assigned_to": user, "status": ("in", OPEN)}
	by_me = {"assigned_by": user, "assigned_to": ("!=", user), "status": ("in", OPEN)}

	data = {
		"cards": {
			"my_open": count(mine),
			"my_overdue": count({**mine, "is_overdue": 1}),
			"my_due_week": count({**mine, "due_date": ("between", [today(), week_end])}),
			"my_approvals": count({**mine, "item_type": "Approval"}),
			"by_me_open": count(by_me),
			"by_me_overdue": count({**by_me, "is_overdue": 1}),
		},
		"my_items": items(mine),
		"my_approvals": items({**mine, "item_type": "Approval"}),
		"by_me_items": items(by_me),
		"team": None,
	}

	team_users = get_subordinate_users(user)
	if is_admin(user) and not team_users:
		team_users = frappe.get_all("Work Item", distinct=True, pluck="assigned_to")
	if team_users:
		data["team"] = get_team_summary(team_users)
		data["team_overdue"] = items({"assigned_to": ("in", team_users), "is_overdue": 1}, limit=20)

	return data


def get_team_summary(users):
	since = add_days(today(), -30)
	rows = frappe.db.sql(
		"""
		select w.assigned_to as user,
			sum(w.status in %(open)s) as open,
			sum(w.is_overdue = 1) as overdue,
			sum(w.status in %(closed)s and w.completed_on >= %(since)s) as closed_30d
		from `tabWork Item` w
		where w.assigned_to in %(users)s
		group by w.assigned_to
		""",
		{"open": OPEN, "closed": CLOSED, "since": since, "users": users},
		as_dict=True,
	)
	stats = {r.user: r for r in rows}
	employees = {
		e.user_id: e
		for e in frappe.get_all(
			"Employee",
			filters={"user_id": ("in", users)},
			fields=["user_id", "employee_name", "department", "designation"],
		)
	}
	summary = []
	for u in users:
		e = employees.get(u) or frappe._dict()
		s = stats.get(u) or frappe._dict()
		summary.append(
			{
				"user": u,
				"name": e.employee_name or frappe.utils.get_fullname(u),
				"department": e.department,
				"designation": e.designation,
				"open": int(s.open or 0),
				"overdue": int(s.overdue or 0),
				"closed_30d": int(s.closed_30d or 0),
			}
		)
	summary.sort(key=lambda r: (-r["overdue"], -r["open"], r["name"] or ""))
	return summary
