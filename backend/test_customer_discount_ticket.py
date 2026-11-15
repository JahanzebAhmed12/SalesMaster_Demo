"""Regression tests for multi-line customer discount tickets."""

import os
import shutil
import sys
import tempfile
from datetime import date, datetime, timedelta
from decimal import Decimal


run_dir = tempfile.mkdtemp(prefix="salesmaster-customer-discount-ticket-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(run_dir, 'test.db')}"
os.environ["STOCK_AUDIT_LOG_DIR"] = os.path.join(run_dir, "logs")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db  # noqa: E402
from flask_jwt_extended import create_access_token  # noqa: E402
from models import (  # noqa: E402
    Customer,
    CustomerDiscount,
    InvoiceDocumentNumber,
    RegularProduct,
    Sale,
    SaleItem,
    User,
    UserRestriction,
    VoidedInvoiceDocument,
)


def main():
    with app.app_context():
        try:
            db.drop_all()
            db.create_all()

            user = User(username="discount-ticket-test", password="test", user_type="admin")
            customer = Customer(
                customer_code="CUST-DISCOUNT-TICKET",
                customer_name="Discount Ticket Customer",
                running_balance=Decimal("0.00"),
            )
            products = [
                RegularProduct(
                    product_code=f"DISCOUNT-TICKET-{index}",
                    description=f"Discount Ticket Product {index}",
                )
                for index in (1, 2)
            ]
            db.session.add_all([user, customer, *products])
            db.session.flush()

            sale = Sale(
                invoice_number="DISCOUNT-TICKET-INVOICE",
                customer_id=customer.id,
                customer_type="account",
                payment_status="unpaid",
                subtotal=Decimal("80.00"),
                total_amount=Decimal("80.00"),
                status="finalized",
                date=datetime.combine(date.today(), datetime.min.time()),
                created_by=user.id,
            )
            other_sale = Sale(
                invoice_number="DISCOUNT-TICKET-OTHER-INVOICE",
                customer_id=customer.id,
                customer_type="account",
                payment_status="unpaid",
                subtotal=Decimal("30.00"),
                total_amount=Decimal("30.00"),
                status="finalized",
                date=datetime.combine(date.today(), datetime.min.time()),
                created_by=user.id,
            )
            db.session.add_all([sale, other_sale])
            db.session.flush()
            sale_items = [
                SaleItem(
                    sale_id=sale.id,
                    product_id=product.id,
                    quantity=Decimal("2"),
                    unit_price=Decimal("25.00"),
                    total_price=Decimal("50.00"),
                )
                for product in products
            ]
            other_sale_item = SaleItem(
                sale_id=other_sale.id,
                product_id=products[0].id,
                quantity=Decimal("1"),
                unit_price=Decimal("30.00"),
                total_price=Decimal("30.00"),
            )
            db.session.add_all([*sale_items, other_sale_item])
            db.session.add(InvoiceDocumentNumber(id=1, last_number=100))
            db.session.commit()

            client = app.test_client()
            headers = {"Authorization": f"Bearer {create_access_token(identity=str(user.id))}"}
            candidates_response = client.get(
                f"/api/customer-discounts/products?customerId={customer.id}"
                f"&fromDate={date.today().isoformat()}&toDate={date.today().isoformat()}",
                headers=headers,
            )
            candidates = candidates_response.get_json() or []
            product_one_invoice_numbers = {
                item["invoiceNumber"]
                for item in candidates
                if item["productId"] == products[0].id
            }
            assert candidates_response.status_code == 200
            assert product_one_invoice_numbers == {
                sale.invoice_number,
                other_sale.invoice_number,
            }

            response = client.post(
                "/api/customer-discounts",
                headers=headers,
                json={
                    "customerId": customer.id,
                    "date": date.today().isoformat(),
                    "items": [
                        {
                            "saleId": sale.id,
                            "saleItemId": sale_items[0].id,
                            "amount": "5.00",
                            "reason": "Quality adjustment",
                        },
                        {
                            "saleId": other_sale.id,
                            "saleItemId": other_sale_item.id,
                            "amount": "3.00",
                            "reason": "Second invoice adjustment",
                        },
                        {
                            "saleId": sale.id,
                            "saleItemId": sale_items[1].id,
                            "amount": "7.00",
                            "reason": "Price adjustment",
                        },
                    ],
                },
            )
            body = response.get_json() or {}
            assert response.status_code == 201, body
            assert body["documentInvoiceNumber"] == "101"
            assert len(body["discounts"]) == 3
            discounts = CustomerDiscount.query.order_by(CustomerDiscount.id).all()
            assert len(discounts) == 3
            assert {discount.document_invoice_number for discount in discounts} == {"101"}
            assert {discount.sale_id for discount in discounts} == {sale.id, other_sale.id}
            assert customer.running_balance == Decimal("-15.00")

            over_limit_response = client.post(
                "/api/customer-discounts",
                headers=headers,
                json={
                    "customerId": customer.id,
                    "date": date.today().isoformat(),
                    "items": [
                        {
                            "saleId": sale.id,
                            "saleItemId": sale_items[0].id,
                            "amount": "35.00",
                            "reason": "Aggregate limit check",
                        },
                        {
                            "saleId": sale.id,
                            "saleItemId": sale_items[1].id,
                            "amount": "34.00",
                            "reason": "Aggregate limit check",
                        },
                    ],
                },
            )
            assert over_limit_response.status_code == 400
            assert CustomerDiscount.query.filter_by(is_deleted=False).count() == 3
            assert customer.running_balance == Decimal("-15.00")

            print_response = client.get(
                f"/api/customer-discounts/print?ids={discounts[0].id}"
            )
            printed = (print_response.get_json() or {}).get("discounts", [])
            assert print_response.status_code == 200
            assert len(printed) == 3
            assert sum(item["discount"]["amount"] for item in printed) == 15

            daily_book_response = client.get(
                f"/api/reports/daily-book-sales?fromDate={date.today().isoformat()}&toDate={date.today().isoformat()}",
                headers=headers,
            )
            daily_book = daily_book_response.get_json() or []
            ticket_rows = [
                row for row in daily_book
                if row.get("isCustomerDiscount") and row.get("invoiceNo") == "101"
            ]
            assert daily_book_response.status_code == 200
            assert len(ticket_rows) == 1
            assert ticket_rows[0]["credit"] == 15
            assert ticket_rows[0]["originalInvoiceNo"] == (
                "DISCOUNT-TICKET-INVOICE, DISCOUNT-TICKET-OTHER-INVOICE"
            )

            statement_response = client.get(
                f"/api/reports/customer-statement?customerId={customer.id}&fromDate={date.today().isoformat()}&toDate={date.today().isoformat()}",
                headers=headers,
            )
            statement = statement_response.get_json() or []
            statement_tickets = [row for row in statement if row.get("invoiceNo") == "101"]
            assert statement_response.status_code == 200
            assert len(statement_tickets) == 1
            assert statement_tickets[0]["discountAdj"] == 15
            assert "DISCOUNT-TICKET-OTHER-INVOICE" in statement_tickets[0]["description"]

            history_response = client.get(
                f"/api/reports/customer-history?customerId={customer.id}&fromDate={date.today().isoformat()}&toDate={date.today().isoformat()}&filterType=All",
                headers=headers,
            )
            history = history_response.get_json() or []
            history_tickets = [row for row in history if row.get("isCustomerDiscount")]
            assert history_response.status_code == 200
            assert len(history_tickets) == 1
            assert history_tickets[0]["invoiceNo"] == "101"
            assert history_tickets[0]["balance"] == -15
            assert "DISCOUNT-TICKET-OTHER-INVOICE" in history_tickets[0]["sourceInvoiceNumbers"]

            delete_response = client.delete(
                f"/api/customer-discounts/{discounts[2].id}",
                headers=headers,
            )
            assert delete_response.status_code == 200, delete_response.get_json()
            assert CustomerDiscount.query.filter_by(is_deleted=False).count() == 0
            voided = VoidedInvoiceDocument.query.filter_by(invoice_number="101").first()
            assert voided is not None and voided.document_type == "released"
            assert InvoiceDocumentNumber.query.get(1).last_number == 100
            assert customer.running_balance == Decimal("0.00")

            latest_discount_response = client.post(
                "/api/customer-discounts",
                headers=headers,
                json={
                    "customerId": customer.id,
                    "date": date.today().isoformat(),
                    "items": [{
                        "saleId": sale.id,
                        "saleItemId": sale_items[0].id,
                        "amount": "5.00",
                        "reason": "Latest ticket deletion check",
                    }],
                },
            )
            latest_discount = latest_discount_response.get_json() or {}
            assert latest_discount_response.status_code == 201, latest_discount
            assert latest_discount["documentInvoiceNumber"] == "101"

            later_sale = Sale(
                invoice_number="102",
                customer_id=customer.id,
                customer_type="account",
                payment_status="unpaid",
                subtotal=Decimal("10.00"),
                total_amount=Decimal("10.00"),
                status="finalized",
                date=datetime.combine(date.today(), datetime.min.time()),
                created_by=user.id,
            )
            db.session.add(later_sale)
            InvoiceDocumentNumber.query.get(1).last_number = 102
            db.session.commit()

            later_record_delete_response = client.delete(
                f"/api/customer-discounts/{latest_discount['discounts'][0]['id']}",
                headers=headers,
            )
            assert later_record_delete_response.status_code == 200, later_record_delete_response.get_json()
            voided = VoidedInvoiceDocument.query.filter_by(invoice_number="101").first()
            assert voided is not None and voided.document_type == "discount"
            assert InvoiceDocumentNumber.query.get(1).last_number == 102
            assert customer.running_balance == Decimal("0.00")

            db.session.add(UserRestriction(
                user_id=user.id,
                section="customer_discount_date",
                allowed=False,
            ))
            db.session.commit()
            hidden_date_response = client.post(
                "/api/customer-discounts",
                headers=headers,
                json={
                    "customerId": customer.id,
                    "saleId": sale.id,
                    "saleItemId": sale_items[0].id,
                    "amount": "1.00",
                    "date": (date.today() - timedelta(days=1)).isoformat(),
                    "reason": "Hidden date uses business date",
                },
            )
            hidden_date_discount = hidden_date_response.get_json() or {}
            assert hidden_date_response.status_code == 201, hidden_date_discount
            assert hidden_date_discount["date"] == date.today().isoformat()
            assert client.delete(
                f"/api/customer-discounts/{hidden_date_discount['id']}",
                headers=headers,
            ).status_code == 200
        finally:
            db.session.remove()
            db.drop_all()
            shutil.rmtree(run_dir, ignore_errors=True)

    print("Customer discount ticket regression: passed")


if __name__ == "__main__":
    raise SystemExit(main())
