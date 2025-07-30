import frappe

@frappe.whitelist()
def check_supplier_item(supplier, item_code):
    return frappe.db.exists({
        "doctype": "Supplier Item Child",
        "parent": supplier,
        "item_code": item_code
    }) is not None


@frappe.whitelist()
def add_supplier_item(supplier, item_code):
    if not frappe.db.exists('Supplier Specific Item', supplier):
        frappe.get_doc({
            'doctype': 'Supplier Specific Item',
            'supplier': supplier
        }).insert()

    supplier_doc = frappe.get_doc('Supplier Specific Item', supplier)
    supplier_doc.append('item_code', {
        'item_code': item_code
    })
    supplier_doc.save()
    return True
