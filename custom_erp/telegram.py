import frappe
from frappe.utils import nowdate, getdate, formatdate, fmt_money
import requests

def send_telegram_message(chat_id, message, bot_token, parse_mode="HTML"):
    """Send message to Telegram"""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": parse_mode
    }
    try:
        response = requests.post(url, data=payload, timeout=30)
        response.raise_for_status()
        return {"success": True, "response": response.json()}
    except Exception as e:
        frappe.logger().error(f"Telegram send failed: {str(e)}")
        frappe.msgprint(f"Error: {str(e)}")
        return {"success": False, "error": str(e)}

def notify_customer_invoice_created(doc, method=None):
    try:
        bot_token = frappe.conf.get('telegram_bot_token')
        if not bot_token:
            frappe.logger().warning("Telegram bot token not found in site_config.json")
            return
            
        customer = frappe.get_doc("Customer", doc.customer)
        telegram_id = customer.get("custom_telegram_id")
        
        if not telegram_id:
            frappe.logger().info(f"No telegram_id found for Customer {doc.customer}")
            return
        
        message = (
            f"<b>Sales Invoice Created</b>\n\n"
            f"<b>Invoice:</b> {doc.name}\n"
            f"<b>Customer:</b> {doc.customer_name}\n"
            f"<b>Total Amount:</b> {fmt_money(doc.grand_total, currency=doc.currency)}\n"
            f"<b>Date:</b> {formatdate(doc.posting_date)}\n"
            f"<b>Due Date:</b> {formatdate(doc.due_date)}\n\n"
            f"Status: <b>Submitted</b>\n\n"
            "Thank you for your business!"
        )
        
        result = send_telegram_message(
            chat_id=telegram_id,
            message=message,
            bot_token=bot_token
        )
        
        if result["success"]:
            frappe.logger().info(f"Telegram notification sent for invoice {doc.name}")
        else:
            frappe.log_error(
                message=result.get("error"),
                title=f"Telegram Notification Failed - {doc.name}"
            )
            
    except Exception as e:
        frappe.log_error(message=str(e), title="Telegram Invoice Notification Error")


def notify_customer_order_placed(doc, method=None):
    try:
        bot_token = frappe.conf.get('telegram_bot_token')
        if not bot_token:
            frappe.logger().warning("Telegram bot token not found in site_config.json")
            return
            
        customer = frappe.get_doc("Customer", doc.customer)
        telegram_id = customer.get("custom_telegram_id")
        
        if not telegram_id:
            frappe.logger().info(f"No telegram_id found for Customer {doc.customer}")
            return
        
        
        items_summary = []
        for item in doc.items[:3]:  
            items_summary.append(f"• {item.item_name} (Qty: {item.qty})")
        
        if len(doc.items) > 3:
            items_summary.append(f"• ... and {len(doc.items) - 3} more items")
        
        items_text = "\n".join(items_summary)
        
        message = (
            f"<b>ORDER CONFIRMATION</b>\n\n"
            f"<b>Order Number:</b> {doc.name}\n"
            f"<b>Customer:</b> {doc.customer_name}\n"
            f"<b>Order Total:</b> {fmt_money(doc.grand_total, currency=doc.currency)}\n"
            f"<b>Order Date:</b> {formatdate(doc.transaction_date)}\n"
            f"<b>Delivery Date:</b> {formatdate(doc.delivery_date) if doc.delivery_date else 'TBD'}\n\n"
            f"<b>Items Ordered:</b>\n{items_text}\n\n"
            f"<b>Status:</b> Order Confirmed & Submitted\n\n"
            f"Thank you for your order!\n\n"
        )
        
        result = send_telegram_message(
            chat_id=telegram_id,
            message=message,
            bot_token=bot_token
        )
        
        if result["success"]:
            frappe.logger().info(f"Order notification sent for {doc.name}")
        else:
            frappe.log_error(
                message=result.get("error"),
                title=f"Order Notification Failed - {doc.name}"
            )
            
    except Exception as e:
        frappe.log_error(message=str(e), title="Order Notification Error")

def check_and_send_payment_reminders():
    try:
        bot_token = frappe.conf.get('telegram_bot_token')
        if not bot_token:
            frappe.logger().warning("Telegram bot token not found in site_config.json")
            return

        today = nowdate()
        overdue_invoices = frappe.get_all(
            "Sales Invoice",
            filters={
                "outstanding_amount": [">", 0],
                "due_date": ["<", today],
                "docstatus": 1
            },
            fields=["name", "customer", "customer_name", "due_date",
                   "posting_date", "outstanding_amount", "grand_total", "currency"]
        )

        for invoice in overdue_invoices:
            send_overdue_reminder(invoice, bot_token)

        frappe.logger().info(f"Overdue reminders sent for {len(overdue_invoices)} invoices")

    except Exception as e:
        frappe.log_error(message=str(e), title="Payment Reminder Check Error")


def send_overdue_reminder(invoice, bot_token):
    try:
        customer = frappe.get_doc("Customer", invoice.customer)
        telegram_id = customer.get("custom_telegram_id")

        if not telegram_id:
            frappe.logger().info(f"No telegram_id found for Customer {invoice.customer}")
            return

        days_overdue = (getdate(nowdate()) - getdate(invoice.due_date)).days

        message = (
            f"<b>PAYMENT OVERDUE REMINDER</b>\n\n"
            f"<b>Invoice:</b> {invoice.name}\n"
            f"<b>Customer:</b> {invoice.customer_name}\n"
            f"<b>Outstanding Amount:</b> {fmt_money(invoice.outstanding_amount, currency=invoice.currency)}\n"
            f"<b>Total Amount:</b> {fmt_money(invoice.grand_total, currency=invoice.currency)}\n"
            f"<b>Invoice Date:</b> {formatdate(invoice.posting_date)}\n"
            f"<b>Due Date:</b> {formatdate(invoice.due_date)}\n"
            f"<b>Days Overdue:</b> {days_overdue} days\n\n"
            f"<b>Action Required:</b> Please settle this payment immediately to avoid further penalties.\n\n"
            f"Thank you!"
        )

        result = send_telegram_message(
            chat_id=telegram_id,
            message=message,
            bot_token=bot_token
        )

        if result["success"]:
            frappe.logger().info(f"Overdue reminder sent for invoice {invoice.name}")
        else:
            frappe.log_error(
                message=result.get("error"),
                title=f"Overdue Reminder Failed - {invoice.name}"
            )

    except Exception as e:
        frappe.log_error(message=str(e), title="Overdue Reminder Error")