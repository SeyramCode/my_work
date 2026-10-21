import frappe
from frappe.permissions import add_permission, update_permission_property

ROLES = ("My Work User", "My Work Manager")


def before_install():
	for role in ROLES:
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert(
				ignore_permissions=True
			)


def after_install():
	setup_todo_permission()

	# Give every active desk user who is linked to an Employee access to My Work.
	users = frappe.get_all(
		"Employee",
		filters={"status": "Active", "user_id": ("is", "set")},
		pluck="user_id",
		distinct=True,
	)
	for user in users:
		if not frappe.db.get_value("User", {"name": user, "enabled": 1, "user_type": "System User"}):
			continue
		if "My Work User" not in frappe.get_roles(user):
			frappe.get_doc("User", user).add_roles("My Work User")


def setup_todo_permission():
	"""Frappe's own ToDo condition steps aside for roles with an explicit ToDo permission.
	Giving My Work User one lets my_work.permissions.todo_query_conditions (which adds the
	reporting chain) become the effective rule for those users."""
	if not frappe.db.exists("Custom DocPerm", {"parent": "ToDo", "role": "My Work User"}):
		add_permission("ToDo", "My Work User")
	for ptype in ("write", "create", "report", "print", "email"):
		update_permission_property("ToDo", "My Work User", 0, ptype, 1, validate=False)
	frappe.clear_cache(doctype="ToDo")


def before_uninstall():
	for name in frappe.get_all(
		"Custom DocPerm", filters={"parent": "ToDo", "role": "My Work User"}, pluck="name"
	):
		frappe.delete_doc("Custom DocPerm", name, ignore_permissions=True)
	frappe.clear_cache(doctype="ToDo")
