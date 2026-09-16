# Stock Audit Logs

The backend writes structured JSON Lines to `backend/logs/stock-audit.log`. Each line is one event and can be searched with standard server tools such as `grep`, `jq`, or `less`.

## Discrepancy-only mode

The file only records discrepancies and errors — routine per-product / per-request success noise (every mutation, snapshot row, every stock-check row, started/completed markers) is silenced in `stock_audit_log()` via `STOCK_AUDIT_NOISY_EVENTS` in `backend/app.py`.

## Events

- `stock_check_discrepancy`: one product's expected stock differs from closing stock and/or live current stock. Logged **once per product per business date** — refreshes while the discrepancy persists write nothing new. Carries the full breakdown (opening, purchases, sales, customer returns, dumps, supplier returns, expected, closing, differences) plus `last_operation` — the latest `StockMovement` for that product (movement type, reference, quantity, previous/new stock, movement/business dates, user, remarks), i.e. the last operation that may have caused the discrepancy.
- `stock_discrepancy_resolved`: a previously logged discrepancy for that business date is now clean (closing stock entered/fixed). The dedup key is released, so a future discrepancy logs fresh.
- Error events (kept): `stock_mutation_rejected`, `stock_check_rejected`, `stock_check_row_failed`, `stock_check_failed`, `current_stock_snapshot_failed`.

## Retention policy

The logger rotates at midnight UTC and retains the current file plus 30 rotated daily files by default, covering approximately 31 calendar days. Set `STOCK_AUDIT_LOG_RETENTION_DAYS` to a positive integer in the server environment to change the number of rotated daily files retained. Runtime `.log` files are excluded from Git; only this documentation and the directory marker are committed.

Do not put secrets, passwords, tokens, customer contact details, or full invoice payloads in these logs. The recorded product ID/type, movement references, stock quantities, date range, user ID, request path, and request ID are intended for operational reconciliation.
