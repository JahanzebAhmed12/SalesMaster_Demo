"""Focused A-02 API authentication regression.

This test imports the real Flask app against a disposable SQLite database and
checks the centralized default-deny API gate without touching production data.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path


_fd, _db_path = tempfile.mkstemp(prefix="salesmaster-a02-", suffix=".db")
os.close(_fd)
Path(_db_path).unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["JWT_SECRET_KEY"] = "a02-test-secret-key-with-32-bytes!!"
os.environ["SECRET_KEY"] = "a02-test-session-secret-key-with-32-bytes!!"

from werkzeug.security import generate_password_hash  # noqa: E402

from app import app  # noqa: E402
from models import User, db  # noqa: E402


app.config.update(TESTING=True)


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
    print(f"[PASS] {message}")


def status(response) -> int:
    return int(response.status_code)


with app.app_context():
    db.drop_all()
    db.create_all()
    user = User(
        username="a02-test-user",
        password=generate_password_hash("A02-test-password"),
        user_type="user",
        status="active",
    )
    db.session.add(user)
    db.session.commit()
    user_id = user.id

with app.app_context():
    token = app.config.get("JWT_SECRET_KEY")
    # The test client obtains a genuine application token below; this local
    # variable only documents that the configured test key is non-default.
    check(token == "a02-test-secret-key-with-32-bytes!!", "isolated test JWT secret is explicit and non-default")
    from flask_jwt_extended import create_access_token

    access_token = create_access_token(identity=str(user_id))

client = app.test_client()
auth_headers = {"Authorization": f"Bearer {access_token}"}

# Sensitive read and mutation representatives must fail before handlers run.
for method, path in [
    ("get", "/api/customers"),
    ("post", "/api/customers"),
    ("get", "/api/regular_products"),
    ("get", "/api/business-date"),
    ("get", "/api/reports/stock-check?fromDate=2026-08-24&toDate=2026-08-24"),
    ("get", "/api/users"),
    ("get", "/api/test-pdf"),
]:
    response = getattr(client, method)(path)
    check(status(response) in (401, 422), f"unauthenticated {method.upper()} {path} is rejected: status={status(response)}")

# Invalid bearer tokens must not pass the centralized gate.
invalid = client.get("/api/customers", headers={"Authorization": "Bearer definitely-invalid"})
check(status(invalid) in (401, 422), f"invalid bearer token is rejected: status={status(invalid)}")

# CORS preflight is not an authenticated business request.
preflight = client.options(
    "/api/customers",
    headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization",
    },
)
check(status(preflight) not in (401, 422), f"CORS preflight is not blocked by JWT gate: status={status(preflight)}")

# Deliberately public compatibility endpoints remain reachable for the
# separately deferred email/print/PDF issues. Their exact handler response is
# not asserted because the test database has no business records.
for method, path in [
    ("get", "/api/health"),
    ("get", "/api/server-time"),
    ("get", "/api/email-config"),
    ("get", "/api/print-queue/pending"),
    ("get", "/api/sales/does-not-exist/invoice"),
]:
    response = getattr(client, method)(path)
    check(status(response) not in (401, 422), f"deferred/public {method.upper()} {path} is not changed by A-02: status={status(response)}")

# A valid token reaches the same representative handlers.
for method, path, expected in [
    ("get", "/api/customers", 200),
    ("get", "/api/regular_products", 200),
    ("get", "/api/business-date", 200),
    ("get", "/api/users", 200),
]:
    response = getattr(client, method)(path, headers=auth_headers)
    check(status(response) == expected, f"authenticated {method.upper()} {path} reaches handler: status={status(response)}")

print("A-02 AUTHENTICATION REGRESSION: PASS")
