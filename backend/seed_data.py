#!/usr/bin/env python3
"""Nexora - 演示数据生成脚本

一键生成完整的演示数据：1个商家 + 50个商品 + 80笔订单 + 100个客户 + 2个店铺

用法:
    cd backend
    python seed_data.py
"""

import httpx
import random
import time
from datetime import datetime, timedelta, timezone

BASE_URL = "http://localhost:8000/api/v1"

# 演示数据模板 - 大学生网店
PRODUCT_NAMES = [
    # 手机配件
    "透明手机壳", "钢化膜", "Type-C快充线", "无线充电板", "手机挂绳",
    "蓝牙自拍杆", "耳机收纳盒", "手机散热背夹", "磁吸卡包", "镜头保护膜",
    # 宿舍好物
    "USB小台灯", "折叠收纳箱", "床边挂篮", "静音小风扇", "插座转换器",
    "桌面增高架", "粘钩套装", "寝室遮光帘", "USB加湿器", "迷你垃圾桶",
    # 文具数码
    "无线鼠标", "笔记本内胆包", "U盘64G", "取卡针套装", "屏幕清洁套装",
    "键盘膜", "电动橡皮擦", "错题打印机", "荧光笔套装", "活页本",
    # 潮流配饰
    "帆布斜挎包", "棒球帽", "冰丝袖套", "防晒口罩", "彩色袜子套装",
    "发带运动款", "简约手链", "手机壳挂链", "墨镜夹片", "小方巾",
    # 生活小物
    "保温杯350ml", "折叠雨伞", "迷你电子秤", "硅胶冰格", "旅行分装瓶",
    "照片墙夹子灯", "桌面小时钟", "钥匙扣挂件", "可折叠拖鞋", "午睡眼罩",
]

CUSTOMER_NAMES = [
    "张伟", "王芳", "李娜", "刘洋", "陈静", "杨磊", "赵敏", "黄强", "周婷", "吴昊",
    "徐丽", "孙鹏", "马超", "朱琳", "胡涛", "郭明", "何欣", "高雅", "林峰", "罗丹",
    "郑杰", "梁宇", "谢雪", "宋佳", "唐心", "许诺", "韩冰", "冯刚", "邓菲", "曹睿",
    "彭博", "曾毅", "汪蕊", "田源", "董卿", "潘雅", "袁帅", "于蓝", "蒋雯", "余文",
    "杜峰", "戴琦", "夏雨", "钟楠", "汪浩", "王磊", "李想", "张超", "陈晨", "杨柳",
    "赵雪", "黄磊", "周杰", "吴敏", "徐静", "孙丽", "马芳", "朱华", "胡静", "郭峰",
    "何宇", "高磊", "林娜", "罗晶", "郑昊", "梁静", "谢峰", "宋磊", "唐媛", "许峰",
    "韩雪", "冯敏", "邓超", "曹芳", "彭丽", "曾昊", "汪峰", "田静", "董磊", "潘婷",
    "袁静", "于娜", "蒋宇", "余静", "杜丽", "戴磊", "夏敏", "钟宇", "汪静", "王芳",
    "李静", "张磊", "陈宇", "杨芳", "赵磊", "黄宇", "周丽", "吴宇", "徐磊", "孙芳"
]

ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "delivered", "delivered", "cancelled"]
PAYMENT_STATUSES = ["paid", "paid", "paid", "paid", "unpaid", "refunded"]
PRODUCT_CATEGORIES = ["手机配件", "宿舍好物", "文具数码", "潮流配饰", "生活小物"]


