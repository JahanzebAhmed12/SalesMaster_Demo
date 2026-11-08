# Customer Discount Feature — Implementation Plan

## Status

Implementation is complete and verified. The final report review included dashboard totals/charts and monthly and product Profit/Loss calculations.

## Implementation results

- Added the `CustomerDiscount` transaction and `CustomerDiscountAudit` history models, plus an idempotent Python startup migration that creates the additive tables without changing existing records.
- Added authenticated APIs for invoice/line lookup, discount listing, creation, editing, and soft deletion. Server validation enforces invoice/customer/line ownership, finalized status, amount precision and limits, current business-date/backdate permissions, and audit history.
- Added the Customer Discount Data Entry page with invoice and line selection, amount preview, historical entries, editing, and deletion. Wired it into the application route, sidebar, and user restrictions.
- Kept original invoice and line amounts, dates, quantities, stock, and payment records unchanged. Adjusted invoice outstanding/payment status and customer running balance from the separate discount transaction.
- Integrated dated discounts into Daily Book Sales, Daily Summary and its printable output, customer statement/history, aging, product history/product sales reports, date-wise sales, sales analysis, dashboard totals/charts, monthly full analysis, and product Profit/Loss. Discounts are credited once on their transaction date.
- Updated customer payment outstanding calculations so discounts reduce the selectable invoice balance and payment status remains consistent after payment batch changes.
- Added `backend/test_customer_discount.py` for migration idempotency/preservation, CRUD/audit, permissions, invoice and line caps, paid/partially-paid invoice rules, and report integration.
- Extended report regression coverage to verify product sales, monthly net sales, and product Profit/Loss subtract the dated discount without rewriting the original gross invoice sales.

Verified with:

- `backend\venv\Scripts\python.exe backend\test_customer_discount.py`
- `backend\venv\Scripts\python.exe backend\test_credit_payment.py`
- `backend\venv\Scripts\python.exe backend\test_customer_return_print.py`
- `backend\venv\Scripts\python.exe backend\test_invoice_edit_locks.py`
- `npm run check`
- `npm run build`

## Confirmed requirements

- Add a dedicated **Customer Discount** page under Data Entry. It should be a clean transaction-entry page, using the customer-return flow as a reference without turning the feature into a return.
- Select a customer, search that customer's finalized invoices over a date range, choose an invoice, then choose a specific product line.
- Prefill the selected line's product, quantity, price, and line amount. Apply a fixed monetary discount to that line.
- Recalculate the line's effective average unit price for reporting. Keep the exact discounted amount as the monetary source of truth; do not reconstruct it from a rounded unit price.
- Record the discount as a separate transaction on the current business date. It must not rewrite the original invoice's date or gross sales history. Authorized backdated discount entries may use their selected backdate.
- Already-paid invoices are ineligible for a new discount.
- The application does not currently use VAT. The discount is nevertheless a pre-VAT reduction; do not add or enable VAT behavior as part of this feature.
- Users must be able to edit and delete discount entries, with the existing current-date and backdate permissions enforced.
- Any database change must have a safe Python startup migration that runs automatically when the server starts and preserves all existing records.
- The adjustment must be represented consistently in Daily Book Sales, Daily Summary, customer balances, and relevant product/sales reports.

## Accounting and transaction model

Treat a discount as a **separate, dated customer-account adjustment linked to an invoice and one exact invoice line**. Do not silently overwrite the original invoice or its original `SaleItem` values. This preserves the invoice as issued and makes the discount visible on the day granted.

For each active discount:

```text
discounted line value = original line value - active discounts on that line
effective average unit price = discounted line value / original quantity
invoice outstanding = original invoice total - payments applied - active discounts
```

The amount is pre-VAT. Since VAT is not used, discount processing must not create VAT amounts or change VAT settings. Monetary values are stored and calculated at currency precision; only the displayed average unit price may be rounded for presentation.

For the date on which the discount is posted:

```text
daily net sales = gross sales recorded for the business date - discounts posted on that business date
```

The original invoice-date sales remain unchanged. Reports must not both reduce the original invoice and subtract the dated discount, which would double-count the adjustment.

### Eligibility and limits

- Invoice must belong to the selected customer, be finalized, and contain the selected sale-item line.
- A fully paid invoice cannot receive a discount. Re-check this on the server at save time, not only when listing invoices.
- A partially paid invoice may be eligible only while it has a positive outstanding balance.
- The discount must be a finite positive amount, no greater than the remaining undiscounted value of the selected line, and no greater than the invoice's outstanding balance. This prevents negative line values and prevents the customer balance from becoming a credit through this feature.
- Revalidate the outstanding amount and existing active discounts inside the same transaction that writes the new adjustment, to avoid concurrent over-discounting.
- A discount does not change quantity, stock, inventory movements, payment records, or payment methods.
- Add a reason/note to every discount entry for audit and review.

