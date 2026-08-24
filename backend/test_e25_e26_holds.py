import os
import tempfile
from datetime import datetime, timedelta

fd, db_path = tempfile.mkstemp(prefix="salesmaster-e25-e26-", suffix=".db")
os.close(fd)
os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
os.environ["JWT_SECRET_KEY"] = "e25-e26-test-secret"
os.environ["SECRET_KEY"] = "e25-e26-test-secret"

from app import app
from flask_jwt_extended import create_access_token
from models import db, User, Customer, RegularProduct, SaleHold


def auth_headers(user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def hold_payload(hold_id, quantity, user_id=1):
    return {
        "holdId": hold_id,
        "customerId": "1",
        "saleItems": [
            {"productId": 1, "quantity": quantity, "unitPrice": 2, "totalPrice": quantity * 2},
            {"productId": 1, "quantity": 1, "unitPrice": 2, "totalPrice": 2},
            {"productId": 1, "quantity": -1, "unitPrice": 2, "totalPrice": -2},
        ],
        "currentSale": None,
    }


with app.app_context():
    db.drop_all()
    db.create_all()
    user1 = User(username="hold-user-1", password="x", user_type="admin", status="Active")
    user2 = User(username="hold-user-2", password="x", user_type="user", status="Active")
    customer = Customer(customer_code="C1", customer_name="Customer 1")
    product = RegularProduct(product_code="P1", description="Product 1", current_stock=20, initial_stock=20)
    db.session.add_all([user1, user2, customer, product])
    db.session.commit()
    user1_id, user2_id = user1.id, user2.id

client = app.test_client()

# User 1 creates a hold with duplicate positive lines and a negative return line.
response = client.post("/api/held-invoices", json=hold_payload("hold-1", 2), headers=auth_headers(user1_id))
assert response.status_code == 201, response.get_json()

# User 2 sees the same server-side hold and reservation total (2 + 1, negative excluded).
response = client.get("/api/held-invoices", headers=auth_headers(user2_id))
assert response.status_code == 200
assert [hold["holdId"] for hold in response.get_json()] == ["hold-1"]
response = client.get("/api/stock/reservations", headers=auth_headers(user2_id))
assert response.status_code == 200
assert response.get_json()["reservations"] == [{"productId": 1, "productType": "regular", "quantity": 3.0}]

# Renewing the same ID replaces the reservation rather than doubling it.
response = client.post("/api/held-invoices", json=hold_payload("hold-1", 4), headers=auth_headers(user1_id))
assert response.status_code == 201
response = client.get("/api/stock/reservations", headers=auth_headers(user2_id))
assert response.get_json()["reservations"] == [{"productId": 1, "productType": "regular", "quantity": 5.0}]

# A second hold is visible to both clients; edit mode can exclude its own hold.
response = client.post("/api/held-invoices", json=hold_payload("hold-2", 2), headers=auth_headers(user2_id))
assert response.status_code == 201
response = client.get("/api/stock/reservations?excludeHoldId=hold-2", headers=auth_headers(user1_id))
assert response.get_json()["reservations"] == [{"productId": 1, "productType": "regular", "quantity": 5.0}]
response = client.get("/api/stock/reservations", headers=auth_headers(user1_id))
assert response.get_json()["reservations"] == [{"productId": 1, "productType": "regular", "quantity": 8.0}]

# Releasing one hold immediately restores its reservation.
response = client.delete("/api/held-invoices/hold-1", headers=auth_headers(user2_id))
assert response.status_code == 200
response = client.get("/api/stock/reservations", headers=auth_headers(user1_id))
assert response.get_json()["reservations"] == [{"productId": 1, "productType": "regular", "quantity": 3.0}]

# Expiry removes the remaining reservation without changing product stock.
with app.app_context():
    hold = db.session.get(SaleHold, "hold-2")
    hold.expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.session.commit()
response = client.get("/api/stock/reservations", headers=auth_headers(user1_id))
assert response.get_json()["reservations"] == []
with app.app_context():
    assert db.session.get(RegularProduct, 1).current_stock == 20

# A finalized sale carrying its hold ID consumes stock and releases that hold.
response = client.post(
    "/api/held-invoices",
    json=hold_payload("hold-3", 2),
    headers=auth_headers(user1_id),
)
assert response.status_code == 201
sale_payload = {
    "customer_id": 1,
    "customer_type": "account",
    "payment_status": "pending",
    "subtotal": 6,
    "porterage": 0,
    "porterage_type": "per_unit",
    "porterage_rate": 0,
    "vat_rate": 0,
    "vat_amount": 0,
    "total_amount": 6,
    "vehicle_details": None,
    "gate_number": None,
    "notes": None,
    "status": "finalized",
    "date": "2026-08-24",
    "hold_id": "hold-3",
    "items": [{"product_id": 1, "quantity": 3, "unit_price": 2, "total_price": 6}],
}
response = client.post("/api/sales", json=sale_payload, headers=auth_headers(user1_id))
assert response.status_code == 201, response.get_json()
sale = response.get_json()
response = client.get("/api/stock/reservations", headers=auth_headers(user2_id))
assert response.get_json()["reservations"] == []
with app.app_context():
    assert float(db.session.get(RegularProduct, 1).current_stock) == 17.0
    assert db.session.get(SaleHold, "hold-3").status == "released"

# Resuming an existing sale stores canonical saved items in the hold, so edit
# mode can add them back exactly once and exclude only this hold.
edit_hold = hold_payload("hold-4", 5)
edit_hold["currentSale"] = {"id": sale["id"], "invoiceNumber": sale["invoiceNumber"]}
response = client.post("/api/held-invoices", json=edit_hold, headers=auth_headers(user1_id))
assert response.status_code == 201, response.get_json()
assert response.get_json()["currentSale"]["items"][0]["quantity"] == 3.0
response = client.get("/api/stock/reservations?excludeHoldId=hold-4", headers=auth_headers(user2_id))
assert response.get_json()["reservations"] == []

edited_sale_payload = dict(sale_payload)
edited_sale_payload.update({
    "invoice_number": sale["invoiceNumber"],
    "hold_id": "hold-4",
    "items": [{"product_id": 1, "quantity": 5, "unit_price": 2, "total_price": 10}],
    "subtotal": 10,
    "total_amount": 10,
})
edit_lock_response = client.post(
    f"/api/sales/{sale['id']}/edit-lock",
    headers=auth_headers(user1_id),
)
assert edit_lock_response.status_code == 201, edit_lock_response.get_json()
edited_sale_payload["edit_lock_token"] = edit_lock_response.get_json()["lockToken"]
response = client.put(f"/api/sales/{sale['id']}", json=edited_sale_payload, headers=auth_headers(user1_id))
assert response.status_code == 200, response.get_json()
response = client.get("/api/stock/reservations", headers=auth_headers(user2_id))
assert response.get_json()["reservations"] == []
with app.app_context():
    assert float(db.session.get(RegularProduct, 1).current_stock) == 15.0
    assert db.session.get(SaleHold, "hold-4").status == "released"

print("E25/E26 isolated hold regression: OK")
try:
    os.unlink(db_path)
except FileNotFoundError:
    pass
