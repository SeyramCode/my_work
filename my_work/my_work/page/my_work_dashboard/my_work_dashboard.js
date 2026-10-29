frappe.pages["my-work-dashboard"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("My Work Dashboard"),
        single_column: true,
    });

    page.set_primary_action(__("New To Do"), () => frappe.set_route("Form", "ToDo", "new"), "add");
    page.set_secondary_action(__("Refresh"), () => render(), "refresh");

    const $body = $(`<div class="my-work-dashboard"></div>`).appendTo(page.main);

    const esc = frappe.utils.escape_html;
    const today = frappe.datetime.get_today();
    const me = frappe.session.user;

    // Greeting banner helper
    const get_greeting = () => {
        const hour = new Date().getHours();
        const full_name = frappe.session.user_fullname || me.split("@")[0];
        const first_name = full_name.split(" ")[0];

        let greeting = __("Good morning");
        let icon = "fa-sun-o";

        if (hour >= 12 && hour < 17) {
            greeting = __("Good afternoon");
            icon = "fa-sun-o";
        } else if (hour >= 17 || hour < 4) {
            greeting = __("Good evening");
            icon = "fa-moon-o";
        }

        const date_formatted = frappe.datetime.str_to_user(today);

        return `
            <div class="mw-greeting-banner">
                <div class="mw-greeting-header-row">
                    <div class="mw-greeting-title">
                        <i class="fa ${icon}"></i>
                        <span>${esc(greeting)}, ${esc(first_name)}</span>
                    </div>
                    <div class="mw-date-badge">
                        <i class="fa fa-calendar-o"></i>
                        <span>${esc(date_formatted)}</span>
                    </div>
                </div>
                <div class="mw-greeting-subtitle">
                    ${__("Here is an overview of your work and tasks today.")}
                </div>
            </div>
        `;
    };

    const go = (doctype, filters) => {
        frappe.route_options = filters;
        frappe.set_route("List", doctype);
    };

    const card = (label, value, isAlert, onclick) => {
        const $c = $(`
            <div class="mw-metric-card ${isAlert ? "card-danger" : ""}">
                <div class="mw-card-label">${esc(label)}</div>
                <div class="mw-card-number ${isAlert && value > 0 ? "text-danger" : ""}">${value || 0}</div>
            </div>`);
        $c.on("click", onclick);
        return $c;
    };

    const panel = (title, headers, rows, empty, colClass = "col-12") => `
        <div class="${colClass} mb-4">
            <div class="mw-panel">
                <div class="mw-panel-title">
                    <span>${esc(title)}</span>
                    <span class="mw-badge-count">${rows.length} ${__("items")}</span>
                </div>
                ${
                    rows && rows.length
                        ? `<div class="table-responsive"><table class="table mb-0">
                            <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
                            <tbody>${rows.join("")}</tbody></table></div>`
                        : `<div class="text-muted small py-3">${esc(empty)}</div>`
                }
            </div>
        </div>`;

    const overdue_pill = (d) =>
        d.is_overdue ? `<span class="mw-badge-overdue">${__("Overdue")}</span>` : "";

    const date = (d) => frappe.datetime.str_to_user(d) || "";

    const item_row = (d, who, assigned_on = null) => `
        <tr class="${d.is_overdue ? "text-danger" : ""}">
            <td>${
                d.can_open
                    ? `<a href="${esc(d.route)}" class="mw-item-link">${esc(d.subject)}</a>`
                    : `<span title="${esc(
                            __("You can track this here but not open it in ERPNext")
                      )}" class="text-muted">${esc(d.subject)} <i class="fa fa-lock small ml-1"></i></span>`
            }${overdue_pill(d)}${
                d.missing_reference
                    ? `<div class="text-warning small mt-1">${esc(
                            __("Linked {0} was deleted; this To Do is still open", [d.missing_reference])
                      )}</div>`
                    : d.reference_type && !["Task", "ToDo"].includes(d.reference_type)
                    ? `<div class="text-muted small mt-1">${esc(__(d.reference_type))}: ${esc(d.reference_name)}</div>`
                    : d.project
                    ? `<div class="text-muted small mt-1">${esc(d.project)}</div>`
                    : ""
            }</td>
            ${assigned_on !== null ? `<td style="white-space:nowrap">${date(assigned_on)}</td>` : ""}
            <td style="white-space:nowrap">${date(d.due_date)}</td>
            <td>${esc(who(d) || "")}</td>
        </tr>`;

   const approval_row = (a) => `
        <tr class="mw-approval-row">
            <td>
                <a href="${esc(a.route)}" class="mw-item-link mw-approval-title">${esc(a.title)}</a>
                <div class="mw-doc-subtext">
                    <span class="mw-doc-badge">${esc(__(a.doctype))}</span>
                    <span class="mw-doc-name">${esc(a.name)}</span>
                </div>
            </td>
            <td><span class="mw-state-pill">${esc(__(a.state))}</span></td>
            <td><span class="mw-user-text">${esc(a.requested_by || "-")}</span></td>
            <td style="white-space:nowrap">
                <span class="mw-waiting-time" title="${esc(frappe.datetime.str_to_user(a.waiting_since))}">${frappe.datetime.prettyDate(a.waiting_since)}</span>
            </td>
        </tr>`;

    const team_panel = (team, scope) => {
        const rows = (team || []).map((t) => {
            const name = t.name || t.user || "";
            const initials = name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase();

            return `
            <tr data-user="${esc(t.user)}" class="mw-team-row">
                <td>
                    <div class="mw-member-cell">
                        <span class="mw-member-avatar">${esc(initials)}</span>
                        <div class="mw-member-name-wrap">
                            <span class="mw-member-name">${esc(name)}</span>
                            <span class="mw-member-user-id">${esc(t.user || "")}</span>
                        </div>
                    </div>
                </td>
                <td><span class="mw-cell-muted">${esc(t.department || "-")}</span></td>
                <td><span class="mw-cell-muted">${esc(t.designation || "-")}</span></td>
                <td class="text-center">
                    <span class="mw-counter-pill">${t.open_todos || 0}</span>
                </td>
                <td class="text-center">
                    <span class="mw-counter-pill">${t.open_tasks || 0}</span>
                </td>
                <td class="text-center">
                    <span class="mw-counter-pill ${t.overdue > 0 ? "is-overdue" : "is-zero"}">
                        ${t.overdue || 0}
                    </span>
                </td>
                <td class="text-center">
                    <span class="mw-counter-pill is-closed">${t.closed_30d || 0}</span>
                </td>
            </tr>`;
        });

        const title = scope === "company" ? __("Manager View") : __("My Team View");

        const $p = $(
            panel(
                title,
                [
                    __("Employee"),
                    __("Department"),
                    __("Designation"),
                    __("Open To-Dos"),
                    __("Open Tasks"),
                    __("Overdue"),
                    __("Closed (30d)"),
                ],
                rows,
                __("No team members found.")
            )
        );

        $p.on("click", "tr[data-user]", function () {
            show_member($(this).attr("data-user"));
        });
        return $p;
    };
    const show_member = (member) => {
        const $slot = $body
            .find(".mw-member")
            .html(`<div class="col-12 text-muted p-3"><i class="fa fa-spinner fa-spin mr-2"></i>${__("Loading member details...")}</div>`);
        frappe.xcall("my_work.api.get_member_items", { member }).then((m) => {
            $slot.html(
                panel(
                    __("{0}: Open To Dos", [m.name]),
                    [__("To Do"), __("Due"), __("From")],
                    (m.todos || []).map((x) => item_row(x, (r) => r.assigner_name)),
                    __("No open To Dos."),
                    "col-lg-6"
                ) +
                panel(
                    __("{0}: Open Tasks", [m.name]),
                    [__("Task"), __("Due"), __("From")],
                    (m.tasks || []).map((x) => item_row(x, (r) => r.assigner_name)),
                    __("No open Tasks."),
                    "col-lg-6"
                )
            );
            if ($slot[0]) {
                $slot[0].scrollIntoView({ behavior: "smooth" });
            }
        });
    };

    function render() {
        $body.html(`<div class="text-muted p-5 text-center"><i class="fa fa-spinner fa-spin fa-2x mb-2"></i><div>${__("Loading dashboard...")}</div></div>`);
        frappe
            .xcall("my_work.api.get_dashboard")
            .catch(() => {
                $body.html(
                    `<div class="alert alert-warning m-4">${__(
                        "My Work is not available. Ask a System Manager to check My Work Settings."
                    )}</div>`
                );
            })
            .then((d) => {
                if (!d) return;
                const c = d.cards || {};
                $body.empty();

                // The server decides who is in the viewer's team: Work Managers get the whole
                // company, team leads get everyone below them in Employee "Reports To", and
                // everyone else gets no team. Show the team view whenever it sent one.
                const hasTeam = Boolean(d.team && d.team.length);

                const fullName = frappe.session.user_fullname || me.split("@")[0];
                const initials = fullName
                    .split(" ")
                    .map((w) => w[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();

                const $layout = $(`<div class="mw-layout-wrap"></div>`).appendTo($body);

                // --- Sidebar Column ---
                const $sidebarCol = $(`<div class="mw-sidebar-col"></div>`).appendTo($layout);

                // Box 1: Navigation
                const $sidebar = $(`
                    <div class="mw-sidebar">
                        <div class="mw-sidebar-title">${__("Navigation")}</div>
                        <a class="mw-nav-item active-nav" data-view="personal">
                            <i class="fa fa-th-large"></i>
                            <span>${__("My Dashboard")}</span>
                        </a>
                        <a class="mw-nav-item" data-action="approvals">
                            <i class="fa fa-check-circle"></i>
                            <span>${__("Approvals")}</span>
                        </a>
                        <a class="mw-nav-item" data-action="my-todos">
                            <i class="fa fa-list-ul"></i>
                            <span>${__("My To-Dos")}</span>
                        </a>
                        <a class="mw-nav-item" data-action="my-tasks">
                            <i class="fa fa-tasks"></i>
                            <span>${__("My Tasks")}</span>
                        </a>
                        <a class="mw-nav-item" data-action="assigned-by-me">
                            <i class="fa fa-paper-plane"></i>
                            <span>${__("Assigned by Me")}</span>
                        </a>

                        <div class="mw-sidebar-title">${__("Direct ERP Lists")}</div>
                        <a class="mw-nav-item" href="/app/todo">
                            <i class="fa fa-external-link"></i>
                            <span>${__("All To-Dos")}</span>
                        </a>
                        <a class="mw-nav-item" href="/app/task">
                            <i class="fa fa-external-link"></i>
                            <span>${__("All Tasks")}</span>
                        </a>
                    </div>
                `).appendTo($sidebarCol);

                // Box 2: Management OR Profile Box
                if (hasTeam) {
                    $(`
                        <div class="mw-sidebar-card">
                            <div class="mw-sidebar-title">${__("Management")}</div>
                            <a class="mw-nav-item" data-view="team">
                                <i class="fa fa-users"></i>
                                <span>${__("Team Overview")}</span>
                            </a>
                        </div>
                    `).appendTo($sidebarCol);
                } else {
                    $(`
                        <div class="mw-sidebar-card">
                            <div class="mw-user-profile-widget">
                                <div class="mw-user-avatar">${esc(initials)}</div>
                                <div class="mw-user-info">
                                    <div class="mw-user-name">${esc(fullName)}</div>
                                    <div class="mw-user-role-badge">${__("Work User")}</div>
                                </div>
                            </div>
                        </div>
                    `).appendTo($sidebarCol);
                }

                // --- Right Main Content Column ---
                const $mainContent = $(`<div class="mw-main-content"></div>`).appendTo($layout);

                // ==========================================
                // VIEW A: Personal Dashboard Page
                // ==========================================
                const $personalView = $(`<div class="mw-view-personal"></div>`).appendTo($mainContent);

                // Greeting Banner
                $personalView.append(get_greeting());

                // Compact Metric Cards
                const $cardsGrid = $(`<div class="mw-cards-grid"></div>`).appendTo($personalView);
                $cardsGrid.append(
                    card(__("Pending Approval"), c.approvals, false, () => {
                        const el = $personalView.find(".mw-approvals-sec")[0];
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                    }),
                    card(__("Open To-Dos"), c.my_todos, false, () =>
                        go("ToDo", { allocated_to: me, status: "Open" })
                    ),
                    card(__("Overdue To-Dos"), c.my_todos_overdue, true, () =>
                        go("ToDo", { allocated_to: me, status: "Open", date: ["<", today] })
                    ),
                    card(__("Open Tasks"), c.my_tasks, false, () =>
                        go("Task", {
                            _assign: ["like", `%${me}%`],
                            status: ["not in", ["Completed", "Cancelled", "Template"]],
                        })
                    ),
                    card(__("Overdue Tasks"), c.my_tasks_overdue, true, () =>
                        go("Task", { _assign: ["like", `%${me}%`], status: "Overdue" })
                    ),
                    card(__("Assigned (Open)"), c.by_me_open, false, () =>
                        go("ToDo", { assigned_by: me, status: "Open" })
                    ),
                    card(__("Assigned (Overdue)"), c.by_me_overdue, true, () =>
                        go("ToDo", { assigned_by: me, status: "Open", date: ["<", today] })
                    )
                );

               // Approvals (10 items initially with a "Show More" toggle)
                const approvals = d.approvals || [];
                const approvalHeaders = [__("Document"), __("State"), __("Requested By"), __("Waiting Since")];
                const allApprovalRows = approvals.map(approval_row);
                const hasMoreApprovals = allApprovalRows.length > 10;
                const visibleApprovalRows = allApprovalRows.slice(0, 10);

                const $approvalsWrap = $(`<div class="row mw-approvals-sec"></div>`).appendTo($personalView);
                const $approvalsPanel = $(
                    panel(
                        __("Pending My Approval"),
                        approvalHeaders,
                        visibleApprovalRows,
                        __("Nothing is currently waiting for your approval.")
                    )
                ).appendTo($approvalsWrap);

                if (hasMoreApprovals) {
                    const remainingCount = allApprovalRows.length - 10;
                    const $panelBody = $approvalsPanel.find(".mw-panel");
                    const $showMoreBtn = $(`
                        <div class="mw-show-more-wrap">
                            <button type="button" class="btn btn-default btn-xs mw-show-more-btn">
                                <span>${__("Show More ({0} more)", [remainingCount])}</span>
                                <i class="fa fa-chevron-down ml-1"></i>
                            </button>
                        </div>
                    `).appendTo($panelBody);

                    let expanded = false;
                    $showMoreBtn.on("click", "button", function () {
                        expanded = !expanded;
                        const $tbody = $approvalsPanel.find("tbody");
                        if (expanded) {
                            $tbody.html(allApprovalRows.join(""));
                            $(this).find("span").text(__("Show Less"));
                            $(this).find("i").removeClass("fa-chevron-down").addClass("fa-chevron-up");
                        } else {
                            $tbody.html(visibleApprovalRows.join(""));
                            $(this).find("span").text(__("Show More ({0} more)", [remainingCount]));
                            $(this).find("i").removeClass("fa-chevron-up").addClass("fa-chevron-down");
                            $approvalsWrap[0].scrollIntoView({ behavior: "smooth" });
                        }
                    });
                }

                // To-Dos and Tasks
                $(`<div class="row mw-todos-sec mw-tasks-sec"></div>`)
                    .appendTo($personalView)
                    .append(
                        panel(
                            __("My Open To-Dos"),
                            [__("To Do"), __("Created On"), __("Due Date"), __("From")],
                            (d.my_todos || []).map((x) => item_row(x, (r) => r.assigner_name, x.creation)),
                            __("No open To-Dos assigned to you."),
                            "col-lg-6"
                        ),
                        panel(
                            __("My Open Tasks"),
                            [__("Task"), __("Due Date"), __("From")],
                            (d.my_tasks || []).map((x) => item_row(x, (r) => r.assigner_name)),
                            __("No open Tasks assigned to you."),
                            "col-lg-6"
                        )
                    );

               // Assigned by Me
                $(`<div class="row mw-assigned-sec"></div>`)
                    .appendTo($personalView)
                    .append(
                        panel(
                            __("Assigned by Me to Others"),
                            [__("Item"), __("Assigned Date"), __("Due Date"), __("Assigned To")],
                            (d.by_me || []).map((x) => item_row(x, (r) => r.assignee_name, x.assigned_date || x.creation)),
                            __("No active items currently assigned to others.")
                        )
                    );

                // ==========================================
                // VIEW B: Dedicated Team Overview Page
                // ==========================================
                const $teamView = $(`
                    <div class="mw-view-team" style="display:none;">
                        <div class="mw-greeting-banner">
                            <div class="mw-greeting-header-row">
                                <div class="mw-greeting-title">
                                    <i class="fa fa-users" style="color:var(--mw-primary)"></i>
                                    <span>${__("Team Overview")}</span>
                                </div>
                            </div>
                            <div class="mw-greeting-subtitle">
                                ${__("Monitor team workload, active tasks, and overdue items.")}
                            </div>
                        </div>
                        <div class="row mw-team-content"></div>
                    </div>
                `).appendTo($mainContent);

                if (hasTeam) {
                    const $teamContent = $teamView.find(".mw-team-content");
                    $teamContent.append(team_panel(d.team, d.team_scope));
                    $teamContent.append(`<div class="col-12"><div class="row mw-member"></div></div>`);
                    if (d.team_overdue && d.team_overdue.length) {
                        $teamContent.append(
                            panel(
                                __("Team Overdue Items"),
                                [__("Item"), __("Due Date"), __("Assigned To")],
                                d.team_overdue.map((x) => item_row(x, (r) => r.assignee_name)),
                                ""
                            )
                        );
                    }
                }

                // ==========================================
                // Sidebar Click Handlers & View Switching
                // ==========================================
                $sidebarCol.on("click", "[data-view]", function() {
                    const view = $(this).data("view");
                    $sidebarCol.find(".mw-nav-item").removeClass("active-nav");
                    $(this).addClass("active-nav");

                    if (view === "team") {
                        $personalView.hide();
                        $teamView.fadeIn(150);
                    } else {
                        $teamView.hide();
                        $personalView.fadeIn(150);
                    }
                    window.scrollTo({ top: 0, behavior: "smooth" });
                });

                // In-page section scrolling (Approvals, To-Dos, etc.)
                $sidebarCol.on("click", "[data-action]", function() {
                    const action = $(this).data("action");
                    
                    // Switch back to personal view first if currently on team view
                    $teamView.hide();
                    $personalView.show();
                    $sidebarCol.find("[data-view='personal']").addClass("active-nav");
                    $sidebarCol.find("[data-view='team']").removeClass("active-nav");

                    const targetMap = {
                        "approvals": ".mw-approvals-sec",
                        "my-todos": ".mw-todos-sec",
                        "my-tasks": ".mw-tasks-sec",
                        "assigned-by-me": ".mw-assigned-sec",
                    };
                    const targetEl = $personalView.find(targetMap[action])[0];
                    if (targetEl) targetEl.scrollIntoView({ behavior: "smooth" });
                });
            });
    }

    $(wrapper).on("show", () => render());
};

