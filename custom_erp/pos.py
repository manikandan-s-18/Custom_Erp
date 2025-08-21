import frappe
import json

@frappe.whitelist()
def get_sales_orders():
    sales_orders = frappe.get_list(
        'Sales Order',
        fields=['name', 'customer', 'status', 'grand_total'],
        limit_page_length=30
    )
    return sales_orders

@frappe.whitelist()
def create_sales_order(cart_items):
    if isinstance(cart_items, str):
        cart_items = json.loads(cart_items)

    doc = frappe.new_doc("Sales Order")
    doc.customer = "Guest"
    doc.set_warehouse = "demo - MD"
    doc.delivery_date = frappe.utils.now_datetime()
    for c in cart_items:
        doc.append("items", {
            "item_code": c["item_code"][:100],
            "qty": c.get("qty", 1),
            "rate": c.get("rate", 0)
        })
    doc.insert()
    doc.submit()
    return {"name": doc.name}

@frappe.whitelist()
def create_sales_invoice(sales_order):
    try:
        from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice
        si = make_sales_invoice(sales_order)
        si.insert()
        si.submit()
        return {"name": si.name}
    except Exception as e:
        frappe.log_error(e)
        
@frappe.whitelist()
def create_delivery_note(sales_order):
    try:
        from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note
        dn = make_delivery_note(sales_order)
        dn.insert()
        dn.submit()
        return {"name": dn.name}
    except Exception as e:
        frappe.throw(str(e)[:100])
