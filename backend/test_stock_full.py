"""
Stock System Full Test Suite
=============================
Tests all stock operations: purchase, sale, credit return, customer return,
supplier return, dump, closing stock, business date change, and edge cases.

Run with:  python test_stock_full.py
Requires:  fresh (empty) database + backend running on http://localhost:5000

Logs are written to: test_stock_full.log  (same directory)
"""

import requests
import json
import sys
import logging
import traceback
from datetime import datetime

# ── Logging setup ────────────────────────────────────────────────────────────
LOG_FILE = "test_stock_full.log"

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, mode="w", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger("stock_test")

BASE = "http://localhost:5000/api"
TOKEN = None
HEADERS = {}
PASS = 0
FAIL = 0
FAILURES = []  # collect (label, detail) for summary

IDS = {
    "user1": None, "user2": None,
    "supplier1": None, "supplier2": None,
    "customer1": None, "customer2": None,
    "prod_regular1": None, "prod_regular2": None,
    "purchase1": None,
    "invoice1": None,
    "sale1": None, "sale3": None,
    "customer_return1": None,
    "supplier_return1": None,
    "dump1": None,
}

DAY1 = "2026-06-01"
DAY2 = "2026-06-02"
DAY3 = "2026-06-03"


# ── HTTP helpers ─────────────────────────────────────────────────────────────
def _req(method, path, body=None):
    url = f"{BASE}{path}"
    try:
        if method == "GET":
            r = requests.get(url, headers=HEADERS, timeout=15)
        elif method == "POST":
            r = requests.post(url, json=body, headers=HEADERS, timeout=15)
        elif method == "PUT":
            r = requests.put(url, json=body, headers=HEADERS, timeout=15)
        elif method == "DELETE":
            r = requests.delete(url, headers=HEADERS, timeout=15)
        else:
            raise ValueError(f"Unknown method: {method}")

        log.debug(f"{method} {path}  →  HTTP {r.status_code}")
        if body:
            log.debug(f"  REQUEST  body={json.dumps(body, default=str)[:500]}")
        try:
            resp_json = r.json()
            log.debug(f"  RESPONSE body={json.dumps(resp_json, default=str)[:500]}")
        except Exception:
            log.debug(f"  RESPONSE text={r.text[:300]}")
        return r
    except requests.exceptions.ConnectionError as e:
        log.error(f"CONNECTION ERROR {method} {path}: {e}")
        raise
    except Exception as e:
        log.error(f"REQUEST ERROR {method} {path}: {e}\n{traceback.format_exc()}")
        raise

def post(path, body):   return _req("POST",   path, body)
def get(path):          return _req("GET",    path)
def put(path, body):    return _req("PUT",    path, body)
def delete(path):       return _req("DELETE", path)

# ── Assertion helper ──────────────────────────────────────────────────────────
def ok(label, condition, detail=""):
    global PASS, FAIL, FAILURES
    if condition:
        log.info(f"  ✅  PASS  {label}")
        PASS += 1
    else:
        log.error(f"  ❌  FAIL  {label}  |  detail: {detail}")
        FAILURES.append((label, str(detail)))
        FAIL += 1

# ── Stock check helper ────────────────────────────────────────────────────────
def stock_check(from_date, to_date):
    log.debug(f"stock_check({from_date}, {to_date})")
    r = get(f"/reports/stock-check?fromDate={from_date}&toDate={to_date}")
    if r.status_code != 200:
        log.error(f"stock_check failed: HTTP {r.status_code}  {r.text[:300]}")
        return {}
    items = r.json()
    result = {i["productDescription"]: i for i in items}
    log.debug(f"  stock_check returned {len(result)} products")
    for name, row in result.items():
        log.debug(f"    {name}: OS={row.get('os')} NS={row.get('ns')} "
                  f"Sales={row.get('sales')} CRTN={row.get('crtn')} "
                  f"Dmps={row.get('dmps')} SRTN={row.get('srtn')} "
                  f"Stock={row.get('stock')} ClStock={row.get('clStock')} "
                  f"Result={row.get('result')}")
    return result


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 1 — AUTH
# ═══════════════════════════════════════════════════════════════════════════
def test_login():
    global TOKEN, HEADERS
    log.info("\n" + "="*60)
    log.info("SECTION 1: Auth")
    log.info("="*60)
    try:
        r = post("/auth/login", {"username": "admin", "password": "admin123"})
        ok("Login returns 200", r.status_code == 200, r.text[:200])
        data = r.json()
        TOKEN = data.get("access_token") or data.get("token")
        ok("Token received", bool(TOKEN), str(data)[:200])
        HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
        log.info(f"  Token: {TOKEN[:30]}...")
    except Exception as e:
        log.error(f"test_login EXCEPTION: {e}\n{traceback.format_exc()}")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2 — SETUP
