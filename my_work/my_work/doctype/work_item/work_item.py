import frappe
from frappe import _
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from frappe.model.document import Document
from frappe.utils import cstr, get_datetime, getdate, now_datetime, today

from my_work.permissions import is_admin

OPEN_STATUSES = ("Open", "In Progress", "On Hold")
CLOSED_STATUSES = ("Completed", "Approved", "Rejected", "Cancelled")
ACCESS_ROLES = {"My Work User", "My Work Manager", "System Manager"}

# Fields the assignee may change on an item someone else assigned to them.
ASSIGNEE_EDITABLE = {"status", "remarks", "completed_on", "is_overdue", "overdue_notified"}


class WorkItem(Document):
	def before_insert(self):
		if not (self.assigned_by and is_admin(frappe.session.user)):
			self.assigned_by = frappe.session.user

	def validate(self):
		self.validate_assignee()
		self.validate_dates()
		self.validate_status()
		self.validate_edit_rights()
		self.set_departments()
		self.set_closure_and_overdue()

	def on_update(self):
		before = self.get_doc_before_save()
		if not before or before.assigned_to != self.assigned_to:
			self.notify(
				self.assigned_to,
				_("{0} assigned you a {1}: {2}").format(self.assigned_by_name or self.assigned_by, self.item_type, self.subject),
			)
		elif before.status != self.status and self.status in CLOSED_STATUSES:
			self.notify(
				self.assigned_by,
				_("{0} marked {1} as {2}").format(
					frappe.utils.get_fullname(frappe.session.user), self.subject, self.status
				),
			)

	def validate_assignee(self):
		if not frappe.db.get_value("User", {"name": self.assigned_to, "enabled": 1, "user_type": "System User"}):
			frappe.throw(_("{0} is not an active system user.").format(self.assigned_to))
		if not ACCESS_ROLES & set(frappe.get_roles(self.assigned_to)):
			frappe.throw(
				_("{0} does not have the My Work User role and would not be able to see this item.").format(
					self.assigned_to
				)
			)
		if self.item_type == "Approval" and self.assigned_to == self.assigned_by:
			frappe.throw(_("You cannot be the approver of your own approval request."))

	def validate_dates(self):
		if self.start_date and self.due_date and getdate(self.due_date) < getdate(self.start_date):
			frappe.throw(_("Due Date cannot be before Start Date."))

	def validate_status(self):
		if self.item_type == "Approval" and self.status == "Completed":
			frappe.throw(_("An Approval is closed as Approved or Rejected, not Completed."))
		if self.item_type != "Approval" and self.status in ("Approved", "Rejected"):
			frappe.throw(_("Only Approvals can be Approved or Rejected."))
		if self.status == "Rejected" and not (self.remarks or "").strip():
			frappe.throw(_("Please give a reason in Remarks when rejecting."))

		before = self.get_doc_before_save()
		if (
			self.status in ("Approved", "Rejected")
			and (not before or before.status != self.status)
			and frappe.session.user != self.assigned_to
			and not is_admin(frappe.session.user)
		):
			frappe.throw(_("Only the approver ({0}) can approve or reject.").format(self.assigned_to))

	def validate_edit_rights(self):
		"""Assignees may only progress their own items; the assigner owns the rest of the content."""
		user = frappe.session.user
		if self.is_new() or is_admin(user) or user == self.assigned_by:
			return
		before = self.get_doc_before_save()
		if not before:
			return
		changed = [
			df.fieldname
			for df in self.meta.fields
			if df.fieldname not in ASSIGNEE_EDITABLE
			and not df.read_only
			and normalize(df, self.get(df.fieldname)) != normalize(df, before.get(df.fieldname))
		]
		if changed:
			labels = ", ".join(self.meta.get_label(f) for f in changed)
			frappe.throw(_("Only the assigner can change: {0}").format(labels), frappe.PermissionError)
		if self.status == "Cancelled" and before.status != "Cancelled":
			frappe.throw(_("Only the assigner can cancel this item."), frappe.PermissionError)

	def set_departments(self):
		self.assigned_by_department = get_department(self.assigned_by)
		self.assigned_to_department = get_department(self.assigned_to)

	def set_closure_and_overdue(self):
		if self.status in CLOSED_STATUSES:
			self.completed_on = self.completed_on or now_datetime()
		else:
			self.completed_on = None
		self.is_overdue = int(
			bool(self.due_date and self.status in OPEN_STATUSES and getdate(self.due_date) < getdate(today()))
		)
		if not self.is_overdue:
			self.overdue_notified = 0

	def notify(self, user, subject):
		if not user or user == frappe.session.user:
			return
		payload = {
			"type": "Assignment",
			"document_type": self.doctype,
			"document_name": self.name,
			"subject": subject,
			"from_user": frappe.session.user,
		}
		# Only notify once the save is committed, so a failed save sends nothing.
		frappe.db.after_commit.add(lambda: enqueue_create_notification(user, payload))


def normalize(df, value):
	if value in (None, ""):
		return None
	if df.fieldtype == "Date":
		return getdate(value)
	if df.fieldtype == "Datetime":
		return get_datetime(value)
	return cstr(value).strip()


def get_department(user):
	if user:
		return frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "department")
