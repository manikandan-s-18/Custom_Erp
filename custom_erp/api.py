import frappe
#fetch most purchased items from supplier
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
        WHERE pi.supplier = %s AND pi.docstatus = 1
        GROUP BY pii.item_code
        ORDER BY total_qty DESC
        LIMIT 2
    """, (supplier,), as_dict=1)

    return result

#fetch all supplier items from supplier specific item
@frappe.whitelist()
def fetch_supplier_items(supplier):
    parent_name = frappe.get_value('Supplier Specific Item', {'supplier': supplier}, 'name')
    if not parent_name:
        return []
    items = frappe.get_all(
        'Supplier Item Child',
        filters={'parent': parent_name},
        fields=['item_code']
    )
    item_details = []
    for row in items:
        item = frappe.get_value('Item', row.item_code, as_dict=True)
        if item:
            item_details.append({
                'item_code': row.item_code
            })

    return item_details