# ═══════════════════════════════════════════════════════════════════════════
def test_setup():
    log.info("\n" + "="*60)
    log.info("SECTION 2: Setup — users, suppliers, customers, products")
    log.info("="*60)
    try:
        for key, payload in [
            ("user1", {"username": "testuser1", "password": "pass123", "userType": "user", "status": "Active"}),
            ("user2", {"username": "testuser2", "password": "pass123", "userType": "user", "status": "Active"}),
        ]:
            r = post("/users", payload)
            ok(f"Create {key}", r.status_code in (200, 201), r.text[:200])
            IDS[key] = r.json().get("id")
            log.info(f"  {key} id={IDS[key]}")

        for key, payload in [
            ("supplier1", {"supplier_code": "SUP001", "supplier_name": "Fresh Farms Ltd",
                           "supplier_currency": "GBP", "is_active": "Yes"}),
            ("supplier2", {"supplier_code": "SUP002", "supplier_name": "Green Valley Co",
                           "supplier_currency": "GBP", "is_active": "Yes"}),
        ]:
            r = post("/suppliers", payload)
            ok(f"Create {key}", r.status_code in (200, 201), r.text[:200])
            IDS[key] = r.json().get("id")
            log.info(f"  {key} id={IDS[key]}")

        for key, payload in [
            ("customer1", {"customer_code": "C001", "customer_name": "Test Customer A",
                           "customer_currency": "GBP", "is_active": "yes"}),
            ("customer2", {"customer_code": "C002", "customer_name": "Test Customer B",
                           "customer_currency": "GBP", "is_active": "yes"}),
        ]:
            r = post("/customers", payload)
            ok(f"Create {key}", r.status_code in (200, 201), r.text[:200])
            IDS[key] = r.json().get("id")
            log.info(f"  {key} id={IDS[key]}")

        base_prod = {"sellingPrice": 5.00, "taxRate": 0, "status": "active",
                     "reorderLevel": 0, "stockLevelFlag": False, "unitWeight": 0,
                     "reorderQuantity": 0, "lastStockTake": 0, "initialStock": 0}
        for key, extra in [
            ("prod_regular1", {"productCode": "P001", "description": "Casava Cr"}),
            ("prod_regular2", {"productCode": "P002", "description": "Plantain", "sellingPrice": 3.00}),
        ]:
            r = post("/products/regular", {**base_prod, **extra})
            ok(f"Create {key} ({extra['description']})", r.status_code in (200, 201), r.text[:200])
            IDS[key] = r.json().get("id")
            log.info(f"  {key} id={IDS[key]}")

        log.info(f"  Final IDs: {IDS}")
    except Exception as e:
        log.error(f"test_setup EXCEPTION: {e}\n{traceback.format_exc()}")


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 3 — DAY 1: Purchases
# ═══════════════════════════════════════════════════════════════════════════
def test_day1_purchases():
    log.info("\n" + "="*60)
    log.info(f"SECTION 3: Day 1 ({DAY1}) — Purchases")
    log.info("="*60)
    try:
        r = post("/purchases", {"supplierId": IDS["supplier1"],
                                "invoiceDate": DAY1, "deliveryNo": "DEL001",
                                "supplierInvoice": "SUPINV001", "awb": "AWB001",
                                "amount": 500.00})
        ok("Create purchase order 1", r.status_code in (200, 201), r.text[:200])
        IDS["purchase1"] = r.json().get("id")

        r = post("/purchase-invoices", {
            "purchaseId": IDS["purchase1"], "supplierId": IDS["supplier1"], "date": DAY1,
            "items": [
                {"productId": IDS["prod_regular1"], "productName": "Casava Cr",
                 "quantity": 50, "unitPrice": 5.00, "totalPrice": 250.00},
                {"productId": IDS["prod_regular2"], "productName": "Plantain",
                 "quantity": 30, "unitPrice": 3.00, "totalPrice": 90.00},
            ]
        })
        ok("Create purchase invoice 1 (50 Casava + 30 Plantain)", r.status_code in (200, 201), r.text[:200])
        IDS["invoice1"] = r.json().get("id")

        sc = stock_check(DAY1, DAY1)
        casava = sc.get("Casava Cr", {})
        ok("Day1 Casava NS=50", casava.get("ns") == 50, str(casava))
        ok("Day1 Casava OS=0 (no prev closing stock)", casava.get("os") == 0, str(casava))
        ok("Day1 Plantain NS=30", sc.get("Plantain", {}).get("ns") == 30, str(sc.get("Plantain")))
    except Exception as e:
        log.error(f"test_day1_purchases EXCEPTION: {e}\n{traceback.format_exc()}")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 4 — DAY 1: Sales
