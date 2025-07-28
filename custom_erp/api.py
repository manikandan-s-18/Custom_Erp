import frappe

@frappe.whitelist()
def get_most_purchased_items(supplier):
    result = frappe.db.sql("""
        SELECT
            pii.item_code,
            pii.item_name,
            pii.description,
            pii.uom,
            SUM(pii.qty) as total_qty,
            pii.rate
        FROM `tabPurchase Invoice` pi
        JOIN `tabPurchase Invoice Item` pii ON pi.name = pii.parent
        WHERE pi.supplier = %s
        GROUP BY pii.item_code
        ORDER BY total_qty DESC
        LIMIT 10
    """, (supplier,), as_dict=1)
    return result
