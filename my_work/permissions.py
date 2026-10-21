"""Visibility rules for Work Item.

A user can see a Work Item when they:
  * assigned it (assigned_by), or
  * are its assignee (assigned_to), or
  * are above the assignee anywhere in the Employee reporting chain (reports_to).

Administrator, System Manager and My Work Manager see everything.
Only the assigner and assignee may edit; managers in the chain get read-only access.
"""

import frappe

ADMIN_ROLES = {"System Manager", "My Work Manager"}


def is_admin(user):
	return user == "Administrator" or bool(ADMIN_ROLES & set(frappe.get_roles(user)))


def get_employee_bounds(user):
	"""(lft, rgt) of the user's Employee record in the reports_to tree, or None."""
	rows = frappe.get_all(
		"Employee",
		filters={"user_id": user},
		fields=["lft", "rgt", "status"],
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


def get_manager_user(user):
	"""User of the direct reports_to manager of `user`, if any."""
	reports_to = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "reports_to")
	if reports_to:
		return frappe.db.get_value("Employee", reports_to, "user_id")


def work_item_query_conditions(user=None):
	user = user or frappe.session.user
	if is_admin(user):
		return ""

	esc = frappe.db.escape(user)
	conditions = [f"`tabWork Item`.`assigned_by` = {esc}", f"`tabWork Item`.`assigned_to` = {esc}"]

	bounds = get_employee_bounds(user)
	if bounds:
		conditions.append(
			"`tabWork Item`.`assigned_to` in (select `user_id` from `tabEmployee`"
			f" where `lft` > {int(bounds[0])} and `rgt` < {int(bounds[1])} and ifnull(`user_id`, '') != '')"
		)
	return "(" + " or ".join(conditions) + ")"


def work_item_has_permission(doc, ptype=None, user=None, debug=False):
	user = user or frappe.session.user
	if is_admin(user) or doc.is_new():
		return True

	if user in (doc.assigned_by, doc.assigned_to):
		if ptype == "delete":
			return user == doc.assigned_by
		return True

	# Reporting-chain managers: read-only visibility.
	if ptype in ("read", "print", "email", "report", "export") and doc.assigned_to:
		return doc.assigned_to in get_subordinate_users(user)

	return False


def block_work_item_share(doc, method=None):
	"""Sharing would bypass the hierarchy rule (shared docs are OR'd into list queries)."""
	if doc.share_doctype == "Work Item" and not is_admin(frappe.session.user):
		frappe.throw(
			frappe._("Work Items cannot be shared. Change the assignee instead."),
			frappe.PermissionError,
		)
