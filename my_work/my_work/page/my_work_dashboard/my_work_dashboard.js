frappe.pages["my-work-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("My Work Dashboard"),
		single_column: true,
	});
	page.set_primary_action(__("New To Do"), () => frappe.new_doc("ToDo"), "add");
	page.set_secondary_action(__("Refresh"), () => render());
	page.add_menu_item(__("To Do List"), () => frappe.set_route("List", "ToDo"));
	page.add_menu_item(__("Task List"), () => frappe.set_route("List", "Task"));
	page.add_menu_item(__("Workflow Actions"), () => frappe.set_route("List", "Workflow Action"));

	const $body = $(`<div class="my-work-dashboard"></div>`).appendTo(page.main);
	const esc = frappe.utils.escape_html;
	const today = frappe.datetime.get_today();
	const me = frappe.session.user;

	const go = (doctype, filters) => {
		frappe.route_options = filters;
		frappe.set_route("List", doctype);
	};

	const card = (label, value, color, onclick) => {
		const $c = $(`
			<div class="col-6 col-md-4 col-lg-3 mb-3">
				<div class="border rounded p-3 h-100" style="cursor:pointer">
					<div class="text-muted small">${esc(label)}</div>
					<div class="h3 mb-0 ${value && color ? "text-" + color : ""}">${value}</div>
				</div>
			</div>`);
		$c.on("click", onclick);
		return $c;
	};

	const panel = (title, headers, rows, empty, width = 6) => `
		<div class="col-lg-${width} mb-4">
			<div class="border rounded p-3 h-100">
				<h6 class="mb-3">${esc(title)}</h6>
				${
					rows.length
						? `<div class="table-responsive"><table class="table table-sm mb-0">
							<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
							<tbody>${rows.join("")}</tbody></table></div>`
						: `<div class="text-muted small">${esc(empty)}</div>`
				}
			</div>
		</div>`;

	const overdue_pill = (d) =>
		d.is_overdue ? ` <span class="indicator-pill red">${__("Overdue")}</span>` : "";
	const date = (d) => frappe.datetime.str_to_user(d) || "";

	const item_row = (d, who) => `
		<tr class="${d.is_overdue ? "text-danger" : ""}">
			<td>${
				d.can_open
					? `<a href="${d.route}">${esc(d.subject)}</a>`
					: `<span title="${esc(
							__("You can track this here but not open it in ERPNext")
					  )}">${esc(d.subject)}</span>`
			}${overdue_pill(d)}${
		d.missing_reference
			? `<div class="text-warning small">${esc(
					__("Linked {0} was deleted; this To Do is still open", [d.missing_reference])
			  )}</div>`
			: d.reference_type && !["Task", "ToDo"].includes(d.reference_type)
			? `<div class="text-muted small">${esc(__(d.reference_type))}: ${esc(
					d.reference_name
			  )}</div>`
			: d.project
			? `<div class="text-muted small">${esc(d.project)}</div>`
			: ""
	}</td>
			<td>${date(d.due_date)}</td>
			<td>${esc(who(d) || "")}</td>
		</tr>`;

	const approval_row = (a) => `
		<tr>
			<td><a href="${a.route}">${esc(a.title)}</a>
				<div class="text-muted small">${esc(__(a.doctype))}: ${esc(a.name)}</div></td>
			<td>${esc(__(a.state))}</td>
			<td>${esc(a.actions.map((x) => __(x)).join(", "))}</td>
			<td>${esc(a.requested_by || "")}</td>
			<td>${frappe.datetime.prettyDate(a.waiting_since)}</td>
		</tr>`;

	const team_panel = (team, scope) => {
		const rows = team.map(
			(t) => `
			<tr data-user="${esc(t.user)}" style="cursor:pointer">
				<td>${esc(t.name || t.user)}</td>
				<td>${esc(t.department || "")}</td>
				<td>${esc(t.designation || "")}</td>
				<td class="text-right">${t.open_todos}</td>
				<td class="text-right">${t.open_tasks}</td>
				<td class="text-right ${t.overdue ? "text-danger font-weight-bold" : ""}">${t.overdue}</td>
				<td class="text-right">${t.closed_30d}</td>
			</tr>`
		);
		const $p = $(
			panel(
				scope === "company"
					? __("Company (Work Manager view)")
					: __("My Team (everyone reporting to you, directly or indirectly)"),
				[
					__("Employee"),
					__("Department"),
					__("Designation"),
					__("Open To Dos"),
					__("Open Tasks"),
					__("Overdue"),
					__("Closed (30d)"),
				],
				rows,
				__("No one reports to you."),
				12
			)
		);
		$p.on("click", "tr[data-user]", function () {
			show_member($(this).attr("data-user"));
		});
		return $p;
	};

	// Drill-down into one team member's open items, shown on the dashboard itself.
	const show_member = (member) => {
		const $slot = $body
			.find(".mw-member")
			.html(`<div class="col-12 text-muted p-3">${__("Loading...")}</div>`);
		frappe.xcall("my_work.api.get_member_items", { member }).then((m) => {
			$slot.html(
				panel(
					__("{0}: open To Dos", [m.name]),
					[__("To Do"), __("Due"), __("From")],
					m.todos.map((x) => item_row(x, (r) => r.assigner_name)),
					__("No open To Dos.")
				) +
					panel(
						__("{0}: open Tasks", [m.name]),
						[__("Task"), __("Due"), __("From")],
						m.tasks.map((x) => item_row(x, (r) => r.assigner_name)),
						__("No open Tasks.")
					)
			);
			$slot[0].scrollIntoView({ behavior: "smooth" });
		});
	};

	function render() {
		$body.html(`<div class="text-muted p-4">${__("Loading...")}</div>`);
		frappe
			.xcall("my_work.api.get_dashboard")
			.catch(() => {
				$body.html(
					`<div class="text-muted p-4">${__(
						"My Work is not available. Ask a System Manager to check My Work Settings."
					)}</div>`
				);
			})
			.then((d) => {
				if (!d) return;
				const c = d.cards;
				$body.empty();

				$(`<div class="row"></div>`)
					.appendTo($body)
					.append(
						card(__("Pending My Approval"), c.approvals, "primary", () =>
							$body.find(".mw-approvals")[0].scrollIntoView({ behavior: "smooth" })
						),
						card(__("My Open To Dos"), c.my_todos, "", () =>
							go("ToDo", { allocated_to: me, status: "Open" })
						),
						card(__("My Overdue To Dos"), c.my_todos_overdue, "danger", () =>
							go("ToDo", { allocated_to: me, status: "Open", date: ["<", today] })
						),
						card(__("My Open Tasks"), c.my_tasks, "", () =>
							go("Task", {
								_assign: ["like", `%${me}%`],
								status: ["not in", ["Completed", "Cancelled", "Template"]],
							})
						),
						card(__("My Overdue Tasks"), c.my_tasks_overdue, "danger", () =>
							go("Task", { _assign: ["like", `%${me}%`], status: "Overdue" })
						),
						card(__("Assigned by Me (Open)"), c.by_me_open, "", () =>
							go("ToDo", { assigned_by: me, status: "Open" })
						),
						card(__("Assigned by Me (Overdue)"), c.by_me_overdue, "danger", () =>
							go("ToDo", { assigned_by: me, status: "Open", date: ["<", today] })
						)
					);

				$(`<div class="row mw-approvals"></div>`)
					.appendTo($body)
					.append(
						panel(
							__("Pending My Approval"),
							[
								__("Document"),
								__("State"),
								__("You can"),
								__("Requested By"),
								__("Waiting"),
							],
							d.approvals.map(approval_row),
							__("Nothing is waiting for your approval."),
							12
						)
					);

				$(`<div class="row"></div>`)
					.appendTo($body)
					.append(
						panel(
							__("My To Dos"),
							[__("To Do"), __("Due"), __("From")],
							d.my_todos.map((x) => item_row(x, (r) => r.assigner_name)),
							__("No open To Dos.")
						),
						panel(
							__("My Tasks"),
							[__("Task"), __("Due"), __("From")],
							d.my_tasks.map((x) => item_row(x, (r) => r.assigner_name)),
							__("No open Tasks assigned to you.")
						),
						panel(
							__("Assigned by Me"),
							[__("Item"), __("Due"), __("Assignee")],
							d.by_me.map((x) => item_row(x, (r) => r.assignee_name)),
							__("Nothing open that you assigned."),
							12
						)
					);

				if (d.team) {
					const $team = $(`<div class="row"></div>`).appendTo($body);
					$team.append(team_panel(d.team, d.team_scope));
					$team.append(`<div class="col-12"><div class="row mw-member"></div></div>`);
					if (d.team_overdue && d.team_overdue.length) {
						$team.append(
							panel(
								__("Team Overdue"),
								[__("Item"), __("Due"), __("Assignee")],
								d.team_overdue.map((x) => item_row(x, (r) => r.assignee_name)),
								"",
								12
							)
						);
					}
				}
			});
	}

	// "show" fires on first load and on every return to the page.
	$(wrapper).on("show", () => render());
};
