"""Regression test for cross-user visibility of auto-held edited invoices."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_fd, _db_path = tempfile.mkstemp(prefix="salesmaster-held-visibility-", suffix=".db")
os.close(_fd)
Path(_db_path).unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["JWT_SECRET_KEY"] = "held-visibility-test-secret"
os.environ["SECRET_KEY"] = "held-visibility-test-secret"

from flask_jwt_extended import create_access_token  # noqa: E402

from app import app  # noqa: E402
from models import Customer, RegularProduct, User, db  # noqa: E402

app.config.update(TESTING=True)


def auth_headers(user_id: int) -> dict[str, str]:
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


with app.app_context():
    db.drop_all()
    db.create_all()
    admin = User(username="visibility-admin", password="x", user_type="admin", status="Active")
    operator = User(username="visibility-operator", password="x", user_type="user", status="Active")
    customer = Customer(customer_code="C-VIS", customer_name="Visibility Customer")
    product = RegularProduct(product_code="P-VIS", description="Visibility Product", current_stock=20, initial_stock=20)
    db.session.add_all([admin, operator, customer, product])
    db.session.commit()
    admin_id, operator_id, customer_id, product_id = admin.id, operator.id, customer.id, product.id

client = app.test_client()

held_payload = {
    "holdId": "abandoned-edit-001",
    "customerId": str(customer_id),
    "saleItems": [
        {
            "productId": product_id,
            "quantity": 3,
            "unitPrice": 12,
            "totalPrice": 36,
            "highlighted": True,
        }
    ],
    "currentSale": {
        "invoiceNumber": "INV-ABANDONED-001",
        "customerId": customer_id,
        "status": "finalized",
    },
}

created = client.post("/api/held-invoices", json=held_payload, headers=auth_headers(admin_id))
assert created.status_code == 201, created.get_json()

for user_id in (admin_id, operator_id):
    response = client.get("/api/held-invoices", headers=auth_headers(user_id))
    assert response.status_code == 200, response.get_json()
    holds = response.get_json()
    assert len(holds) == 1
    assert holds[0]["holdId"] == "abandoned-edit-001"
    assert holds[0]["currentSale"]["invoiceNumber"] == "INV-ABANDONED-001"
    assert holds[0]["createdByName"] == "visibility-admin"
    assert holds[0]["saleItems"][0]["highlighted"] is True
    print(f"[PASS] user {user_id} sees the abandoned edited invoice hold")

Path(_db_path).unlink(missing_ok=True)
print("Held-invoice cross-user visibility regression suite completed successfully.")