# ═══════════════════════════════════════════════════════════════════════════
def test_day1_sales():
    log.info("\n" + "="*60)
    log.info(f"SECTION 4: Day 1 ({DAY1}) — Sales")
    log.info("="*60)
    try:
        r = post("/sales", {
            "customer_id": IDS["customer1"], "date": DAY1, "customer_type": "cash",
            "status": "finalized", "subtotal": 65.00, "porterage": 0,
            "vat_rate": 0, "vat_amount": 0, "total_amount": 65.00,
            "items": [
                {"product_id": IDS["prod_regular1"], "quantity": 10, "unit_price": 5.00, "total_price": 50.00},
                {"product_id": IDS["prod_regular2"], "quantity": 5,  "unit_price": 3.00, "total_price": 15.00},
            ]
        })
        ok("Create sale 1 (10 Casava + 5 Plantain, finalized)", r.status_code in (200, 201), r.text[:200])
        IDS["sale1"] = r.json().get("id")

        sc = stock_check(DAY1, DAY1)
        casava = sc.get("Casava Cr", {})
        ok("Day1 Casava sales=10", casava.get("sales") == 10, str(casava))
        ok("Day1 Casava expected stock=40", casava.get("stock") == 40, str(casava))
        ok("Day1 Plantain expected stock=25", sc.get("Plantain", {}).get("stock") == 25, str(sc.get("Plantain")))
    except Exception as e:
        log.error(f"test_day1_sales EXCEPTION: {e}\n{traceback.format_exc()}")


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 5 — DAY 1: Customer Return
# ═══════════════════════════════════════════════════════════════════════════
def test_day1_customer_return():
    log.info("\n" + "="*60)
    log.info(f"SECTION 5: Day 1 ({DAY1}) — Customer Return")
    log.info("="*60)
    try:
        r = post("/customer-returns", {
            "customerId": IDS["customer1"], "saleId": IDS["sale1"],
            "productId": IDS["prod_regular1"], "productType": "regular",
            "description": "Casava Cr", "invoiceNumber": "INV-001",
            "quantity": 3, "unitPrice": 5.00, "date": DAY1,
            "returnReason": "Damaged", "creditNoteIssued": False,
            "creditNoteAmount": 0, "status": "completed"
        })
        ok("Create customer return (3 Casava, completed)", r.status_code in (200, 201), r.text[:200])
        IDS["customer_return1"] = r.json().get("id")
        log.info(f"  customer_return1 id={IDS['customer_return1']}")

        sc = stock_check(DAY1, DAY1)
        casava = sc.get("Casava Cr", {})
        ok("Day1 Casava C.RTN=3", casava.get("crtn") == 3, str(casava))
        ok("Day1 Casava expected stock=43 (50-10+3)", casava.get("stock") == 43, str(casava))
    except Exception as e:
        log.error(f"test_day1_customer_return EXCEPTION: {e}\n{traceback.format_exc()}")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 6 — DAY 1: Supplier Return
