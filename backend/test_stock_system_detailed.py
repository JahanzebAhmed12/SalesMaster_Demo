"""Extremely detailed isolated stock-system regression suite.

This suite intentionally uses a throwaway SQLite database. It creates three
regular products, two customers, two suppliers, and two active users, then
exercises the stock lifecycle through the Flask API wherever possible.

Coverage:
  * purchase headers/invoices, purchase invoice update and deletion
  * finalized sales, duplicate product lines, three successive invoice edits
  * negative sale quantities and the generated completed customer return
  * negative stock / overselling
  * standalone customer-return workflow and quantity edits
  * dump create/update/delete
  * supplier-return create/workflow/update/delete
  * server-side holds, two independent users, renewal idempotency, aggregation,
    edit exclusion, finalization release, and no current-stock mutation
  * Stock Check reconciliation against an independently maintained ledger
  * current_stock movement-ledger reconciliation
  * Closing Stock read/save/overwrite/delete/re-save behavior
  * business-date movement dates and Saturday-to-Monday Sunday skipping

Run from backend/:
    python test_stock_system_detailed.py

Optional:
    STOCK_DETAIL_DB=/tmp/salesmaster-detailed.db python test_stock_system_detailed.py
"""

from __future__ import annotations

import os
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

DB_PATH = os.environ.get("STOCK_DETAIL_DB")
_TEMP_DB = False
if not DB_PATH:
    fd, DB_PATH = tempfile.mkstemp(prefix="salesmaster-stock-detail-", suffix=".db")
    os.close(fd)
    _TEMP_DB = True

