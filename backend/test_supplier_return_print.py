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
from flask_jwt_extended import create_access_token  # noqa: E402
from models import RegularProduct, Supplier, SupplierReturn, User  # noqa: E402


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
                document_ref_number="SRPRINT01",
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
            second_return_item = SupplierReturn(
                ref_number="SRPRINT02",
                document_ref_number="SRPRINT01",
                date=date(2026, 8, 27),
                supplier_id=supplier.id,
                product_id=product.id,
                product_type="regular",
                description="Additional damaged stock",
                invoice_number="SUP-INV-77",
                quantity=Decimal("2.000"),
                unit_price=Decimal("20.00"),
                total_value=Decimal("40.00"),
                status="completed",
            )
            db.session.add_all([return_item, second_return_item])
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
            check(
                body.get("items", [{}])[0].get("productName") == f"{product.product_code} - {product.description}",
                "print payload resolves product code and name",
            )
            check(returned.get("refNumber") == "SRPRINT01", "print payload includes return reference")
            check(returned.get("returnReason") == "Damaged", "print payload includes return reason")
            check(returned.get("creditNoteIssued") is True, "print payload includes credit-note flag")
            check(float(returned.get("creditNoteAmount")) == 60.0, "print payload includes credit-note amount")
            check(returned.get("remarks") == return_item.remarks, "print payload includes remarks")
            check(len(body.get("items") or []) == 2, "print payload includes every line in the return document")
            check(float(returned.get("totalQuantity")) == 5.0, "print payload aggregates document quantity")
            check(float(returned.get("totalValue")) == 100.0, "print payload aggregates document value")
            check(
                all(item.get("documentRefNumber") == "SRPRINT01" for item in body.get("items", [])),
                "print lines share the document reference",
            )

            user = User(
                username="supplier-return-batch-test-user",
                password="test-password",
                user_type="user",
                status="Active",
            )
            second_product = RegularProduct(
                product_code="PROD-PRINT-TEST-2",
                description="Second Print Test Product",
                selling_price=Decimal("15.00"),
                current_stock=Decimal("10.000"),
                initial_stock=Decimal("10.000"),
            )
            product.current_stock = Decimal("10.000")
            product.initial_stock = Decimal("10.000")
            db.session.add_all([user, second_product])
            db.session.commit()

            token = create_access_token(identity=str(user.id))
            headers = {"Authorization": f"Bearer {token}"}
            batch_response = client.post(
                "/api/supplier-returns",
                headers=headers,
                json={
                    "date": date.today().isoformat(),
                    "supplierId": supplier.id,
                    "items": [
                        {
                            "productId": product.id,
                            "productType": "regular",
                            "description": product.description,
                            "quantity": 2,
                            "unitPrice": 20,
                            "isManual": True,
                        },
                        {
                            "productId": second_product.id,
                            "productType": "regular",
                            "description": second_product.description,
                            "quantity": 3,
                            "unitPrice": 15,
                            "isManual": True,
                        },
                    ],
                    "creditNoteIssued": False,
                    "creditNoteAmount": 0,
                    "status": "completed",
                },
            )
            batch_body = batch_response.get_json() or {}
            batch_items = batch_body.get("items") or []
            check(batch_response.status_code == 201, "batch supplier return creates successfully")
            check(len(batch_items) == 2, "batch supplier return saves both product lines")
            check(
                len({item.get("documentRefNumber") for item in batch_items}) == 1,
                "batch product lines share one return document number",
            )

            if batch_items:
                db.session.expire_all()
                check(
                    db.session.get(RegularProduct, product.id).current_stock == Decimal("8.000"),
                    "batch creation deducts stock for the first product",
                )
                check(
                    db.session.get(RegularProduct, second_product.id).current_stock == Decimal("7.000"),
                    "batch creation deducts stock for the second product",
                )
                batch_print = client.get(
                    f"/api/supplier-returns/{batch_items[0]['id']}/print"
                ).get_json() or {}
                check(len(batch_print.get("items") or []) == 2, "batch print includes all product lines")

                update_response = client.put(
                    f"/api/supplier-returns/{batch_items[0]['id']}",
                    headers=headers,
                    json={
                        "date": date.today().isoformat(),
                        "supplierId": supplier.id,
                        "purchaseInvoiceId": None,
                        "invoiceNumber": "",
                        "remarks": "Updated batch return",
                        "returnReason": "Updated reason",
                        "creditNoteIssued": False,
                        "creditNoteAmount": 0,
                        "status": "completed",
                        "items": [
                            {
                                "id": batch_items[0]["id"],
                                "productId": product.id,
                                "productType": "regular",
                                "description": product.description,
                                "quantity": 1,
                                "unitPrice": 21,
                            },
                            {
                                "id": batch_items[1]["id"],
                                "productId": second_product.id,
                                "productType": "regular",
                                "description": second_product.description,
                                "quantity": 4,
                                "unitPrice": 15,
                            },
                        ],
                    },
                )
                updated_body = update_response.get_json() or {}
                check(update_response.status_code == 200, "editing a batch return succeeds")
                check(len(updated_body.get("items") or []) == 2, "batch edit preserves all return lines")
                db.session.expire_all()
                check(
                    db.session.get(RegularProduct, product.id).current_stock == Decimal("9.000"),
                    "batch edit adjusts first-product stock by the quantity change",
                )
                check(
                    db.session.get(RegularProduct, second_product.id).current_stock == Decimal("6.000"),
                    "batch edit adjusts second-product stock by the quantity change",
                )

                delete_response = client.delete(
                    f"/api/supplier-returns/{batch_items[0]['id']}",
                    headers=headers,
                )
                check(delete_response.status_code == 200, "deleting a batch removes the document")
                db.session.expire_all()
                check(
                    db.session.get(RegularProduct, product.id).current_stock == Decimal("10.000"),
                    "batch deletion restores first-product stock",
                )
                check(
                    db.session.get(RegularProduct, second_product.id).current_stock == Decimal("10.000"),
                    "batch deletion restores second-product stock",
                )
        finally:
            db.session.remove()
            db.drop_all()
            shutil.rmtree(run_dir, ignore_errors=True)

    print(f"\nSupplier-return print regression: {PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