# ═══════════════════════════════════════════════════════════════════════════
def test_day1_supplier_return():
    log.info("\n" + "="*60)
    log.info(f"SECTION 6: Day 1 ({DAY1}) — Supplier Return")
    log.info("="*60)
    try:
        r = post("/supplier-returns", {
            "supplierId": IDS["supplier1"], "purchaseInvoiceId": IDS["invoice1"],
            "productId": IDS["prod_regular2"], "productType": "regular",
            "description": "Plantain", "invoiceNumber": "SR-001",
            "quantity": 5, "unitPrice": 3.00, "date": DAY1,
            "returnReason": "Overripe", "creditNoteIssued": False,
            "creditNoteAmount": 0, "status": "pending"
        })
        ok("Create supplier return (5 Plantain)", r.status_code in (200, 201), r.text[:200])
        IDS["supplier_return1"] = r.json().get("id")
        log.info(f"  supplier_return1 id={IDS['supplier_return1']}")

        sc = stock_check(DAY1, DAY1)
        plantain = sc.get("Plantain", {})
        ok("Day1 Plantain S.RTN=5 (Fix 2: was always 0 before)", plantain.get("srtn") == 5, str(plantain))
        log.info(f"  Plantain row after supplier return: {plantain}")
    except Exception as e:
        log.error(f"test_day1_supplier_return EXCEPTION: {e}\n{traceback.format_exc()}")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 7 — DAY 1: Dump Entry
# ═══════════════════════════════════════════════════════════════════════════
def test_day1_dump():
    log.info("\n" + "="*60)
    log.info(f"SECTION 7: Day 1 ({DAY1}) — Dump Entry")
    log.info("="*60)
    try:
        r = post("/dump-entries", {
            "supplierId": IDS["supplier1"], "productId": IDS["prod_regular1"],
            "productType": "regular", "description": "Casava Cr",
            "quantity": 2, "unitPrice": 5.00, "date": DAY1, "remarks": "Rotten"
        })
        ok("Create dump entry (2 Casava)", r.status_code in (200, 201), r.text[:200])
        IDS["dump1"] = r.json().get("id")
        log.info(f"  dump1 id={IDS['dump1']}")

        sc = stock_check(DAY1, DAY1)
        casava = sc.get("Casava Cr", {})
        # OS=0, NS=50, Sales=10, CRTN=3, Dmps=2 → 0+50-10+3-2=41
        ok("Day1 Casava Dmps=2", casava.get("dmps") == 2, str(casava))
        ok("Day1 Casava expected stock=41", casava.get("stock") == 41, str(casava))
    except Exception as e:
        log.error(f"test_day1_dump EXCEPTION: {e}\n{traceback.format_exc()}")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 8 — DAY 1: Closing Stock (Rule A)
