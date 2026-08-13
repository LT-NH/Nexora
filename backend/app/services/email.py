import smtplib
import os
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from jinja2 import Template

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.qq.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)


def send_email(to_email: str, subject: str, body_html: str):
    if not SMTP_USER or not SMTP_PASSWORD:
        print(f"[Email] SMTP not configured, skipping email to {to_email}: {subject}")
        return False
    msg = MIMEMultipart("alternative")
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg["Subject"] = f"[Nexora] {subject}"
    msg.attach(MIMEText(body_html, "html", "utf-8"))
    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASSWORD)
            s.send_message(msg)
        return True
    except Exception as e:
        print(f"[Email] Failed: {e}")
        return False


def send_new_order_notification(to_email: str, order_data: dict):
    html = Template("""
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#2560eb;">新订单通知</h2>
      <p>您有一笔新订单：<strong>{{ order_number }}</strong></p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">客户</td><td>{{ customer_name }}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">金额</td><td style="color:#f59e0b;font-weight:bold;">¥{{ total }}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;">状态</td><td>{{ status }}</td></tr>
      </table>
      <p style="margin-top:20px;"><a href="{{ site_url }}/orders" style="background:#2560eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">查看订单</a></p>
    </div>
    """).render(**order_data)
    return send_email(to_email, f"新订单 {order_data.get('order_number','')}", html)


def send_low_stock_alert(to_email: str, products: list):
    items = "".join(f"<li>{p['name']} — 库存仅剩 {p['stock']} 件</li>" for p in products)
    html = Template("""
    <div style="font-family:sans-serif;max-width:600px;">
      <h2 style="color:#ef4444;">库存预警</h2>
      <p>以下商品库存低于安全线：</p>
      <ul>{{ items }}</ul>
      <a href="{{ site_url }}/products" style="background:#ef4444;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">管理库存</a>
    </div>
    """).render(items=items, site_url=os.getenv("SITE_URL", "http://localhost:3000"))
    return send_email(to_email, "库存预警", html)


async def send_email_async(to_email: str, subject: str, body_html: str):
    """Run the blocking :func:`send_email` in a worker thread.

    Keeps the synchronous SMTP implementation untouched while letting
    async callers avoid blocking the event loop. Designed for use with
    ``app.services.queue.enqueue``.
    """
    return await asyncio.to_thread(send_email, to_email, subject, body_html)


async def send_new_order_notification_async(to_email: str, order_data: dict):
    """Run the blocking :func:`send_new_order_notification` in a worker thread."""
    return await asyncio.to_thread(
        send_new_order_notification, to_email, order_data
    )


async def send_low_stock_alert_async(to_email: str, products: list):
    """Run the blocking :func:`send_low_stock_alert` in a worker thread."""
    return await asyncio.to_thread(send_low_stock_alert, to_email, products)
