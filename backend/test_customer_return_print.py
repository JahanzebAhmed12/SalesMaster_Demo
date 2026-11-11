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

from app import (  # noqa: E402
    app,
    db,
    _allocate_invoice_document_number,
    _prune_trailing_customer_return_voids,
    _record_voided_invoice_document,
    _release_latest_invoice_document_number,
)
from models import (  # noqa: E402
    Company,
    Customer,
    CustomerReturn,
    InvoiceDocumentNumber,
    RegularProduct,
    VoidedInvoiceDocument,
)
from flask_jwt_extended import create_access_token  # noqa: E402


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

            db.session.add(InvoiceDocumentNumber(id=1, last_number=7430))
            db.session.add(VoidedInvoiceDocument(
                invoice_number="7430",
                document_type="return",
                date=date(2026, 8, 3),
            ))
            db.session.commit()
            _prune_trailing_customer_return_voids()
            assert InvoiceDocumentNumber.query.get(1).last_number == 7429
            released = VoidedInvoiceDocument.query.filter_by(invoice_number="7430").first()
            assert released and released.document_type == "released"
            assert _allocate_invoice_document_number() == "7430"
            assert not VoidedInvoiceDocument.query.filter_by(invoice_number="7430").first()
            _record_voided_invoice_document(
                "7430",
                "return",
                date(2026, 8, 3),
            )
            assert _allocate_invoice_document_number() == "7431"
            assert not _release_latest_invoice_document_number("7430")
            void_7430 = VoidedInvoiceDocument.query.filter_by(invoice_number="7430").first()
            assert void_7430 and void_7430.document_type == "return"

            VoidedInvoiceDocument.query.delete()
            InvoiceDocumentNumber.query.get(1).last_number = 7431
            db.session.add_all([
                VoidedInvoiceDocument(
                    invoice_number="7430",
                    document_type="return",
                    date=date(2026, 8, 3),
                ),
                VoidedInvoiceDocument(
                    invoice_number="7431",
                    document_type="return",
                    date=date(2026, 8, 4),
                ),
            ])
            db.session.commit()
            _prune_trailing_customer_return_voids()
            assert InvoiceDocumentNumber.query.get(1).last_number == 7430
            assert VoidedInvoiceDocument.query.filter_by(
                invoice_number="7430",
                document_type="return",
            ).first()
            assert VoidedInvoiceDocument.query.filter_by(
                invoice_number="7431",
                document_type="released",
            ).first()
            _prune_trailing_customer_return_voids()
            assert InvoiceDocumentNumber.query.get(1).last_number == 7430
            assert VoidedInvoiceDocument.query.filter_by(
                invoice_number="7430",
                document_type="return",
            ).first()
            assert _allocate_invoice_document_number() == "7431"
            assert not VoidedInvoiceDocument.query.filter_by(invoice_number="7431").first()

            returns = [
                CustomerReturn(
                    ref_number=f"CRPRINT{index}",
                    date=date(2026, 8, index),
                    customer_id=customer.id,
                    product_id=product.id,
                    product_type="regular",
                    description=product.description,
                    invoice_number="INV-100",
                    document_invoice_number=f"RET{index}",
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
            assert documents[0]["returnItem"]["documentInvoiceNumber"] == "RET1"
            assert documents[1]["returnItem"]["refNumber"] == "CRPRINT2"
            assert float(documents[1]["returnItem"]["totalValue"]) == 25.0

            grouped_returns = [
                CustomerReturn(
                    ref_number=f"CRGROUP{index}",
                    date=date(2026, 8, 3),
                    customer_id=customer.id,
                    product_id=product.id,
                    product_type="regular",
                    description=product.description,
                    invoice_number="INV-200",
                    document_invoice_number="RET-GROUP",
                    quantity=Decimal(index),
                    unit_price=Decimal("12.50"),
                    total_value=Decimal(index) * Decimal("12.50"),
                    status="completed",
                )
                for index, product in enumerate(products, start=1)
            ]
            db.session.add_all(grouped_returns)
            db.session.commit()
            token = create_access_token(identity="return-print-test")
            daily_book_response = client.get(
                "/api/reports/daily-book-sales?fromDate=2026-08-03&toDate=2026-08-03",
                headers={"Authorization": f"Bearer {token}"},
            )
            daily_book_returns = [
                row for row in (daily_book_response.get_json() or [])
                if row.get("invoiceNo") == "RET-GROUP"
            ]
            assert daily_book_response.status_code == 200
            assert len(daily_book_returns) == 1
            assert daily_book_returns[0]["credit"] == 37.5
            assert daily_book_returns[0]["boxes"] == -3

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
