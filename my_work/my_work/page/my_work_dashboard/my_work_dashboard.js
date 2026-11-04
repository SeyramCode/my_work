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

    const item_cell = (d) => `
        ${
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
        }`;

    // Standard item row: Item | [Created/Assigned Date] | Due Date | Assignee/Assigner
    const item_row = (d, who, assigned_on = null) => `
        <tr class="${d.is_overdue ? "text-danger" : ""}">
            <td>${item_cell(d)}</td>
            ${assigned_on !== null ? `<td style="white-space:nowrap">${date(assigned_on)}</td>` : ""}
            <td style="white-space:nowrap">${date(d.due_date)}</td>
            <td>${esc(who(d) || "")}</td>
        </tr>`;

    // Row for "Assigned by Me": Assigned To | Item | Assigned Date | Due Date
    const assigned_by_me_row = (d) => `
        <tr class="${d.is_overdue ? "text-danger" : ""}">
            <td>${esc(d.assignee_name || d.allocated_to || "")}</td>
            <td>${item_cell(d)}</td>
            <td style="white-space:nowrap">${date(d.assigned_date || d.creation)}</td>
            <td style="white-space:nowrap">${date(d.due_date)}</td>
        </tr>`;

    // Row for Team Overdue Items: Assigned To | Item | Due Date
    const team_overdue_row = (d) => `
        <tr class="${d.is_overdue ? "text-danger" : ""}">
            <td><strong>${esc(d.assignee_name || d.allocated_to || "")}</strong></td>
            <td>${item_cell(d)}</td>
            <td style="white-space:nowrap">${date(d.due_date)}</td>
        </tr>`;

    // Pending Approval row: Bold Requested By, left-aligned Document
    const approval_row = (a) => `
        <tr class="mw-approval-row">
            <td style="text-align: left !important;">
                <span class="mw-user-text" style="font-weight: 600; color: var(--text-color);">${esc(a.requested_by || "-")}</span>
            </td>
            <td style="text-align: left !important;">
                <a href="${esc(a.route)}" class="mw-item-link mw-approval-title" style="display: block; text-align: left !important; font-weight: 400 !important; text-decoration: none;">
                    ${esc(a.title)}
                </a>
                <div class="mw-doc-subtext" style="display: flex; justify-content: flex-start; align-items: center; gap: 6px; margin-top: 4px; text-align: left !important;">
                    <span class="mw-doc-badge">${esc(__(a.doctype))}</span>
                    <span class="mw-doc-name">${esc(a.name)}</span>
                </div>
            </td>
            <td><span class="mw-state-pill">${esc(__(a.state))}</span></td>
            <td style="white-space: nowrap;">
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

                // Sidebar Navigation
                $(`
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

                // Management OR Profile Box
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

                // Each card opens a list with exactly the filters used for its count in my_work/api.py.
                const my_todos = { allocated_to: me, status: "Open", reference_type: ["!=", "Task"] };
                const by_me = {
                    assigned_by: me,
                    allocated_to: ["!=", me],
                    status: "Open",
                    reference_type: ["!=", "Task"],
                };
                const my_tasks = {
                    _assign: ["like", `%${me}%`],
                    status: ["not in", ["Completed", "Cancelled", "Template"]],
                };
                // "between" rather than "<": Frappe's "<" date filter also matches empty dates,
                // and an item with no due date is never overdue.
                const past_due = ["between", ["1900-01-01", frappe.datetime.add_days(today, -1)]];
                const overdue = { date: past_due };

                $cardsGrid.append(
                    card(__("Pending Approval"), c.approvals, false, () => {
                        const el = $personalView.find(".mw-approvals-sec")[0];
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                    }),
                    card(__("Open To-Dos"), c.my_todos, false, () => go("ToDo", { ...my_todos })),
                    card(__("Overdue To-Dos"), c.my_todos_overdue, true, () =>
                        go("ToDo", { ...my_todos, ...overdue })
                    ),
                    card(__("Assigned (Open)"), c.by_me_open, false, () => go("ToDo", { ...by_me })),
                    card(__("Assigned (Overdue)"), c.by_me_overdue, true, () =>
                        go("ToDo", { ...by_me, ...overdue })
                    ),
                    card(__("Open Tasks"), c.my_tasks, false, () => go("Task", { ...my_tasks })),
                    card(__("Overdue Tasks"), c.my_tasks_overdue, true, () =>
                        go("Task", { ...my_tasks, exp_end_date: past_due })
                    )
                );

                // ==========================================
                // 1. Approvals Panel with Real Dynamic Autocomplete Dropdown
                // ==========================================
                const allApprovals = d.approvals || [];
                const approvalHeaders = [__("Requested By"), __("Document"), __("State"), __("Waiting Since")];

                const allSuggestions = [...new Set([
                    ...allApprovals.map((a) => a.requested_by).filter(Boolean),
                    ...allApprovals.map((a) => a.doctype).filter(Boolean),
                    ...allApprovals.map((a) => a.name).filter(Boolean)
                ])].sort();

                const $approvalsWrap = $(`<div class="row mw-approvals-sec"></div>`).appendTo($personalView);
                const $approvalsCol = $(`<div class="col-12 mb-4"></div>`).appendTo($approvalsWrap);

                let searchQuery = "";
                let isExpanded = false;

                const renderApprovalsPanel = () => {
                    const q = (searchQuery || "").trim().toLowerCase();

                    const filteredList = q
                        ? allApprovals.filter((a) => {
                              const req = (a.requested_by || "").toLowerCase();
                              const title = (a.title || "").toLowerCase();
                              const dt = (a.doctype || "").toLowerCase();
                              const name = (a.name || "").toLowerCase();
                              return req.includes(q) || title.includes(q) || dt.includes(q) || name.includes(q);
                          })
                        : allApprovals;

                    const rows = filteredList.map(approval_row);
                    const hasMore = rows.length > 10;
                    const visibleRows = isExpanded ? rows : rows.slice(0, 10);
                    const remainingCount = rows.length - 10;

                    const matchingSuggestions = q
                        ? allSuggestions.filter((item) => item.toLowerCase().includes(q) && item.toLowerCase() !== q).slice(0, 8)
                        : [];

                    const html = `
                        <div class="mw-panel">
                            <div class="d-flex justify-content-between align-items-center mb-3" style="min-height: 32px;">
                                <div class="mw-panel-title d-flex align-items-center" style="gap: 8px;">
                                    <span>${esc(__("Pending My Approval"))}</span>
                                    <span class="mw-badge-count">${filteredList.length} ${__("items")}</span>
                                </div>

                                <div class="mw-search-container position-relative" style="width: 200px;">
                                    <input 
                                        type="text" 
                                        class="form-control form-control-sm mw-approval-filter-input" 
                                        placeholder="${__("Filter approvals...")}" 
                                        value="${esc(searchQuery)}"
                                        autocomplete="off"
                                        style="height: 28px; font-size: 12px; padding-left: 26px; padding-right: 22px; border-radius: 4px;"
                                    />
                                    <i class="fa fa-search text-muted position-absolute" style="left: 8px; top: 8px; font-size: 11px; pointer-events: none;"></i>
                                    ${
                                        searchQuery
                                            ? `<i class="fa fa-times-circle mw-clear-filter position-absolute text-muted" style="right: 7px; top: 7px; font-size: 13px; cursor: pointer;"></i>`
                                            : ""
                                    }

                                    ${
                                        matchingSuggestions.length
                                            ? `<ul class="dropdown-menu show mw-autocomplete-menu" style="width: 100%; top: 30px; left: 0; max-height: 190px; overflow-y: auto; padding: 4px 0; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); font-size: 12px; z-index: 1050; display: block;">
                                                ${matchingSuggestions
                                                    .map(
                                                        (item) => `
                                                    <li>
                                                        <a class="dropdown-item mw-suggestion-item py-1 px-2" href="#" style="cursor: pointer; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                                            ${esc(item)}
                                                        </a>
                                                    </li>`
                                                    )
                                                    .join("")}
                                               </ul>`
                                            : ""
                                    }
                                </div>
                            </div>

                            ${
                                visibleRows.length
                                    ? `<div class="table-responsive">
                                        <table class="table mb-0">
                                            <thead><tr>${approvalHeaders.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
                                            <tbody>${visibleRows.join("")}</tbody>
                                        </table>
                                       </div>`
                                    : `<div class="text-muted small py-4 text-center">${esc(__("No pending approvals match your search."))}</div>`
                            }

                            ${
                                hasMore
                                    ? `<div class="mw-show-more-wrap text-center mt-3">
                                        <button type="button" class="btn btn-default btn-xs mw-toggle-expand-btn">
                                            <span>${isExpanded ? __("Show Less") : __("Show More ({0} more)", [remainingCount])}</span>
                                            <i class="fa fa-chevron-${isExpanded ? "up" : "down"} ml-1"></i>
                                        </button>
                                       </div>`
                                    : ""
                            }
                        </div>
                    `;

                    $approvalsCol.html(html);

                    const $input = $approvalsCol.find(".mw-approval-filter-input");
                    if (searchQuery) {
                        $input.focus();
                        const len = $input.val().length;
                        $input[0].setSelectionRange(len, len);
                    }
                };

                renderApprovalsPanel();

                $approvalsCol.on("input", ".mw-approval-filter-input", function () {
                    searchQuery = $(this).val();
                    isExpanded = false;
                    renderApprovalsPanel();
                });

                $approvalsCol.on("click", ".mw-suggestion-item", function (e) {
                    e.preventDefault();
                    searchQuery = $(this).text().trim();
                    isExpanded = false;
                    renderApprovalsPanel();
                });

                $approvalsCol.on("click", ".mw-clear-filter", function () {
                    searchQuery = "";
                    renderApprovalsPanel();
                });

                $approvalsCol.on("click", ".mw-toggle-expand-btn", function () {
                    isExpanded = !isExpanded;
                    renderApprovalsPanel();
                });

                // ==========================================
                // 2. To-Dos and Tasks Panels
                // ==========================================
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

                // ==========================================
                // 3. Assigned by Me to Others
                // ==========================================
                const rawAssigned = d.by_me || [];
                const sortedByMe = [...rawAssigned].sort((a, b) => {
                    const dateA = new Date(a.assigned_date || a.creation || 0).getTime();
                    const dateB = new Date(b.assigned_date || b.creation || 0).getTime();
                    return dateB - dateA;
                });

                $(`<div class="row mw-assigned-sec"></div>`)
                    .appendTo($personalView)
                    .append(
                        panel(
                            __("Assigned by Me to Others"),
                            [__("Assigned To"), __("Item"), __("Assigned Date"), __("Due Date")],
                            sortedByMe.map(assigned_by_me_row),
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
                                [__("Assigned To"), __("Item"), __("Due Date")],
                                d.team_overdue.map(team_overdue_row),
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

                // In-page section scrolling
                $sidebarCol.on("click", "[data-action]", function() {
                    const action = $(this).data("action");
                    
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
