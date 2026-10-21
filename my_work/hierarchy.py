"""Employee reporting-line lookups used by the My Work dashboard.

These only decide what the dashboard displays. ERPNext's own permissions on ToDo, Task and
every other document are left exactly as they are.
"""

import frappe

WORK_MANAGER_ROLE = "Work Manager"


def is_work_manager(user):
	"""Work Managers get the whole-company team overview on the dashboard."""
	return user == "Administrator" or WORK_MANAGER_ROLE in frappe.get_roles(user)


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


def get_team_users(user):
	"""Whose work `user` may track on the dashboard: everyone for Work Managers, else their reporting line."""
	if is_work_manager(user):
		return frappe.get_all(
			"Employee", filters={"status": "Active", "user_id": ("is", "set")}, pluck="user_id"
		)
	return get_subordinate_users(user)


def get_manager_user(user):
	"""User of the direct reports_to manager of `user`, if any."""
	reports_to = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "reports_to")
	if reports_to:
		return frappe.db.get_value("Employee", reports_to, "user_id")
