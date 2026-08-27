"""Regression test for Supplier Payment History supplier filtering.

Run from the repository root with:
    python3 backend/test_supplier_payment_filter.py
"""

import os
import shutil
import sys
import tempfile
from datetime import date
from decimal import Decimal


run_dir = tempfile.mkdtemp(prefix="salesmaster-supplier-payment-filter-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(run_dir, 'test.db')}"
os.environ["STOCK_AUDIT_LOG_DIR"] = os.path.join(run_dir, "logs")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db  # noqa: E402
from models import Supplier, SupplierPayment  # noqa: E402
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

            supplier_a = Supplier(
                supplier_code="SUPP-FILTER-A",
                supplier_name="Filter Supplier A",
                supplier_currency="GBP",
            )
            supplier_b = Supplier(
                supplier_code="SUPP-FILTER-B",
                supplier_name="Filter Supplier B",
                supplier_currency="GBP",
            )
            db.session.add_all([supplier_a, supplier_b])
            db.session.flush()
            db.session.add_all([
                SupplierPayment(
                    supplier_id=supplier_a.id,
                    amount=Decimal("25.00"),
                    payment_mode="cash",
                    payment_date=date(2026, 8, 27),
                    remarks="Supplier A payment",
                ),
                SupplierPayment(
                    supplier_id=supplier_b.id,
                    amount=Decimal("40.00"),
                    payment_mode="card",
                    payment_date=date(2026, 8, 27),
                    remarks="Supplier B payment",
                ),
            ])
            db.session.commit()

            token = create_access_token(identity="supplier-filter-test-user")
            headers = {"Authorization": f"Bearer {token}"}
            client = app.test_client()

            all_response = client.get(
                "/api/supplier-payments/history?fromDate=2026-08-27&toDate=2026-08-27",
                headers=headers,
            )
            all_rows = all_response.get_json() or []
            check(all_response.status_code == 200, "default all-suppliers query returns HTTP 200")
            check(len(all_rows) == 2, "default all-suppliers query returns both entries")

            selected_response = client.get(
                f"/api/supplier-payments/history?fromDate=2026-08-27&toDate=2026-08-27&supplierId={supplier_a.id}",
                headers=headers,
            )
            selected_rows = selected_response.get_json() or []
            check(selected_response.status_code == 200, "specific supplier query returns HTTP 200")
            check(len(selected_rows) == 1, "specific supplier query returns one entry")
            check(
                selected_rows and selected_rows[0].get("supplier") == supplier_a.supplier_name,
                "specific supplier query returns only the selected supplier",
            )
        finally:
            db.session.remove()
            db.drop_all()
            shutil.rmtree(run_dir, ignore_errors=True)

    print(f"\nSupplier-payment filter regression: {PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