# ═══════════════════════════════════════════════════════════════════════════
def test_day1_closing_stock():
    log.info("\n" + "="*60)
    log.info(f"SECTION 8: Day 1 ({DAY1}) — Closing Stock (Rule A)")
    log.info("="*60)
    try:
        r = post("/closing-stock", {
            "date": DAY1,
            "items": [
                {"productId": IDS["prod_regular1"], "productType": "regular", "quantity": 40},
                {"productId": IDS["prod_regular2"], "productType": "regular", "quantity": 25},
            ]
        })
        ok("Save closing stock for Day1", r.status_code == 200, r.text[:200])
        log.info("  Closing stock saved: Casava=40, Plantain=25")

        sc = stock_check(DAY1, DAY1)
        casava = sc.get("Casava Cr", {})
        ok("Day1 Casava clStock=40 (manual override)", casava.get("clStock") == 40, str(casava))
        ok("Day1 Casava result contains 'short' (expected 41, entered 40)",
           "short" in str(casava.get("result", "")), str(casava))
        ok("Day1 Plantain clStock=25", sc.get("Plantain", {}).get("clStock") == 25, str(sc.get("Plantain")))
    except Exception as e:
        log.error(f"test_day1_closing_stock EXCEPTION: {e}\n{traceback.format_exc()}")


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 9 — DAY 2: Opening Stock (Rule A)
# ═══════════════════════════════════════════════════════════════════════════
def test_day2_opening_stock():
    log.info("\n" + "="*60)
    log.info(f"SECTION 9: Day 2 ({DAY2}) — Opening Stock (Rule A)")
    log.info("="*60)
    try:
        sc = stock_check(DAY2, DAY2)
        casava = sc.get("Casava Cr", {})
        plantain = sc.get("Plantain", {})
        ok("Day2 Casava OS=40 (from Day1 closing stock)", casava.get("os") == 40, str(casava))
        ok("Day2 Plantain OS=25", plantain.get("os") == 25, str(plantain))
        ok("Day2 Casava NS=0 (no purchases)", casava.get("ns") == 0, str(casava))
        ok("Day2 Casava expected stock=40", casava.get("stock") == 40, str(casava))
    except Exception as e:
        log.error(f"test_day2_opening_stock EXCEPTION: {e}\n{traceback.format_exc()}")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 10 — DAY 2: Credit Return via Negative Qty (Fix 4)
# ═══════════════════════════════════════════════════════════════════════════
def test_day2_credit_return_in_sale():
    log.info("\n" + "="*60)
    log.info(f"SECTION 10: Day 2 ({DAY2}) — Credit Return via Negative Qty (Fix 4)")
    log.info("="*60)
    try:
        r = post("/sales", {
            "customer_id": IDS["customer1"], "date": DAY2, "customer_type": "cash",
            "status": "finalized", "subtotal": 30.00, "porterage": 0,
            "vat_rate": 0, "vat_amount": 0, "total_amount": 30.00,
            "items": [
                {"product_id": IDS["prod_regular1"], "quantity":  8, "unit_price": 5.00, "total_price":  40.00},
                {"product_id": IDS["prod_regular1"], "quantity": -2, "unit_price": 5.00, "total_price": -10.00},
            ]
        })
        ok("Create sale with inline credit return (8 sold, -2 returned)", r.status_code in (200, 201), r.text[:200])
        IDS["sale3"] = r.json().get("id")
        log.info(f"  sale3 id={IDS['sale3']}")

        sc = stock_check(DAY2, DAY2)
        casava = sc.get("Casava Cr", {})
        # OS=40, NS=0, Sales=8, CRTN=2 → 40-8+2=34
        ok("Day2 Casava sales=6 (net: 8 sold - 2 returned inline)", casava.get("sales") == 6, str(casava))
        ok("Day2 Casava C.RTN=2 (Fix 4: inline credit now counted)", casava.get("crtn") == 2, str(casava))
        ok("Day2 Casava expected stock=36 (OS=40 - net_sales=6 + crtn=2)", casava.get("stock") == 36, str(casava))
    except Exception as e:
        log.error(f"test_day2_credit_return_in_sale EXCEPTION: {e}\n{traceback.format_exc()}")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 11 — DAY 2: Dump Update (Fix 3)
