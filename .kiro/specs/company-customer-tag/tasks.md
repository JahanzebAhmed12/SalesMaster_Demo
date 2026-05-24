# Implementation Plan: Company Customer/Supplier Tag

## Overview

Add `is_company` boolean flag to `Customer` and `Supplier` models, expose it through schemas and forms, and filter company-tagged entities out of financial totals in the three daily reports. All changes are additive and backward-compatible.

## Tasks

- [x] 1. Backend model changes — Customer and Supplier
  - [x] 1.1 Add `is_company` column to `Customer` model in `backend/models.py`
    - Add `is_company = db.Column(db.Boolean, default=False)` to the `Customer` class
    - Add `'is_company': bool(self.is_company)` to `Customer.to_dict()`
    - _Requirements: 1.1, 1.4_

  - [ ]* 1.2 Write property test for Customer.to_dict() always includes is_company as bool
    - **Property 1: to_dict() always includes is_company as a boolean**
    - **Validates: Requirements 1.4**
    - Use `hypothesis` to generate `Customer` instances with arbitrary `is_company` values (True, False, None/0/1 as stored by SQLite)
    - Assert `to_dict()` returns `"is_company"` as a Python `bool`
    - Tag: `Feature: company-customer-tag, Property 1: to_dict always includes is_company as bool`

  - [x] 1.3 Add `is_company` column to `Supplier` model in `backend/models.py`
    - Add `is_company = db.Column(db.Boolean, default=False)` to the `Supplier` class
    - Add `'is_company': bool(self.is_company)` to `Supplier.to_dict()`
    - _Requirements: 2.1, 2.4_

  - [ ]* 1.4 Write property test for Supplier.to_dict() always includes is_company as bool
    - **Property 1: to_dict() always includes is_company as a boolean (Supplier)**
    - **Validates: Requirements 2.4**
    - Same pattern as 1.2 but for `Supplier` instances
    - Tag: `Feature: company-customer-tag, Property 1: to_dict always includes is_company as bool`

- [x] 2. Database migration — startup ALTER TABLE
  - [x] 2.1 Add startup migration for `customer` table in `backend/app.py`
    - Follow the existing `PRAGMA table_info` + `ALTER TABLE … ADD COLUMN` pattern already used in `app.py`
    - Add inside the `with app.app_context()` startup block: check for `is_company` in `customer` columns; if absent, execute `ALTER TABLE customer ADD COLUMN is_company BOOLEAN DEFAULT 0`
    - _Requirements: 1.2_

  - [x] 2.2 Add startup migration for `suppliers` table in `backend/app.py`
    - Same pattern as 2.1 for the `suppliers` table
    - _Requirements: 2.2_

- [ ] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Backend schema changes — CustomerSchema and SupplierSchema
  - [x] 4.1 Add `is_company` field to `CustomerSchema` in `backend/schemas.py`
    - Add `is_company: bool = False` to `CustomerSchema`
    - _Requirements: 1.3_

  - [ ]* 4.2 Write property test for CustomerSchema round-trip preserves is_company
    - **Property 2: Schema round-trip preserves is_company**
    - **Validates: Requirements 1.3**
    - Generate random booleans; construct `CustomerSchema` with that value; serialise to dict; assert the value is preserved
    - Tag: `Feature: company-customer-tag, Property 2: schema round-trip preserves is_company`

  - [x] 4.3 Add `is_company` field to `SupplierSchema` in `backend/schemas.py`
    - Add `is_company: bool = False` to `SupplierSchema`
    - _Requirements: 2.3_

  - [ ]* 4.4 Write property test for SupplierSchema round-trip preserves is_company
    - **Property 2: Schema round-trip preserves is_company (Supplier)**
    - **Validates: Requirements 2.3**
    - Same pattern as 4.2 but for `SupplierSchema`
    - Tag: `Feature: company-customer-tag, Property 2: schema round-trip preserves is_company`

- [x] 5. Frontend schema changes — shared/schema.ts
  - [x] 5.1 Add `is_company` to `customerSchema` and `insertCustomerSchema` in `shared/schema.ts`
    - Add `is_company: z.boolean().default(false).optional()` to `customerSchema`
    - `insertCustomerSchema` inherits it automatically via `.omit()`
    - _Requirements: 3.3_

  - [x] 5.2 Add `is_company` to `supplierSchema` and `insertSupplierSchema` in `shared/schema.ts`
    - Add `is_company: z.boolean().default(false).optional()` to `supplierSchema`
    - `insertSupplierSchema` inherits it automatically via `.omit()`
    - _Requirements: 4.3_

