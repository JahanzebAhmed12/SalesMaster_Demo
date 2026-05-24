# Design Document: Company Customer/Supplier Tag

## Overview

This feature adds an `is_company` boolean flag to the `Customer` and `Supplier` models. When set, the flag causes that entity's transactions to be excluded from all financial totals in the three daily reports (daily book sales, daily summary, daily accounts), while the individual transaction rows remain visible. Stock movements are unaffected.

The change is additive and backward-compatible: existing records default to `is_company = False`, so no existing behaviour changes unless an administrator explicitly marks a record as a company.

## Architecture

The change spans three layers:

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React/TypeScript)                        │
│  customer-database-edit.tsx / supplier-database-    │
│  edit.tsx  ──  add Checkbox field + schema field    │
└────────────────────┬────────────────────────────────┘
                     │ REST API (JSON)
┌────────────────────▼────────────────────────────────┐
│  Backend (Flask / SQLAlchemy)                       │
│  models.py   ── add is_company column               │
│  schemas.py  ── add is_company field                │
│  app.py      ── startup migration + report filters  │
└────────────────────┬────────────────────────────────┘
                     │ SQLAlchemy ORM
┌────────────────────▼────────────────────────────────┐
│  SQLite database                                    │
│  customer table / suppliers table                   │
│  ALTER TABLE … ADD COLUMN is_company BOOLEAN        │
│  DEFAULT 0 (run once at startup if missing)         │
└─────────────────────────────────────────────────────┘
```

No new routes, services, or files are introduced. All changes are localised to existing files.

## Components and Interfaces

### 1. Database Migration (app.py — startup)

The existing codebase uses a pattern of checking `PRAGMA table_info` at application startup and issuing `ALTER TABLE … ADD COLUMN` if the column is absent. The same pattern is applied for both tables:

```python
# Run once at startup inside the app context
with db.engine.connect() as conn:
    cols = [row[1] for row in conn.execute(text("PRAGMA table_info(customer)"))]
    if 'is_company' not in cols:
        conn.execute(text("ALTER TABLE customer ADD COLUMN is_company BOOLEAN DEFAULT 0"))
        conn.commit()

    cols = [row[1] for row in conn.execute(text("PRAGMA table_info(suppliers)"))]
    if 'is_company' not in cols:
        conn.execute(text("ALTER TABLE suppliers ADD COLUMN is_company BOOLEAN DEFAULT 0"))
        conn.commit()
```

### 2. Model Changes (backend/models.py)

Add `is_company` to both models and their `to_dict()` methods:

```python
# Customer model
is_company = db.Column(db.Boolean, default=False)

def to_dict(self):
    return {
        ...
        'is_company': bool(self.is_company),
    }

# Supplier model
is_company = db.Column(db.Boolean, default=False)

def to_dict(self):
    return {
        ...
        'is_company': bool(self.is_company),
    }
```

### 3. Schema Changes (backend/schemas.py)

Add `is_company` as an optional boolean field defaulting to `False` in both Pydantic schemas:

```python
class CustomerSchema(BaseModel):
    ...
    is_company: bool = False

class SupplierSchema(BaseModel):
    ...
    is_company: bool = False
```

### 4. Frontend Schema (shared/schema.ts)

Add `is_company` to the Zod `customerSchema` and `supplierSchema` (and their insert variants):

```typescript
// customerSchema
is_company: z.boolean().default(false).optional(),

