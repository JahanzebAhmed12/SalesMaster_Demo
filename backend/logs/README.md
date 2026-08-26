# Stock Audit Logs

The backend writes structured JSON Lines to `backend/logs/stock-audit.log`. Each line is one event and can be searched with standard server tools such as `grep`, `jq`, or `less`.

## Events

- `stock_mutation_started`: a current-stock mutation began, including product identity, signed quantity, movement type, references, business date, and authenticated user ID when available.
- `stock_mutation_applied`: the atomic current-stock update succeeded, including previous stock, new stock, and retry attempt.
- `stock_movement_created`: the matching `StockMovement` row was queued in the transaction.
- `stock_mutation_rejected`: the mutation failed, including the error and retry attempt.
- `stock_check_started`: a Stock Check request began, including the requested date range and optional search term.
- `stock_check_row`: one product’s Stock Check inputs and calculated result were produced, including opening stock, purchases, sales, customer returns, dumps, supplier returns, expected stock, closing stock, and difference.
- `stock_check_discrepancy`: a Stock Check row has a non-zero difference between calculated expected stock and closing stock.
- `stock_check_completed`: the request completed, including product counts, discrepancy count, and elapsed milliseconds.
- `stock_check_failed`: the request failed before completion.

## Retention policy

The logger rotates at midnight UTC and retains the current file plus 30 rotated daily files by default, covering approximately 31 calendar days. Set `STOCK_AUDIT_LOG_RETENTION_DAYS` to a positive integer in the server environment to change the number of rotated daily files retained. Runtime `.log` files are excluded from Git; only this documentation and the directory marker are committed.

Do not put secrets, passwords, tokens, customer contact details, or full invoice payloads in these logs. The recorded product ID/type, movement references, stock quantities, date range, user ID, request path, and request ID are intended for operational reconciliation.
