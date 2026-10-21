import frappe
from frappe import _
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from frappe.utils import today

from my_work.permissions import get_manager_user

OPEN = ("Open", "In Progress", "On Hold")


def mark_overdue():
	"""Daily: flag open items past their due date and notify assignee + their manager once."""
	wi = frappe.qb.DocType("Work Item")
	# Items no longer overdue (closed or due date moved) are cleared on save; this catches date rollover.
	(
		frappe.qb.update(wi)
		.set(wi.is_overdue, 1)
		.where(wi.status.isin(OPEN) & (wi.due_date < today()) & (wi.is_overdue == 0))
	).run()

	to_notify = frappe.get_all(
		"Work Item",
		filters={"is_overdue": 1, "overdue_notified": 0, "status": ("in", OPEN)},
		fields=["name", "subject", "due_date", "assigned_to", "assigned_to_name", "assigned_by"],
	)
	for item in to_notify:
		recipients = {item.assigned_to, item.assigned_by, get_manager_user(item.assigned_to)}
		for user in filter(None, recipients):
			subject = (
				_("Overdue: {0} (due {1})").format(item.subject, frappe.format(item.due_date, "Date"))
				if user == item.assigned_to
				else _("Overdue: {0} assigned to {1} (due {2})").format(
					item.subject, item.assigned_to_name or item.assigned_to, frappe.format(item.due_date, "Date")
				)
			)
			enqueue_create_notification(
				user,
				{
					"type": "Alert",
					"document_type": "Work Item",
					"document_name": item.name,
					"subject": subject,
					"from_user": "Administrator",
				},
			)
		frappe.db.set_value("Work Item", item.name, "overdue_notified", 1, update_modified=False)