// supplierSchema (if it exists in shared/schema.ts)
is_company: z.boolean().default(false).optional(),
```

### 5. Frontend Forms

Both `customer-database-edit.tsx` and `supplier-database-edit.tsx` use `react-hook-form` with a Zod resolver. The change is:

- Add `is_company: false` to `defaultValues`
- Add a `<Checkbox>` field (the `@/components/ui/checkbox` component already exists) bound to `is_company`
- The existing `form.reset(customerData)` / `form.reset(supplierData)` calls already handle pre-population once the field is in the schema

### 6. Report Filter — daily_book_sales (app.py)

The `daily_book_sales` function builds a list of sale rows and then the frontend computes totals from those rows. The totals row is computed client-side from the returned array.

Two options:
- **Option A**: Add an `isCompany` flag to each row and let the frontend exclude company rows from totals.
- **Option B**: Return a separate `totals` object from the backend with company rows already excluded.

**Decision: Option A** — it is the minimal change, keeps the existing response shape intact (rows still appear), and the frontend already iterates the array to compute totals. Adding `isCompany: bool` to each row lets the frontend skip those rows when summing.

```python
result.append({
    ...
    'isCompany': bool(sale.customer.is_company) if sale.customer else False,
})
```

### 7. Report Filter — daily_summary_report (app.py)

The `daily_summary_report` function queries `Sale` joined to `Customer` and accumulates `cash_total`, `card_total`, `account_total`, etc. in a Python loop. The filter is applied by checking `is_company` on the joined `Customer` row:

```python
# In the sales_query join, Customer is already joined.
# When accumulating totals, skip company customers:
for sale in sales_query:
    if sale.customer and sale.customer.is_company:
        # Still append to sales_summary for listing visibility
        sales_summary.append({...})
        continue  # Do not add to cash_total / card_total / account_total
    cash_total += cash_amount
    ...
```

### 8. Report Filter — daily_accounts_report / sum_payment() (app.py)

The `sum_payment()` helper inside `daily_accounts_report` queries `Payment` directly. To exclude company customers it needs a join to `Customer`:

```python
def sum_payment(mode, on_account=False):
    query = db.session.query(func.sum(Payment.amount))\
        .join(Customer, Payment.customer_id == Customer.id)\
        .filter(
            Customer.is_company == False,
            Payment.payment_mode.ilike(mode),
            Payment.payment_date >= from_dt.date(),
            Payment.payment_date < to_dt.date(),
            or_(Payment.payment_source.is_(None),
                Payment.payment_source != 'daily_book_sales')
        )
    if on_account:
        query = query.filter(Payment.payment_type == 'on-account')
    else:
        query = query.filter(
            or_(Payment.payment_type != 'on-account',
                Payment.payment_type.is_(None))
        )
    return float(query.scalar() or 0)
