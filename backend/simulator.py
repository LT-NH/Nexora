#!/usr/bin/env python3
"""
Nexora 数据模拟器 - 定时生成真实订单和客户，让演示数据保持活跃
每 30 分钟运行一次，周末更活跃
"""

import httpx, random, time
from datetime import datetime, timedelta, timezone

BASE = "http://127.0.0.1:8000/api/v1"
EMAIL = "demo@nexora.com"
PASSWORD = "Demo1234!"

def login(client: httpx.Client) -> tuple[str, str]:
    """Get token and workspace slug."""
    resp = client.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    token = resp.json()["access_token"]
    ws = client.get(f"{BASE}/workspaces", headers={"Authorization": f"Bearer {token}"})
    slug = ws.json()["items"][0]["slug"]
    return token, slug

def get_products(client, token, slug):
    resp = client.get(f"{BASE}/workspaces/{slug}/products?page=1&page_size=100",
                      headers={"Authorization": f"Bearer {token}"})
    items = resp.json().get("items", [])
    return [(it["id"], it["name"], float(it["price"])) for it in items]

def get_customers(client, token, slug):
    resp = client.get(f"{BASE}/workspaces/{slug}/customers?page=1&page_size=200",
                      headers={"Authorization": f"Bearer {token}"})
    items = resp.json().get("items", [])
    return [(it["id"], it.get("name", "Walk-in")) for it in items]

def maybe_create_customer(client, token, slug):
    """10% chance to create a new customer."""
    if random.random() > 0.1:
        return
    names = ["周瑞","吴悠","郑浩","钱佳","沈逸","韩雨","冯乐","曹阳","蒋凡","余悦",
             "杜然","戴莹","夏琪","钟鸣","汪蕊","田雨","董亮","潘琪","袁波","于飞"]
    cname = random.choice(names)
    try:
        client.post(f"{BASE}/workspaces/{slug}/customers",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"name": cname, "email": f"{random.randint(1000,9999)}@qq.com",
                          "phone": f"138{random.randint(10000000,99999999)}"})
        print(f"  [customer] + {cname}")
    except: pass

def run():
    client = httpx.Client(timeout=30)
    token, slug = login(client)
    prods = get_products(client, token, slug)
    custs = get_customers(client, token, slug)

    # Weekend boost: 0-3 on weekdays, 1-5 on Thu-Sat
    wd = datetime.now(timezone.utc).weekday()
    is_busy = wd in (3, 4, 5)  # Thu, Fri, Sat
    n = random.randint(1 if is_busy else 0, 5 if is_busy else 3)

    created = 0
    for _ in range(n):
        pid, pname, price = random.choice(prods)
        cid, cname = random.choice(custs) if custs else (None, "Walk-in")
        qty = 1 if random.random() < 0.75 else 2
        total = round(qty * price, 2)
        status = random.choice(["confirmed","processing","shipped","delivered","pending"])
        order = {
            "customer_id": cid, "customer_name": cname,
            "customer_email": f"{random.randint(100,999)}@qq.com",
            "status": status, "payment_status": "paid",
            "items": [{"product_id": pid, "product_name": pname,
                       "quantity": qty, "unit_price": price, "total_price": total}],
            "subtotal": total, "tax": 0,
            "shipping": 0 if total > 39 else round(random.uniform(5, 10), 2),
            "discount": 0,
            "notes": random.choice(["","请放快递柜","联系我取件","","","加急"]),
            "platform": random.choice(["manual","manual","manual","douyin"]),
        }
        order["total"] = round(total + order["shipping"], 2)
        try:
            r = client.post(f"{BASE}/workspaces/{slug}/orders",
                           headers={"Authorization": f"Bearer {token}"}, json=order)
            if r.status_code == 201: created += 1
        except: pass

    maybe_create_customer(client, token, slug)

    if created > 0:
        rev = sum(o["total"] for o in [{}] * created)  # (approximation)
        print(f"{datetime.now().strftime('%H:%M:%S')} | {created} new orders | "
              f"{'BUSY' if is_busy else 'NORMAL'} mode")

    return created

if __name__ == "__main__":
    print(f"  Nexora 数据模拟器已启动 (间隔=30分钟, 周末活跃)")
    print(f"  按 Ctrl+C 停止")
    while True:
        try:
            run()
        except Exception as e:
            print(f"  [error] {e}")
        time.sleep(30 * 60)  # 30 minutes