# ═══════════════════════════════════════════════════════════════════════════
def test_day2_dump_update():
    log.info("\n" + "="*60)
    log.info(f"SECTION 11: Day 2 ({DAY2}) — Dump Update (Fix 3)")
    log.info("="*60)
    try:
        r = post("/dump-entries", {
            "supplierId": IDS["supplier1"], "productId": IDS["prod_regular2"],
            "productType": "regular", "description": "Plantain",
            "quantity": 4, "unitPrice": 3.00, "date": DAY2, "remarks": "Overripe"
        })
        ok("Create dump (4 Plantain on Day2)", r.status_code in (200, 201), r.text[:200])
        dump2_id = r.json().get("id")
        log.info(f"  dump2 id={dump2_id}")

        sc = stock_check(DAY2, DAY2)
        plantain = sc.get("Plantain", {})
        ok("Day2 Plantain Dmps=4 after create", plantain.get("dmps") == 4, str(plantain))
        ok("Day2 Plantain expected stock=21 (25-4)", plantain.get("stock") == 21, str(plantain))

        log.info("  Updating dump from 4 to 6...")
        r = put(f"/dump-entries/{dump2_id}", {
            "supplierId": IDS["supplier1"], "productId": IDS["prod_regular2"],
            "productType": "regular", "description": "Plantain",
            "quantity": 6, "unitPrice": 3.00, "date": DAY2, "remarks": "Overripe - updated"
        })
        ok("Update dump from 4 to 6", r.status_code == 200, r.text[:200])

        sc = stock_check(DAY2, DAY2)
        plantain = sc.get("Plantain", {})
        ok("Day2 Plantain Dmps=6 after update (Fix 3)", plantain.get("dmps") == 6, str(plantain))
        ok("Day2 Plantain expected stock=19 (25-6)", plantain.get("stock") == 19, str(plantain))
    except Exception as e:
        log.error(f"test_day2_dump_update EXCEPTION: {e}\n{traceback.format_exc()}")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 12 — DAY 3: Rule B (no closing stock = OS zero)
