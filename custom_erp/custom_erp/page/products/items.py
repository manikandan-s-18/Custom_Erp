import frappe

from frappe.model.mapper import get_mapped_doc
@frappe.whitelist()
def add_stock(item_code, title, price, image, quantity, required_date, target_warehouse):
    image_url=None
    file_doc = frappe.get_doc({
        "doctype": "File",
        "file_url": image,      
        "file_name": f"{item_code}.jpg",
        "attached_to_doctype": "Item",
        "attached_to_name": item_code,
        "is_private": 0
    })
    image_url = file_doc.file_url
    file_doc.insert()

    if not frappe.db.exists("Item", item_code):
        frappe.get_doc({
            "doctype": "Item",
            "item_code": item_code,
            "item_name": title[:100],
            "stock_uom": "Nos",
            "is_stock_item": 1,
            "item_group": "Products",
            "description": title,
            "image": image_url,   
            "valuation_rate": price
        }).insert()


    fso = frappe.new_doc('Fake Store Order')
    fso.item_code = item_code
    fso.price = price
    fso.image = image
    fso.quantity = quantity
    fso.required_date = required_date
    fso.target_warehouse = target_warehouse
    fso.insert()

    po = frappe.new_doc('Purchase Order')
    po.supplier = fso.supplier or frappe.db.get_value("Supplier", {}, "name") or "Default Supplier"
    po.company = frappe.db.get_value("Company", {}, "name")
    po.schedule_date = required_date
    po.set_warehouse = target_warehouse
    po.append("items", {
        "item_code": item_code,
        "qty": quantity,
        "rate": price,
        "uom": "Nos",
        "required_by": required_date,
        "warehouse": target_warehouse
    })
    po.insert()
    po.submit()

    return {
        "purchase_order": po.name,
        "workflow_state": fso.workflow_state
    }

@frappe.whitelist()
def get_workflow_state(fake_store_order):
    fso_name = frappe.db.get_value("Fake Store Order", {"item_code": fake_store_order}, "name")
    if not fso_name:
        return {"status": "no_po", "workflow_state": None}

    fso = frappe.get_doc("Fake Store Order", fso_name)

    po_name = frappe.db.get_value("Purchase Order Item", {"item_code": fso.item_code}, "parent")
    if po_name:
        pr_name = frappe.db.get_value("Purchase Receipt Item", {"purchase_order": po_name}, "parent")
        if pr_name:
            pr_docstatus = frappe.db.get_value("Purchase Receipt", pr_name, "docstatus")
            if pr_docstatus == 1:
                return {"status": "completed", "purchase_order": po_name, "workflow_state": fso.workflow_state}
        return {"status": "po_created", "purchase_order": po_name, "workflow_state": fso.workflow_state}
    return {"status": "no_po", "workflow_state": fso.workflow_state}

@frappe.whitelist()
def add_purchase_receipt(purchase_order):
    def update_item(source, target):
        target.purchase_order_item = source.name

    pr = get_mapped_doc(
        "Purchase Order",
        purchase_order,
        {
            "Purchase Order": {
                "doctype": "Purchase Receipt",
                "field_map": {"supplier_warehouse": "set_warehouse"}
            },
            "Purchase Order Item": {
                "doctype": "Purchase Receipt Item",
                "field_map": {"name": "purchase_order_item", "parent": "purchase_order"}
            }
        },
        None,
        update_item
    )
    pr.insert()
    pr.submit()

    fake_order_name = frappe.db.get_value("Fake Store Order", {"item_code": pr.items[0].item_code}, "name")
    if fake_order_name:
        fso_doc = frappe.get_doc("Fake Store Order", fake_order_name)
        if fso_doc.docstatus == 0:
            fso_doc.submit()

    return {"status": "success", "purchase_receipt": pr.name, "workflow_state": "Submitted"}

@frappe.whitelist()
def get_stock_balance(item_code):
    result = frappe.db.sql("""
        SELECT SUM(actual_qty) FROM `tabBin` WHERE item_code = %s
    """, (item_code,))
    return result[0][0] if result and result[0][0] is not None else 0

@frappe.whitelist()
def check_item_exists(item_code):
    exists = frappe.db.exists("Item", item_code)
    return {"exists": bool(exists)}

