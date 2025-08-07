import frappe

@frappe.whitelist()
def add_stock(title, price, image, quantity, required_date, target_warehouse):
    doc = frappe.get_doc({
        "doctype": "Fake Store Order",
        "item_code": title[:100],
        "price": price,
        "image": image,
        "quantity": quantity,
        "required_date": required_date,
        "target_warehouse": target_warehouse
    })
    doc.insert()
    
    po_result = create_purchase_order(doc.name)
    
    return {
        "purchase_order": po_result["purchase_order"],
        "workflow_state": frappe.db.get_value("Fake Store Order", doc.name, "workflow_state")
    }


@frappe.whitelist()
def create_purchase_order(fake_store_order):
    fake_order = frappe.get_doc("Fake Store Order", fake_store_order)
    item_code = fake_order.item_code

    if not frappe.db.exists("Item", item_code):
        item = frappe.get_doc({
            "doctype": "Item",
            "item_code": item_code,
            "item_name": item_code,
            "stock_uom": "Nos",
            "is_stock_item": 1,
            "item_group": "Products",
            "description": fake_order.item_code
        })
        item.insert()
    
    company = frappe.db.get_value("Company", {}, "name")
    supplier = fake_order.supplier or "Fake Supplier"

    po = frappe.get_doc({
        "doctype": "Purchase Order",
        "supplier": supplier,
        "company": company,
        "schedule_date": fake_order.required_date,
        "set_warehouse": fake_order.target_warehouse,
        "items": [{
            "item_code": item_code,
            "qty": fake_order.quantity,
            "rate": fake_order.price,
            "uom": "Nos",
            "required_by": fake_order.required_date,
            "warehouse": fake_order.target_warehouse
        }]
    })
    po.insert()
    po.submit()
    return {"purchase_order": po.name}




@frappe.whitelist()
def get_workflow_state(item_code):
    po_name = frappe.db.get_value("Purchase Order Item", {"item_code": item_code}, "parent")
    if po_name:
        pr_name = frappe.db.get_value("Purchase Receipt Item", {"purchase_order": po_name}, "parent")
        pr_submitted = False
        if pr_name:
            docstatus = frappe.db.get_value("Purchase Receipt", pr_name, "docstatus")
            pr_submitted = docstatus == 1
        fake_order = frappe.get_value("Fake Store Order", {"item_code": item_code}, ["name", "workflow_state"])
        if fake_order:
            _, state = fake_order
            if pr_submitted or state == "Submitted":
                return {
                    "status": "completed",
                    "workflow_state": "Submitted",
                    "purchase_order": po_name
                }
            return {
                "status": "po_created",
                "purchase_order": po_name,
                "workflow_state": state
            }
    return {"status": "not_found"}


@frappe.whitelist()
def add_purchase_receipt(purchase_order):
    po = frappe.get_doc("Purchase Order", purchase_order)
    if not po.items:
        frappe.throw("No items found in Purchase Order")
    item = po.items[0]

    pr = frappe.get_doc({
        "doctype": "Purchase Receipt",
        "supplier": po.supplier,
        "company": po.company,
        "items": [{
            "item_code": item.item_code,
            "qty": item.qty,
            "rate": item.rate,
            "uom": item.uom,
            "warehouse": item.warehouse,
            "purchase_order": po.name,
            "purchase_order_item": item.name
        }]
    })
    pr.insert()
    pr.submit()
    
    fso_doc = frappe.get_doc("Fake Store Order", {"item_code": item.item_code})
    if fso_doc.docstatus == 0:
        fso_doc.submit()

    return {
        "status": "success",
        "purchase_receipt": pr.name,
        "workflow_state": "Submitted"
    }
