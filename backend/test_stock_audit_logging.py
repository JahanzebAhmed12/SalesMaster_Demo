"""Regression checks for structured stock-audit logging."""
import json
import os
import sys
import tempfile
from pathlib import Path


LOG_DIR = Path(tempfile.mkdtemp(prefix="salesmaster-stock-audit-logs-"))
os.environ["DATABASE_URL"] = f"sqlite:///{LOG_DIR / 'test.db'}"
os.environ["STOCK_AUDIT_LOG_DIR"] = str(LOG_DIR)
os.environ["STOCK_AUDIT_LOG_RETENTION_DAYS"] = "2"
os.environ["STOCK_AUDIT_LOG_LEVEL"] = "INFO"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, stock_audit_handler, stock_audit_log  # noqa: E402


with app.test_request_context(
    "/api/reports/stock-check?fromDate=2026-08-26&toDate=2026-08-26",
    method="GET",
    headers={"X-Request-ID": "stock-audit-test-request"},
):
    stock_audit_log(
        "test_stock_audit_event",
        operation_id="test-operation",
        product_id=7,
        product_type="regular",
        current_stock=12.5,
    )

for handler in app.logger.handlers:
    handler.flush()
stock_audit_handler.flush()

log_path = LOG_DIR / "stock-audit.log"
assert log_path.exists(), f"Expected stock audit log at {log_path}"
record = json.loads(log_path.read_text(encoding="utf-8").splitlines()[-1])
assert record["event"] == "test_stock_audit_event"
assert record["operation_id"] == "test-operation"
assert record["product_id"] == 7
assert record["request_method"] == "GET"
assert record["request_path"] == "/api/reports/stock-check"
assert record["request_id"] == "stock-audit-test-request"
assert stock_audit_handler.backupCount == 2
print("Stock audit structured logging and retention configuration: OK")
