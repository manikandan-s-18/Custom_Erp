import frappe
from frappe import _

def validate_supplier_items(doc, method=None):
    if not hasattr(doc, "supplier") or not doc.supplier:
        return


    supplier_master = frappe.db.get_value("Supplier Specific Item", {"supplier": doc.supplier}, "name")
    if not supplier_master:
        frappe.throw(_(f"No Supplier Item Master found for Supplier <b>{doc.supplier}</b>."))


    allowed_items = frappe.get_all("Supplier Item Child",
        filters={"parent": supplier_master},
        fields=["item_code"])

    allowed_item_codes = {item.item_code for item in allowed_items}

    for item in doc.items:
        if item.item_code not in allowed_item_codes:
            frappe.throw(_(f"Item <b>{item.item_code}</b> is not Supplied by Supplier <b>{doc.supplier}</b>."))
