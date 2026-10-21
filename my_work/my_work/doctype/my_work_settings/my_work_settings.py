import frappe
from frappe.model.document import Document


class MyWorkSettings(Document):
	def on_update(self):
		apply_settings(self.enabled)


def apply_settings(enabled):
	"""Show or hide the My Work workspace; the dashboard and daily digest check the flag themselves."""
	if frappe.db.exists("Workspace", "My Work"):
		frappe.db.set_value("Workspace", "My Work", "is_hidden", 0 if enabled else 1)
	frappe.clear_cache()