# ═══════════════════════════════════════════════════════════════════════════
def test_day3_rule_b():
    log.info("\n" + "="*60)
    log.info(f"SECTION 12: Day 3 ({DAY3}) — Rule B (no Day2 closing stock → OS=0)")
    log.info("="*60)
    try:
        log.info("  (No closing stock entered for Day2 — intentional)")
        sc = stock_check(DAY3, DAY3)
        casava = sc.get("Casava Cr", {})
        plantain = sc.get("Plantain", {})
        ok("Day3 Casava OS=0 (Rule B)", casava.get("os") == 0, str(casava))
        ok("Day3 Plantain OS=0 (Rule B)", plantain.get("os") == 0, str(plantain))

        r = post("/purchases", {"supplierId": IDS["supplier1"],
                                "invoiceDate": DAY3, "deliveryNo": "DEL004",
                                "supplierInvoice": "SUPINV004", "awb": "AWB004",
                                "amount": 100.00})
        purchase3_id = r.json().get("id")
        r = post("/purchase-invoices", {
            "purchaseId": purchase3_id, "supplierId": IDS["supplier1"], "date": DAY3,
            "items": [{"productId": IDS["prod_regular1"], "productName": "Casava Cr",
                       "quantity": 10, "unitPrice": 5.00, "totalPrice": 50.00}]
        })
        ok("Day3 purchase invoice (10 Casava)", r.status_code in (200, 201), r.text[:200])

        sc = stock_check(DAY3, DAY3)
        casava = sc.get("Casava Cr", {})
        ok("Day3 Casava OS=0, NS=10, stock=10 (starts from zero)", casava.get("stock") == 10, str(casava))
    except Exception as e:
        log.error(f"test_day3_rule_b EXCEPTION: {e}\n{traceback.format_exc()}")


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 13 — EDGE CASES
# ═══════════════════════════════════════════════════════════════════════════
def test_edge_cases():
    log.info("\n" + "="*60)
    log.info("SECTION 13: Edge Cases")
    log.info("="*60)
    try:
        # Edge 1: Purchase invoice update
        log.info("  Edge1: Update purchase invoice (50→60 Casava)")
        r = put(f"/purchase-invoices/{IDS['invoice1']}", {
            "remarks": "Updated",
            "items": [
                {"productId": IDS["prod_regular1"], "productName": "Casava Cr",
                 "quantity": 60, "unitPrice": 5.00, "totalPrice": 300.00},
                {"productId": IDS["prod_regular2"], "productName": "Plantain",
                 "quantity": 30, "unitPrice": 3.00, "totalPrice": 90.00},
            ]
        })
        ok("Edge1: Update purchase invoice", r.status_code == 200, r.text[:200])
        sc = stock_check(DAY1, DAY1)
        ok("Edge1: Day1 Casava NS=60 after update", sc.get("Casava Cr", {}).get("ns") == 60,
           str(sc.get("Casava Cr")))

        # Edge 2: Delete purchase invoice
        log.info("  Edge2: Delete purchase invoice")
        r = post("/purchases", {"supplierId": IDS["supplier2"],
                                "invoiceDate": DAY1, "deliveryNo": "DEL003",
                                "supplierInvoice": "SUPINV003", "awb": "AWB003",
                                "amount": 50.00})
        tmp_pid = r.json().get("id")
        r = post("/purchase-invoices", {
            "purchaseId": tmp_pid, "supplierId": IDS["supplier2"], "date": DAY1,
            "items": [{"productId": IDS["prod_regular1"], "productName": "Casava Cr",
                       "quantity": 5, "unitPrice": 5.00, "totalPrice": 25.00}]
        })
        ok("Edge2: Create temp invoice (5 Casava)", r.status_code in (200, 201), r.text[:200])
        tmp_inv_id = r.json().get("id")
        ns_before = stock_check(DAY1, DAY1).get("Casava Cr", {}).get("ns", 0)
        log.info(f"  NS before delete: {ns_before}")
        r = delete(f"/purchase-invoices/{tmp_inv_id}")
        ok("Edge2: Delete temp invoice", r.status_code == 200, r.text[:200])
        ns_after = stock_check(DAY1, DAY1).get("Casava Cr", {}).get("ns", 0)
        log.info(f"  NS after delete: {ns_after}")
        ok("Edge2: NS reduced by 5 after delete", ns_after == ns_before - 5,
           f"before={ns_before} after={ns_after}")

        # Edge 3: Draft sale does NOT affect stock
        log.info("  Edge3: Draft sale should not affect stock")
        sales_before = stock_check(DAY1, DAY1).get("Casava Cr", {}).get("sales", 0)
        r = post("/sales", {
            "customer_id": IDS["customer1"], "date": DAY1, "customer_type": "cash",
            "status": "draft", "subtotal": 25.00, "porterage": 0,
            "vat_rate": 0, "vat_amount": 0, "total_amount": 25.00,
            "items": [{"product_id": IDS["prod_regular1"], "quantity": 5,
                       "unit_price": 5.00, "total_price": 25.00}]
        })
        ok("Edge3: Create draft sale", r.status_code in (200, 201), r.text[:200])
        sales_after = stock_check(DAY1, DAY1).get("Casava Cr", {}).get("sales", 0)
        ok("Edge3: Draft sale does NOT change sales qty",
           sales_after == sales_before, f"before={sales_before} after={sales_after}")

        # Edge 4: Delete customer return
        log.info("  Edge4: Delete customer return")
        r = delete(f"/customer-returns/{IDS['customer_return1']}")
        ok("Edge4: Delete customer return", r.status_code == 200, r.text[:200])
        sc4 = stock_check(DAY1, DAY1)
        casava4 = sc4.get("Casava Cr") or {}
        ok("Edge4: C.RTN=0 after customer return deleted", casava4.get("crtn") == 0, f"crtn={casava4.get('crtn')}")

        # Edge 5: Delete supplier return
        log.info("  Edge5: Delete supplier return")
        r = delete(f"/supplier-returns/{IDS['supplier_return1']}")
        ok("Edge5: Delete supplier return", r.status_code == 200, r.text[:200])
        sc5 = stock_check(DAY1, DAY1)
        plantain5 = sc5.get("Plantain") or {}
        ok("Edge5: S.RTN=0 after supplier return deleted", plantain5.get("srtn") == 0, f"srtn={plantain5.get('srtn')}")

        # Edge 6: Delete dump
        log.info("  Edge6: Delete dump entry")
        r = delete(f"/dump-entries/{IDS['dump1']}")
        ok("Edge6: Delete dump entry", r.status_code == 200, r.text[:200])
        sc6 = stock_check(DAY1, DAY1)
        casava6 = sc6.get("Casava Cr") or {}
        ok("Edge6: Dmps=0 after dump delete", casava6.get("dmps") == 0, f"dmps={casava6.get('dmps')}")

    except Exception as e:
        log.error(f"test_edge_cases EXCEPTION: {e}\n{traceback.format_exc()}")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 14 — BUSINESS DATE SWITCH
