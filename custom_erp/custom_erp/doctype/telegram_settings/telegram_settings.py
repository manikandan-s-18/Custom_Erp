import frappe
from frappe.model.document import Document
import requests


class TelegramSettings(Document):
    def validate(self):
        if self.telegram_token and self.webhook_url:
            try:
                setup_webhook_with_doctype(self.telegram_token, self.webhook_url)
            except Exception as e:
                frappe.throw(f"Error setting Telegram webhook:\n{str(e)}")

def setup_webhook_with_doctype(telegram_token, ngrok_url):
    
    webhook_url = f"{ngrok_url}/api/method/custom_erp.chatbot.telegram_webhook.telegram_webhook"

    telegram_url = f"https://api.telegram.org/bot{telegram_token}/setWebhook"
    payload = {
        "url": webhook_url,
        "max_connections": 40,
        "allowed_updates": ["message", "callback_query"],
    }
    try:
        response = requests.post(telegram_url, json=payload, timeout=30)
        try:
            result = response.json()
        except Exception:
            frappe.throw(f"Telegram did not return JSON. Response: {response.text}")

        if result.get("ok"):
            frappe.msgprint("Webhook set successfully!")
        else:
            frappe.throw(f"Failed to set webhook: {result}")
    except Exception as e:
        frappe.throw(f"Error setting webhook: {str(e)}")