```

This is the only change needed in `daily_accounts_report` — all downstream totals (`total_cash`, `total_others`, etc.) are derived from `sum_payment()` calls, so they are automatically correct.

## Data Models

### Customer (updated)

| Column | Type | Default | Notes |
|---|---|---|---|
| id | INTEGER PK | — | existing |
| customer_code | VARCHAR(50) | — | existing |
| customer_name | VARCHAR(100) | — | existing |
| … | … | … | existing |
| is_company | BOOLEAN | 0 (False) | **new** |

### Supplier (updated)

| Column | Type | Default | Notes |
|---|---|---|---|
| id | INTEGER PK | — | existing |
| supplier_code | VARCHAR(50) | — | existing |
| supplier_name | VARCHAR(100) | — | existing |
| … | … | … | existing |
| is_company | BOOLEAN | 0 (False) | **new** |

### API response shape changes

`GET /api/customers/:id` and `GET /api/customers` — each customer object gains `"is_company": bool`.

`GET /api/suppliers/:id` and `GET /api/suppliers` — each supplier object gains `"is_company": bool`.

`GET /api/reports/daily-book-sales` — each sale row gains `"isCompany": bool`.

`GET /api/reports/daily-summary` and `GET /api/reports/daily-accounts` — no shape change; totals are already computed server-side and the exclusion is applied internally.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: to_dict() always includes is_company as a boolean

*For any* `Customer` or `Supplier` instance (regardless of how `is_company` was stored), calling `to_dict()` should return a dictionary that contains the key `"is_company"` with a value that is a Python `bool`.

**Validates: Requirements 1.4, 2.4**

---

### Property 2: Schema round-trip preserves is_company

*For any* `Customer` or `Supplier` object with any `is_company` value (`True` or `False`), serialising it through the Pydantic schema and then reading the field back should produce the same boolean value.

**Validates: Requirements 1.3, 2.3**

---

### Property 3: API create/update round-trip preserves is_company

*For any* boolean value of `is_company` submitted in a customer or supplier create/update API request, the record returned by a subsequent GET request for that entity should have the same `is_company` value.

**Validates: Requirements 3.3, 4.3**

---

### Property 4: Company customer rows appear in daily book sales listing

*For any* date range containing sales to company customers, the `daily_book_sales` response array should include a row for every such sale (i.e., no rows are suppressed based on `is_company`).

**Validates: Requirements 5.1**

---

### Property 5: Company customer amounts are excluded from daily book sales totals

*For any* set of sales containing a mix of company and non-company customer sales, the financial totals computed from the `daily_book_sales` response (by summing only rows where `isCompany == false`) should equal the sum of only the non-company customer sale amounts.

**Validates: Requirements 5.2, 5.3**

---

### Property 6: Daily summary financial totals exclude company customer amounts

*For any* report date with a mix of company and non-company customer sales, every financial total returned by `daily_summary_report` (`cash_total`, `card_total`, `account_total`, `bank_transfer_total`, `cheque_total`) should equal the sum of the corresponding amounts from non-company customers only.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

---

### Property 7: sum_payment() excludes company customer payments

*For any* payment mode and any date range containing payments from both company and non-company customers, `sum_payment()` should return a value equal to the sum of payments from non-company customers only.

**Validates: Requirements 7.1, 7.2, 7.3**

---

### Property 8: Stock movements are unaffected by is_company

*For any* sale to a company customer and an equivalent sale to a non-company customer (same items, same quantities), the resulting stock level change should be identical.

**Validates: Requirements 8.1**

---

## Error Handling

- **Migration failure**: If `ALTER TABLE` fails (e.g., column already exists due to a race condition), the `PRAGMA table_info` check prevents the statement from running. Any unexpected exception during migration should be logged and re-raised so the application fails fast rather than starting with an inconsistent schema.
- **Missing is_company in API payload**: Both `CustomerSchema` and `SupplierSchema` default `is_company` to `False`, so omitting the field from a request body is safe and backward-compatible.
- **NULL in database**: SQLite stores `False` as `0`. The `bool()` cast in `to_dict()` handles `None` (from rows inserted before the migration) by coercing it to `False`.
- **sum_payment() join**: Adding `.join(Customer, Payment.customer_id == Customer.id)` assumes referential integrity. If a `Payment` row has a `customer_id` that does not exist in `customer`, it will be silently excluded from the sum. This is acceptable — orphaned payments are a pre-existing data integrity issue.

## Testing Strategy

### Unit Tests

Focus on specific examples and edge cases:

- Customer/Supplier default: a newly created instance has `is_company == False`.
- Migration idempotency: running the migration twice does not raise an error.
- `to_dict()` with `is_company = True` returns `True`; with `False` returns `False`; with `None` (legacy row) returns `False`.
- `sum_payment()` with all company customers returns `0.0`.
- `sum_payment()` with no company customers returns the full sum (unchanged behaviour).

### Property-Based Tests

Use a property-based testing library (e.g., `hypothesis` for Python, `fast-check` for TypeScript).

Each property test must run a minimum of 100 iterations.

Tag format: `Feature: company-customer-tag, Property {N}: {property_text}`

**Python (hypothesis)**:

- **Property 1** — Generate random `Customer`/`Supplier` instances with arbitrary `is_company` values; assert `to_dict()` always contains `"is_company"` as a `bool`.
  - Tag: `Feature: company-customer-tag, Property 1: to_dict always includes is_company as bool`

- **Property 2** — Generate random `is_company` booleans; create a schema instance, serialise to dict, deserialise back; assert the value is preserved.
  - Tag: `Feature: company-customer-tag, Property 2: schema round-trip preserves is_company`

- **Property 5** — Generate a random list of sale dicts with random `isCompany` flags and random amounts; assert that summing only `isCompany == false` rows equals the expected total.
  - Tag: `Feature: company-customer-tag, Property 5: company amounts excluded from daily book sales totals`

- **Property 6** — Generate random sets of sales with mixed `is_company` flags; call the summary aggregation logic; assert totals match non-company-only sums.
  - Tag: `Feature: company-customer-tag, Property 6: daily summary totals exclude company amounts`

- **Property 7** — Generate random payment records with mixed `is_company` flags on their customers; call `sum_payment()` equivalent logic; assert result equals sum of non-company payments.
  - Tag: `Feature: company-customer-tag, Property 7: sum_payment excludes company customer payments`

- **Property 8** — Generate random sale items; assert stock decrement is the same regardless of `is_company` on the customer.
  - Tag: `Feature: company-customer-tag, Property 8: stock movements unaffected by is_company`

Unit tests and property tests are complementary. Unit tests catch concrete bugs in specific scenarios; property tests verify the general correctness of the filtering logic across the full input space.
