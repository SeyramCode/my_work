"""Reporting-chain visibility for ERPNext's existing ToDo and Task.

A user can see a ToDo / Task when they:
  * assigned it, or
  * are its assignee, or
  * are above the assignee anywhere in the Employee reporting chain (reports_to).
Task also stays visible to its creator. Managers in the chain get read-only access.

Users with ADMIN_ROLES (and Projects Manager for Task) are not restricted.
Documents explicitly shared with a user stay visible through Frappe's normal sharing.
"""

import frappe

ADMIN_ROLES = {"System Manager", "My Work Manager"}
TASK_ADMIN_ROLES = ADMIN_ROLES | {"Projects Manager"}
READ_PTYPES = ("read", "print", "email", "report", "export")


def is_admin(user, roles=ADMIN_ROLES):
	return user == "Administrator" or bool(set(roles) & set(frappe.get_roles(user)))


def get_employee_bounds(user):
	"""(lft, rgt) of the user's Employee record in the reports_to tree, or None."""
	rows = frappe.get_all(
		"Employee",
		filters={"user_id": user},
		fields=["lft", "rgt"],
		order_by="FIELD(status, 'Active') desc, modified desc",
		limit=1,
	)
	if rows and rows[0].lft and rows[0].rgt:
		return rows[0].lft, rows[0].rgt
	return None


def get_subordinate_users(user):
	"""Users of every employee below `user` in the reporting chain (direct and indirect)."""
	bounds = get_employee_bounds(user)
	if not bounds:
		return []
	return frappe.get_all(
		"Employee",
		filters={"lft": (">", bounds[0]), "rgt": ("<", bounds[1]), "user_id": ("is", "set")},
		pluck="user_id",
	)


def subordinate_users_sql(user):
	"""SQL sub-select of subordinate users, or None when the user manages nobody."""
	bounds = get_employee_bounds(user)
	if not bounds:
		return None
	return (
		"select `user_id` from `tabEmployee`"
		f" where `lft` > {int(bounds[0])} and `rgt` < {int(bounds[1])} and ifnull(`user_id`, '') != ''"
	)


def get_manager_user(user):
	"""User of the direct reports_to manager of `user`, if any."""
	reports_to = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "reports_to")
	if reports_to:
		return frappe.db.get_value("Employee", reports_to, "user_id")


# ToDo
# Frappe's own ToDo condition steps aside for roles with an explicit ToDo permission;
# My Work User is given one at install, so this condition becomes the effective rule.


def todo_query_conditions(user=None, doctype=None):
	user = user or frappe.session.user
	if is_admin(user):
		return ""

	esc = frappe.db.escape(user)
	conditions = [f"`tabToDo`.`allocated_to` = {esc}", f"`tabToDo`.`assigned_by` = {esc}"]
	if sub := subordinate_users_sql(user):
		conditions.append(f"`tabToDo`.`allocated_to` in ({sub})")
	return "(" + " or ".join(conditions) + ")"


def todo_has_permission(doc, ptype=None, user=None, debug=False):
	user = user or frappe.session.user
	if is_admin(user) or doc.is_new():
		return True
	if user in (doc.allocated_to, doc.assigned_by):
		return True
	if ptype in READ_PTYPES and doc.allocated_to:
		return doc.allocated_to in get_subordinate_users(user)
	return False


# Task
# Assignment on a Task is a ToDo with reference_type = 'Task' (Frappe's "Assign To").


def task_query_conditions(user=None, doctype=None):
	user = user or frappe.session.user
	if is_admin(user, TASK_ADMIN_ROLES):
		return ""

	esc = frappe.db.escape(user)
	assignee = [f"td.`allocated_to` = {esc}", f"td.`assigned_by` = {esc}"]
	if sub := subordinate_users_sql(user):
		assignee.append(f"td.`allocated_to` in ({sub})")
	# Frappe only adds shared docs to lists for users without full role read, so add them here.
	return (
		f"(`tabTask`.`owner` = {esc} or exists (select 1 from `tabToDo` td"
		" where td.`reference_type` = 'Task' and td.`reference_name` = `tabTask`.`name`"
		" and td.`status` != 'Cancelled' and (" + " or ".join(assignee) + "))"
		" or exists (select 1 from `tabDocShare` ds where ds.`share_doctype` = 'Task'"
		f" and ds.`share_name` = `tabTask`.`name` and ds.`read` = 1 and (ds.`user` = {esc} or ds.`everyone` = 1)))"
	)


def task_has_permission(doc, ptype=None, user=None, debug=False):
	user = user or frappe.session.user
	if is_admin(user, TASK_ADMIN_ROLES) or doc.is_new():
		return None  # no opinion: standard role permissions apply

	todos = frappe.get_all(
		"ToDo",
		filters={"reference_type": "Task", "reference_name": doc.name, "status": ("!=", "Cancelled")},
		fields=["allocated_to", "assigned_by"],
	)
	if user == doc.owner or any(user in (t.allocated_to, t.assigned_by) for t in todos):
		return None
	if ptype in READ_PTYPES:
		subs = set(get_subordinate_users(user))
		if any(t.allocated_to in subs for t in todos):
			return True
	if frappe.share.get_shared(doc.doctype, user, filters=[["share_name", "=", doc.name]]):
		return None
	return False
