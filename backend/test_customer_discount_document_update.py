"""Regression tests for updating a whole customer discount ticket."""

import os
import shutil
import sys
import tempfile
from datetime import date
from decimal import Decimal


run_dir = tempfile.mkdtemp(prefix="salesmaster-discount-doc-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(run_dir, 'test.db')}"
os.environ["STOCK_AUDIT_LOG_DIR"] = os.path.join(run_dir, "logs")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db  # noqa: E402
from models import (  # noqa: E402
    Company,
    Customer,
    CustomerDiscount,
    RegularProduct,
    Sale,
    SaleItem,
    User,
)
from flask_jwt_extended import create_access_token  # noqa: E402


def main():
    with app.app_context():
        try:
            db.drop_all()
            db.create_all()

            company = Company(companyName="Discount Doc Co", address1="1 Test Road")
            customer = Customer(
                customer_code="CUST-DISC-DOC",
                customer_name="Discount Doc Customer",
                running_balance=Decimal("-30.00"),
            )
            user = User(username="discount-doc-test", password="test", user_type="admin")
            product_a = RegularProduct(product_code="DISC-A", description="Product A")
            product_b = RegularProduct(product_code="DISC-B", description="Product B")
            product_c = RegularProduct(product_code="DISC-C", description="Product C")
            db.session.add_all([company, customer, user, product_a, product_b, product_c])
            db.session.flush()

            sale = Sale(
                invoice_number="INV-DISC-DOC-1",
                customer_id=customer.id,
                customer_type="account",
                status="finalized",
                subtotal=Decimal("120.00"),
                total_amount=Decimal("120.00"),
            )
            db.session.add(sale)
            db.session.flush()
            items = [
                SaleItem(sale_id=sale.id, product_id=product_a.id, quantity=Decimal("5"), unit_price=Decimal("10.00"), total_price=Decimal("50.00")),
                SaleItem(sale_id=sale.id, product_id=product_b.id, quantity=Decimal("1"), unit_price=Decimal("40.00"), total_price=Decimal("40.00")),
                SaleItem(sale_id=sale.id, product_id=product_c.id, quantity=Decimal("1"), unit_price=Decimal("30.00"), total_price=Decimal("30.00")),
            ]
            db.session.add_all(items)
            db.session.flush()
            item_a, item_b, item_c = items

            today = date.today()
            line_a = CustomerDiscount(
                customer_id=customer.id, sale_id=sale.id, sale_item_id=item_a.id,
                document_invoice_number="DOC-DISC-1", amount=Decimal("10.00"),
                date=today, reason="old reason a", created_by=user.id,
            )
            line_b = CustomerDiscount(
                customer_id=customer.id, sale_id=sale.id, sale_item_id=item_b.id,
                document_invoice_number="DOC-DISC-1", amount=Decimal("20.00"),
                date=today, reason="old reason b", created_by=user.id,
            )
            db.session.add_all([line_a, line_b])
            db.session.commit()

            client = app.test_client()
            token = create_access_token(identity=user.id)
            headers = {"Authorization": f"Bearer {token}"}
            url = "/api/customer-discounts/document/DOC-DISC-1"

            # 1. Exceeding a line limit is rejected.
            over_line = client.put(url, json={
                "customerId": customer.id,
                "date": today.isoformat(),
                "items": [
                    {"id": line_a.id, "amount": 60, "reason": "too much"},
                    {"id": line_b.id, "amount": 20, "reason": "keep"},
                ],
            }, headers=headers)
            assert over_line.status_code == 400, over_line.get_json()

            # 2. Omitting an existing line is rejected.
            missing = client.put(url, json={
                "customerId": customer.id,
                "date": today.isoformat(),
                "items": [{"id": line_a.id, "amount": 10, "reason": "keep"}],
            }, headers=headers)
            assert missing.status_code == 400, missing.get_json()

            # 3. Duplicate product line across kept and new entries is rejected.
            duplicate = client.put(url, json={
                "customerId": customer.id,
                "date": today.isoformat(),
                "items": [
                    {"id": line_a.id, "amount": 10, "reason": "keep"},
                    {"id": line_b.id, "amount": 20, "reason": "keep"},
                    {"saleId": sale.id, "saleItemId": item_a.id, "amount": 1, "reason": "dup"},
                ],
            }, headers=headers)
            assert duplicate.status_code == 400, duplicate.get_json()

            # 4. Removing every line is rejected.
            remove_all = client.put(url, json={
                "customerId": customer.id,
                "date": today.isoformat(),
                "items": [
                    {"id": line_a.id, "delete": True},
                    {"id": line_b.id, "delete": True},
                ],
            }, headers=headers)
            assert remove_all.status_code == 400, remove_all.get_json()

            balance_before = float(customer.running_balance)

            # 5. Update one line, delete another, and add a new line.
            updated = client.put(url, json={
                "customerId": customer.id,
                "date": today.isoformat(),
                "items": [
                    {"id": line_a.id, "amount": 15, "reason": "revised reason"},
                    {"id": line_b.id, "delete": True},
                    {"saleId": sale.id, "saleItemId": item_c.id, "amount": 5, "reason": "added line"},
                ],
            }, headers=headers)
            body = updated.get_json()
            assert updated.status_code == 200, body
            discounts = body["discounts"]
            assert len(discounts) == 3

            kept = next(row for row in discounts if row["id"] == line_a.id)
            assert float(kept["amount"]) == 15
            assert kept["reason"] == "revised reason"
            assert kept["isDeleted"] is False

            removed = next(row for row in discounts if row["id"] == line_b.id)
            assert removed["isDeleted"] is True

            added = next(row for row in discounts if row["id"] not in (line_a.id, line_b.id))
            assert added["documentInvoiceNumber"] == "DOC-DISC-1"
            assert added["saleItemId"] == item_c.id
            assert float(added["amount"]) == 5
            assert added["reason"] == "added line"

            db.session.expire_all()
            expected_balance = balance_before - 5 + 20 - 5  # line A +5 cost, B restored, C -5
            assert abs(float(customer.running_balance) - expected_balance) < 0.001, (
                customer.running_balance, expected_balance
            )

            # 6. A follow-up edit cannot push the invoice over its remaining value.
            added_id = added["id"]
            over_invoice = client.put(url, json={
                "customerId": customer.id,
                "date": today.isoformat(),
                "items": [
                    {"id": line_a.id, "amount": 15, "reason": "revised reason"},
                    {"id": added_id, "amount": 200, "reason": "too much"},
                ],
            }, headers=headers)
            assert over_invoice.status_code == 400, over_invoice.get_json()

            print("customer discount document update tests passed")
        finally:
            db.session.remove()
            db.drop_all()
            shutil.rmtree(run_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