## Proposed data model

Add a dedicated adjustment table, for example `customer_discount`, with:

- Primary key and unique human-readable reference.
- Customer foreign key, sale/invoice foreign key, and exact `SaleItem` foreign key.
- Discount amount (`Numeric` currency precision).
- Discount transaction date (business date selected at posting).
- Reason/remarks.
- Created-by and created-at metadata; updated-by and updated-at metadata.
- Soft-delete/reversal metadata (deleted-by, deleted-at, deletion reason) so deleting a visible entry does not erase the audit trail.
- Optional revision/audit records for before/after values when an entry is edited.

The `Sale` and `SaleItem` tables retain the original invoice and line amounts. Compute each line's net amount from its original `SaleItem.total_price` less active linked discounts, and invoice outstanding from the original invoice amount less payments and active discounts. If performance requires materialized totals later, make them derived/reconciled fields rather than the only record of the discount.

The exact table and column naming should follow the existing SQLAlchemy model conventions. Use decimal/`Numeric` arithmetic for persisted money; avoid binary floating point in financial comparisons.

## Safe automatic startup migration

Implement a versioned, idempotent Python schema-upgrade function consistent with the existing startup migration helpers in `backend/app.py` (or use the repository's migration framework if it is active in deployment):

1. Run after the database connection is available and before discount routes/models are used.
2. Detect whether the new table/indexes already exist. Create only missing schema objects; repeated starts must be harmless.
3. Do not rewrite, delete, or backfill existing sales, payments, returns, or customer balances. Existing discount data starts empty.
4. If any existing table must be altered after implementation details are finalized, inspect its live columns first and apply only the missing alteration. Do not assume `db.create_all()` updates existing tables.
5. Use a transaction where the database supports transactional DDL; otherwise make each step retry-safe and report migration errors explicitly rather than continuing with a partial schema.
6. Add appropriate foreign keys/indexes without changing existing row identifiers or values.
7. Test startup against both a fresh database and a copy of a pre-feature database. Compare row counts and representative values before/after, then restart a second time to prove idempotency.

The migration must be a proper checked-in Python migration/upgrade script that runs automatically on server startup, not a manual SQL instruction. Keep the deployment's existing migration mechanism and startup order in view when selecting the concrete implementation.

## Business-date and permission behavior

Use the existing `BusinessDate` record as the source of the current business date (`get_business_date()`), not the browser clock. Reuse the established per-user `UserBackDateOption` flags exposed by `/api/user-backdate-options/<user_id>`:

- `editing`: permits creating or editing past/backdated records.
- `deleting`: permits deleting past/backdated records.
- `current_editing`: permits editing/deleting records on the current business date, following the existing transaction patterns.

Required behavior:

| Operation | Current business date | Past/backdate |
|---|---|---|
| Create discount | Default to the current business date; current-date creation is allowed, consistent with existing transaction-entry policy. | Permit only when the user's `editing` permission allows backdated entry. |
| Edit discount | Require `current_editing`. | Require `editing`. |
| Delete discount | Require `current_editing`. | Require `deleting`; do not treat edit permission alone as delete permission. |
| Change an entry's date | Authorize both the original and destination dates. Apply the relevant current-date/backdate rules for each side; reject moving a protected record into or out of a date the user cannot edit. |

Compare entry dates to the database business date, not `datetime.now().date()` or the browser's calendar date. The page should hide or disable unavailable actions and explain why, but the backend must repeat all checks using the authenticated user's ID and current database business date. Permission failures return an explicit `403` and do not leave partial changes. A missing permission record must not grant backdated editing or deleting.

When editing or deleting, re-check that removing/changing the adjustment will not create an invalid customer credit or violate payment/accounting invariants. Soft-delete/deactivation must reverse the active discount's effect exactly once.

## User interface and routes

Add a standalone page, likely `client/src/pages/data-entry/customer-discount.tsx`, with:

1. **Customer selector** — reuse established customer search and loading/error patterns.
2. **Date range and invoice selector** — use the existing finalized customer-invoice lookup, adapted to include enough summary data to show invoice number, invoice date, total, paid, outstanding, and eligibility.
3. **Invoice line selector** — fetch invoice detail and select the exact `SaleItem` (not only a product ID, since an invoice can contain duplicate product lines).
4. **Discount form** — show product/description, original quantity, original unit price, original line amount, existing discounts, remaining line value, invoice outstanding, transaction date, amount, and required reason.
5. **Preview** — show resulting line value and effective average unit price; show the invoice's remaining balance after the discount.
6. **Discount register/history** — show the selected customer's entries with date, invoice/reference, product, amount, reason, creator, and status. Expose edit/delete only when the user has permission.
7. **Edit form** — prefill the stored entry, validate the proposed amount/date/reason against the state excluding the entry being edited, then save atomically.
8. **Delete confirmation** — explain that the discount will be removed from balances/reports; require confirmation and a reason if required by the existing audit convention.

Wire up:

- Protected route in `client/src/App.tsx`, under the existing `data_entry` section.
- Data Entry sidebar item in `client/src/components/layout/sidebar.tsx`.
- Route permission mapping in `client/src/hooks/useRouteProtection.tsx` if routes are mapped individually.
- Business-date and backdate permission hooks in the page; invalidate relevant React Query keys after create/edit/delete.
- Loading, empty, validation, API, and permission-denied states with explicit messages.

## API and server-side behavior

Add authenticated endpoints following existing backend route conventions:

- List a customer's eligible finalized invoices for a requested date range, including amount paid, active discounts, outstanding amount, and whether the invoice can receive a discount.
- Fetch invoice discount-eligible lines with exact sale-item IDs and existing active discounts.
- Create a discount adjustment.
- List discount adjustments with customer/date/invoice filters.
- Update a discount adjustment.
- Delete/deactivate a discount adjustment.

Every write endpoint must:

1. Validate payload types, required values, finite positive currency amount, valid date format, and reason length.
2. Resolve and verify customer, invoice, and sale-item ownership on the server.
3. Verify finalized status, not-fully-paid eligibility, line/invoice caps, and business-date permissions.
4. Use a database transaction and row-level locking where supported; recompute invoice outstanding using current payments and active adjustments.
5. Persist adjustment and audit metadata atomically, roll back on failure, and return a clear error response.
6. Avoid changing stock, the original invoice totals, or payment transactions.

Do not expose a generic update route that lets the client directly alter invoice totals or a different customer's invoice.

## Reports, balances, and output surfaces

| Surface | Required treatment |
|---|---|
| **Daily Book Sales** | Include discount adjustments by their transaction date as a separate negative sales/customer-credit amount. Keep payment-method columns tied to real payment records. A discount must not appear as cash paid. Preserve the original invoice row/date and show a distinguishable discount row or adjustment column with reference/invoice/product. |
| **Daily Summary and PDF** | Include the day's discount total as a distinct negative sales adjustment and compute net sales consistently. Do not alter the original invoice-day summary. Make API and PDF calculations use the same adjustment query and formula. |
| **Customer outstanding/balance** | Subtract active adjustments from the linked invoice's outstanding balance. Update any denormalized customer balance safely, or calculate from ledger sources; never create a payment or refund record. Editing/deleting must restore the exact prior outstanding amount. |
| **Customer history and statements** | Keep original invoice sales on their original date and list discounts as dated, linked credit adjustments on the discount date. Include adjustments in running balance and current outstanding; do not present them as returns or payments. |
| **Customer aging** | Use adjusted outstanding amounts. Decide/implement whether the discounted amount reduces the linked invoice's aged balance while retaining the original invoice aging date; it should not make a new invoice-date sale. |
| **Product history and product sales reports** | Attribute discounts to the selected product line and discount date. Provide gross sales, discount amount, and net sales/effective average price so quantities remain unchanged and discounts are not mistaken for returns. For a discounted line, effective average is that line's net value divided by its original quantity. Do not add the original sale quantity again on the discount date; date-filtered reports should distinguish sale quantity from discount activity. |
| **Sales analysis, dashboard, monthly/date-wise reports, Profit/Loss** | Inventory every aggregate that reads `Sale.total_amount`, `Sale.subtotal`, `SaleItem.total_price`, or `SaleItem.unit_price`. Add dated discount adjustments exactly once where that report represents net sales; preserve gross-sales measures where the report explicitly means invoice value. |
| **Invoice view, A4/A5/dot-matrix and email PDFs** | Keep the original invoice as issued; do not silently make a historical invoice print appear amended. Display current outstanding after adjustments where the screen already shows balance. A separately requested discount receipt/statement can show the adjustment but is not a replacement invoice. |
| **Payment entry and payment changes** | Payment records and their dates/methods remain untouched. Recompute the displayed outstanding and payment status after an adjustment; prevent creating a discount on an already-paid invoice. |
| **Stock and inventory** | No stock movement, quantity change, return record, or return email/print action is created. |

Before implementation, perform a repository-wide inventory of `Sale.total_amount`, `Sale.subtotal`, `Sale.vat_amount`, `SaleItem.total_price`, and `SaleItem.unit_price` consumers, including backend APIs and frontend summaries. Classify each consumer as invoice gross, dated net sales, product net sales, outstanding, or actual cash/payment. This prevents a broad but incorrect global replacement.

## Frontend data consistency

After create/edit/delete, invalidate/refetch:

- The discount register and selected invoice's discount details.
- Customer invoice lists and invoice outstanding/eligibility.
- Daily Book Sales and Daily Summary queries for the affected transaction date.
- Customer history, statement, and aging queries.
- Product history, product sales, and other affected report queries.

When editing/deleting a backdated entry, invalidate both the old and new dates. The original invoice date need not be invalidated for net sales if it remains gross and unchanged, but invoice outstanding/customer balances must refresh.

## Implementation sequence

1. **Audit current accounting/report semantics.** Trace invoice creation/edit, payment application, customer balance maintenance, daily reports, customer statement/aging, product net sales, and relevant dashboard/analysis queries. Record which reports show gross sales versus net activity.
2. **Finalize storage and migration.** Add the adjustment model, audit fields, indexes/FKs, and an idempotent startup Python migration. Validate fresh and existing database startup before feature routes depend on it.
3. **Implement backend read/write APIs.** Add invoice eligibility/line data and transactional create/list/edit/delete endpoints with server-side permissions, ownership, balance caps, and regression tests.
4. **Implement the Data Entry page.** Add selectors, previews, register/history, edit/delete, business-date defaults, backdate selection, permission-aware controls, and query invalidation.
5. **Integrate reports and customer balances.** Add dated adjustment rows/totals to Daily Book Sales, Daily Summary/PDF, customer statements/history/aging, and product/sales reports according to the classification from step 1.
6. **Verify all output surfaces.** Confirm original invoice printing/email remains historically accurate and current outstanding figures use the adjustments.
7. **Regression and rollout checks.** Run backend tests, frontend type checks, targeted report tests, migration preservation/idempotency tests, and `git diff --check`.

## Test checklist

### Migration

- New database starts and creates the discount schema.
- Existing database starts without changing prior sales, sale items, payments, returns, balances, IDs, or row counts.
- Repeated server starts do not duplicate or damage schema/data.
- Migration failure is visible and prevents the feature from running against an incomplete schema.

### Discount validation and accounting

- Correct customer/invoice/line association succeeds.
- Wrong customer, wrong invoice line, draft/unfinalized invoice, zero/negative/non-finite amount, over-line amount, and over-outstanding amount are rejected.
- Fully paid invoice is ineligible; partially paid invoice can only be discounted up to eligible remaining values.
- Multiple lines containing the same product are handled by exact sale-item ID.
- Multiple discounts are cumulative; editing excludes the old value during cap checks.
- Discount does not affect quantity, stock, VAT settings, payments, or invoice gross amount.
- Discount reduces outstanding once; deleting it restores outstanding once.
- A concurrent attempt cannot exceed the line or invoice balance.

### Dates and permissions

- New entry defaults to the server's current business date, including when calendar date differs.
- Current-date edit/delete checks `current_editing`; backdated deletion specifically checks `deleting`.
- Backdated creation/edit checks `editing`; backdated deletion checks `deleting`.
- Moving an entry between dates checks authorization for both dates.
- API rejects unauthorized operations even if the UI is bypassed.
- Business-date changes are reflected in the page and do not rely on a stale browser date.

### Reports and presentation

- Discount appears once on its transaction date in Daily Book Sales and Daily Summary/PDF.
- Historical invoice-date gross sales remain unchanged.
- Customer running balance, statement, aging, and invoice outstanding reflect active adjustments.
- Product reports retain quantities and show discount/net/effective average consistently.
- Payment method totals remain actual cash/cheque/card/transfer amounts, with no synthetic payment.
- Original A4/A5/dot-matrix/email invoice remains as issued; no return/inventory behavior is invoked.
- Create/edit/delete invalidates affected current and backdated report data.

## Explicitly out of scope unless separately requested

- VAT calculation or enabling VAT.
- Discounts on fully paid invoices, refunds, or issuing a credit note that creates a customer credit.
- Changing invoice gross totals or rewriting the original invoice date.
- Stock changes, customer-return records, or payment transactions.
- Replacing or amending the original invoice print/email with a discount-adjusted invoice.