os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH}"
os.environ.setdefault("JWT_SECRET_KEY", "detailed-stock-test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from flask_jwt_extended import create_access_token  # noqa: E402
from sqlalchemy import func  # noqa: E402

from app import app, db, set_business_date  # noqa: E402
from models import (  # noqa: E402
    BusinessDate,
    ClosingStock,
    Customer,
    CustomerReturn,
    DumpEntry,
    Purchase,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    RegularProduct,
    Sale,
    SaleItem,
    StockMovement,
    Supplier,
    SupplierReturn,
    User,
    UserBackDateOption,
)


DAY1 = date(2026, 8, 24)  # Monday
PREVIOUS_SATURDAY = date(2026, 8, 22)
SATURDAY = date(2026, 8, 29)
SUNDAY = date(2026, 8, 30)
DAY2 = date(2026, 8, 31)  # Monday after skipped Sunday
EPS = 0.001

PASS = 0
FAIL = 0
DEFAULT_TOKEN: str | None = None


def report_pass(label: str, detail: str = "") -> None:
    global PASS
    PASS += 1
    print(f"[PASS] {label}{(': ' + detail) if detail else ''}")


def report_fail(label: str, detail: str = "") -> None:
    global FAIL
    FAIL += 1
    print(f"[FAIL] {label}{(': ' + detail) if detail else ''}")


def check(condition: bool, label: str, detail: str = "") -> None:
    if condition:
        report_pass(label, detail)
    else:
        report_fail(label, detail)
        raise AssertionError(f"{label}: {detail}")


def number(value: Any) -> float:
    return float(value or 0)


def same(actual: Any, expected: Any) -> bool:
    return abs(number(actual) - number(expected)) <= EPS


def iso(day: date) -> str:
    return day.isoformat()


def token_for(user: User) -> str:
    return create_access_token(identity=str(user.id))


def api_call(client, method: str, path: str, payload: dict | None = None,
             token: str | None = None, expected_status: int | tuple[int, ...] = 200):
    effective_token = token if token is not None else DEFAULT_TOKEN
    headers = {"Authorization": f"Bearer {effective_token}"} if effective_token else {}
    # Assertions and fixture lookups may have opened a read transaction on the
    # scoped session. The sale route explicitly begins its own transaction, so
    # close any prior read transaction before every test-client request.
    db.session.rollback()
    response = getattr(client, method.lower())(path, json=payload, headers=headers)
    allowed = (expected_status,) if isinstance(expected_status, int) else expected_status
    body = response.get_json(silent=True)
    check(response.status_code in allowed, f"{method.upper()} {path} returned expected status",
          f"status={response.status_code}, body={body}")
    db.session.expire_all()
    return body


def make_sale_items(items: list[tuple[RegularProduct, float, float]]) -> list[dict]:
    return [
        {
            "product_id": product.id,
            "quantity": quantity,
            "unit_price": price,
            "total_price": quantity * price,
            "notes": None,
        }
        for product, quantity, price in items
    ]


def sale_payload(customer: Customer, items: list[tuple[RegularProduct, float, float]],
                 day: date, status: str = "finalized", hold_id: str | None = None,
                 invoice_number: str | None = None) -> dict:
    subtotal = sum(quantity * price for _, quantity, price in items)
    payload = {
        "invoice_number": invoice_number,
        "customer_id": customer.id,
        "customer_type": "cash",
        "payment_status": "pending",
        "subtotal": subtotal,
        "porterage": 0,
        "porterage_type": "per_unit",
        "porterage_rate": 0,
        "vat_rate": 0,
        "vat_amount": 0,
        "total_amount": subtotal,
        "vehicle_details": None,
        "gate_number": None,
        "notes": "Detailed stock regression",
        "status": status,
        "date": iso(day),
        "items": make_sale_items(items),
    }
    if hold_id:
        payload["hold_id"] = hold_id
    return payload


def stock_effect(quantity: float) -> float:
    return -float(quantity) if quantity > 0 else abs(float(quantity))


def apply_sale_to_ledger(ledger: dict[int, float], items: list[tuple[RegularProduct, float, float]],
                         multiplier: float = 1) -> None:
    for product, quantity, _ in items:
        ledger[product.id] += multiplier * stock_effect(quantity)


def assert_current_stocks(products: dict[str, RegularProduct], ledger: dict[int, float], label: str) -> None:
    db.session.expire_all()
    for name, product in products.items():
        fresh = RegularProduct.query.get(product.id)
        actual = number(fresh.current_stock)
        expected = ledger[product.id]
        check(same(actual, expected), f"{label}: current_stock {name}",
              f"actual={actual}, expected={expected}")


def create_purchase_invoice(client, supplier: Supplier, items: list[tuple[RegularProduct, float, float]],
                            day: date, ledger: dict[int, float]) -> tuple[Purchase, int]:
    amount = sum(quantity * price for _, quantity, price in items)
    purchase = Purchase(
        supplier_id=supplier.id,
        supplier_name=supplier.supplier_name,
        amount=amount,
        date=datetime.combine(day, datetime.min.time()),
        status="pending",
    )
    db.session.add(purchase)
    db.session.commit()
    payload = {
        "purchaseId": purchase.id,
        "supplierId": supplier.id,
        "date": iso(day),
        "remarks": "Detailed stock regression purchase",
        "items": [
            {
                "productId": product.id,
                "productName": product.description,
                "quantity": quantity,
                "unitPrice": price,
                "totalPrice": quantity * price,
                "remarks": None,
            }
            for product, quantity, price in items
        ],
    }
    body = api_call(client, "POST", "/api/purchase-invoices", payload, expected_status=201)
    invoice_id = int(body["id"])
    for product, quantity, _ in items:
        ledger[product.id] += quantity
    return purchase, invoice_id


def update_purchase_invoice(client, invoice_id: int,
                            items: list[tuple[RegularProduct, float, float]],
                            ledger: dict[int, float], old_items: list[tuple[RegularProduct, float, float]],
                            token: str) -> None:
    payload = {
        "remarks": "Detailed stock regression purchase updated",
        "items": [
            {
                "productId": product.id,
                "productName": product.description,
                "quantity": quantity,
                "unitPrice": price,
                "totalPrice": quantity * price,
                "remarks": None,
            }
            for product, quantity, price in items
        ],
    }
    api_call(client, "PUT", f"/api/purchase-invoices/{invoice_id}", payload, token, 200)
    for product, quantity, _ in old_items:
        ledger[product.id] -= quantity
    for product, quantity, _ in items:
        ledger[product.id] += quantity


def delete_purchase_invoice(client, invoice_id: int, items: list[tuple[RegularProduct, float, float]],
                            ledger: dict[int, float], token: str) -> None:
    api_call(client, "DELETE", f"/api/purchase-invoices/{invoice_id}", token=token, expected_status=200)
    for product, quantity, _ in items:
        ledger[product.id] -= quantity


def create_sale(client, customer: Customer, items: list[tuple[RegularProduct, float, float]],
                day: date, ledger: dict[int, float], token: str,
                status: str = "finalized", hold_id: str | None = None) -> Sale:
    body = api_call(client, "POST", "/api/sales",
                    sale_payload(customer, items, day, status, hold_id), token, 201)
    db.session.expire_all()
    sale = Sale.query.get(int(body["id"]))
    check(sale is not None, "sale persisted", f"sale_id={body.get('id')}")
    if status == "finalized":
        apply_sale_to_ledger(ledger, items)
    return sale


def update_sale(client, sale: Sale, old_items: list[tuple[RegularProduct, float, float]],
                new_items: list[tuple[RegularProduct, float, float]], day: date,
                ledger: dict[int, float], token: str, hold_id: str | None = None) -> None:
    payload = sale_payload(
        Customer.query.get(sale.customer_id), new_items, day,
        status=sale.status, hold_id=hold_id, invoice_number=sale.invoice_number,
    )
    lock = api_call(client, "POST", f"/api/sales/{sale.id}/edit-lock", {}, token, 201)
    payload["edit_lock_token"] = lock["lockToken"]
    api_call(client, "PUT", f"/api/sales/{sale.id}", payload, token, 200)
    if sale.status == "finalized":
        apply_sale_to_ledger(ledger, old_items, multiplier=-1)
        apply_sale_to_ledger(ledger, new_items, multiplier=1)
    db.session.expire_all()


def return_payload(customer: Customer, product: RegularProduct, quantity: float, day: date,
                   status: str, sale_id: int | None = None) -> dict:
    return {
        "customerId": customer.id,
        "saleId": sale_id,
        "productId": product.id,
        "productType": "regular",
        "description": product.description,
        "invoiceNumber": None,
        "remarks": "Detailed customer-return regression",
        "quantity": quantity,
        "unitPrice": 10,
        "totalValue": quantity * 10,
        "returnReason": "Detailed regression",
        "creditNoteIssued": False,
        "creditNoteAmount": 0,
        "status": status,
        "date": iso(day),
    }


def supplier_return_payload(supplier: Supplier, product: RegularProduct, quantity: float,
                            day: date, status: str, purchase_invoice_id: int | None = None) -> dict:
    return {
        "supplierId": supplier.id,
        "purchaseInvoiceId": purchase_invoice_id,
        "productId": product.id,
        "productType": "regular",
        "description": product.description,
        "invoiceNumber": None,
        "remarks": "Detailed supplier-return regression",
        "quantity": quantity,
        "unitPrice": 10,
        "totalValue": quantity * 10,
        "returnReason": "Detailed regression",
        "creditNoteIssued": False,
        "creditNoteAmount": 0,
        "status": status,
        "date": iso(day),
    }


def dump_payload(supplier: Supplier, product: RegularProduct, quantity: float, day: date) -> dict:
    return {
        "supplierId": supplier.id,
        "productId": product.id,
        "productType": "regular",
        "description": product.description,
        "remarks": "Detailed dump regression",
        "quantity": quantity,
        "unitPrice": 10,
        "date": iso(day),
    }


def assert_stock_check(client, day_from: date, day_to: date, ledger: dict[int, float],
                       products: dict[str, RegularProduct], token: str, label: str) -> None:
    rows = api_call(
        client, "GET", f"/api/reports/stock-check?fromDate={iso(day_from)}&toDate={iso(day_to)}",
        token=token, expected_status=200,
    )
    by_id = {int(row["id"]): row for row in rows}
    check(len(by_id) >= len(products), f"{label}: Stock Check includes all products",
          f"rows={len(by_id)}")
    for name, product in products.items():
        row = by_id[product.id]
        expected = ledger[product.id]
        check(same(row["stock"], expected), f"{label}: Stock Check stock {name}",
              f"stock={row['stock']}, expected={expected}, row={row}")
        check(same(row["clStock"], expected), f"{label}: Stock Check closing {name}",
              f"clStock={row['clStock']}, expected={expected}")
        check(row["status"] == "correct" and row["result"] == "✓",
              f"{label}: Stock Check status {name}", f"status={row['status']}, result={row['result']}")


def save_closing(client, day: date, products: dict[str, RegularProduct],
                 ledger: dict[int, float], token: str, label: str) -> None:
    payload = {
        "date": iso(day),
        "items": [
            {"productId": product.id, "productType": "regular", "quantity": ledger[product.id]}
            for product in products.values()
        ],
    }
    api_call(client, "POST", "/api/closing-stock", payload, token, 200)
    rows = api_call(client, "GET", f"/api/closing-stock?date={iso(day)}", token=token, expected_status=200)
    by_id = {int(row["productId"]): row for row in rows}
    for name, product in products.items():
        check(same(by_id[product.id]["quantity"], ledger[product.id]),
              f"{label}: Closing Stock saved quantity {name}",
              f"actual={by_id[product.id]['quantity']}, expected={ledger[product.id]}")
    assert_current_stocks(products, ledger, label)


def assert_movement_ledger(products: dict[str, RegularProduct], label: str) -> None:
    for name, product in products.items():
        total = db.session.query(func.sum(StockMovement.quantity)).filter_by(
            product_id=product.id, product_type="regular"
        ).scalar() or 0
        actual = RegularProduct.query.get(product.id).current_stock
        check(same(total, actual), f"{label}: movement sum equals current_stock {name}",
              f"movement_sum={total}, current_stock={actual}")


def main() -> int:
    global PASS, FAIL, DEFAULT_TOKEN
    app.config["TESTING"] = True
    with app.app_context():
        db.drop_all()
        db.create_all()
        client = app.test_client()

        print("=" * 88)
        print("DETAILED ISOLATED STOCK REGRESSION")
        print(f"Temporary database: {DB_PATH}")
        print("Only regular products are created; no non-product rows are used.")
        print("=" * 88)

        # ------------------------------------------------------------------
        # SETUP: two users, two customers, two suppliers, three products.
        # ------------------------------------------------------------------
        print("\nPHASE 0 — deterministic test setup")
        user1 = User(username="detail-user-1", password="test", user_type="admin", status="Active")
        user2 = User(username="detail-user-2", password="test", user_type="admin", status="Active")
        db.session.add_all([user1, user2])
        db.session.flush()
        db.session.add_all([
            UserBackDateOption(user_id=user1.id, editing=True, deleting=True, current_editing=True),
            UserBackDateOption(user_id=user2.id, editing=True, deleting=True, current_editing=True),
        ])
        customers = {
            "Customer 1": Customer(customer_code="DETAIL-CUST-1", customer_name="Detail Customer One"),
            "Customer 2": Customer(customer_code="DETAIL-CUST-2", customer_name="Detail Customer Two"),
        }
        suppliers = {
            "Supplier 1": Supplier(supplier_code="DETAIL-SUPP-1", supplier_name="Detail Supplier One", supplier_currency="GBP"),
            "Supplier 2": Supplier(supplier_code="DETAIL-SUPP-2", supplier_name="Detail Supplier Two", supplier_currency="GBP"),
        }
        db.session.add_all(list(customers.values()) + list(suppliers.values()))
        db.session.flush()
        products = {
            "Product A": RegularProduct(product_code="DETAIL-A", description="Detailed Regular Product A", initial_stock=50, current_stock=50, selling_price=10, status="active"),
            "Product B": RegularProduct(product_code="DETAIL-B", description="Detailed Regular Product B", initial_stock=30, current_stock=30, selling_price=10, status="active"),
            "Product C": RegularProduct(product_code="DETAIL-C", description="Detailed Regular Product C", initial_stock=20, current_stock=20, selling_price=10, status="active"),
        }
        db.session.add_all(list(products.values()))
        db.session.flush()
        for product in products.values():
            db.session.add(StockMovement(
                product_id=product.id, product_type="regular", movement_type="adjustment",
                quantity=number(product.initial_stock), previous_stock=0, new_stock=number(product.initial_stock),
                reference_type="initial_stock", movement_date=DAY1, remarks="Detailed test initial stock",
                created_by=user1.id,
            ))
        db.session.commit()
        user1_id = user1.id
        user2_id = user2.id
        set_business_date(DAY1)
        product_ids = {name: product.id for name, product in products.items()}
        customer_ids = {name: customer.id for name, customer in customers.items()}
        supplier_ids = {name: supplier.id for name, supplier in suppliers.items()}
        ledger = {product.id: number(product.initial_stock) for product in products.values()}
        check(len(products) == 3, "exactly three regular products created")
        check(len(customers) == 2, "exactly two customers created")
        check(NonProduct_count() == 0, "no non-products created in this suite")
        assert_current_stocks(products, ledger, "setup")

        token1 = create_access_token(identity=str(user1_id))
        token2 = create_access_token(identity=str(user2_id))
        DEFAULT_TOKEN = token1
        products = {name: RegularProduct.query.get(product_id) for name, product_id in product_ids.items()}
        customers = {name: Customer.query.get(customer_id) for name, customer_id in customer_ids.items()}
        suppliers = {name: Supplier.query.get(supplier_id) for name, supplier_id in supplier_ids.items()}
        cust1 = customers["Customer 1"]
        cust2 = customers["Customer 2"]
        supp1 = suppliers["Supplier 1"]
        supp2 = suppliers["Supplier 2"]

        # Seed the prior Saturday as the last active closing day. There is no
        # Sunday closing row, so Monday opening stock must walk back over Sunday
        # and use this Saturday baseline.
        save_closing(client, PREVIOUS_SATURDAY, products, ledger, token1, "prior Saturday baseline")

        # ------------------------------------------------------------------
        # DAY 1 PURCHASES AND SALES, INCLUDING THREE EDITS.
        # ------------------------------------------------------------------
        print("\nPHASE 1 — purchases, duplicate sale lines, negative sale lines, and edits")
        purchase1, purchase_invoice1 = create_purchase_invoice(
            client, supp1,
            [(products["Product A"], 20, 10), (products["Product B"], 10, 10), (products["Product C"], 30, 10)],
            DAY1, ledger,
        )
        check(purchase_invoice1 > 0, "purchase invoice with all three products persisted")
        assert_current_stocks(products, ledger, "after purchase invoice 1")

        sale1_items = [
            (products["Product A"], 8, 10),
            (products["Product A"], 2, 10),  # duplicate product line in one invoice
            (products["Product B"], 5, 10),
        ]
        sale1 = create_sale(client, cust1, sale1_items, DAY1, ledger, token1)
        db.session.expire_all()
        check(SaleItem.query.filter_by(sale_id=sale1.id, product_id=products["Product A"].id).count() == 2,
              "sale preserves duplicate product lines as separate SaleItems")
        assert_current_stocks(products, ledger, "after initial duplicate-line sale")

        edit1 = [
            (products["Product A"], 12, 10),
            (products["Product A"], 3, 10),
            (products["Product B"], 2, 10),
            (products["Product C"], 4, 10),
        ]
        update_sale(client, sale1, sale1_items, edit1, DAY1, ledger, token1)
        assert_current_stocks(products, ledger, "after sale edit 1")

        edit2 = [
            (products["Product A"], 4, 10),
            (products["Product A"], 1, 10),
            (products["Product B"], 7, 10),
            (products["Product B"], 3, 10),
            (products["Product C"], 4, 10),
        ]
        update_sale(client, sale1, edit1, edit2, DAY1, ledger, token2)
        assert_current_stocks(products, ledger, "after sale edit 2 by second user")

        edit3 = [
            (products["Product A"], 6, 10),
            (products["Product A"], -2, 10),  # negative line becomes a customer return
            (products["Product B"], 5, 10),
            (products["Product B"], 1, 10),
            (products["Product C"], 4, 10),
        ]
        update_sale(client, sale1, edit2, edit3, DAY1, ledger, token1)
        db.session.expire_all()
        check(CustomerReturn.query.filter_by(
            sale_id=sale1.id, return_reason="Return via negative quantity sale", status="completed"
        ).count() == 1, "third sale edit rebuilds one completed negative-line customer return")
        assert_current_stocks(products, ledger, "after sale edit 3 with negative and duplicate lines")

        # Purchase update and deletion exercise reversal/re-add paths.
        purchase2, purchase_invoice2 = create_purchase_invoice(
            client, supp2, [(products["Product A"], 15, 10), (products["Product B"], 5, 10)], DAY1, ledger
        )
        purchase2_old = [(products["Product A"], 15, 10), (products["Product B"], 5, 10)]
        purchase2_new = [(products["Product A"], 20, 10), (products["Product B"], 5, 10)]
        update_purchase_invoice(client, purchase_invoice2, purchase2_new, ledger, purchase2_old, token2)
        assert_current_stocks(products, ledger, "after purchase invoice update")
        delete_purchase_invoice(client, purchase_invoice2, purchase2_new, ledger, token1)
        assert_current_stocks(products, ledger, "after purchase invoice deletion")

        # ------------------------------------------------------------------
        # DAY 1 RETURN, DUMP, SUPPLIER RETURN WORKFLOWS.
        # ------------------------------------------------------------------
        print("\nPHASE 2 — customer returns, dumps, supplier returns, and reversals")
        pending_return = api_call(
            client, "POST", "/api/customer-returns",
            return_payload(cust2, products["Product B"], 3, DAY1, "pending", sale1.id), token1, 201
        )
        assert_current_stocks(products, ledger, "pending customer return has no stock effect")
        cr_id = int(pending_return["id"])
        api_call(client, "POST", f"/api/customer-returns/{cr_id}/approve", token=token2, expected_status=200)
        assert_current_stocks(products, ledger, "approved customer return has no additional stock effect")
        api_call(client, "POST", f"/api/customer-returns/{cr_id}/complete", token=token1, expected_status=200)
        ledger[products["Product B"].id] += 3
        assert_current_stocks(products, ledger, "completed customer return increases stock")
        updated_return = return_payload(cust2, products["Product B"], 5, DAY1, "completed", sale1.id)
        api_call(client, "PUT", f"/api/customer-returns/{cr_id}", updated_return, token=token2, expected_status=200)
        ledger[products["Product B"].id] += 2
        assert_current_stocks(products, ledger, "editing completed customer return applies only quantity delta")
        api_call(client, "DELETE", f"/api/customer-returns/{cr_id}", token=token1, expected_status=200)
        ledger[products["Product B"].id] -= 5
        assert_current_stocks(products, ledger, "deleting customer return reverses its effective quantity")

        dump_body = api_call(
            client, "POST", "/api/dump-entries", dump_payload(supp1, products["Product C"], 4, DAY1), token=token1, expected_status=201
        )
        dump_id = int(dump_body["id"])
        ledger[products["Product C"].id] -= 4
        assert_current_stocks(products, ledger, "creating dump decreases stock")
        api_call(client, "PUT", f"/api/dump-entries/{dump_id}", dump_payload(supp1, products["Product C"], 6, DAY1), token1, 200)
        ledger[products["Product C"].id] -= 2
        assert_current_stocks(products, ledger, "editing dump applies only quantity delta")
        api_call(client, "DELETE", f"/api/dump-entries/{dump_id}", token=token2, expected_status=200)
        ledger[products["Product C"].id] += 6
        assert_current_stocks(products, ledger, "deleting dump restores stock")

        supplier_body = api_call(
            client, "POST", "/api/supplier-returns",
            supplier_return_payload(supp1, products["Product C"], 5, DAY1, "pending", purchase_invoice1), token1, 201
        )
        supplier_return_id = int(supplier_body["id"])
        ledger[products["Product C"].id] -= 5
        assert_current_stocks(products, ledger, "creating supplier return decreases stock immediately")
        api_call(client, "POST", f"/api/supplier-returns/{supplier_return_id}/approve", token=token2, expected_status=200)
        assert_current_stocks(products, ledger, "approving supplier return does not double-decrease stock")
        api_call(client, "PUT", f"/api/supplier-returns/{supplier_return_id}",
                 supplier_return_payload(supp1, products["Product C"], 7, DAY1, "approved", purchase_invoice1), token1, 200)
        ledger[products["Product C"].id] -= 2
        assert_current_stocks(products, ledger, "editing supplier return applies only net quantity delta")
        api_call(client, "DELETE", f"/api/supplier-returns/{supplier_return_id}", token=token2, expected_status=200)
        ledger[products["Product C"].id] += 7
        assert_current_stocks(products, ledger, "deleting supplier return restores its quantity")

        # At this point only sale1's final edited state and the first purchase remain.
        save_closing(client, DAY1, products, ledger, token1, "day 1 exact closing")
        assert_stock_check(client, DAY1, DAY1, ledger, products, token2, "day 1")
        assert_movement_ledger(products, "day 1")

        # ------------------------------------------------------------------
        # SUNDAY BUSINESS DATE AND DAY 2 NEGATIVE STOCK.
        # ------------------------------------------------------------------
        print("\nPHASE 3 — Sunday skipping, negative stock, and multi-user holds")
        set_business_date(SATURDAY)
        business_body = api_call(client, "GET", "/api/business-date", expected_status=200)
        check(business_body["currentDate"] == iso(SATURDAY), "business date can be set to Saturday")
        check(business_body["nextDate"] == iso(DAY2), "next business date skips Sunday", str(business_body))
        switched = api_call(client, "POST", "/api/business-date/switch", token=token1, expected_status=200)
        check(switched["newDate"] == iso(DAY2), "business-date switch lands on Monday after Sunday")
        db.session.expire_all()
        check(BusinessDate.query.first().current_date == DAY2, "business date persisted as Monday after switch")

        purchase3, purchase_invoice3 = create_purchase_invoice(
            client, supp2, [(products["Product C"], 10, 10)], DAY2, ledger
        )
        assert_current_stocks(products, ledger, "day 2 purchase")
        check(PurchaseInvoice.query.get(purchase_invoice3) is not None, "day 2 purchase invoice row exists")

        oversell_items = [
            (products["Product A"], 5, 10),
            (products["Product A"], 5, 10),
            (products["Product B"], 40, 10),  # drives B negative
            (products["Product C"], -3, 10),  # negative sale becomes return
        ]
        oversell_sale = create_sale(client, cust2, oversell_items, DAY2, ledger, token2)
        db.session.expire_all()
        check(number(RegularProduct.query.get(products["Product B"].id).current_stock) < 0,
              "overselling is recorded and produces negative current_stock",
              f"B={RegularProduct.query.get(products['Product B'].id).current_stock}")
        check(CustomerReturn.query.filter_by(
            sale_id=oversell_sale.id, return_reason="Return via negative quantity sale", status="completed"
        ).count() == 1, "negative sale creates a completed customer-return record")
        assert_current_stocks(products, ledger, "after negative-stock sale")

        def hold_payload(hold_id: str, customer: Customer, items: list[tuple[RegularProduct, float, float]],
                         current_sale: dict | None = None) -> dict:
            return {
                "holdId": hold_id,
                "customerId": customer.id,
                "vehicleDetails": "HOLD-VEHICLE",
                "gateNumber": "HOLD-GATE",
                "notes": "Detailed hold regression",
                "saleItems": [
                    {"productId": product.id, "quantity": quantity, "unitPrice": price, "totalPrice": quantity * price}
                    for product, quantity, price in items
                ],
                "currentSale": current_sale,
            }

        hold1_items = [
            (products["Product A"], 10, 10),
            (products["Product A"], 5, 10),  # duplicate held line aggregates
            (products["Product B"], 2, 10),
            (products["Product A"], -4, 10),  # negative hold line does not reserve
        ]
        hold2_items = [
            (products["Product A"], 7, 10),
            (products["Product C"], 3, 10),
        ]
        hold1 = api_call(client, "POST", "/api/held-invoices", hold_payload("detail-hold-user-1", cust1, hold1_items), token1, 201)
        hold2 = api_call(client, "POST", "/api/held-invoices", hold_payload("detail-hold-user-2", cust2, hold2_items), token2, 201)
        hold_stock_snapshot = dict(ledger)
        assert_current_stocks(products, ledger, "creating holds does not change current_stock")
        check(hold1["holdId"] == "detail-hold-user-1" and hold2["holdId"] == "detail-hold-user-2",
              "two distinct users create two durable holds")

        reservations = api_call(client, "GET", "/api/stock/reservations", token=token2, expected_status=200)["reservations"]
        totals = {(row["productType"], int(row["productId"])): number(row["quantity"]) for row in reservations}
        check(same(totals[("regular", products["Product A"].id)], 22),
              "shared reservations aggregate duplicate lines across users", str(totals))
        check(same(totals[("regular", products["Product B"].id)], 2),
              "negative hold quantity is excluded from reservation totals", str(totals))
        check(same(totals[("regular", products["Product C"].id)], 3),
              "second user hold is visible to first user", str(totals))

        listed = api_call(client, "GET", "/api/held-invoices", token=token1, expected_status=200)
        check({row["holdId"] for row in listed} == {"detail-hold-user-1", "detail-hold-user-2"},
              "held-invoice list is shared across users")

        # Renewing the same ID must update one row, not create a duplicate reservation.
        api_call(client, "POST", "/api/held-invoices", hold_payload("detail-hold-user-1", cust1, hold1_items), token=token1, expected_status=201)
        db.session.expire_all()
        check(SaleHold_count() == 2, "renewing a hold is idempotent at the database row level")
        reservations_after_renewal = api_call(client, "GET", "/api/stock/reservations", token=token1, expected_status=200)["reservations"]
        totals_after_renewal = {(row["productType"], int(row["productId"])): number(row["quantity"]) for row in reservations_after_renewal}
        check(same(totals_after_renewal[("regular", products["Product A"].id)], 22),
              "renewing a hold does not double-reserve stock")

        excluded = api_call(client, "GET", "/api/stock/reservations?excludeHoldId=detail-hold-user-1", token=token1, expected_status=200)["reservations"]
        excluded_totals = {(row["productType"], int(row["productId"])): number(row["quantity"]) for row in excluded}
        check(excluded_totals == {("regular", products["Product A"].id): 7, ("regular", products["Product C"].id): 3},
              "editing client can exclude only its own hold from availability", str(excluded_totals))
        check(hold_stock_snapshot == ledger, "hold creation and renewal leave expected stock ledger unchanged")

        # Finalizing each held invoice releases exactly its own reservation.
        held_sale2 = create_sale(client, cust2, hold2_items, DAY2, ledger, token2, hold_id="detail-hold-user-2")
        db.session.expire_all()
        check(SaleHold_count(active_only=True) == 1, "finalizing user 2 invoice releases only user 2 hold")
        assert_current_stocks(products, ledger, "after finalizing held invoice 2")
        held_sale1 = create_sale(client, cust1, hold1_items, DAY2, ledger, token1, hold_id="detail-hold-user-1")
        db.session.expire_all()
        check(SaleHold_count(active_only=True) == 0, "finalizing user 1 invoice releases final active hold")
        check(SaleHold_count(status="released") == 2, "both finalized holds are retained as released audit rows")
        check(held_sale1.status == "finalized" and held_sale2.status == "finalized",
              "both held invoices finalize as ordinary sales")
        assert_current_stocks(products, ledger, "after finalizing both held invoices")

        # More day-2 operations while one product is already negative.
        standalone_return = api_call(
            client, "POST", "/api/customer-returns",
            return_payload(cust1, products["Product A"], 4, DAY2, "completed"), token1, 201
        )
        ledger[products["Product A"].id] += 4
        assert_current_stocks(products, ledger, "day 2 standalone completed customer return")
        dump2 = api_call(
            client, "POST", "/api/dump-entries", dump_payload(supp2, products["Product B"], 10, DAY2), token2, 201
        )
        ledger[products["Product B"].id] -= 10
        assert_current_stocks(products, ledger, "day 2 dump from already negative stock")
        supplier2 = api_call(
            client, "POST", "/api/supplier-returns",
            supplier_return_payload(supp2, products["Product A"], 5, DAY2, "pending", purchase_invoice3), token2, 201
        )
        ledger[products["Product A"].id] -= 5
        assert_current_stocks(products, ledger, "day 2 supplier return")
        # Delete the day-2 supplier return and dump to prove both reversals.
        api_call(client, "DELETE", f"/api/supplier-returns/{supplier2['id']}", token=token1, expected_status=200)
        ledger[products["Product A"].id] += 5
        api_call(client, "DELETE", f"/api/dump-entries/{dump2['id']}", token=token1, expected_status=200)
        ledger[products["Product B"].id] += 10
        assert_current_stocks(products, ledger, "day 2 supplier-return and dump deletions")

        save_closing(client, DAY2, products, ledger, token2, "day 2 exact closing")
        assert_stock_check(client, DAY2, DAY2, ledger, products, token1, "day 2")
        assert_movement_ledger(products, "day 2")

        # ------------------------------------------------------------------
        # CLOSING STOCK OVERWRITE, DELETE, HISTORICAL READS.
        # ------------------------------------------------------------------
        print("\nPHASE 4 — Closing Stock page data, overwrite, deletion, and re-save")
        closing_rows = api_call(client, "GET", f"/api/closing-stock?date={iso(DAY2)}", token=token1, expected_status=200)
        check(len(closing_rows) == 3, "Closing Stock page returns all three regular products")
        historical_rows = api_call(client, "GET", f"/api/stock/closing?date={iso(DAY2)}", expected_status=200)
        historical_by_id = {int(row["id"]): row for row in historical_rows if row["productType"] == "regular"}
        for name, product in products.items():
            check(same(historical_by_id[product.id]["closingStock"], ledger[product.id]),
                  f"historical closing endpoint returns correct {name}")

        wrong_a = ledger[products["Product A"].id] + 100
        api_call(client, "POST", "/api/closing-stock", {
            "date": iso(DAY2),
            "items": [{"productId": products["Product A"].id, "productType": "regular", "quantity": wrong_a}],
        }, token1, 200)
        db.session.expire_all()
        check(same(RegularProduct.query.get(products["Product A"].id).current_stock, wrong_a),
              "Closing Stock save directly overwrites current_stock")
        discrepancy_rows = api_call(client, "GET", f"/api/reports/stock-check?fromDate={iso(DAY2)}&toDate={iso(DAY2)}", token=token2, expected_status=200)
        discrepancy_a = next(row for row in discrepancy_rows if int(row["id"]) == products["Product A"].id)
        check(discrepancy_a["status"] == "excess" and same(discrepancy_a["clStock"], wrong_a),
              "Stock Check exposes an intentional Closing Stock discrepancy")

        save_closing(client, DAY2, products, ledger, token1, "corrected day 2 closing")
        api_call(client, "POST", "/api/closing-stock/delete", {
            "date": iso(DAY2), "productId": products["Product A"].id, "productType": "regular",
        }, token=token2, expected_status=200)
        db.session.expire_all()
        check(same(RegularProduct.query.get(products["Product A"].id).current_stock, ledger[products["Product A"].id]),
              "deleting Closing Stock does not corrupt the restored current_stock")
        missing_a = api_call(client, "GET", f"/api/closing-stock?date={iso(DAY2)}", token=token1, expected_status=200)
        check(not any(int(row["productId"]) == products["Product A"].id for row in missing_a),
              "Closing Stock delete removes the selected page entry")
        save_closing(client, DAY2, products, ledger, token1, "re-saved day 2 closing after delete")
        assert_stock_check(client, DAY2, DAY2, ledger, products, token2, "day 2 after closing delete/re-save")
        assert_movement_ledger(products, "final")

        # Final entity-level audit checks.
        db.session.expire_all()
        check(Sale.query.count() >= 3, "multiple finalized sales persisted")
        check(PurchaseInvoiceItem.query.count() >= 3, "purchase invoice items persisted")
        check(StockMovement.query.filter_by(product_type="non").count() == 0, "no non-product stock movements exist")
        check(StockMovement.query.filter(StockMovement.movement_date == DAY2).count() > 0,
              "day 2 operations use the business movement date")
        check(StockMovement.query.filter(StockMovement.movement_date == SUNDAY).count() == 0,
              "no inventory movement is incorrectly dated Sunday")

        total = PASS + FAIL
        print("\n" + "=" * 88)
        print("DETAILED STOCK REGRESSION SUMMARY")
        print(f"PASS: {PASS}")
        print(f"FAIL: {FAIL}")
        print(f"TOTAL ASSERTIONS: {total}")
        print(f"PASS RATE: {100.0 * PASS / max(total, 1):.2f}%")
        print(f"Database: {DB_PATH}")
        print("=" * 88)
        return 0 if FAIL == 0 else 1


def NonProduct_count() -> int:
    # Kept as a function to make the setup assertion readable and explicit.
    from models import NonProduct
    return NonProduct.query.count()


def SaleHold_count(active_only: bool = False, status: str | None = None) -> int:
    from models import SaleHold
    query = SaleHold.query
    if active_only:
        query = query.filter_by(status="active")
    if status:
        query = query.filter_by(status=status)
    return query.count()


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        if _TEMP_DB:
            try:
                os.unlink(DB_PATH)
            except FileNotFoundError:
                pass
        else:
            print(f"Detailed stock test database retained at {DB_PATH}")
