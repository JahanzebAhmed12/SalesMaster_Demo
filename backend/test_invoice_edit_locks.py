"""Regression coverage for exclusive multi-user saved-invoice edit locks.

The test uses a disposable SQLite database and never touches the application
instance database or production data.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_fd, _db_path = tempfile.mkstemp(prefix="salesmaster-edit-lock-", suffix=".db")
os.close(_fd)
Path(_db_path).unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["JWT_SECRET_KEY"] = "invoice-edit-lock-test-secret-key-32-bytes"
os.environ["SECRET_KEY"] = "invoice-edit-lock-test-session-secret"

from flask_jwt_extended import create_access_token  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402

from app import app  # noqa: E402
from models import Customer, Sale, SaleEditLock, User, db  # noqa: E402

app.config.update(TESTING=True)


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
    print(f"[PASS] {message}")


with app.app_context():
    db.drop_all()
    db.create_all()

    first_user = User(
        username="edit-lock-user-one",
        password=generate_password_hash("test-password-one"),
        user_type="user",
        status="active",
    )
    second_user = User(
        username="edit-lock-user-two",
        password=generate_password_hash("test-password-two"),
        user_type="admin",
        status="active",
    )
    customer = Customer(
        customer_code="LOCK-CUST-001",
        customer_name="Edit Lock Test Customer",
        customer_currency="GBP",
        is_active="yes",
    )
    db.session.add_all([first_user, second_user, customer])
    db.session.flush()

    sale = Sale(
        invoice_number="LOCK-INV-001",
        customer_id=customer.id,
        payment_status="pending",
        subtotal=100,
        total_amount=100,
        status="finalized",
        created_by=first_user.id,
    )
    db.session.add(sale)
    db.session.commit()
    sale_id = sale.id
    first_user_id = first_user.id
    second_user_id = second_user.id

with app.app_context():
    first_token = create_access_token(identity=str(first_user_id))
    second_token = create_access_token(identity=str(second_user_id))

client = app.test_client()
first_headers = {"Authorization": f"Bearer {first_token}"}
second_headers = {"Authorization": f"Bearer {second_token}"}

# The first user acquires the lock and receives a secret token.
first_acquire = client.post(f"/api/sales/{sale_id}/edit-lock", headers=first_headers)
check(first_acquire.status_code == 201, "first user acquires an unlocked invoice")
first_lock = first_acquire.get_json()
check(bool(first_lock.get("lockToken")), "acquisition returns a lock token")
check(first_lock.get("username") == "edit-lock-user-one", "lock response identifies the owning user")
first_lock_token = first_lock["lockToken"]

# Repeated acquisition by the same user is idempotent and does not rotate the token.
same_user_acquire = client.post(f"/api/sales/{sale_id}/edit-lock", headers=first_headers)
check(same_user_acquire.status_code == 200, "same user can safely reacquire the existing lock")
check(same_user_acquire.get_json()["lockToken"] == first_lock_token, "same-user reacquisition preserves the lock token")

# A second user is told that editable access is unavailable, including an admin user.
second_acquire = client.post(f"/api/sales/{sale_id}/edit-lock", headers=second_headers)
check(second_acquire.status_code == 409, "second user cannot acquire the locked invoice")
second_conflict = second_acquire.get_json()
check(second_conflict.get("code") == "INVOICE_EDIT_LOCKED", "lock conflict has a stable machine-readable code")
check(second_conflict.get("username") == "edit-lock-user-one", "lock conflict identifies the current owner")

# Read-only invoice retrieval remains available while another user edits.
readonly_fetch = client.get("/api/sales/LOCK-INV-001", headers=second_headers)
check(readonly_fetch.status_code == 200, "another user can still load the invoice read-only")
check(readonly_fetch.get_json()["invoiceNumber"] == "LOCK-INV-001", "read-only invoice retrieval returns the saved invoice")

valid_update = {
    "invoice_number": "LOCK-INV-001",
    "customer_id": 1,
    "customer_type": "account",
    "payment_status": "pending",
    "subtotal": 100,
    "porterage": 0,
    "porterage_type": "per_unit",
    "porterage_rate": 0,
    "vat_rate": 0,
    "vat_amount": 0,
    "total_amount": 100,
    "vehicle_details": None,
    "gate_number": None,
    "notes": "lock test",
    "status": "finalized",
    "items": [],
}

# Wrong-owner update cannot mutate the invoice even if it supplies the other user token.
wrong_owner_update = dict(valid_update, notes="must not be written", edit_lock_token=first_lock_token)
wrong_owner_response = client.put(f"/api/sales/{sale_id}", json=wrong_owner_update, headers=second_headers)
check(wrong_owner_response.status_code == 409, "wrong owner cannot update a locked invoice")

# The owner must present the exact lock token to update successfully.
owner_update = dict(valid_update, notes="updated by lock owner", edit_lock_token=first_lock_token)
owner_response = client.put(f"/api/sales/{sale_id}", json=owner_update, headers=first_headers)
check(owner_response.status_code == 200, "lock owner can update with the valid token")

with app.app_context():
    updated_sale = db.session.get(Sale, sale_id)
    remaining_lock = db.session.query(SaleEditLock).filter_by(sale_id=sale_id).first()
    check(updated_sale.notes == "updated by lock owner", "authorized update changes the invoice")
    check(remaining_lock is None, "successful update releases the edit lock atomically")

# After completion, another user can acquire a fresh lock.
second_reacquire = client.post(f"/api/sales/{sale_id}/edit-lock", headers=second_headers)
check(second_reacquire.status_code == 201, "another user can edit after the prior update completes")
second_lock_token = second_reacquire.get_json()["lockToken"]

# Only the current owner can explicitly release the lock.
first_release_attempt = client.delete(
    f"/api/sales/{sale_id}/edit-lock",
    json={"lockToken": second_lock_token},
    headers=first_headers,
)
check(first_release_attempt.status_code == 403, "non-owner cannot release another user’s lock")

second_release = client.delete(
    f"/api/sales/{sale_id}/edit-lock",
    json={"lockToken": second_lock_token},
    headers=second_headers,
)
check(second_release.status_code == 200, "current owner can explicitly release the lock")

with app.app_context():
    check(
        db.session.query(SaleEditLock).filter_by(sale_id=sale_id).first() is None,
        "explicit release removes the persistent lock",
    )

print("INVOICE EDIT LOCK REGRESSION: PASS")
