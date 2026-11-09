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

from app import app, db, _initialize_invoice_document_numbers  # noqa: E402
from migrations.customer_discount_v1 import upgrade  # noqa: E402
from migrations.invoice_document_numbers_v1 import upgrade as upgrade_invoice_document_numbers  # noqa: E402
from models import (  # noqa: E402
    BusinessDate,
    Customer,
    CustomerDiscount,
    CustomerDiscountAudit,
    CustomerReturn,
    DumpEntry,
    ClosingStock,
    Payment,
    RegularProduct,
    Sale,
    SaleItem,
    StockMovement,
    Supplier,
    SupplierReturn,
    User,
    UserBackDateOption,
    UserRestriction,
    InvoiceDocumentNumber,
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

            numbering_engine = create_engine(
                f"sqlite:///{os.path.join(run_dir, 'legacy-numbering.db')}"
            )
            with numbering_engine.begin() as connection:
                connection.execute(text(
                    "CREATE TABLE customer_return (id INTEGER PRIMARY KEY, invoice_number VARCHAR(50))"
                ))
                connection.execute(text(
                    "INSERT INTO customer_return (id, invoice_number) VALUES (1, 'ORIGINAL-100')"
                ))
                connection.execute(text(
                    "CREATE TABLE customer_discount (id INTEGER PRIMARY KEY)"
                ))
            upgrade_invoice_document_numbers(numbering_engine, InvoiceDocumentNumber.__table__)
            upgrade_invoice_document_numbers(numbering_engine, InvoiceDocumentNumber.__table__)
            with numbering_engine.connect() as connection:
                return_columns = {
                    row[1] for row in connection.execute(text("PRAGMA table_info(customer_return)"))
                }
                discount_columns = {
                    row[1] for row in connection.execute(text("PRAGMA table_info(customer_discount)"))
                }
                sequence_columns = {
                    row[1] for row in connection.execute(text("PRAGMA table_info(invoice_document_number)"))
                }
                assert "document_invoice_number" in return_columns
                assert "document_invoice_number" in discount_columns
                assert "last_number" in sequence_columns
                assert connection.execute(
                    text("SELECT invoice_number FROM customer_return WHERE id = 1")
                ).scalar_one() == "ORIGINAL-100"
            numbering_engine.dispose()

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
            supplier = Supplier(
                supplier_code="SUP-DISCOUNT-TEST",
                supplier_name="Discount Test Supplier",
                supplier_currency="GBP",
            )
            db.session.add_all([user, customer, product, supplier])
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
                notes="Sale invoice note",
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
                notes="Product-specific note",
            )
            db.session.add_all([
                item,
                Sale(
                    invoice_number="500",
                    customer_id=customer.id,
                    customer_type="account",
                    payment_status="pending",
                    subtotal=Decimal("0.00"),
                    total_amount=Decimal("0.00"),
                    paid_amount=Decimal("0.00"),
                    status="finalized",
                    date=datetime(2026, 1, 1, 10, 0),
                    created_by=user.id,
                ),
                CustomerReturn(
                    ref_number="CR-LEGACY-SEQUENCE",
                    date=date(2026, 1, 1),
                    customer_id=customer.id,
                    sale_id=None,
                    product_id=product.id,
                    product_type="regular",
                    description=product.description,
                    invoice_number=sale.invoice_number,
                    quantity=Decimal("1.000"),
                    unit_price=Decimal("10.00"),
                    total_value=Decimal("10.00"),
                    return_reason="Damaged product",
                    status="completed",
                ),
                BusinessDate(current_date=date(2026, 6, 15)),
                UserBackDateOption(
                    user_id=user.id,
                    editing=False,
                    deleting=False,
                    current_editing=True,
                ),
            ])
            db.session.commit()
            _initialize_invoice_document_numbers()
            legacy_return = CustomerReturn.query.filter_by(ref_number="CR-LEGACY-SEQUENCE").one()
            assert legacy_return.document_invoice_number == "501"

            client = app.test_client()
            headers = {
                "Authorization": f"Bearer {create_access_token(identity=str(user.id))}"
            }

            current_business_date_return = CustomerReturn(
                ref_number="CR-CURRENT-BUSINESS-DATE",
                date=date(2026, 6, 15),
                customer_id=customer.id,
                product_id=product.id,
                product_type="regular",
                description=product.description,
                quantity=Decimal("1.000"),
                unit_price=Decimal("10.00"),
                total_value=Decimal("10.00"),
                return_reason="Permission regression test",
                status="pending",
                created_by=user.id,
            )
            db.session.add(current_business_date_return)
            db.session.commit()
            current_date_return_delete_response = client.delete(
                f"/api/customer-returns/{current_business_date_return.id}",
                headers=headers,
            )
            assert current_date_return_delete_response.status_code == 200, (
                current_date_return_delete_response.get_json()
            )

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
            assert created["documentInvoiceNumber"] == "502"
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
            assert daily_book[0]["invoiceNo"] == created["documentInvoiceNumber"]
            assert daily_book[0]["originalInvoiceNo"] == sale.invoice_number
            assert daily_book[0]["credit"] == 20

            print_response = client.get(
                f"/api/customer-discounts/print?ids={created['id']}"
            )
            print_data = print_response.get_json() or {}
            assert print_response.status_code == 200, print_data
            assert print_data["discounts"][0]["discount"]["documentInvoiceNumber"] == created["documentInvoiceNumber"]
            assert print_data["discounts"][0]["discount"]["originalInvoiceNumber"] == sale.invoice_number

            daily_summary_response = client.get(
                "/api/reports/daily-summary?date=2026-06-15", headers=headers
            )
            daily_summary = daily_summary_response.get_json() or {}
            assert daily_summary_response.status_code == 200
            assert any(row.get("is_customer_discount") for row in daily_summary["sales_summary"])
            db.session.add(SupplierReturn(
                ref_number="SR-DISCOUNT-TEST",
                date=date(2026, 6, 15),
                supplier_id=supplier.id,
                product_id=product.id,
                product_type="regular",
                description="Supplier return note",
                invoice_number="PUR-100",
                quantity=Decimal("1.000"),
                unit_price=Decimal("10.00"),
                total_value=Decimal("10.00"),
                status="completed",
                created_by=user.id,
            ))
            db.session.commit()
            supplier_returns_response = client.get(
                "/api/supplier-returns?fromDate=2026-06-15&toDate=2026-06-15",
                headers=headers,
            )
            supplier_returns = supplier_returns_response.get_json() or []
            assert supplier_returns_response.status_code == 200
            assert supplier_returns[0]["productName"] == "PROD-DISCOUNT-TEST - Discount Test Product"
            daily_summary_pdf_response = client.get(
                "/api/reports/daily-summary/pdf"
                "?date=2026-06-15&includeStock=true&includePurchase=true",
                headers=headers,
            )
            assert daily_summary_pdf_response.status_code == 200
            assert daily_summary_pdf_response.mimetype == "text/html"
            daily_summary_print = daily_summary_pdf_response.get_data(as_text=True)
            assert "DISC-100" in daily_summary_print
            assert created["reference"] not in daily_summary_print
            assert "PROD-DISCOUNT-TEST - Discount Test Product" in daily_summary_print
            assert daily_summary_print.index("Stock Check") < daily_summary_print.index("Customer Returns")
            assert daily_summary_print.index("Customer Returns") < daily_summary_print.index("Supplier Returns")
            assert "No customer returns found" in daily_summary_print
            assert "Supplier return note" in daily_summary_print
            assert "<th>Status</th>" not in daily_summary_print
            assert "@page return-portrait" in daily_summary_print
            assert "A4 portrait" in daily_summary_print

            statement_response = client.get(
                "/api/reports/customer-statement"
                f"?customerId={customer.id}&fromDate=2026-06-15&toDate=2026-06-15",
                headers=headers,
            )
            statement = statement_response.get_json() or []
            assert statement_response.status_code == 200
            assert len(statement) == 1
            discount_row = next(row for row in statement if row["discountAdj"])
            assert discount_row["discountAdj"] == 20
            assert discount_row["balance"] == -20

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
            assert general_product_history["sales"][0]["notes"] == "Commercial allowance"

            sale_history_response = client.get(
                "/api/reports/product-history"
                f"?productId={product.id}&fromDate=2026-06-01&toDate=2026-06-02",
                headers=headers,
            )
            sale_history = sale_history_response.get_json() or {}
            assert sale_history_response.status_code == 200
            assert len(sale_history["sales"]) == 1
            assert sale_history["sales"][0]["notes"] == "Product-specific note"

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

            payment_customer = Customer(
                customer_code="CUST-BATCH-PAYMENT-TEST",
                customer_name="Batch Payment Test Customer",
                running_balance=Decimal("1000.00"),
            )
            db.session.add(payment_customer)
            db.session.flush()
            payment_sale = Sale(
                invoice_number="BATCH-PAYMENT-100",
                customer_id=payment_customer.id,
                customer_type="account",
                payment_status="pending",
                subtotal=Decimal("1000.00"),
                total_amount=Decimal("1000.00"),
                paid_amount=Decimal("0.00"),
                status="finalized",
                date=datetime(2026, 6, 1, 10, 0),
                created_by=user.id,
            )
            db.session.add(payment_sale)
            db.session.flush()
            second_payment_sale = Sale(
                invoice_number="BATCH-PAYMENT-101",
                customer_id=payment_customer.id,
                customer_type="account",
                payment_status="pending",
                subtotal=Decimal("100.00"),
                total_amount=Decimal("100.00"),
                paid_amount=Decimal("0.00"),
                status="finalized",
                date=datetime(2026, 6, 2, 10, 0),
                created_by=user.id,
            )
            db.session.add(second_payment_sale)
            db.session.flush()
            db.session.add_all([
                Payment(
                    customer_id=payment_customer.id,
                    sale_id=payment_sale.id,
                    amount=Decimal("150.00"),
                    payment_mode="cash",
                    payment_date=date(2026, 6, 15),
                    batch_id=42,
                    payment_type="direct",
                    payment_source="customer_payment",
                    created_by=user.id,
                ),
                Payment(
                    customer_id=payment_customer.id,
                    sale_id=second_payment_sale.id,
                    amount=Decimal("50.00"),
                    payment_mode="cash",
                    payment_date=date(2026, 6, 15),
                    batch_id=42,
                    payment_type="direct",
                    payment_source="customer_payment",
                    created_by=user.id,
                ),
                Payment(
                    customer_id=payment_customer.id,
                    sale_id=payment_sale.id,
                    amount=Decimal("600.00"),
                    payment_mode="bank",
                    payment_date=date(2026, 6, 15),
                    batch_id=42,
                    payment_type="direct",
                    payment_source="customer_payment",
                    created_by=user.id,
                ),
                Payment(
                    customer_id=payment_customer.id,
                    sale_id=payment_sale.id,
                    amount=Decimal("200.00"),
                    payment_mode="bank_transfer",
                    payment_date=date(2026, 6, 15),
                    batch_id=42,
                    payment_type="direct",
                    payment_source="customer_payment",
                    created_by=user.id,
                ),
            ])
            db.session.commit()
            split_statement_response = client.get(
                "/api/reports/customer-statement"
                f"?customerId={payment_customer.id}&fromDate=2026-06-15&toDate=2026-06-15",
                headers=headers,
            )
            split_statement = split_statement_response.get_json() or []
            assert split_statement_response.status_code == 200
            payment_rows = [row for row in split_statement if row["paid"] > 0]
            assert len(payment_rows) == 3
            assert {row["invoiceNo"] for row in payment_rows} == {"42"}
            assert {row["batchId"] for row in payment_rows} == {42}
            assert {row["description"] for row in payment_rows} == {
                "Payment Received - Cash",
                "Payment Received - Card",
                "Payment Received - Bank Transfer",
            }
            assert {
                row["description"]: row["paid"] for row in payment_rows
            } == {
                "Payment Received - Cash": 200,
                "Payment Received - Card": 600,
                "Payment Received - Bank Transfer": 200,
            }

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
                    "amount": "40.01",
                    "date": "2026-06-15",
                    "reason": "Exceeds remaining invoice value",
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
            paid_invoice_lines_response = client.get(
                f"/api/customer-discounts/invoices/{sale.id}",
                headers=headers,
            )
            paid_invoice_lines = paid_invoice_lines_response.get_json() or {}
            assert paid_invoice_lines_response.status_code == 200
            assert paid_invoice_lines["discountEligible"] is True
            assert paid_invoice_lines["availableDiscountAmount"] == 100

            customer_invoices_response = client.get(
                f"/api/customers/{customer.id}/invoices"
                "?fromDate=2026-06-01&toDate=2026-06-15",
                headers=headers,
            )
            customer_invoices = customer_invoices_response.get_json() or []
            paid_invoice = next(invoice for invoice in customer_invoices if invoice["id"] == sale.id)
            assert customer_invoices_response.status_code == 200
            assert paid_invoice["discountEligible"] is True
            assert paid_invoice["availableDiscountAmount"] == 100

            paid_invoice_response = client.post(
                "/api/customer-discounts",
                json={
                    "customerId": customer.id,
                    "saleId": sale.id,
                    "saleItemId": item.id,
                    "amount": "1.00",
                    "date": "2026-06-15",
                    "reason": "Paid invoice discount",
                },
                headers=headers,
            )
            assert paid_invoice_response.status_code == 201, paid_invoice_response.get_json()
            db.session.refresh(customer)
            assert customer.running_balance == Decimal("99.00")

            excessive_paid_discount_response = client.post(
                "/api/customer-discounts",
                json={
                    "customerId": customer.id,
                    "saleId": sale.id,
                    "saleItemId": item.id,
                    "amount": "100.00",
                    "date": "2026-06-15",
                    "reason": "Exceeds remaining value",
                },
                headers=headers,
            )
            assert excessive_paid_discount_response.status_code == 400

            restriction = UserRestriction(
                user_id=user.id,
                section="customer_discount",
                allowed=False,
            )
            db.session.add(restriction)
            db.session.commit()
            denied_response = client.get("/api/customer-discounts", headers=headers)
            assert denied_response.status_code == 403

            stock_product = RegularProduct(
                product_code="PROD-STOCK-CHECK-TEST",
                description="Stock Check Test Product",
                selling_price=Decimal("10.00"),
            )
            db.session.add(stock_product)
            db.session.flush()
            stock_sale = Sale(
                invoice_number="STOCK-CHECK-100",
                customer_id=customer.id,
                customer_type="account",
                payment_status="pending",
                subtotal=Decimal("100.00"),
                total_amount=Decimal("100.00"),
                paid_amount=Decimal("0.00"),
                status="finalized",
                date=datetime(2026, 7, 15, 10, 0),
                created_by=user.id,
            )
            db.session.add(stock_sale)
            db.session.flush()
            db.session.add_all([
                SaleItem(
                    sale_id=stock_sale.id,
                    product_id=stock_product.id,
                    quantity=Decimal("10.000"),
                    unit_price=Decimal("10.00"),
                    total_price=Decimal("100.00"),
                ),
                ClosingStock(
                    product_id=stock_product.id,
                    product_type="regular",
                    date=date(2026, 6, 30),
                    quantity=Decimal("20.000"),
                ),
                StockMovement(
                    product_id=stock_product.id,
                    product_type="regular",
                    movement_type="purchase",
                    quantity=Decimal("5.000"),
                    previous_stock=Decimal("20.000"),
                    new_stock=Decimal("25.000"),
                    movement_date=date(2026, 7, 15),
                ),
                StockMovement(
                    product_id=stock_product.id,
                    product_type="regular",
                    movement_type="purchase_reversal",
                    quantity=Decimal("-1.000"),
                    previous_stock=Decimal("25.000"),
                    new_stock=Decimal("24.000"),
                    movement_date=date(2026, 7, 15),
                ),
                CustomerReturn(
                    ref_number="CR-STOCK-CHECK-TEST",
                    date=date(2026, 7, 15),
                    customer_id=customer.id,
                    sale_id=stock_sale.id,
                    product_id=stock_product.id,
                    product_type="regular",
                    description="Stock check customer return",
                    quantity=Decimal("2.000"),
                    unit_price=Decimal("10.00"),
                    total_value=Decimal("20.00"),
                    status="completed",
                    created_by=user.id,
                ),
                DumpEntry(
                    ref_number="DM-STOCK-CHECK-TEST",
                    date=date(2026, 7, 15),
                    product_id=stock_product.id,
                    product_type="regular",
                    description="Stock check wastage",
                    quantity=Decimal("3.000"),
                    unit_price=Decimal("10.00"),
                    total_value=Decimal("30.00"),
                    created_by=user.id,
                ),
                SupplierReturn(
                    ref_number="SR-STOCK-CHECK-TEST",
                    date=date(2026, 7, 15),
                    supplier_id=supplier.id,
                    product_id=stock_product.id,
                    product_type="regular",
                    description="Stock check supplier return",
                    invoice_number="PUR-STOCK-100",
                    quantity=Decimal("1.000"),
                    unit_price=Decimal("10.00"),
                    total_value=Decimal("10.00"),
                    status="completed",
                    created_by=user.id,
                ),
            ])
            db.session.commit()
            stock_check_response = client.get(
                "/api/reports/stock-check?fromDate=2026-07-01&toDate=2026-07-15",
                headers=headers,
            )
            stock_check = stock_check_response.get_json() or []
            assert stock_check_response.status_code == 200
            stock_row = next(row for row in stock_check if row["id"] == stock_product.id)
            assert stock_row["os"] == 20
            assert stock_row["ns"] == 4
            assert stock_row["sales"] == 10
            assert stock_row["crtn"] == 2
            assert stock_row["dmps"] == 3
            assert stock_row["srtn"] == 1
            assert stock_row["stock"] == 12

            assert customer.customer_name == "Discount Test Customer"
            assert sale.total_amount == Decimal("100.00")
            assert db.session.execute(
                db.text("SELECT COUNT(*) FROM customer_discount")
            ).scalar_one() == 3
        finally:
            db.session.remove()
            db.drop_all()
            shutil.rmtree(run_dir, ignore_errors=True)

    print("Customer-discount regression: passed")


if __name__ == "__main__":
    main()
