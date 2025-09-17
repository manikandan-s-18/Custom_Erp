import frappe
import json
import requests
import traceback
from frappe.utils.background_jobs import enqueue
from frappe.utils.pdf import get_pdf


TELEGRAM_TOKEN = frappe.get_doc("Telegram Settings").telegram_token.strip()
BASE_URL = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"

def get_user_state(chat_id):
    cache_key = f"telegram_user_state_{chat_id}"
    return frappe.cache().get_value(cache_key) or "idle"

def set_user_state(chat_id, state):
    cache_key = f"telegram_user_state_{chat_id}"
    frappe.cache().set_value(cache_key, state, expires_in_sec=3600)

def send_telegram_message(chat_id, text, reply_markup=None):
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        response = requests.post(f"{BASE_URL}/sendMessage", json=payload, timeout=30)
        return response.json()
    except Exception as e:
        frappe.log_error(f"Telegram send message error: {str(e)}", "Telegram Bot")
        return None

def send_telegram_document(chat_id, file_bytes, filename, reply_markup=None):
    try:
        files = {
            "document": (filename, file_bytes, "application/pdf")
        }
        data = {
            "chat_id": chat_id,
            "caption": filename
        }
        if reply_markup:
            data["reply_markup"] = json.dumps(reply_markup)

        response = requests.post(f"{BASE_URL}/sendDocument", data=data, files=files, timeout=60)
        return response.json()
    except Exception as e:
        frappe.log_error(f"Telegram send document error: {str(e)}", "Telegram Bot")
        return None

def generate_pdf_and_send(order_id, chat_id):
    buttons_after_doc = {
        "inline_keyboard": [
            [
                {"text": "Orders", "callback_data": "menu_orders"},
                {"text": "Help", "callback_data": "menu_help"}
            ]
        ]
    }
    try:
        frappe.set_user("bot@gmail.com")
        if not frappe.db.exists("Sales Order", order_id):
            send_telegram_message(chat_id, f"Order <b>{order_id}</b> not found.", reply_markup=buttons_after_doc)
            return

        html = frappe.get_print("Sales Order", order_id, as_pdf=False)
        pdf_content = get_pdf(html)

        send_telegram_document(chat_id, pdf_content, f"{order_id}.pdf", reply_markup=buttons_after_doc)

    except Exception:
        frappe.log_error(frappe.get_traceback(), "Telegram PDF Generation Error")
        send_telegram_message(chat_id, "Failed to generate PDF. Please try again later.", reply_markup=buttons_after_doc)

@frappe.whitelist(allow_guest=True)
def telegram_webhook():
    try:
        chat_id = None
        raw_data = frappe.request.get_data(as_text=True)

        if not raw_data:
            frappe.response["http_status_code"] = 400
            return {"status": "error", "message": "No data received"}

        try:
            data = json.loads(raw_data)
        except Exception as e:
            frappe.log_error(f"Telegram update JSON parse error: {str(e)}\nRaw data: {raw_data}", "Telegram Bot")
            frappe.response["http_status_code"] = 400
            return {"status": "error", "message": "Invalid JSON data"}

        if "message" in data:
            chat_id = data["message"].get("chat", {}).get("id")
        elif "callback_query" in data:
            chat_id = data["callback_query"].get("message", {}).get("chat", {}).get("id")

        MAIN_KEYBOARD = {
            "inline_keyboard": [
                [
                    {"text": "Orders", "callback_data": "menu_orders"},
                    {"text": "Help", "callback_data": "menu_help"}
                ]
            ]
        }

        if "message" in data:
            message = data["message"]
            chat = message.get("chat", {})
            chat_id = chat.get("id")
            text = message.get("text", "").strip() if message.get("text") else ""

            user_state = get_user_state(chat_id)

            if text == "/start":
                welcome_text = (
                    "<b>Welcome to Order Management Bot!</b>\n\n"
                    "I can help you with:\n"
                    "1.View order details\n"
                    "2.Download order PDFs\n"
                    "3.Get help and support\n\n"
                    "Choose an option below:"
                )
                send_telegram_message(chat_id, welcome_text, MAIN_KEYBOARD)
                set_user_state(chat_id, "idle")

            elif text == "/orders":
                orders_text = (
                    "<b>Order Lookup</b>\n\n"
                    "Please enter your <b>Order ID</b>:\n"
                    "Example: SAL-ORD-2024-00001"
                )
                send_telegram_message(chat_id, orders_text)
                set_user_state(chat_id, "awaiting_order_id")

            elif text == "/help":
                help_text = (
                    "<b>Bot Help</b>\n\n"
                    "<b>Available Commands:</b>\n"
                    "1.<code>/start</code> - Start the bot\n"
                    "2.<code>/orders</code> - Look up orders\n"
                    "3.<code>/help</code> - Show help\n\n"
                    "<b>How to use:</b>\n"
                    "Send /orders or click 'Orders'\n"
                    "Enter your Order ID\n"
                    "Get PDF instantly"
                )
                send_telegram_message(chat_id, help_text, MAIN_KEYBOARD)
                set_user_state(chat_id, "idle")

            elif user_state == "awaiting_order_id" and text:
                order_id = text.upper()
                send_telegram_message(chat_id, f"Generating PDF for {order_id}... Please wait.")
                enqueue("custom_erp.chatbot.telegram_webhook.generate_pdf_and_send",
                        order_id=order_id, chat_id=chat_id)
                set_user_state(chat_id, "idle")

            else:
                default_text = (
                    "Hi! Use the options below:\n\n"
                    "1.<code>/orders</code> - Check order details\n"
                    "2.<code>/help</code> - Get assistance"
                )
                send_telegram_message(chat_id, default_text, MAIN_KEYBOARD)

        elif "callback_query" in data:
            callback_query = data["callback_query"]
            message = callback_query.get("message", {})
            chat = message.get("chat", {})
            chat_id = chat.get("id")
            query_data = callback_query.get("data")
            query_id = callback_query.get("id")

            if chat_id and query_data and query_id:
                requests.post(
                    f"{BASE_URL}/answerCallbackQuery",
                    json={"callback_query_id": query_id},
                    timeout=10
                )

                if query_data == "menu_orders":
                    orders_text = (
                        "<b>Order Lookup</b>\n\n"
                        "Enter your <b>Order ID</b>:\n"
                        "Example: SAL-ORD-2024-00001"
                    )
                    send_telegram_message(chat_id, orders_text)
                    set_user_state(chat_id, "awaiting_order_id")

                elif query_data == "menu_help":
                    help_text = (
                        "<b>Help & Support</b>\n\n"
                        "Available commands and usage instructions:\n"
                        "1.Click 'Orders' to look up order details\n"
                        "2.Send order ID when prompted\n"
                        "3.PDF will be sent automatically\n\n"
                        "Need more help? Contact support."
                    )
                    send_telegram_message(chat_id, help_text, MAIN_KEYBOARD)
                    set_user_state(chat_id, "idle")

        frappe.response["http_status_code"] = 200
        return {"status": "ok"}

    except Exception as e:
        error_message = f"Telegram webhook error: {str(e)}\n{traceback.format_exc()}"
        frappe.log_error(error_message, "Telegram Bot Error")
        frappe.response["http_status_code"] = 500
        return {"status": "error", "message": "Internal server error"}
