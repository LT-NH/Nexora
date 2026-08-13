# -*- coding: utf-8 -*-
"""按 ecommerce.ts 接口清单逐条验证 saas-forge 后端。"""
import json, urllib.request, urllib.error

BASE = "http://127.0.0.1:8000/api/v1"

def req(method, path, token, body=None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", f"Bearer {token}")
    if data:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:150]

# 登录
_, login = req("POST", "/auth/login", "", {"email": "demo@nexora.com", "password": "Demo1234!"})
token = login.get("access_token", "")
print("登录:", "OK" if token else "FAIL")

_, ws = req("GET", "/workspaces", token)
slug = ws["items"][0]["slug"]
print(f"workspace: {slug}\n")

results = []
def check(name, method, path, body=None):
    code, _ = req(method, path, token, body)
    results.append((name, code))
    print(f"{code} {name}")

check("GET products", "GET", f"/workspaces/{slug}/products?page=1&page_size=5")
check("GET orders", "GET", f"/workspaces/{slug}/orders?page=1&page_size=5")
check("GET orders/stats", "GET", f"/workspaces/{slug}/orders/stats")
check("GET customers", "GET", f"/workspaces/{slug}/customers?page=1&page_size=5")
check("GET customers/rfm-analysis", "GET", f"/workspaces/{slug}/customers/rfm-analysis")
check("GET stores", "GET", f"/workspaces/{slug}/stores")
check("GET coupons", "GET", f"/workspaces/{slug}/coupons")
check("GET reviews/stats", "GET", f"/workspaces/{slug}/reviews/stats")
check("GET refunds", "GET", f"/workspaces/{slug}/refunds?page=1&page_size=5")
check("GET refunds/stats", "GET", f"/workspaces/{slug}/refunds/stats")
check("GET membership", "GET", f"/workspaces/{slug}/membership")
check("POST products (create)", "POST", f"/workspaces/{slug}/products",
      {"name": "接口验证商品", "slug": "verify-prod-001", "price": 99, "stock": 10, "sku": "VP001"})

# 拿刚创建的商品 id 继续 CRUD
_, plist = req("GET", f"/workspaces/{slug}/products?page=1&page_size=100", token)
pid = next((p["id"] for p in plist.get("items", []) if p.get("slug") == "verify-prod-001"), None)
if pid:
    check("GET product detail", "GET", f"/workspaces/{slug}/products/{pid}")
    check("PUT product", "PUT", f"/workspaces/{slug}/products/{pid}", {"price": 88})
    check("POST variant", "POST", f"/workspaces/{slug}/products/{pid}/variants", {"name": "黑色", "price": 99, "stock": 5})
    _, vlist = req("GET", f"/workspaces/{slug}/products/{pid}/variants", token)
    vid = (vlist or [{}])[0].get("id", "")
    if vid:
        check("PUT variant", "PUT", f"/workspaces/{slug}/products/{pid}/variants/{vid}", {"price": 90})
        check("DELETE variant", "DELETE", f"/workspaces/{slug}/products/{pid}/variants/{vid}")
    check("POST categories", "POST", f"/workspaces/{slug}/products/categories", {"name": "测试分类", "slug": "test-cat-001"})
    check("DELETE product", "DELETE", f"/workspaces/{slug}/products/{pid}")
else:
    print("!! 未找到创建的商品（POST products 可能失败）")

check("POST coupons", "POST", f"/workspaces/{slug}/coupons",
      {"code": "VERIFY20", "type": "fixed", "value": 20, "min_order_amount": 99, "expires_at": "2026-09-01T00:00:00"})
check("POST coupons/validate", "POST", f"/workspaces/{slug}/coupons/validate", {"code": "VERIFY20", "order_amount": 120})
check("POST orders (create)", "POST", f"/workspaces/{slug}/orders",
      {"customer_name": "接口测试", "items": [{"product_name": "验证商品", "quantity": 1, "unit_price": 10}], "total": 10, "status": "confirmed", "payment_status": "paid"})
check("GET health", "GET", f"/workspaces/{slug}/health")
check("GET health/weekly-review", "GET", f"/workspaces/{slug}/health/weekly-review")

print("\n=== 汇总 ===")
fails = [r for r in results if r[1] >= 400]
print(f"总检查 {len(results)} 项 | 通过 {len(results)-len(fails)} | 失败 {len(fails)}")
for name, code in fails:
    print(f"  FAIL {code} {name}")
