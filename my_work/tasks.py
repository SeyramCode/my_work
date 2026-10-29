import frappe
from frappe import _
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from frappe.utils import cint, get_time, getdate, now_datetime, today

from my_work.api import get_open_tasks
from my_work.settings import is_enabled


def maybe_send_overdue_digest():
	"""Runs every 5 minutes; sends the overdue summary once a day, at the first run after the
	time set in My Work Settings, and only while automatic notifications are enabled."""
	# Read straight from the database: last_notification_date changes outside the cached doc.
	settings = frappe.db.get_singles_dict("My Work Settings", cast=True)
	if not (settings.enabled and settings.notifications_enabled and settings.notification_time):
		return
	now = now_datetime()
	if settings.last_notification_date and getdate(settings.last_notification_date) >= now.date():
		return
	if now.time() < get_time(settings.notification_time):
		return
	# Record today's send first, so a failure part-way never sends twice.
	frappe.db.set_single_value("My Work Settings", "last_notification_date", now.date())
	frappe.db.commit()
	send_overdue_digest(now.date())


def send_overdue_digest(date=None):
	"""One notification to each person with overdue ToDos/Tasks. Managers are not notified.
	With "Skip People on Holiday" on, anyone whose holiday list marks `date` as a holiday or
	weekly off is left out for that day."""
	if not is_enabled():
		return
	date = getdate(date or today())
	# Raw stored value: a Check that was never saved is missing, and then means the default (on).
	skip_holidays = frappe.db.get_singles_dict("My Work Settings").get("skip_on_holidays")
	skip_holidays = 1 if skip_holidays in (None, "") else cint(skip_holidays)
	todo_counts = dict(
		frappe.db.sql(
			"""select allocated_to, count(*) from `tabToDo`
			where status = 'Open' and date < %s and ifnull(reference_type, '') != 'Task'
			group by allocated_to""",
			today(),
		)
	)
	assignees = frappe.get_all(
		"ToDo", filters={"status": "Open", "reference_type": "Task"}, pluck="allocated_to", distinct=True
	)
	task_counts = {}
	for t in get_open_tasks(assignees):
		if t.is_overdue:
			task_counts[t.allocated_to] = task_counts.get(t.allocated_to, 0) + 1

	enabled = set(frappe.get_all("User", filters={"enabled": 1, "user_type": "System User"}, pluck="name"))
	for user in (set(todo_counts) | set(task_counts)) & enabled:
		if skip_holidays and is_on_holiday(user, date):
			continue
		total = todo_counts.get(user, 0) + task_counts.get(user, 0)
		notify(user, _("You have {0} overdue item(s) in My Work.").format(total))


def is_on_holiday(user, date):
	"""True if the user's Employee holiday list (or their company's default) has `date` as a
	holiday or weekly off. No Employee record or no holiday list counts as a working day."""
	from erpnext.setup.doctype.employee.employee import is_holiday

	employee = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")
	return bool(employee and is_holiday(employee, date, raise_exception=False))


def notify(user, subject):
	enqueue_create_notification(
		user,
		{
			"type": "Alert",
			"document_type": "Page",
			"document_name": "my-work-dashboard",
			"subject": subject,
			"from_user": "Administrator",
		},
	)
