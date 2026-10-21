import frappe
from frappe import _


def block_work_item_todo(doc, method=None):
	"""The sidebar 'Assign To' creates ToDos and shares the doc; Work Item uses its own Assigned To field."""
	if doc.reference_type == "Work Item":
		frappe.throw(_("Use the Assigned To field on the Work Item instead of sidebar assignment."))
