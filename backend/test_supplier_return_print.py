"""Regression test for supplier-return A4 print data.

Run from the repository root with:
    python3 backend/test_supplier_return_print.py
"""

import os
import shutil
import sys
import tempfile
from datetime import date
from decimal import Decimal


run_dir = tempfile.mkdtemp(prefix="salesmaster-supplier-return-print-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(run_dir, 'test.db')}"
os.environ["STOCK_AUDIT_LOG_DIR"] = os.path.join(run_dir, "logs")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db  # noqa: E402
from models import RegularProduct, Supplier, SupplierReturn  # noqa: E402


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
                supplier_code="SUPP-PRINT-TEST",
                supplier_name="Print Test Supplier",
                supplier_currency="GBP",
                address="1 Test Street",
                vat_number="GB123456789",
            )
            product = RegularProduct(
                product_code="PROD-PRINT-TEST",
                description="Print Test Product",
                selling_price=Decimal("20.00"),
                current_stock=Decimal("10.000"),
                initial_stock=Decimal("10.000"),
            )
            db.session.add_all([supplier, product])
            db.session.flush()

            return_item = SupplierReturn(
                ref_number="SRPRINT01",
                date=date(2026, 8, 27),
                supplier_id=supplier.id,
                product_id=product.id,
                product_type="regular",
                description="Damaged packaging",
                invoice_number="SUP-INV-77",
                remarks="Keep with the supplier credit paperwork.",
                quantity=Decimal("3.000"),
                unit_price=Decimal("20.00"),
                total_value=Decimal("60.00"),
                return_reason="Damaged",
                credit_note_issued=True,
                credit_note_amount=Decimal("60.00"),
                status="completed",
            )
            db.session.add(return_item)
            db.session.commit()

            client = app.test_client()
            response = client.get(f"/api/supplier-returns/{return_item.id}/print")
            body = response.get_json() or {}
            if response.status_code != 200:
                print(f"  [DEBUG] print endpoint response: {body}")
            returned = body.get("returnItem") or {}

            check(response.status_code == 200, "supplier-return print endpoint returns HTTP 200")
            check(body.get("supplier", {}).get("supplier_name") == supplier.supplier_name, "print payload includes supplier details")
            check(body.get("product", {}).get("description") == product.description, "print payload includes product details")
            check(returned.get("productName") == product.description, "print payload resolves productName")
            check(returned.get("refNumber") == "SRPRINT01", "print payload includes return reference")
            check(returned.get("returnReason") == "Damaged", "print payload includes return reason")
            check(returned.get("creditNoteIssued") is True, "print payload includes credit-note flag")
            check(float(returned.get("creditNoteAmount")) == 60.0, "print payload includes credit-note amount")
            check(returned.get("remarks") == return_item.remarks, "print payload includes remarks")
        finally:
            db.session.remove()
            db.drop_all()
            shutil.rmtree(run_dir, ignore_errors=True)

    print(f"\nSupplier-return print regression: {PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
