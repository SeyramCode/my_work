import frappe
from frappe import _
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from frappe.utils import today

from my_work.api import get_open_tasks
from my_work.permissions import get_manager_user


def send_overdue_digest():
	"""Daily: one notification per assignee with overdue ToDos/Tasks, one per manager for their reports."""
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
	team = {}
	for user in set(todo_counts) | set(task_counts):
		total = todo_counts.get(user, 0) + task_counts.get(user, 0)
		if user in enabled:
			notify(user, _("You have {0} overdue item(s) in My Work.").format(total))
		if (manager := get_manager_user(user)) and manager in enabled:
			team[manager] = team.get(manager, 0) + total

	for manager, total in team.items():
		notify(manager, _("Your team has {0} overdue item(s) in My Work.").format(total))


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
