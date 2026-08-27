"""Regression test for supplier-payment history date filtering.

Run from the repository root with:
    python3 backend/test_supplier_payment_history.py
"""

import os
import shutil
import sys
import tempfile
from datetime import date, datetime
from decimal import Decimal


run_dir = tempfile.mkdtemp(prefix="salesmaster-supplier-payment-history-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(run_dir, 'test.db')}"
os.environ["STOCK_AUDIT_LOG_DIR"] = os.path.join(run_dir, "logs")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db  # noqa: E402
from models import (  # noqa: E402
    Purchase,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    Supplier,
    SupplierPayment,
)
from flask_jwt_extended import create_access_token  # noqa: E402


PASS = 0
FAIL = 0


def check(condition, description):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  [PASS] {description}")
    else:
        FAIL += 1
        print(f"  [FAIL] {description}")


def main():
    with app.app_context():
        try:
            db.drop_all()
            db.create_all()

            supplier = Supplier(
                supplier_code="SUPP-DATE-TEST",
                supplier_name="Date Comparison Test Supplier",
                supplier_currency="GBP",
            )
            db.session.add(supplier)
            db.session.flush()

            purchase = Purchase(
                supplier_id=supplier.id,
                supplier_name=supplier.supplier_name,
                amount=Decimal("125.00"),
                date=datetime(2026, 8, 27, 9, 30),
                status="pending",
            )
            db.session.add(purchase)
            db.session.flush()

            invoice = PurchaseInvoice(
                purchase_id=purchase.id,
                supplier_id=supplier.id,
                date=datetime(2026, 8, 27, 15, 45),
            )
            db.session.add(invoice)
            db.session.flush()
            db.session.add(
                PurchaseInvoiceItem(
                    invoice_id=invoice.id,
                    product_id=1,
                    product_name="Date Comparison Test Product",
                    quantity=Decimal("5.000"),
                    unit_price=Decimal("25.00"),
                    total_price=Decimal("125.00"),
                )
            )

            # This payment has no purchase_invoice_id, which exercises the
            # nearby-invoice path where payment_date is date and invoice.date
            # is datetime.
            nearby_payment = SupplierPayment(
                supplier_id=supplier.id,
                purchase_invoice_id=None,
                amount=Decimal("75.00"),
                payment_mode="cash",
                payment_date=date(2026, 8, 27),
                remarks="Unlinked same-day payment",
            )
            linked_payment = SupplierPayment(
                supplier_id=supplier.id,
                purchase_invoice_id=invoice.id,
                amount=Decimal("50.00"),
                payment_mode="card",
                payment_date=date(2026, 8, 27),
                remarks="Linked same-day payment",
            )
            db.session.add_all([nearby_payment, linked_payment])
            db.session.commit()

            token = create_access_token(identity="supplier-payment-test-user")
            client = app.test_client()
            response = client.get(
                "/api/supplier-payments/history?fromDate=2026-08-27&toDate=2026-08-27",
                headers={"Authorization": f"Bearer {token}"},
            )
            body = response.get_json()

            check(response.status_code == 200, "supplier-payment history returns HTTP 200")
            check(isinstance(body, list), "supplier-payment history returns a list")
            check(len(body or []) == 2, "history includes both same-day payments")

            rows_by_mode = {row.get("paymentMode"): row for row in (body or [])}
            nearby_row = rows_by_mode.get("cash")
            linked_row = rows_by_mode.get("card")
            check(nearby_row is not None, "unlinked same-day payment is returned")
            check(
                nearby_row and nearby_row.get("invNo") == str(invoice.id),
                "unlinked payment resolves the nearby invoice without a datetime/date error",
            )
            check(
                linked_row and linked_row.get("invNo") == str(invoice.id),
                "linked payment still resolves its invoice",
            )
        finally:
            db.session.remove()
            db.drop_all()
            shutil.rmtree(run_dir, ignore_errors=True)

    print(f"\nSupplier-payment history regression: {PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
