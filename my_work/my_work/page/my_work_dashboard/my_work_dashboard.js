frappe.pages["my-work-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("My Work Dashboard"),
		single_column: true,
	});
	page.set_primary_action(__("New Work Item"), () => frappe.new_doc("Work Item"), "add");
	page.set_secondary_action(__("Refresh"), () => render());
	page.add_menu_item(__("All Work Items"), () => frappe.set_route("List", "Work Item"));

	const $body = $(`<div class="my-work-dashboard"></div>`).appendTo(page.main);
	const esc = frappe.utils.escape_html;

	const list_route = (filters) => {
		frappe.route_options = filters;
		frappe.set_route("List", "Work Item");
	};

	const card = (label, value, color, filters) => {
		const $c = $(`
			<div class="col-6 col-md-4 col-lg-2 mb-3">
				<div class="border rounded p-3 h-100" style="cursor:pointer">
					<div class="text-muted small">${esc(label)}</div>
					<div class="h3 mb-0 ${value && color ? "text-" + color : ""}">${value}</div>
				</div>
			</div>`);
		$c.on("click", () => list_route(filters));
		return $c;
	};

	const item_table = (title, items, show_assignee, empty) => {
		const rows = items
			.map(
				(d) => `
				<tr class="${d.is_overdue ? "text-danger" : ""}">
					<td><a href="/app/work-item/${encodeURIComponent(d.name)}">${esc(d.subject)}</a></td>
					<td>${esc(__(d.item_type))}</td>
					<td>${esc(__(d.status))}${d.is_overdue ? ` <span class="indicator-pill red">${__("Overdue")}</span>` : ""}</td>
					<td>${frappe.datetime.str_to_user(d.due_date) || ""}</td>
					<td>${esc((show_assignee ? d.assigned_to_name : d.assigned_by_name) || "")}</td>
				</tr>`
			)
			.join("");
		return `
			<div class="col-lg-6 mb-4">
				<div class="border rounded p-3 h-100">
					<h6 class="mb-3">${esc(title)}</h6>
					${
						items.length
							? `<table class="table table-sm mb-0"><thead><tr>
								<th>${__("Subject")}</th><th>${__("Type")}</th><th>${__("Status")}</th>
								<th>${__("Due")}</th><th>${show_assignee ? __("Assignee") : __("From")}</th>
							</tr></thead><tbody>${rows}</tbody></table>`
							: `<div class="text-muted small">${esc(empty)}</div>`
					}
				</div>
			</div>`;
	};

	const team_table = (team) => {
		const rows = team
			.map(
				(t) => `
				<tr data-user="${esc(t.user)}" style="cursor:pointer">
					<td>${esc(t.name || t.user)}</td>
					<td>${esc(t.department || "")}</td>
					<td>${esc(t.designation || "")}</td>
					<td class="text-right">${t.open}</td>
					<td class="text-right ${t.overdue ? "text-danger font-weight-bold" : ""}">${t.overdue}</td>
					<td class="text-right">${t.closed_30d}</td>
				</tr>`
			)
			.join("");
		const $t = $(`
			<div class="col-12 mb-4">
				<div class="border rounded p-3">
					<h6 class="mb-3">${__("My Team")} <span class="text-muted small">(${__(
						"everyone reporting to you, directly or indirectly"
					)})</span></h6>
					<table class="table table-sm table-hover mb-0"><thead><tr>
						<th>${__("Employee")}</th><th>${__("Department")}</th><th>${__("Designation")}</th>
						<th class="text-right">${__("Open")}</th><th class="text-right">${__("Overdue")}</th>
						<th class="text-right">${__("Closed (30d)")}</th>
					</tr></thead><tbody>${rows}</tbody></table>
				</div>
			</div>`);
		$t.on("click", "tr[data-user]", function () {
			list_route({ assigned_to: $(this).attr("data-user") });
		});
		return $t;
	};

	function render() {
		$body.html(`<div class="text-muted p-4">${__("Loading...")}</div>`);
		frappe.xcall("my_work.api.get_dashboard").then((d) => {
			const me = frappe.session.user;
			const c = d.cards;
			const open = ["in", ["Open", "In Progress", "On Hold"]];
			$body.empty();

			const $cards = $(`<div class="row"></div>`).appendTo($body);
			$cards.append(
				card(__("My Open"), c.my_open, "", { assigned_to: me, status: open }),
				card(__("My Overdue"), c.my_overdue, "danger", { assigned_to: me, is_overdue: 1 }),
				card(__("Due in 7 Days"), c.my_due_week, "warning", {
					assigned_to: me,
					status: open,
					due_date: [
						"between",
						[frappe.datetime.get_today(), frappe.datetime.add_days(frappe.datetime.get_today(), 7)],
					],
				}),
				card(__("Approvals Waiting on Me"), c.my_approvals, "primary", {
					assigned_to: me,
					item_type: "Approval",
					status: open,
				}),
				card(__("Assigned by Me (Open)"), c.by_me_open, "", { assigned_by: me, status: open }),
				card(__("Assigned by Me (Overdue)"), c.by_me_overdue, "danger", {
					assigned_by: me,
					is_overdue: 1,
				})
			);

			const $lists = $(`<div class="row"></div>`).appendTo($body);
			$lists.append(
				item_table(__("On Me"), d.my_items, false, __("Nothing open on you.")),
				item_table(__("Approvals Waiting on Me"), d.my_approvals, false, __("No pending approvals.")),
				item_table(__("Assigned by Me"), d.by_me_items, true, __("Nothing open that you assigned."))
			);

			if (d.team) {
				const $team = $(`<div class="row"></div>`).appendTo($body);
				$team.append(team_table(d.team));
				if (d.team_overdue && d.team_overdue.length) {
					$team.append(item_table(__("Team Overdue"), d.team_overdue, true, ""));
				}
			}
		});
	}

	// "show" fires on first load and on every return to the page.
	$(wrapper).on("show", () => render());
};
