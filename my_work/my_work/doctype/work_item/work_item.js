const ASSIGNEE_EDITABLE = ["status", "remarks"];

frappe.ui.form.on("Work Item", {
	setup(frm) {
		frm.set_query("assigned_to", () => ({
			query: "my_work.api.assignable_users",
		}));
	},

	refresh(frm) {
		// Assignment and sharing go through the Assigned To field only, so the
		// reporting-chain visibility rule stays the single source of access.
		frm.sidebar && frm.sidebar.sidebar.find(".form-assignments, .form-shared").hide();

		if (frm.doc.is_overdue) {
			frm.dashboard.set_headline_alert(
				__("Overdue since {0}", [frappe.datetime.str_to_user(frm.doc.due_date)]),
				"red"
			);
		}

		const user = frappe.session.user;
		const is_admin =
			frappe.user.has_role("System Manager") || frappe.user.has_role("My Work Manager");
		const is_assigner = frm.is_new() || frm.doc.assigned_by === user || is_admin;

		if (!is_assigner) {
			frm.fields
				.filter((f) => f.df.fieldname && !ASSIGNEE_EDITABLE.includes(f.df.fieldname))
				.forEach((f) => frm.set_df_property(f.df.fieldname, "read_only", 1));
		}

		frm.trigger("set_status_options");
		frm.trigger("add_action_buttons");
	},

	item_type(frm) {
		frm.trigger("set_status_options");
	},

	set_status_options(frm) {
		const closing = frm.doc.item_type === "Approval" ? ["Approved", "Rejected"] : ["Completed"];
		frm.set_df_property("status", "options", [
			"Open",
			"In Progress",
			"On Hold",
			...closing,
			"Cancelled",
		]);
	},

	add_action_buttons(frm) {
		if (frm.is_new() || !["Open", "In Progress", "On Hold"].includes(frm.doc.status)) return;
		if (frm.doc.assigned_to !== frappe.session.user) return;

		const set_status = (status, remarks) => {
			frm.set_value("status", status);
			if (remarks) frm.set_value("remarks", remarks);
			frm.save();
		};

		if (frm.doc.item_type === "Approval") {
			frm.add_custom_button(__("Approve"), () => set_status("Approved")).addClass(
				"btn-primary"
			);
			frm.add_custom_button(__("Reject"), () => {
				frappe.prompt(
					{ fieldname: "remarks", fieldtype: "Small Text", label: __("Reason"), reqd: 1 },
					(v) => set_status("Rejected", v.remarks),
					__("Reject"),
					__("Reject")
				);
			});
		} else {
			if (frm.doc.status === "Open") {
				frm.add_custom_button(__("Start"), () => set_status("In Progress"));
			}
			frm.add_custom_button(__("Mark Completed"), () => set_status("Completed")).addClass(
				"btn-primary"
			);
		}
	},
});
