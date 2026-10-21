frappe.listview_settings["Work Item"] = {
	add_fields: ["status", "is_overdue", "item_type", "due_date"],
	hide_name_column: true,

	get_indicator(doc) {
		if (doc.is_overdue) return [__("Overdue"), "red", "is_overdue,=,1"];
		const colors = {
			Open: "orange",
			"In Progress": "blue",
			"On Hold": "gray",
			Completed: "green",
			Approved: "green",
			Rejected: "red",
			Cancelled: "darkgrey",
		};
		return [__(doc.status), colors[doc.status] || "gray", "status,=," + doc.status];
	},

	onload(listview) {
		const me = frappe.session.user;
		listview.page.add_inner_button(__("Assigned to Me"), () =>
			listview.filter_area.clear().then(() =>
				listview.filter_area.add([["Work Item", "assigned_to", "=", me]])
			)
		);
		listview.page.add_inner_button(__("Assigned by Me"), () =>
			listview.filter_area.clear().then(() =>
				listview.filter_area.add([["Work Item", "assigned_by", "=", me]])
			)
		);
		listview.page.add_inner_button(__("Overdue"), () =>
			listview.filter_area.clear().then(() =>
				listview.filter_area.add([["Work Item", "is_overdue", "=", 1]])
			)
		);
	},
};
