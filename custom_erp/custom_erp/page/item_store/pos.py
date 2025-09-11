import frappe
import json


@frappe.whitelist()
def get_sales_orders():
    sales_orders = frappe.get_list(
        'Sales Order',
        fields=['name', 'customer', 'status', 'grand_total'],
        limit_page_length=20,
        order_by='creation desc'
    )
    for so in sales_orders:
        invoices = frappe.get_all(
            "Sales Invoice",
            filters={"sales_order": so.name, "docstatus": 1},
            fields=["name", "status", "outstanding_amount"]
        )
        so["invoice_status"] = invoices
        so["has_invoice"] = len(invoices) > 0

        delivery_items = frappe.get_all(
            "Delivery Note Item",
            filters={"against_sales_order": so.name, "docstatus": 1},
            fields=["parent"],
            distinct=True
        )
        so["has_delivery_note"] = len(delivery_items) > 0

    return sales_orders


@frappe.whitelist()
def create_sales_order(cart_items):
    if isinstance(cart_items, str):
        cart_items = json.loads(cart_items)

    try:
        doc = frappe.new_doc("Sales Order")
        doc.customer = "Guest"
        doc.delivery_date = frappe.utils.add_days(frappe.utils.nowdate(), 7)
        
        warehouses = frappe.get_all("Warehouse", filters={"disabled": 0}, limit=1)
        if warehouses:
            doc.set_warehouse = warehouses[0].name
        
        for item in cart_items:
            doc.append("items", {
                "item_code": item["item_code"],
                "qty": item.get("qty", 1),
                "rate": item.get("rate", 0)
            })

        doc.insert()
        doc.submit()
        return {"success": True, "name": doc.name}
    except Exception as e:
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def create_sales_invoice(sales_order):
    try:
        from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice
        existing = frappe.get_all(
            "Sales Invoice",
            filters={"sales_order": sales_order, "docstatus": 1},
            limit=1
        )
        if existing:
            return {"success": False, "error": "Invoice already exists"}

        si = make_sales_invoice(sales_order)
        si.insert()
        si.submit()
        return {"success": True, "name": si.name}
    except Exception as e:
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def create_delivery_note(sales_order):
    try:
        from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note
        
        existing = frappe.get_all(
            "Delivery Note Item",
            filters={"against_sales_order": sales_order, "docstatus": 1},
            limit=1
        )
        if existing:
            return {"success": False, "error": "Delivery note already exists"}

        dn = make_delivery_note(sales_order)
        dn.insert()
        dn.submit()
        return {"success": True, "name": dn.name}
    except Exception as e:
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def get_payment_info(sales_order_id, invoice_id=None):
    try:
        if invoice_id:
            invoice = frappe.get_doc("Sales Invoice", invoice_id)
            return {
                "success": True,
                "outstanding": invoice.outstanding_amount,
                "type": "invoice"
            }
        else:
            so = frappe.get_doc("Sales Order", sales_order_id)
            advances = frappe.get_all(
                "Payment Entry Reference",
                filters={
                    "reference_doctype": "Sales Order",
                    "reference_name": sales_order_id,
                    "docstatus": 1
                },
                fields=["allocated_amount"]
            )

            paid_amount = sum(float(adv.allocated_amount or 0) for adv in advances)
            outstanding = max(0, so.grand_total - paid_amount)

            if outstanding == 0:
                so.status = "Paid"
            elif paid_amount > 0:
                so.status = "Partly Paid"
            so.save(ignore_permissions=True)

            return {
                "success": True,
                "outstanding": outstanding,
                "type": "advance",
                "paid_amount": paid_amount
            }
    except Exception as e:
        return {"success": False, "error": str(e)}

    
@frappe.whitelist()
def create_payment(sales_order_id, mode_of_payment, amount, reference_no=None, invoice_id=None):
    try:
        so = frappe.get_doc("Sales Order", sales_order_id)
        pe = frappe.new_doc("Payment Entry")
        pe.company = so.company
        pe.payment_type = "Receive"
        pe.party_type = "Customer"
        pe.party = so.customer
        pe.mode_of_payment = mode_of_payment
        pe.paid_amount = float(amount)
        pe.received_amount = float(amount)
        pe.reference_no = reference_no or "AUTO-" + frappe.generate_hash(length=6)
        pe.reference_date = frappe.utils.nowdate()
        pe.posting_date = frappe.utils.nowdate()

        pe.paid_from = frappe.db.get_value("Company", so.company, "default_receivable_account")
        pe.paid_to = frappe.db.get_value("Company", so.company, "default_bank_account")
        pe.paid_from_account_currency = frappe.db.get_value("Account", pe.paid_from, "account_currency")
        pe.paid_to_account_currency = frappe.db.get_value("Account", pe.paid_to, "account_currency")
        pe.paid_from_account_balance = 0

        pe.ignore_exchange_rate = 1
        pe.source_exchange_rate = 1
        pe.target_exchange_rate = 1

        pe.setup_party_account_field()
        pe.set_missing_values()

        if invoice_id:
            pe.append("references", {
                 "reference_doctype": "Sales Invoice",
                 "reference_name": invoice_id,
                 "allocated_amount": float(amount)
             })
        else:
            pe.append("references", {
                 "reference_doctype": "Sales Order",
                 "reference_name": sales_order_id,
                 "allocated_amount": float(amount)
             })

        pe.insert()
        pe.submit()

        return {"success": True, "payment_entry": pe.name}
    except Exception as e:
        return {"success": False, "error": str(e)}
