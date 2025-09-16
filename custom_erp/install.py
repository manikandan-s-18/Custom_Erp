import frappe

def after_install():
    bot_user_creation()

def bot_user_creation():
    if not frappe.db.exists("user","bot@gmail.com"):
        user_doc = frappe.get_doc({
        "doctype": "User",
        "email":"bot@gmail.com",
        "first_name" :"Bot",
        "enabled" :1,
        "send_welcome_email": 0, 
        "roles": [{"role": "System Manager"},{"role": "Sales Manager"}]

    })
        user_doc.insert(ignore_permissions=True)
        frappe.db.commit()
        frappe.msgprint("User"+user_doc.email+" created Successfully")
    else:
        frappe.msgprint("User"+user_doc.email+" already exists.")