def main():
    print("=" * 50)
    print("  Nexora 演示数据生成器")
    print("=" * 50)
    
    client = httpx.Client(base_url=BASE_URL, timeout=30.0)

    # Override client methods with automatic 429 retry
    _orig_post = client.post
    _orig_get = client.get

    def _post_with_retry(url, **kwargs):
        for _ in range(5):
            resp = _orig_post(url, **kwargs)
            if resp.status_code == 429:
                wait = resp.json().get("retry_after_seconds", 5)
                print(f"    速率限制，等待 {wait}s 后重试...")
                time.sleep(wait + 1)
                continue
            return resp
        return resp

    def _get_with_retry(url, **kwargs):
        for _ in range(5):
            resp = _orig_get(url, **kwargs)
            if resp.status_code == 429:
                wait = resp.json().get("retry_after_seconds", 5)
                time.sleep(wait + 1)
                continue
            return resp
        return resp

    client.post = _post_with_retry
    client.get = _get_with_retry
    
    # 1. Register/Login
    print("\n[1/8] 注册测试账号...")
    email = "demo@nexora.com"
    password = "Demo1234!"
    
    try:
        client.post("/auth/register", json={
            "email": email,
            "password": password,
            "full_name": "Demo Merchant"
        })
        print(f"  注册成功: {email}")
    except Exception:
        pass  # Already registered
    
    # Login
    resp = client.post("/auth/login", json={"email": email, "password": password})
    token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    print(f"  登录成功: {token[:20]}...")
    
    # 2. Get workspace
    print("\n[2/8] 获取工作空间...")
    resp = client.get("/workspaces")
    ws_data = resp.json()
    workspaces = ws_data if isinstance(ws_data, list) else ws_data.get("items", [])
    if not workspaces:
        print("  错误: 没有工作空间!")
        return
    ws_slug = workspaces[0]["slug"]
    ws_name = workspaces[0]["name"]
    print(f"  工作空间: {ws_name} (slug={ws_slug})")
    
    # 2.5 Subscribe to a plan (so Dashboard stat cards show data)
    print("\n[2.5/8] 订阅 Pro 计划...")
    try:
        plans = client.get("/subscriptions/plans").json()
        pro_slug = None
        for p in plans:
            if p.get("slug") == "pro":
                pro_slug = "pro"
                break
        if pro_slug:
            resp = client.post(
                f"/subscriptions/workspace/{ws_slug}/subscribe",
                json={"plan_slug": pro_slug},
            )
            if resp.status_code == 200:
                print(f"  已订阅 Pro 计划")
            else:
                print(f"  订阅失败: {resp.status_code} — 可能已有订阅")
        else:
            print("  未找到 Pro 计划")
    except Exception as e:
        print(f"  订阅异常 (可忽略): {e}")

    # 3. Create product categories
    print("\n[3/8] 创建商品分类...")
    for cat in PRODUCT_CATEGORIES:
        try:
            client.post(f"/workspaces/{ws_slug}/products/categories", json={"name": cat})
            print(f"  分类: {cat}")
        except Exception:
            pass
    
    # 4. Create products
    print("\n[4/8] 创建商品...")
    product_ids = []
    for i, name in enumerate(PRODUCT_NAMES):
        # College student price range: mostly ¥6.9-89.9, 15% chance of splurge items ¥99-299
        if random.random() < 0.15:
            price = round(random.uniform(99, 299), 2)
        else:
            price = round(random.uniform(6.9, 89.9), 2)
        cost = round(price * random.uniform(0.3, 0.6), 2)
        category = PRODUCT_CATEGORIES[i % len(PRODUCT_CATEGORIES)]
        try:
            resp = client.post(f"/workspaces/{ws_slug}/products", json={
                "name": name,
                "slug": f"product-{i+1:03d}",
                "sku": f"SKU-{i+1:04d}",
                "price": price,
                "cost_price": cost,
                "status": "active",
                "description": f"{name} - 高品质优选，限时特惠",
                "category": category,
                "tags": [category, "热销"],
            })
            if resp.status_code == 201:
                pid = resp.json().get("id")
                if pid:
                    product_ids.append((pid, name, price))
            elif resp.status_code == 409:
                # Already exists, will fetch later
                pass
            else:
                print(f"  商品 {name} 创建失败: {resp.status_code} {resp.text[:100]}")
            if (i + 1) % 10 == 0:
                print(f"  已处理 {i+1}/50 个商品")
        except Exception as e:
            print(f"  商品 {name} 创建异常: {e}")
    # If no new products were created, fetch existing ones
    if not product_ids:
        print("  商品已存在，从API获取现有商品...")
        resp = client.get(f"/workspaces/{ws_slug}/products?page=1&page_size=100")
        items = resp.json().get("items", [])
        for item in items:
            product_ids.append((item["id"], item["name"], float(item["price"])))
    print(f"  完成: {len(product_ids)} 个商品")

    # 5. Create customers
    print("\n[5/8] 创建100个客户...")
    customer_ids = []
    for i, name in enumerate(CUSTOMER_NAMES):
        try:
            resp = client.post(f"/workspaces/{ws_slug}/customers", json={
                "name": name,
                "email": f"customer{i+1}@example.com",
                "phone": f"138{random.randint(10000000, 99999999)}",
                "tags": ["VIP"] if i < 20 else (["老客户"] if i < 50 else ["新客户"]),
            })
            if resp.status_code == 201:
                cid = resp.json().get("id")
                if cid:
                    customer_ids.append((cid, name))
            elif resp.status_code == 409:
                pass
        except Exception:
            pass
        if (i + 1) % 20 == 0:
            print(f"  已处理 {i+1}/100 个客户")
    # If no new customers were created, fetch existing ones
    if not customer_ids:
        print("  客户已存在，从API获取现有客户...")
        resp = client.get(f"/workspaces/{ws_slug}/customers?page=1&page_size=100")
        items = resp.json().get("items", [])
        for item in items:
            customer_ids.append((item["id"], item["name"]))
    print(f"  完成: {len(customer_ids)} 个客户")
    
    # 6. Create orders (80 orders over 60 days, college-student realistic)
    print("\n[6/8] 创建80笔订单（大学生网店合理数据）...")
    now = datetime.now(timezone.utc)
    
    # Generate dates with weekend bias (more orders on Fri/Sat/Sun)
    dates = []
    for _ in range(80):
        # 60% of orders fall into weekend-ish (Thur-Sun)
        if random.random() < 0.6:
            day_offset = random.randint(0, 14)  # recent 2 weeks
            # bias toward last 3 days of week
            weekday = random.choices([3,4,5,6], weights=[1,2,3,2])[0]  # Thur-Sun
            base = now - timedelta(days=now.weekday() + 7)  # start of last week
            dates.append(base + timedelta(days=weekday) + timedelta(hours=random.randint(8,22), minutes=random.randint(0,59)))
        else:
            days_ago = random.randint(0, 59)
            dates.append(now - timedelta(days=days_ago, hours=random.randint(0,23)))
    
    dates.sort()
    
    for i in range(80):
        pid, pname, price = random.choice(product_ids)
        cid, cname = random.choice(customer_ids) if customer_ids else (None, "Walk-in")
        order_date = dates[i]
        
        quantity = 1 if random.random() < 0.7 else 2  # mostly 1-item orders
        unit_price = price
        total = round(quantity * unit_price, 2)
        
        # Status: delivered > confirmed > shipped > processing > pending > cancelled
        status = random.choice(["delivered","delivered","delivered","confirmed","confirmed","shipped","processing","pending","cancelled"])
        payment = random.choice(["paid","paid","paid","paid","paid","unpaid","refunded"])
        
        order_data = {
            "customer_id": cid,
            "customer_name": cname,
            "customer_email": f"customer{random.randint(1,100)}@example.com",
            "status": status,
            "payment_status": payment,
            "items": [{
                "product_id": pid,
                "product_name": pname,
                "quantity": quantity,
                "unit_price": unit_price,
                "total_price": total,
            }],
            "subtotal": total,
            "tax": 0,
            "shipping": 0 if total > 39 else round(random.uniform(5, 10), 2),  # free shipping over ¥39
            "discount": 0,
            "notes": random.choice(["","请发申通","放丰巢柜","联系我取件","加急发出",""]),
            "platform": random.choice(["manual","manual","douyin","shopify"]),
        }
        order_data["total"] = round(total + order_data["shipping"], 2)
        
        try:
            resp = client.post(f"/workspaces/{ws_slug}/orders", json=order_data)
            if resp.status_code != 201:
                if i == 0:
                    print(f"  订单创建失败示例: {resp.status_code} {resp.text[:200]}")
        except Exception as e:
            if i == 0:
                print(f"  订单创建异常: {e}")
        if (i + 1) % 20 == 0:
            print(f"  已处理 {i+1}/80 笔订单")
    print(f"  完成: 80 笔订单")
    
    # 7. Create stores
    print("\n[7/8] 创建演示店铺...")
    stores = [
        {
            "name": "校园好物小店",
            "platform": "shopify",
            "store_url": "https://campus-goods.myshopify.com",
            "api_key": "shpat_demo_key_001",
            "api_secret": "shss_demo_secret_001",
            "access_token": "shpat_demo_token_001",
        },
        {
            "name": "大学生活推荐",
            "platform": "douyin",
            "store_url": "https://www.douyin.com/shop/demo",
            "api_key": "dy_demo_key_002",
            "api_secret": "dy_demo_secret_002",
            "access_token": "dy_demo_token_002",
        },
    ]
    for store in stores:
        try:
            resp = client.post(f"/workspaces/{ws_slug}/stores", json=store)
            if resp.status_code == 201:
                print(f"  店铺: {store['name']} ({store['platform']})")
            elif resp.status_code == 409:
                print(f"  店铺已存在: {store['name']}")
            else:
                print(f"  店铺创建失败: {store['name']} - {resp.status_code} {resp.text[:100]}")
        except Exception as e:
            print(f"  店铺创建异常: {store['name']} - {e}")
    
    # 8. Create demo API keys
    print("\n[8/8] 创建演示 API 密钥...")
    api_keys = [
        {"name": "生产环境只读密钥", "scopes": {"read": True}},
        {"name": "开发测试密钥", "scopes": {"read": True, "write": True}},
    ]
    for ak in api_keys:
        try:
            resp = client.post(
                f"/workspaces/{ws_slug}/api-keys/",
                json={"name": ak["name"], "scopes": ak["scopes"]},
            )
            if resp.status_code == 201:
                prefix = resp.json()["api_key"]["key_prefix"]
                print(f"  密钥: {ak['name']} (前缀: {prefix})")
            elif resp.status_code == 409:
                print(f"  密钥已存在: {ak['name']}")
            else:
                print(f"  密钥创建失败: {ak['name']} - {resp.status_code} {resp.text[:100]}")
        except Exception as e:
            print(f"  密钥创建异常: {ak['name']} - {e}")
    
    print("\n" + "=" * 50)
    print("  演示数据生成完成!")
    print(f"  账号: {email}")
    print(f"  密码: {password}")
    print(f"  工作空间: {ws_name}")
    print("  (含 2 个预创建的 API 密钥)")
    print("=" * 50)


if __name__ == "__main__":
    main()