# ═══════════════════════════════════════════════════════════════════════════
def test_business_date():
    log.info("\n" + "="*60)
    log.info("SECTION 14: Business Date Switch")
    log.info("="*60)
    try:
        r = get("/business-date")
        ok("Get business date returns 200", r.status_code == 200, r.text[:200])
        current = r.json().get("currentDate") or r.json().get("current_date")
        ok("Business date returned", bool(current), r.text[:200])
        log.info(f"  Current business date: {current}")

        r = post("/business-date/switch", {})
        ok("Switch business date returns 200", r.status_code == 200, r.text[:200])
        r2 = get("/business-date")
        new_date = r2.json().get("currentDate") or r2.json().get("current_date")
        log.info(f"  New business date: {new_date}")
        ok("Business date changed after switch", new_date != current, f"was={current} now={new_date}")
    except Exception as e:
        log.error(f"test_business_date EXCEPTION: {e}\n{traceback.format_exc()}")

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 15 — STOCK ADJUSTMENT
# ═══════════════════════════════════════════════════════════════════════════
def test_stock_adjustment():
    log.info("\n" + "="*60)
    log.info("SECTION 15: Stock Adjustment")
    log.info("="*60)
    try:
        r = post("/stock/adjust", {
            "productId": IDS["prod_regular1"], "productType": "regular",
            "adjustmentType": "increase", "quantity": 5,
            "reason": "Stock count correction", "remarks": "Test +5",
            "adjustmentDate": DAY1
        })
        ok("Stock adjustment increase +5 Casava", r.status_code in (200, 201), r.text[:200])

        r = post("/stock/adjust", {
            "productId": IDS["prod_regular1"], "productType": "regular",
            "adjustmentType": "decrease", "quantity": 3,
            "reason": "Correction", "remarks": "Test -3",
            "adjustmentDate": DAY1
        })
        ok("Stock adjustment decrease -3 Casava", r.status_code in (200, 201), r.text[:200])
    except Exception as e:
        log.error(f"test_stock_adjustment EXCEPTION: {e}\n{traceback.format_exc()}")

# ═══════════════════════════════════════════════════════════════════════════
# MAIN RUNNER
# ═══════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    start = datetime.now()
    log.info("=" * 60)
    log.info("  STOCK SYSTEM FULL TEST SUITE")
    log.info(f"  Started: {start.strftime('%Y-%m-%d %H:%M:%S')}")
    log.info(f"  Backend: {BASE}")
    log.info(f"  Log file: {LOG_FILE}")
    log.info("  NOTE: Run against a FRESH empty database only")
    log.info("=" * 60)

    test_login()
    if not TOKEN:
        log.error("Cannot continue without auth token. Check admin credentials.")
        sys.exit(1)

    test_setup()
    test_day1_purchases()
    test_day1_sales()
    test_day1_customer_return()
    test_day1_supplier_return()
    test_day1_dump()
    test_day1_closing_stock()
    test_day2_opening_stock()
    test_day2_credit_return_in_sale()
    test_day2_dump_update()
    test_day3_rule_b()
    test_edge_cases()
    test_business_date()
    test_stock_adjustment()

    elapsed = (datetime.now() - start).total_seconds()
    log.info("\n" + "=" * 60)
    log.info(f"  RESULTS:  ✅ {PASS} passed   ❌ {FAIL} failed")
    log.info(f"  Duration: {elapsed:.1f}s")
    log.info(f"  Full log: {LOG_FILE}")

    if FAILURES:
        log.info("\n" + "-" * 60)
        log.info(f"  FAILED TESTS ({len(FAILURES)}):")
        log.info("-" * 60)
        for i, (label, detail) in enumerate(FAILURES, 1):
            log.error(f"  {i:>2}. ❌  {label}")
            # Truncate detail to keep it readable
            short_detail = detail[:200] + "..." if len(detail) > 200 else detail
            log.error(f"       Detail: {short_detail}")

    log.info("=" * 60)
    sys.exit(0 if FAIL == 0 else 1)
