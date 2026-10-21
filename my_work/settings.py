"""Cached access to My Work Settings."""

import frappe


def is_enabled():
	return bool(frappe.get_cached_doc("My Work Settings").enabled)
