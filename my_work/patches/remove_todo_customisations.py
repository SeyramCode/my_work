import frappe

PTYPES = ("read", "write", "create", "delete", "submit", "cancel", "amend", "report", "export",
          "import", "share", "print", "email", "select", "if_owner", "permlevel")


def execute():
	"""Earlier versions customised ToDo permissions; My Work now leaves ERPNext permissions alone.

	Removes the Work User rule, then removes the remaining ToDo Custom DocPerms only if they are an
	unchanged copy of the standard ToDo permissions (which is what Frappe creates when the first
	custom rule is added). Genuine customisations are left untouched.
	"""
	for name in frappe.get_all(
		"Custom DocPerm", filters={"parent": "ToDo", "role": ("in", ["Work User", "My Work User"])}, pluck="name"
	):
		frappe.delete_doc("Custom DocPerm", name, ignore_permissions=True, force=True)

	custom = frappe.get_all("Custom DocPerm", filters={"parent": "ToDo"}, fields=["name", "role", *PTYPES])
	standard = frappe.get_all(
		"DocPerm", filters={"parent": "ToDo", "parenttype": "DocType"}, fields=["role", *PTYPES]
	)

	def key(rows):
		return sorted((r.role, *(int(r.get(p) or 0) for p in PTYPES)) for r in rows)

	if custom and key(custom) == key(standard):
		for row in custom:
			frappe.delete_doc("Custom DocPerm", row.name, ignore_permissions=True, force=True)

	frappe.clear_cache(doctype="ToDo")