- [x] 6. Frontend customer form — Is Company checkbox
  - [x] 6.1 Add `is_company: false` to `defaultValues` in `customer-database-edit.tsx`
    - In the `useForm` `defaultValues` object, add `is_company: false`
    - _Requirements: 3.1, 3.2_

  - [x] 6.2 Add the "Is Company" `<Checkbox>` field to the customer form JSX
    - Use the existing `@/components/ui/checkbox` component
    - Bind to `form.control` with field name `is_company`
    - Place it near the `is_active` / `own_branch` fields for logical grouping
    - Label: "Is Company"
    - `form.reset(customerData)` already handles pre-population once the field is in the schema
    - _Requirements: 3.1, 3.2, 3.4_

- [x] 7. Frontend supplier form — Is Company checkbox
  - [x] 7.1 Add `is_company: false` to `defaultValues` in `supplier-database-edit.tsx`
    - In the `useForm` `defaultValues` object, add `is_company: false`
    - _Requirements: 4.1, 4.2_

  - [x] 7.2 Add the "Is Company" `<Checkbox>` field to the supplier form JSX
    - Same pattern as 6.2 but in `supplier-database-edit.tsx`
    - _Requirements: 4.1, 4.2, 4.4_

- [ ] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [-] 9. Report filter — daily_book_sales
  - [x] 9.1 Add `isCompany` flag to each row in the `daily_book_sales` response in `backend/app.py`
    - In the `result.append({...})` call inside `daily_book_sales`, add `'isCompany': bool(sale.customer.is_company) if sale.customer else False`
    - No rows are suppressed; all sales remain visible in the listing
    - _Requirements: 5.1_

  - [x] 9.2 Update `SalesEntry` interface in `daily-book-sales.tsx` to include `isCompany`
    - Add `isCompany?: boolean` to the `SalesEntry` interface
    - Update the totals computation (the reduce/accumulation that builds the totals row) to skip rows where `isCompany === true`
    - _Requirements: 5.2, 5.3_

  - [ ] 9.3 Write property test for company amounts excluded from daily book sales totals
    - **Property 5: Company customer amounts are excluded from daily book sales totals**
    - **Validates: Requirements 5.2, 5.3**
    - Generate a random list of sale dicts with random `isCompany` flags and random amounts
    - Assert that summing only `isCompany == False` rows equals the expected total
    - Tag: `Feature: company-customer-tag, Property 5: company amounts excluded from daily book sales totals`

- [x] 10. Report filter — daily_summary_report
  - [x] 10.1 Exclude company customer amounts from `daily_summary_report` totals in `backend/app.py`
    - In the sales accumulation loop inside `daily_summary_report`, check `sale.customer and sale.customer.is_company`
    - If `True`: still append the row to `sales_summary` for listing visibility, but `continue` before adding to `cash_total`, `card_total`, `account_total`, `bank_transfer_total`, `cheque_total`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 10.2 Write property test for daily summary totals excluding company amounts
    - **Property 6: Daily summary financial totals exclude company customer amounts**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
    - Generate random sets of sales with mixed `is_company` flags; run the aggregation logic; assert totals match non-company-only sums
    - Tag: `Feature: company-customer-tag, Property 6: daily summary totals exclude company amounts`

- [x] 11. Report filter — daily_accounts_report / sum_payment()
  - [x] 11.1 Add `Customer` join to `sum_payment()` in `backend/app.py` to exclude company customers
    - Inside `daily_accounts_report`, modify the `sum_payment()` inner function to add `.join(Customer, Payment.customer_id == Customer.id)` and `.filter(Customer.is_company == False)`
    - All downstream totals (`total_cash`, `total_others`, etc.) are derived from `sum_payment()` calls and are automatically correct
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 11.2 Write property test for sum_payment() excluding company customer payments
    - **Property 7: sum_payment() excludes company customer payments**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - Generate random payment records with mixed `is_company` flags on their customers; run the equivalent filtering logic; assert result equals sum of non-company payments only
    - Tag: `Feature: company-customer-tag, Property 7: sum_payment excludes company customer payments`

- [ ] 12. Property test — stock movements unaffected by is_company
  - [ ]* 12.1 Write property test confirming stock movements are unaffected by is_company
    - **Property 8: Stock movements are unaffected by is_company**
    - **Validates: Requirements 8.1**
    - Generate random sale items; assert stock decrement is identical regardless of `is_company` on the customer
    - Tag: `Feature: company-customer-tag, Property 8: stock movements unaffected by is_company`

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- The migration uses the existing `PRAGMA table_info` + `ALTER TABLE` pattern already established in `app.py` — no new migration framework needed
- `form.reset(customerData)` / `form.reset(supplierData)` already handles pre-population of the new checkbox once `is_company` is in the Zod schema and `defaultValues`
- `insertCustomerSchema` and `insertSupplierSchema` inherit `is_company` automatically via `.omit()` — no separate change needed
- Property tests should use `hypothesis` (Python) and run a minimum of 100 iterations each
