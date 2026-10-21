import frappe

USER_ROLE = "Work User"
MANAGER_ROLE = "Work Manager"
ROLES = (USER_ROLE, MANAGER_ROLE)


def before_install():
	for role in ROLES:
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert(
				ignore_permissions=True
			)


def after_install():
	settings = frappe.get_single("My Work Settings")
	settings.enabled = 1
	settings.save(ignore_permissions=True)

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
		if USER_ROLE not in frappe.get_roles(user):
			frappe.get_doc("User", user).add_roles(USER_ROLE)
