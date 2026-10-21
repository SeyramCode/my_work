import frappe

RENAMES = {"My Work User": "Work User", "My Work Manager": "Work Manager"}


def execute():
	"""Roles were renamed: My Work User -> Work User, My Work Manager -> Work Manager."""
	for old, new in RENAMES.items():
		if frappe.db.exists("Role", old) and not frappe.db.exists("Role", new):
			frappe.rename_doc("Role", old, new, force=True)
