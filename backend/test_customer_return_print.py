"""Regression tests for customer-return print data."""

import os
import shutil
import sys
import tempfile
from datetime import date
from decimal import Decimal


run_dir = tempfile.mkdtemp(prefix="salesmaster-customer-return-print-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(run_dir, 'test.db')}"
os.environ["STOCK_AUDIT_LOG_DIR"] = os.path.join(run_dir, "logs")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db  # noqa: E402
from models import Company, Customer, CustomerReturn, RegularProduct  # noqa: E402


def main():
    with app.app_context():
        try:
            db.drop_all()
            db.create_all()

            company = Company(companyName="Print Test Company", address1="1 Test Road")
            customer = Customer(
                customer_code="CUST-RETURN-PRINT",
                customer_name="Print Test Customer",
                address="2 Customer Road",
            )
            products = [
                RegularProduct(
                    product_code=f"PROD-RETURN-PRINT-{index}",
                    description=f"Returned Product {index}",
                )
                for index in (1, 2)
            ]
            db.session.add_all([company, customer, *products])
            db.session.flush()

            returns = [
                CustomerReturn(
                    ref_number=f"CRPRINT{index}",
                    date=date(2026, 8, index),
                    customer_id=customer.id,
                    product_id=product.id,
                    product_type="regular",
                    description=product.description,
                    invoice_number="INV-100",
                    quantity=Decimal(index),
                    unit_price=Decimal("12.50"),
                    total_value=Decimal(index) * Decimal("12.50"),
                    status="completed",
                )
                for index, product in enumerate(products, start=1)
            ]
            db.session.add_all(returns)
            db.session.commit()

            client = app.test_client()
            response = client.get(
                f"/api/customer-returns/print?ids={returns[1].id},{returns[0].id}"
            )
            body = response.get_json() or {}
            documents = body.get("returns") or []

            assert response.status_code == 200, body
            assert body.get("company", {}).get("companyName") == company.companyName
            assert len(documents) == 2
            assert documents[0]["returnItem"]["refNumber"] == "CRPRINT1"
            assert documents[0]["customer"]["customer_name"] == customer.customer_name
            assert documents[0]["product"]["description"] == products[0].description
            assert documents[0]["returnItem"]["invoiceNumber"] == "INV-100"
            assert documents[1]["returnItem"]["refNumber"] == "CRPRINT2"
            assert float(documents[1]["returnItem"]["totalValue"]) == 25.0

            missing_response = client.get("/api/customer-returns/print?ids=999999")
            assert missing_response.status_code == 404

            invalid_response = client.get("/api/customer-returns/print?ids=not-an-id")
            assert invalid_response.status_code == 400
        finally:
            db.session.remove()
            db.drop_all()
            shutil.rmtree(run_dir, ignore_errors=True)

    print("Customer-return print regression: passed")


if __name__ == "__main__":
    raise SystemExit(main())
