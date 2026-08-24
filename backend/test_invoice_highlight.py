"""Regression coverage for manually highlighted sales invoice rows.

The test uses a disposable SQLite database and never touches application data.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_fd, _db_path = tempfile.mkstemp(prefix="salesmaster-highlight-", suffix=".db")
os.close(_fd)
Path(_db_path).unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["JWT_SECRET_KEY"] = "invoice-highlight-test-secret-key-32-bytes"
os.environ["SECRET_KEY"] = "invoice-highlight-test-session-secret"

from flask_jwt_extended import create_access_token  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402

from app import app, get_invoice_data_for_pdf  # noqa: E402
from mail_utils import render_invoice_html  # noqa: E402
from models import Customer, RegularProduct, Sale, SaleItem, User, db  # noqa: E402
from pdf_generator import DotMatrixInvoicePDF  # noqa: E402

app.config.update(TESTING=True)


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
    print(f"[PASS] {message}")


with app.app_context():
    db.drop_all()
    db.create_all()

    user = User(
        username="highlight-test-user",
        password=generate_password_hash("test-password"),
        user_type="admin",
        status="active",
    )
    customer = Customer(
        customer_code="HIGHLIGHT-CUST-001",
        customer_name="Highlight Test Customer",
        customer_currency="GBP",
        is_active="yes",
    )
    product = RegularProduct(
        product_code="HIGHLIGHT-PROD-001",
        description="Highlighted Test Product",
        selling_price=10,
        current_stock=100,
        initial_stock=100,
    )
    db.session.add_all([user, customer, product])
    db.session.commit()
    user_id = user.id
    customer_id = customer.id
    product_id = product.id

client = app.test_client()
with app.app_context():
    access_token = create_access_token(identity=str(user_id))
headers = {"Authorization": f"Bearer {access_token}"}

create_payload = {
    "customer_id": customer_id,
    "customer_type": "account",
    "payment_status": "pending",
    "subtotal": 10,
    "porterage": 0,
    "porterage_type": "per_unit",
    "porterage_rate": 0,
    "vat_rate": 0,
    "vat_amount": 0,
    "total_amount": 10,
    "vehicle_details": None,
    "gate_number": None,
    "notes": None,
    "status": "draft",
    "items": [
        {
            "product_id": product_id,
            "non_product_id": None,
            "quantity": 1,
            "unit_price": 10,
            "total_price": 10,
            "notes": None,
            "added_by": "highlight-test-user",
            "highlighted": True,
        }
    ],
}

created = client.post("/api/sales", json=create_payload, headers=headers)
check(created.status_code == 201, "new invoice with a highlighted row is created")
created_data = created.get_json()
invoice_number = created_data["invoiceNumber"]
sale_id = created_data["id"]
check(created_data["items"][0]["highlighted"] is True, "create response returns the highlighted row")

with app.app_context():
    persisted_item = SaleItem.query.filter_by(sale_id=sale_id).one()
    check(persisted_item.highlighted is True, "highlight is persisted on the SaleItem row")

fetched = client.get(f"/api/sales/{invoice_number}", headers=headers)
check(fetched.status_code == 200, "saved invoice can be retrieved")
check(fetched.get_json()["items"][0]["highlighted"] is True, "invoice retrieval returns the persisted highlight")

lock_response = client.post(f"/api/sales/{sale_id}/edit-lock", headers=headers)
check(lock_response.status_code in (200, 201), "invoice edit lock can be acquired for the highlight update")
lock_token = lock_response.get_json()["lockToken"]

update_payload = {
    **create_payload,
    "invoice_number": invoice_number,
    "highlighted": False,
    "edit_lock_token": lock_token,
    "items": [{**create_payload["items"][0], "highlighted": False}],
}
updated = client.put(f"/api/sales/{sale_id}", json=update_payload, headers=headers)
check(updated.status_code == 200, "existing invoice can update its row highlight")
check(updated.get_json()["items"][0]["highlighted"] is False, "update response returns the changed highlight")

with app.app_context():
    persisted_item = SaleItem.query.filter_by(sale_id=sale_id).one()
    check(persisted_item.highlighted is False, "edited highlight state is persisted")
    invoice_data = get_invoice_data_for_pdf(invoice_number)
    pdf = DotMatrixInvoicePDF().generate_pdf(invoice_data)
    check(pdf.read(4) == b"%PDF", "invoice PDF generator accepts persisted highlight data")
    sale = db.session.get(Sale, sale_id)
    html = render_invoice_html(sale, sale.customer)
    check('class="highlighted-row"' not in html, "email HTML omits the highlight class when the row is unhighlighted")
    persisted_item.highlighted = True
    db.session.commit()
    html = render_invoice_html(sale, sale.customer)
    check("highlighted-row" in html, "email HTML includes the highlight class when the row is highlighted")

Path(_db_path).unlink(missing_ok=True)
print("Invoice highlight regression suite completed successfully.")

