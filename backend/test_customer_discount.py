"""Regression coverage for customer discount transactions.

Run from the repository root with:
    backend\\venv\\Scripts\\python.exe backend\\test_customer_discount.py
"""

import os
import shutil
import sys
import tempfile
from datetime import date, datetime
from decimal import Decimal


run_dir = tempfile.mkdtemp(prefix="salesmaster-customer-discount-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(run_dir, 'test.db')}"
os.environ["STOCK_AUDIT_LOG_DIR"] = os.path.join(run_dir, "logs")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db  # noqa: E402
from migrations.customer_discount_v1 import upgrade  # noqa: E402
from models import (  # noqa: E402
    BusinessDate,
    Customer,
    CustomerDiscount,
    CustomerDiscountAudit,
    Payment,
    RegularProduct,
    Sale,
    SaleItem,
    User,
    UserBackDateOption,
    UserRestriction,
)
from flask_jwt_extended import create_access_token  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402


def main():
    with app.app_context():
        try:
            db.drop_all()
            db.create_all()
            legacy_engine = create_engine(
                f"sqlite:///{os.path.join(run_dir, 'legacy.db')}"
            )
            with legacy_engine.begin() as connection:
                connection.execute(text(
                    "CREATE TABLE legacy_records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
                ))
                connection.execute(text(
                    "INSERT INTO legacy_records (id, value) VALUES (1, 'preserved')"
                ))
            upgrade(legacy_engine, CustomerDiscount.__table__, CustomerDiscountAudit.__table__)
            upgrade(legacy_engine, CustomerDiscount.__table__, CustomerDiscountAudit.__table__)
            with legacy_engine.connect() as connection:
                assert connection.execute(
                    text("SELECT value FROM legacy_records WHERE id = 1")
                ).scalar_one() == "preserved"
                assert connection.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table' AND name='customer_discount'")
                ).scalar_one() == "customer_discount"
            legacy_engine.dispose()

            user = User(
                username="discount-test-user",
                password="test",
                user_type="admin",
                status="Active",
            )
            customer = Customer(
                customer_code="CUST-DISCOUNT-TEST",
                customer_name="Discount Test Customer",
                running_balance=Decimal("100.00"),
            )
            product = RegularProduct(
                product_code="PROD-DISCOUNT-TEST",
                description="Discount Test Product",
                selling_price=Decimal("10.00"),
            )
            db.session.add_all([user, customer, product])
            db.session.flush()
            sale = Sale(
                invoice_number="DISC-100",
                customer_id=customer.id,
                customer_type="account",
                payment_status="pending",
                subtotal=Decimal("100.00"),
                total_amount=Decimal("100.00"),
                paid_amount=Decimal("0.00"),
                status="finalized",
                date=datetime(2026, 6, 1, 10, 0),
                created_by=user.id,
            )
            db.session.add(sale)
            db.session.flush()
            item = SaleItem(
                sale_id=sale.id,
                product_id=product.id,
                quantity=Decimal("10.000"),
                unit_price=Decimal("10.00"),
                total_price=Decimal("100.00"),
            )
            db.session.add_all([
                item,
                BusinessDate(current_date=date(2026, 6, 15)),
                UserBackDateOption(
                    user_id=user.id,
                    editing=False,
                    deleting=False,
                    current_editing=True,
                ),
            ])
            db.session.commit()

            client = app.test_client()
            headers = {
                "Authorization": f"Bearer {create_access_token(identity=str(user.id))}"
            }

            invoices_response = client.get(
                f"/api/customers/{customer.id}/invoices"
                "?fromDate=2026-06-01&toDate=2026-06-15",
                headers=headers,
            )
            invoices = invoices_response.get_json() or []
            assert invoices_response.status_code == 200
            assert invoices[0]["discountEligible"] is True
            assert invoices[0]["outstandingAmount"] == 100

            create_response = client.post(
                "/api/customer-discounts",
                json={
                    "customerId": customer.id,
                    "saleId": sale.id,
                    "saleItemId": item.id,
                    "amount": "20.00",
                    "date": "2026-06-15",
                    "reason": "Commercial allowance",
                },
                headers=headers,
            )
            assert create_response.status_code == 201, create_response.get_json()
            created = create_response.get_json()
            assert created["reference"] == "CD-000001"
            assert created["amount"] == 20
            assert sale.total_amount == Decimal("100.00")
            assert item.total_price == Decimal("100.00")
            assert customer.running_balance == Decimal("80.00")

            lines_response = client.get(
                f"/api/customer-discounts/invoices/{sale.id}", headers=headers
            )
            lines = lines_response.get_json() or {}
            assert lines_response.status_code == 200
            assert lines["outstandingAmount"] == 80
            assert lines["items"][0]["remainingValue"] == 80
            assert lines["items"][0]["effectiveUnitPrice"] == 8

            oversized_response = client.post(
                "/api/customer-discounts",
                json={
                    "customerId": customer.id,
                    "saleId": sale.id,
                    "saleItemId": item.id,
                    "amount": "81.00",
                    "date": "2026-06-15",
                    "reason": "Over limit",
                },
                headers=headers,
            )
            assert oversized_response.status_code == 400

            daily_book_response = client.get(
                "/api/reports/daily-book-sales"
                "?fromDate=2026-06-15&toDate=2026-06-15",
                headers=headers,
            )
            daily_book = daily_book_response.get_json() or []
            assert daily_book_response.status_code == 200
            assert len(daily_book) == 1
            assert daily_book[0]["isCustomerDiscount"] is True
            assert daily_book[0]["credit"] == 20

            daily_summary_response = client.get(
                "/api/reports/daily-summary?date=2026-06-15", headers=headers
            )
            daily_summary = daily_summary_response.get_json() or {}
            assert daily_summary_response.status_code == 200
            assert any(row.get("is_customer_discount") for row in daily_summary["sales_summary"])
            daily_summary_pdf_response = client.get(
                "/api/reports/daily-summary/pdf?date=2026-06-15",
                headers=headers,
            )
            assert daily_summary_pdf_response.status_code == 200
            assert daily_summary_pdf_response.mimetype == "text/html"
            assert created["reference"] in daily_summary_pdf_response.get_data(as_text=True)

            statement_response = client.get(
                "/api/reports/customer-statement"
                f"?customerId={customer.id}&fromDate=2026-06-15&toDate=2026-06-15",
                headers=headers,
            )
            statement = statement_response.get_json() or []
            assert statement_response.status_code == 200
            assert len(statement) == 1
            assert statement[0]["discountAdj"] == 20
            assert statement[0]["balance"] == -20

            product_history_response = client.get(
                "/api/reports/product-sales-history"
                f"?productId={product.id}&fromDate=2026-06-15&toDate=2026-06-15",
                headers=headers,
            )
            product_history = product_history_response.get_json() or []
            assert product_history_response.status_code == 200
            assert len(product_history) == 1
            assert product_history[0]["isCustomerDiscount"] is True
            assert product_history[0]["total"] == -20

            general_product_history_response = client.get(
                "/api/reports/product-history"
                f"?productId={product.id}&fromDate=2026-06-15&toDate=2026-06-16",
                headers=headers,
            )
            general_product_history = general_product_history_response.get_json() or {}
            assert general_product_history_response.status_code == 200
            assert len(general_product_history["sales"]) == 1
            assert general_product_history["sales"][0]["isCustomerDiscount"] is True
            assert general_product_history["sales"][0]["total"] == -20

            product_sales_response = client.get(
                "/api/reports/product-sales"
                "?fromDate=2026-06-01&toDate=2026-06-30",
                headers=headers,
            )
            product_sales = product_sales_response.get_json() or []
            assert product_sales_response.status_code == 200
            assert product_sales[0]["grossTotal"] == 100
            assert product_sales[0]["discountTotal"] == 20
            assert product_sales[0]["total"] == 80

            full_analysis_response = client.get(
                "/api/reports/full-analysis"
                "?fromDate=2026-06-01&toDate=2026-06-30",
                headers=headers,
            )
            full_analysis = full_analysis_response.get_json() or []
            assert full_analysis_response.status_code == 200
            assert len(full_analysis) == 1
            assert full_analysis[0]["sales"] == 100
            assert full_analysis[0]["netSales"] == 80

            profit_loss_response = client.get(
                "/api/reports/profit-loss"
                "?fromDate=2026-06-01&toDate=2026-06-30",
                headers=headers,
            )
            profit_loss = profit_loss_response.get_json() or []
            discounted_product = next(
                row for row in profit_loss if row["id"] == product.id
            )
            assert profit_loss_response.status_code == 200
            assert discounted_product["totSales"] == 80
            assert discounted_product["avgSales"] == 8

            aging_response = client.get(
                "/api/reports/customer-aging?asOfDate=2026-06-15", headers=headers
            )
            aging = aging_response.get_json() or {}
            aging_customer = next(
                row for row in aging.get("data", []) if row["id"] == customer.id
            )
            assert aging_customer["totalOutstanding"] == 80

            partial_customer = Customer(
                customer_code="CUST-DISCOUNT-PARTIAL",
                customer_name="Partially Paid Customer",
                running_balance=Decimal("60.00"),
            )
            db.session.add(partial_customer)
            db.session.flush()
            partial_sale = Sale(
                invoice_number="DISC-101",
                customer_id=partial_customer.id,
                customer_type="account",
                payment_status="partial",
                subtotal=Decimal("100.00"),
                total_amount=Decimal("100.00"),
                paid_amount=Decimal("40.00"),
                status="finalized",
                date=datetime(2026, 6, 1, 10, 0),
                created_by=user.id,
            )
            db.session.add(partial_sale)
            db.session.flush()
            partial_item = SaleItem(
                sale_id=partial_sale.id,
                product_id=product.id,
                quantity=Decimal("10.000"),
                unit_price=Decimal("10.00"),
                total_price=Decimal("100.00"),
            )
            db.session.add_all([
                partial_item,
                Payment(
                    customer_id=partial_customer.id,
                    sale_id=partial_sale.id,
                    amount=Decimal("40.00"),
                    payment_mode="cash",
                    payment_date=date(2026, 6, 5),
                ),
            ])
            db.session.commit()
            partial_discount_response = client.post(
                "/api/customer-discounts",
                json={
                    "customerId": partial_customer.id,
                    "saleId": partial_sale.id,
                    "saleItemId": partial_item.id,
                    "amount": "60.00",
                    "date": "2026-06-15",
                    "reason": "Partial invoice allowance",
                },
                headers=headers,
            )
            assert partial_discount_response.status_code == 201
            db.session.refresh(partial_sale)
            db.session.refresh(partial_customer)
            assert partial_sale.payment_status == "paid"
            assert partial_customer.running_balance == Decimal("0.00")
            partial_over_limit_response = client.post(
                "/api/customer-discounts",
                json={
                    "customerId": partial_customer.id,
                    "saleId": partial_sale.id,
                    "saleItemId": partial_item.id,
                    "amount": "0.01",
                    "date": "2026-06-15",
                    "reason": "Over the remaining balance",
                },
                headers=headers,
            )
            assert partial_over_limit_response.status_code == 400

            edit_backdate_denied = client.put(
                f"/api/customer-discounts/{created['id']}",
                json={
                    "amount": "25.00",
                    "date": "2026-06-10",
                    "reason": "Updated allowance",
                },
                headers=headers,
            )
            assert edit_backdate_denied.status_code == 403

            options = UserBackDateOption.query.filter_by(user_id=user.id).first()
            options.editing = True
            db.session.commit()
            edit_response = client.put(
                f"/api/customer-discounts/{created['id']}",
                json={
                    "amount": "25.00",
                    "date": "2026-06-10",
                    "reason": "Updated allowance",
                },
                headers=headers,
            )
            assert edit_response.status_code == 200, edit_response.get_json()
            db.session.refresh(customer)
            assert customer.running_balance == Decimal("75.00")
            assert CustomerDiscountAudit.query.filter_by(
                discount_id=created["id"], action="updated"
            ).count() == 1

            delete_backdate_denied = client.delete(
                f"/api/customer-discounts/{created['id']}",
                json={"reason": "Entered in error"},
                headers=headers,
            )
            assert delete_backdate_denied.status_code == 403

            options.deleting = True
            db.session.commit()
            delete_response = client.delete(
                f"/api/customer-discounts/{created['id']}",
                json={"reason": "Entered in error"},
                headers=headers,
            )
            assert delete_response.status_code == 200, delete_response.get_json()
            db.session.refresh(customer)
            assert customer.running_balance == Decimal("100.00")
            assert CustomerDiscount.query.filter_by(
                id=created["id"], is_deleted=True
            ).count() == 1
            assert CustomerDiscountAudit.query.filter_by(
                discount_id=created["id"], action="deleted"
            ).count() == 1

            db.session.add(Payment(
                customer_id=customer.id,
                sale_id=sale.id,
                amount=Decimal("100.00"),
                payment_mode="cash",
                payment_date=date(2026, 6, 15),
            ))
            sale.paid_amount = Decimal("100.00")
            db.session.commit()
            paid_invoice_response = client.post(
                "/api/customer-discounts",
                json={
                    "customerId": customer.id,
                    "saleId": sale.id,
                    "saleItemId": item.id,
                    "amount": "1.00",
                    "date": "2026-06-15",
                    "reason": "Should not be accepted",
                },
                headers=headers,
            )
            assert paid_invoice_response.status_code == 400

            restriction = UserRestriction(
                user_id=user.id,
                section="customer_discount",
                allowed=False,
            )
            db.session.add(restriction)
            db.session.commit()
            denied_response = client.get("/api/customer-discounts", headers=headers)
            assert denied_response.status_code == 403

            assert customer.customer_name == "Discount Test Customer"
            assert sale.total_amount == Decimal("100.00")
            assert db.session.execute(
                db.text("SELECT COUNT(*) FROM customer_discount")
            ).scalar_one() == 2
        finally:
            db.session.remove()
            db.drop_all()
            shutil.rmtree(run_dir, ignore_errors=True)

    print("Customer-discount regression: passed")


if __name__ == "__main__":
    main()
