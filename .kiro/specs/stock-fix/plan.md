# Stock System Fix Plan

## Core Rules (User Requirements)

### Rule A — Closing stock entered = hard override
If a manual closing stock entry exists for a date, that value IS the stock for that date.
It overrides all calculations. Next day's opening stock = that value exactly.

### Rule B — No closing stock entered = zero next day
If no manual closing stock entry exists for a date, the next day starts from zero.
All purchases, sales, returns on that next day are calculated from zero.

---

## Fixes

### Fix 1 — `get_opening_stock` — implement Rule A and Rule B
**File:** `backend/app.py`
**Status:** TODO

Current: falls back to last StockMovement if no ClosingStock exists.
New: previous day manual ClosingStock → use it. No entry → return 0.

```python
def get_opening_stock(product_id, product_type, from_date):
    prev_date = (from_date - timedelta(days=1)).date()
    closing_entry = ClosingStock.query.filter_by(
        product_id=product_id,
        product_type=product_type,
        date=prev_date,
        manual_entry=True
    ).first()
    if closing_entry:
        return safe_float(closing_entry.quantity)
    return 0  # Rule B: no closing stock = start from zero
```

---

### Fix 2 — Supplier returns never update stock
**File:** `backend/app.py`
**Status:** TODO

Current: `create_supplier_return` skips stock update. No approve endpoint exists.
Fix:
- `create_supplier_return` → `update_product_stock(-quantity, 'supplier_return', reference_id=supplier_return.id)`
- `delete_supplier_return` → `update_product_stock(+quantity, 'supplier_return_cancellation', reference_id=supplier_return.id)`
- `update_supplier_return` → if quantity changed, `update_product_stock(diff, 'supplier_return_adjustment')`

---

### Fix 3 — Dump UPDATE doesn't update stock
**File:** `backend/app.py`
**Status:** TODO

Current: `update_dump_entry` only updates DB record, no stock movement.
Fix: calculate quantity diff and apply movement.

```python
old_quantity = dump_entry.quantity
# ... update fields ...
quantity_diff = quantity - old_quantity
if quantity_diff != 0:
    update_product_stock(
        quantity_change=-quantity_diff,
        movement_type='dump_adjustment',
        reference_id=dump_entry.id,
        reference_type='dump'
    )
```

---

### Fix 4 — Credit returns via negative sale qty missed in C.RTN
**File:** `backend/app.py`
**Status:** TODO

Current: negative qty sale items create StockMovement with reference_id=sale.id.
`get_customer_returns_quantity` joins StockMovement to CustomerReturn by reference_id — misses these.
Fix: after creating CustomerReturn record, update the StockMovement reference_id to CustomerReturn.id.

```python
movement = StockMovement.query.filter_by(
    reference_id=new_sale.id,
    reference_type='sale',
    product_id=stock_update['product_id'],
    movement_type='customer_return'
).order_by(StockMovement.created_at.desc()).first()
if movement:
    movement.reference_id = customer_return.id
    movement.reference_type = 'customer_return'
```

---

### Fix 5 — `get_dumps_quantity` sign logic hardening
**File:** `backend/app.py`
**Status:** TODO

Current: only counts movements where quantity < 0. Fragile.
Fix: use abs() on all dump/dump_adjustment movements, subtract cancellations.

---

### Fix 6 — `initial_stock` integer field loses decimal quantities
**File:** `backend/models.py` + migration in `backend/app.py`
**Status:** TODO (low priority)

Current: `initial_stock = db.Column(db.Integer)` truncates fractional quantities.
Fix: migrate to `Numeric(10, 3)` via SQLite table recreate pattern.

---

## Execution Order

| # | Fix | Risk | Effort | Status |
|---|---|---|---|---|
| 1 | `get_opening_stock` Rule A + B | Medium | Small | ✅ DONE |
| 2 | Supplier returns update stock | Low | Small | ✅ DONE |
| 3 | Dump UPDATE updates stock | Low | Small | ✅ DONE |
| 4 | Credit return reference fix | Low | Small | ✅ DONE |
| 5 | Dump quantity sign hardening | Very low | Small | ✅ DONE |
| 6 | `initial_stock` decimal migration | Very low | Medium | ✅ DONE |
