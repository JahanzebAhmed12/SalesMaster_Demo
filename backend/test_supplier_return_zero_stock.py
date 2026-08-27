"""Regression test: supplier returns may reduce zero stock below zero.

Run from the repository root with:
    python3 backend/test_supplier_return_zero_stock.py
"""

import os
import shutil
import sys
import tempfile
from datetime import date
from decimal import Decimal


run_dir = tempfile.mkdtemp(prefix="salesmaster-supplier-return-zero-stock-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(run_dir, 'test.db')}"
os.environ["STOCK_AUDIT_LOG_DIR"] = os.path.join(run_dir, "logs")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db  # noqa: E402
from flask_jwt_extended import create_access_token  # noqa: E402
from models import RegularProduct, StockMovement, Supplier, SupplierReturn, User  # noqa: E402


def main():
    with app.app_context():
        try:
            db.drop_all()
            db.create_all()

            user = User(
                username="supplier-return-zero-stock-user",
                password="test-password",
                user_type="user",
                status="Active",
            )
            supplier = Supplier(
                supplier_code="SUPP-ZERO-STOCK",
                supplier_name="Zero Stock Supplier",
                supplier_currency="GBP",
            )
            product = RegularProduct(
                product_code="PROD-ZERO-STOCK",
                description="Zero Stock Product",
                selling_price=Decimal("10.00"),
                initial_stock=Decimal("0"),
                current_stock=Decimal("0"),
            )
            db.session.add_all([user, supplier, product])
            db.session.flush()

            token = create_access_token(identity=str(user.id))
            response = app.test_client().post(
                "/api/supplier-returns",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "date": date.today().isoformat(),
                    "supplierId": supplier.id,
                    "purchaseInvoiceId": None,
                    "productId": product.id,
                    "productType": "regular",
                    "description": product.description,
                    "invoiceNumber": None,
                    "remarks": "Return from zero stock",
                    "quantity": 4,
                    "unitPrice": 10,
                    "totalValue": 40,
                    "returnReason": "Zero-stock regression",
                    "creditNoteIssued": False,
                    "creditNoteAmount": 0,
                    "status": "completed",
                },
            )

            assert response.status_code == 201, response.get_json()
            db.session.expire_all()
            stored_product = db.session.get(RegularProduct, product.id)
            stored_return = SupplierReturn.query.one()
            movement = StockMovement.query.filter_by(
                product_id=product.id,
                product_type="regular",
                movement_type="supplier_return",
            ).one()

            assert stored_return.quantity == Decimal("4.000"), stored_return.quantity
            assert stored_product.current_stock == Decimal("-4.000"), stored_product.current_stock
            assert movement.quantity == Decimal("-4.0"), movement.quantity
            print("[PASS] supplier return is recorded from zero stock")
            print("[PASS] current stock becomes -4 without rejecting the return")
            print("[PASS] supplier-return stock movement is recorded with quantity -4")
            print("\nSupplier-return zero-stock regression: 3 passed, 0 failed")
            return 0
        finally:
            db.session.remove()
            db.drop_all()
            shutil.rmtree(run_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
