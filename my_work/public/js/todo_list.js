// My Work: show overdue ToDos in red in the standard ToDo list.
frappe.listview_settings["ToDo"] = Object.assign(frappe.listview_settings["ToDo"] || {}, {
	add_fields: ["reference_type", "reference_name", "status", "date"],

	get_indicator(doc) {
		if (doc.status === "Open" && doc.date && doc.date < frappe.datetime.get_today()) {
			return [__("Overdue"), "red", "status,=,Open"];
		}
		const colors = { Open: "orange", Closed: "green", Cancelled: "darkgrey" };
		return [__(doc.status), colors[doc.status] || "gray", "status,=," + doc.status];
	},
});
