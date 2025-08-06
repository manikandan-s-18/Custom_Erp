import frappe

@frappe.whitelist()
def add_to_cart(product_id, title, price, description, image, category):
    fixed_item_group = "All Item Groups"  

    if frappe.db.exists("Item", {"item_code": product_id}):
        return {"status": "EXISTS", "message": f"{title} already exists."}
    
    item = frappe.get_doc({
        "doctype": "Item",
        "item_code": product_id,
        "item_name": title[:140],
        "description": description[:1000],
        "image": image,
        "item_group": fixed_item_group,
        "stock_uom": "Nos",
        "standard_rate": price,
        "is_stock_item": 1,
        "maintain_stock": 1
    })

    item.insert()  
    return {"status": "SUCCESS", "message": f"{title[:20]} added to Items."}

@frappe.whitelist()
def get_existing_item_codes():
    return frappe.get_all("Item", fields=["item_code"], pluck="item_code")
