"""Regression tests for adding lines while updating a customer return document."""

import os
import sys
import tempfile
from datetime import date
from decimal import Decimal


run_dir = tempfile.mkdtemp(prefix="salesmaster-customer-return-doc-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(run_dir, 'test.db')}"
os.environ["STOCK_AUDIT_LOG_DIR"] = os.path.join(run_dir, "logs")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db  # noqa: E402
from models import (  # noqa: E402
    Company,
    Customer,
    CustomerReturn,
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

            company = Company(companyName="Doc Update Co", address1="1 Test Road")
            customer = Customer(
                customer_code="CUST-DOC-EDIT",
                customer_name="Doc Edit Customer",
                address="2 Customer Road",
            )
            user = User(username="doc-edit-test", password="test", user_type="admin")
            product_a = RegularProduct(
                product_code="PROD-DOC-A",
                description="Product A",
                current_stock=Decimal("10"),
            )
            product_b = RegularProduct(
                product_code="PROD-DOC-B",
                description="Product B",
                current_stock=Decimal("20"),
            )
            db.session.add_all([company, customer, user, product_a, product_b])
            db.session.flush()

            sale = Sale(
                invoice_number="INV-DOC-EDIT-1",
                customer_id=customer.id,
                date=None,
                customer_type="account",
                status="finalized",
                subtotal=Decimal("90.00"),
                total_amount=Decimal("90.00"),
            )
            db.session.add(sale)
            db.session.flush()
            item_a = SaleItem(
                sale_id=sale.id,
                product_id=product_a.id,
                quantity=Decimal("5"),
                unit_price=Decimal("10.00"),
                total_price=Decimal("50.00"),
            )
            item_b = SaleItem(
                sale_id=sale.id,
                product_id=product_b.id,
                quantity=Decimal("1"),
                unit_price=Decimal("40.00"),
                total_price=Decimal("40.00"),
            )
            db.session.add_all([item_a, item_b])
            db.session.flush()

            existing_return = CustomerReturn(
                ref_number="CRDOC0001",
                document_invoice_number="DOC-EDIT-1",
                date=date.today(),
                customer_id=customer.id,
                sale_id=sale.id,
                source_sale_item_id=item_a.id,
                is_manual=False,
                product_id=product_a.id,
                product_type="regular",
                description="Product A",
                invoice_number="INV-DOC-EDIT-1",
                remarks="original remarks",
                quantity=Decimal("2"),
                unit_price=Decimal("10.00"),
                total_value=Decimal("20.00"),
                status="completed",
            )
            db.session.add(existing_return)
            db.session.commit()

            client = app.test_client()
            token = create_access_token(identity=user.id)
            headers = {"Authorization": f"Bearer {token}"}
            url = f"/api/customer-returns/{existing_return.id}/document"

            # 1. New line quantity beyond the invoice remainder is rejected.
            too_many = client.put(url, json={
                "remarks": "original remarks",
                "items": [
                    {"id": existing_return.id, "quantity": 2, "unitPrice": 10},
                    {
                        "productId": product_b.id,
                        "productType": "regular",
                        "description": "Product B",
                        "quantity": 5,
                        "unitPrice": 40,
                        "sourceSaleItemId": item_b.id,
                    },
                ],
            }, headers=headers)
            assert too_many.status_code == 400, too_many.get_json()

            # 2. Existing line beyond its invoice remainder is rejected.
            too_many_existing = client.put(url, json={
                "items": [{"id": existing_return.id, "quantity": 6, "unitPrice": 10}],
            }, headers=headers)
            assert too_many_existing.status_code == 400, too_many_existing.get_json()

            # 3. New line without an invoice link is rejected.
            unlinked = client.put(url, json={
                "items": [
                    {"id": existing_return.id, "quantity": 2, "unitPrice": 10},
                    {
                        "productId": product_b.id,
                        "productType": "regular",
                        "description": "Product B",
                        "quantity": 1,
                        "unitPrice": 40,
                    },
                ],
            }, headers=headers)
            assert unlinked.status_code == 400, unlinked.get_json()

            # 4. New line whose product does not match the invoice line is rejected.
            mismatched = client.put(url, json={
                "items": [
                    {"id": existing_return.id, "quantity": 2, "unitPrice": 10},
                    {
                        "productId": product_a.id,
                        "productType": "regular",
                        "description": "Product A",
                        "quantity": 1,
                        "unitPrice": 10,
                        "sourceSaleItemId": item_b.id,
                    },
                ],
            }, headers=headers)
            assert mismatched.status_code == 400, mismatched.get_json()

            # 5. Omitting an existing line is rejected.
            missing_line = client.put(url, json={"items": []}, headers=headers)
            assert missing_line.status_code == 400, missing_line.get_json()

            stock_a_before = float(product_a.current_stock)
            stock_b_before = float(product_b.current_stock)

            # 6. Update existing quantity and add a new invoice-linked line.
            updated = client.put(url, json={
                "remarks": "updated remarks",
                "items": [
                    {
                        "id": existing_return.id,
                        "quantity": 3,
                        "unitPrice": 11,
                        "itemRemarks": "adjusted",
                    },
                    {
                        "productId": product_b.id,
                        "productType": "regular",
                        "description": "Product B",
                        "quantity": 1,
                        "unitPrice": 40,
                        "sourceSaleItemId": item_b.id,
                        "itemRemarks": "added during edit",
                    },
                ],
            }, headers=headers)
            body = updated.get_json()
            assert updated.status_code == 200, body
            assert len(body) == 2

            updated_existing = next(row for row in body if row["id"] == existing_return.id)
            assert float(updated_existing["quantity"]) == 3
            assert float(updated_existing["unitPrice"]) == 11
            assert updated_existing["itemRemarks"] == "adjusted"
            assert updated_existing["remarks"] == "updated remarks"

            added = next(row for row in body if row["id"] != existing_return.id)
            assert added["documentInvoiceNumber"] == "DOC-EDIT-1"
            assert added["saleId"] == sale.id
            assert added["invoiceNumber"] == "INV-DOC-EDIT-1"
            assert added["sourceSaleItemId"] == item_b.id
            assert added["productId"] == product_b.id
            assert float(added["quantity"]) == 1
            assert float(added["unitPrice"]) == 40
            assert added["itemRemarks"] == "added during edit"
            assert added["status"] == "completed"

            db.session.expire_all()
            assert float(product_a.current_stock) == stock_a_before + 1  # 2 -> 3
            assert float(product_b.current_stock) == stock_b_before + 1  # new line

            persisted = CustomerReturn.query.filter_by(
                document_invoice_number="DOC-EDIT-1"
            ).order_by(CustomerReturn.id).all()
            assert len(persisted) == 2
            assert {row.product_id for row in persisted} == {product_a.id, product_b.id}

            # 7. A second edit cannot exceed the remaining quantity (B is now fully returned).
            added_id = added["id"]
            over_limit = client.put(url, json={
                "items": [
                    {"id": existing_return.id, "quantity": 3, "unitPrice": 11},
                    {"id": added_id, "quantity": 1, "unitPrice": 40},
                    {
                        "productId": product_b.id,
                        "productType": "regular",
                        "description": "Product B",
                        "quantity": 1,
                        "unitPrice": 40,
                        "sourceSaleItemId": item_b.id,
                    },
                ],
            }, headers=headers)
            assert over_limit.status_code == 400, over_limit.get_json()

            print("customer return document update tests passed")
        finally:
            db.session.remove()
            db.drop_all()
            shutil_cleanup = __import__("shutil")
            shutil_cleanup.rmtree(run_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
