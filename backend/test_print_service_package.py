"""Regression coverage for print-service settings and package delivery."""

from __future__ import annotations

import json
import os
import tempfile
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

_fd, _db_path = tempfile.mkstemp(prefix="salesmaster-print-service-", suffix=".db")
os.close(_fd)
Path(_db_path).unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["JWT_SECRET_KEY"] = "print-service-test-secret-key-32-bytes"
os.environ["SECRET_KEY"] = "print-service-test-session-secret"

from flask_jwt_extended import create_access_token  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402

from app import app  # noqa: E402
from models import PrintQueue, User, db  # noqa: E402

app.config.update(TESTING=True)


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
    print(f"[PASS] {message}")


with app.app_context():
    db.drop_all()
    db.create_all()
    admin = User(
        username="print-service-admin",
        password=generate_password_hash("test-password"),
        user_type="admin",
        status="Active",
    )
    regular_user = User(
        username="print-service-user",
        password=generate_password_hash("test-password"),
        user_type="user",
        status="Active",
    )
    db.session.add_all([admin, regular_user])
    db.session.commit()
    admin_id = admin.id
    regular_user_id = regular_user.id

with app.app_context():
    admin_token = create_access_token(identity=str(admin_id))
    regular_token = create_access_token(identity=str(regular_user_id))

client = app.test_client()
admin_headers = {"Authorization": f"Bearer {admin_token}"}
regular_headers = {"Authorization": f"Bearer {regular_token}"}

check(client.get("/api/print-service/settings", headers=regular_headers).status_code == 403, "non-admin users cannot read print-service settings")
check(client.get("/api/print-service/package", headers=admin_headers).status_code == 405, "package endpoint only accepts POST")

initial = client.get("/api/print-service/settings", headers=admin_headers)
check(initial.status_code == 200, "administrator can read print-service settings")
check(initial.get_json()["pollIntervalMs"] == 10000, "settings expose the default polling interval")

saved = client.put(
    "/api/print-service/settings",
    json={
        "salesMasterUrl": "https://print.example.test/",
        "printerName": "Warehouse EPSON",
        "pollIntervalMs": 15000,
    },
    headers=admin_headers,
)
check(saved.status_code == 200, "administrator can save print-service settings")
check(saved.get_json() == {
    "salesMasterUrl": "https://print.example.test",
    "printerName": "Warehouse EPSON",
    "pollIntervalMs": 15000,
}, "saved settings are normalized and returned")

invalid = client.put(
    "/api/print-service/settings",
    json={"salesMasterUrl": "not-a-url", "printerName": "Printer", "pollIntervalMs": 500},
    headers=admin_headers,
)
check(invalid.status_code == 400, "invalid print-service settings are rejected")

package_response = client.post(
    "/api/print-service/package",
    json={
        "salesMasterUrl": "http://pc-specific.example.test:5000/",
        "printerName": "PC-Specific Printer",
        "pollIntervalMs": 20000,
    },
    headers=admin_headers,
)
check(package_response.status_code == 200, "administrator can download a per-PC package")
check(package_response.mimetype == "application/zip", "package response is a ZIP archive")

with app.app_context():
    db.session.add(PrintQueue(
        id="print-job-test-001",
        invoice_number="INV-PRINT-001",
        print_type="dot_matrix",
        status="pending",
        print_data=json.dumps({"invoice_number": "INV-PRINT-001", "items": []}),
        created_by=admin_id,
        device_type="desktop",
    ))
    db.session.commit()

pending_jobs = client.get("/api/print-queue/pending")
check(pending_jobs.status_code == 200, "print service can poll the pending-job endpoint")
check(pending_jobs.get_json()[0]["id"] == "print-job-test-001", "pending poll returns the queued job")
printing = client.post("/api/print-queue/print-job-test-001/status", json={"status": "printing"})
check(printing.status_code == 200, "print service can claim a job as printing")
completed = client.post("/api/print-queue/print-job-test-001/status", json={"status": "completed"})
check(completed.status_code == 200, "print service can report a completed job")
with app.app_context():
    job = db.session.get(PrintQueue, "print-job-test-001")
    check(job.status == "completed", "completed print status is persisted")

with ZipFile(BytesIO(package_response.data)) as archive:
    names = set(archive.namelist())
    check("config.json" in names, "package contains generated config.json")
    check("INSTALL-SERVICE.bat" in names, "package contains the Windows installer")
    check("service-install.js" in names, "package contains the service registration script")
    check("auto-chrome-service.js" in names, "package contains the print-service runtime")
    runtime = archive.read("auto-chrome-service.js").decode("utf-8")
    check("headless: !isConfigMode" in runtime, "normal service mode uses headless browser execution")
    check("Page.printToPDF" in runtime, "normal service mode generates a PDF without a print dialog")
    check("-print-to" in runtime and "-print-settings \"noscale\"" in runtime, "normal service mode sends the PDF silently through SumatraPDF")
    config = json.loads(archive.read("config.json"))
    check(config == {
        "salesMasterUrl": "http://pc-specific.example.test:5000",
        "printerName": "PC-Specific Printer",
        "pollIntervalMs": 20000,
    }, "package embeds the requested per-PC settings")
    package_notes = archive.read("PACKAGE-CONFIGURATION.txt").decode("utf-8")
    check("Only one active print-service poller" in package_notes, "package documents the shared-queue limitation")

Path(_db_path).unlink(missing_ok=True)
print("Print-service package regression suite completed successfully.")
