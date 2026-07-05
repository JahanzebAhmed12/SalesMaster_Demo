# Stock System Audit Report

Generated: 2026-07-05
Files Analyzed: `backend/app.py`, `backend/models.py`, `backend/check_stock_discrepancy.py`, `.kiro/specs/stock-fix/plan.md`

---

## Severity Levels

- **CRITICAL** — Causes permanent, unrecoverable stock corruption
- **HIGH** — Causes stock drift over time or under specific conditions
- **MEDIUM** — Functional bug that can cause incorrect stock under certain workflows
- **LOW** — Code quality, consistency, or edge case issues

---

## ISSUE 1: DELETE Sale Does NOT Restore Stock (CRITICAL)

**Files:** `backend/app.py:1713-1734`
**Status:** Existing bug (not yet fixed)

### Description
The `delete_sale` route deletes the sale, its items, and associated customer returns, but **never restores the stock** that was deducted when the sale was finalized. This causes permanent stock leakage every time a finalized sale is deleted.

### Current Code
```python
def delete_sale(id):
    sale = Sale.query.get_or_404(id)
    try:
        customer_returns = CustomerReturn.query.filter_by(sale_id=sale.id).all()
        for cr in customer_returns:
            StockMovement.query.filter_by(
                reference_id=cr.id, reference_type='customer_return'
            ).delete()                    # <-- Deletes customer return stock movements
            db.session.delete(cr)
        for item in sale.items:
            db.session.delete(item)
        db.session.delete(sale)           # <-- Sale deleted, stock NEVER restored
        db.session.commit()
```

### What Goes Wrong
1. Stock that was deducted via `update_product_stock(quantity_change=-quantity)` for each sale item is **never added back**
2. Customer return stock movements are silently deleted, erasing the audit trail
3. No check is made for whether the sale was `finalized` — a draft sale with no stock impact is treated the same
4. Even the `StockMovement` records with `movement_type='sale'` for the sale remain in the database (not deleted), but the stock itself is not corrected

### Reproduction
1. Create a sale with 10 units of Product A (finalized) → Product A `current_stock` decreases by 10
2. Delete the sale → stock stays decreased by 10 permanently
3. Create another sale for 10 units → stock decreases by another 10 (now -20 from original)
4. `current_stock` is now permanently wrong

### Fix Required
```python
def delete_sale(id):
    sale = Sale.query.get_or_404(id)
    try:
        # Only restore stock if sale was finalized
        if sale.status == 'finalized':
            for item in sale.items:
                product_id = item.product_id or item.non_product_id
                product_type = 'regular' if item.product_id else 'non'
                if product_id and item.quantity > 0:
                    # Restore stock for positive-quantity items (sale reduction)
                    update_product_stock(
                        product_id=product_id,
                        product_type=product_type,
                        quantity_change=float(item.quantity),  # Positive = restore
                        movement_type='sale_cancellation',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Sale deleted: {sale.invoice_number}"
                    )
                elif product_id and item.quantity < 0:
                    # Reverse stock for negative-quantity items (customer returns)
                    update_product_stock(
                        product_id=product_id,
                        product_type=product_type,
                        quantity_change=-abs(float(item.quantity)),  # Negative = reverse return
                        movement_type='customer_return_cancellation',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Customer return reversed on sale delete: {sale.invoice_number}"
                    )

        # Delete associated customer return records
        customer_returns = CustomerReturn.query.filter_by(sale_id=sale.id).all()
        for cr in customer_returns:
            db.session.delete(cr)

        for item in sale.items:
            db.session.delete(item)
        db.session.delete(sale)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400
```

---

## ISSUE 2: Customer Return `create` Bypasses `update_product_stock()` (HIGH)

**Files:** `backend/app.py:8808-8831`
**Status:** Existing bug

### Description
The `create_customer_return` route directly manipulates `product.current_stock` and manually creates a `StockMovement` record, **bypassing** the central `update_product_stock()` function. This means no row-level locking, no retry logic, no negative-stock validation, and no consistency with other stock operations.

### Current Code
```python
# CRITICAL: Update the product's current_stock in the database
product.current_stock = new_stock

stock_movement = StockMovement(
    product_id=...,
    ...
)
db.session.add(stock_movement)
```

### Why This Is Dangerous
- **Race condition**: Two simultaneous customer returns for the same product can overwrite each other
- **No locking**: Unlike all other stock operations, this doesn't use `with_for_update()`
- **No validation**: Negative stock is not prevented
- **Inconsistent pattern**: All other stock mutations go through `update_product_stock`

### Fix Required
Replace the manual stock manipulation with a call to `update_product_stock()`:

```python
if customer_return_data.status == 'completed':
    success, result = update_product_stock(
        product_id=customer_return_data.productId,
        product_type=customer_return_data.productType,
        quantity_change=quantity,  # Positive for returns (stock increase)
        movement_type='customer_return',
        reference_id=customer_return.id,
        reference_type='customer_return',
        remarks=f"Customer return: {ref_number}",
        user_id=user_id,
        movement_date=parsed_date
    )
    if not success:
        db.session.rollback()
        return jsonify({"error": f"Stock update failed: {result}"}), 400
```

---

## ISSUE 3: Supplier Return Rejection Has Wrong Reversal Sign (HIGH)

**Files:** `backend/app.py:9627-9641`
**Status:** Existing bug

### Description
When a supplier return is rejected, the stock reversal uses the **wrong sign**. The create operation reduces stock with `-quantity`, but the reject also uses `-quantity` (instead of `+quantity`), causing a **double deduction**.

### Current Code
```python
success, result = update_product_stock(
    product_id=supplier_return.product_id,
    quantity_change=-supplier_return.quantity,  # <-- WRONG: should be +quantity
    movement_type='supplier_return_rejection',
    ...
)
```

### Reproduction
1. Stock = 100
2. Create supplier return of 10 → stock becomes 90 (100 - 10)
3. Reject the return → stock becomes **80** (90 - 10) instead of **100** (90 + 10)
4. Stock is now permanently 20 units too low

### Fix Required
```python
quantity_change=supplier_return.quantity,  # Positive: reverses the original -quantity
```

---

## ISSUE 4: Stock Check Formula Has Wrong Sign for Supplier Returns (HIGH)

**Files:** `backend/app.py:7951, 8025`
**Status:** Bug introduced by Fix 2 (the formula was not updated when supplier returns were changed to update stock)

### Description
The stock check formula adds supplier returns to expected stock (`+ SRTN`), but since Fix 2 made supplier returns actually **decrease** `current_stock`, they should be **subtracted** (`- SRTN`). This double-counts supplier returns in the opposite direction.

### Current Formula
```python
expected_stock = opening_stock + new_stock - sales + customer_returns - dumps + supplier_returns
                                                                                ^^^^^^^^^^^^^^^^
                                                                                WRONG: should be -
```

### Before Fix 2
Supplier returns did NOT update `current_stock`, so adding them in the formula was needed to account for the physical stock reduction. The formula was correct.

### After Fix 2
Supplier returns DO update `current_stock` (with `-quantity`). But the formula still has `+ SRTN` instead of `- SRTN`. This means:
- Stock check report OVERSTATES expected stock by 2× the supplier return value
- Every supplier return creates a false "short" discrepancy of 2× the quantity

### Reproduction
1. Stock = 100
2. Supplier return of 10: `current_stock` = 90
3. OS = 100 (from previous closing stock)
4. Stock check: Expected = 100 + 0 - 0 + 0 - 0 + 10 = 110
5. Actual = 90, Difference = -20 (reports "short 20")
6. Reality: stock should show 0 difference

### Fix Required
Change the formula in both places (regular products line 7951 and non-products line 8025):
```python
expected_stock = opening_stock + new_stock - sales + customer_returns - dumps - supplier_returns
```

Also update `check_stock_discrepancy.py:151` with the same fix.

---

## ISSUE 5: `get_new_stock()` Uses `created_at` Instead of Business Date (HIGH)

**Files:** `backend/app.py:8112-8138`
**Status:** Existing inconsistency

### Description
The `get_new_stock()` function filters stock movements by `StockMovement.created_at`, while `get_sales_quantity()`, `get_customer_returns_quantity()`, `get_dumps_quantity()`, and `get_supplier_returns_quantity()` all filter by their respective **business date fields**. This inconsistency means purchases may fall into different date boundaries than other transactions.

### The Problem
- Sales filter by `Sale.date` (business date)
- Purchases filter by `StockMovement.created_at` (system timestamp)
- If a purchase invoice is created at 11:59 PM on Day 1 but the `created_at` timestamp is 12:01 AM on Day 2 (due to processing time), the purchase will not appear in Day 1's stock check even though the sale it relates to does
- Conversely, if the StockMovement was created on Day 1 but the invoice date was Day 2, it would appear in the wrong day's report

### Why It Exists
The code comment says: "We use `created_at` because deleted invoices no longer exist to join against." This is true — if you delete a purchase invoice, the `PurchaseInvoice` record is gone, so you can't join on `invoice.date`. The `StockMovement` record persists and `created_at` is the only reliable timestamp.

### Fix Options
Option A: Add a `movement_date` field to `StockMovement` model (populated at creation time from the business date) and use that for all stock report filtering.

Option B: Accept the discrepancy and document that purchase stock movements may straddle date boundaries by up to a few seconds/minutes.

Option C: For the stock check report, join purchase StockMovements with PurchaseInvoiceItem → PurchaseInvoice to get the invoice date, and only fall back to `created_at` for deleted invoices.

**Recommended: Option A** — Add and use `movement_date` on StockMovement. The field already exists as a parameter in `update_product_stock` (line 655: `movement_timestamp = movement_date if movement_date else datetime.now()`) but it's stored in `created_at`. The model should have a separate `movement_date` field.

---

## ISSUE 6: Sale Update — Customer Return Items Mislabeled as `sale` Movements (MEDIUM)

**Files:** `backend/app.py:1422-1559`
**Status:** Existing inconsistency

### Description
When a finalized sale is updated and quantity changes involve items that were originally customer returns (negative quantity), the adjustment stock movements are created with `movement_type='sale'` instead of `customer_return_adjustment`. This corrupts the audit trail.

### Specific Problem Points
1. **Lines 1436-1442**: When searching for existing movement, it only looks for `movement_type == 'sale'`. For items where the original was `customer_return`, no existing movement is found, so it creates a new one with `movement_type='sale'` (line 1477-1478)
2. **Lines 1491-1531**: Removed products always use `movement_type='sale_cancellation'`, even if the original was a customer return
3. **Lines 1533-1559**: New products always use `movement_type='sale'`, even if the new item has negative quantity (should be `customer_return`)

### Fix Required
For each item being processed, determine if the quantity is positive (sale) or negative (customer return) and use the appropriate movement_type.

---

## ISSUE 7: Supplier Return Quantity Truncated to Integer (MEDIUM)

**Files:** `backend/app.py:9259`
**Status:** Existing bug

### Description
Supplier returns convert the quantity to `int`, losing decimal precision. All other stock entities use `float`.

### Current Code
```python
quantity = int(data.get('quantity', 0))  # <-- Truncates decimals
```

### Contrast With
- Customer Return (line 8736): `quantity = float(data.get('quantity', 0))`
- Dump Entry (line 8551): `quantity = float(data.get('quantity', 0))`
- Sale Item: Uses whatever the frontend sends (typically float)

### Fix Required
```python
quantity = float(data.get('quantity', 0))
```

Also update line 9420 in `update_supplier_return`:
```python
quantity = float(data.get('quantity', 0))
```

---

## ISSUE 8: Closing Stock First-Save Auto-Zeroes ALL Products (MEDIUM)

**Files:** `backend/app.py:7506-7562`
**Status:** Design issue with side effects

### Description
The first time closing stock is saved for a date, it auto-creates `ClosingStock` entries with `quantity=0` for EVERY active product not in the submitted list. It also sets `product.current_stock = 0` for those products. This means:

1. Products with real stock that weren't submitted are zeroed out
2. Auto-zeroed entries have `manual_entry=False` but `get_opening_stock()` doesn't filter by `manual_entry`
3. These auto-zeroed entries become the "opening stock" for the next day

### Reproduction
1. Day 1: Product A has 100 units in stock
2. User saves closing stock for Day 1, only submitting Product B (they forgot Product A)
3. Product A gets auto-zeroed: `current_stock = 0`, closing stock entry with quantity=0
4. Day 2: Opening stock for Product A is 0 (from the auto-zeroed entry)
5. All day's calculations start from 0, even though Product A had 100 units

### Mitigation
This is partially a UX issue — users must submit ALL products when first saving closing stock for a date. On subsequent saves, only submitted items are updated (no auto-zero).

### Fix Options
Option A: On first save, don't auto-zero. Only save submitted items.
Option B: On first save, auto-zero but set `manual_entry=True` and show a warning.
Option C: Add a confirmation dialog on the frontend warning about auto-zero behavior.

---

## ISSUE 9: Customer Return Approve — Creates Duplicate Stock Increase (MEDIUM)

**Files:** `backend/app.py:9037-9072`
**Status:** Existing design flaw

### Description
The `create_customer_return` already updates stock if `status == 'completed'`. But if a return is created as `pending`, the `approve` endpoint (line 9048-9058) calls `update_product_stock` with a `customer_return` movement, creating a **second** stock increase. The issue is that the `complete` endpoint (line 9121-9137) does NOT update stock — it only changes status. So the approve endpoint is where stock gets updated for pending→approved transitions.

### The Flow That Works Correctly
1. Create return with `status='completed'` → stock increases in create
2. Approve/Complete not needed

### The Flow That May Be Buggy
1. Create return with `status='pending'` → stock does NOT increase
2. Approve → stock increases (correct, first time stock is touched)
3. Complete → no stock change (correct, already done)

### But What About Reject?
1. Create return with `status='pending'` → stock does NOT increase
2. Reject (line 9074-9119) → calls `update_product_stock(quantity_change=-quantity)`
3. But stock was never increased! So this would DECREASE stock for a pending return that was rejected

**This is a bug**: Rejecting a pending customer return **decreases stock** even though the create never increased it.

### Fix Required
The approve and reject endpoints should check whether stock was already updated:
- If `status` was `pending`, approve should be the first stock update (correct as-is)
- If `status` was `pending`, reject should NOT reverse stock (because it was never increased)
- The complete endpoint should handle the actual stock update for pending→completed transitions

---

## ISSUE 10: Sale DELETE Doesn't Check Finalized Status (MEDIUM)

**Files:** `backend/app.py:1713-1734`
**Status:** Existing bug

### Description
The delete_sale route doesn't check whether the sale was `finalized`. While a draft sale has no stock impact, there is no explicit check, making the code fragile.

### Fix
Add a check at the beginning of delete_sale:
```python
was_finalized = sale.status == 'finalized'
```
Then use this flag to conditionally restore stock.

---

## ISSUE 11: Sale Update — Finalized→Non-Finalized Customer Return Reversal (MEDIUM)

**Files:** `backend/app.py:1382-1421`
**Status:** Subtle audit trail issue

### Description
When a finalized sale is changed to non-finalized (e.g., draft), the code restores stock for ALL items using `movement_type='sale_cancellation'`. For customer return items (negative quantity), the quantity_change sign IS correct (it reverses the effect), but the `movement_type` should be `customer_return_cancellation` not `sale_cancellation`.

### Current Code
```python
for item_data in sale_data.items:
    if item_data.product_id:
        success, result = update_product_stock(
            quantity_change=safe_float(item_data.quantity),  # Sign correct for both + and - items
            movement_type='sale_cancellation',  # <-- Wrong for negative items
            ...
        )
```

### Fix
Check the sign of the quantity and use the appropriate movement_type:
```python
if item_data.quantity > 0:
    movement_type = 'sale_cancellation'
else:
    movement_type = 'customer_return_cancellation'
```

---

## ISSUE 12: `get_opening_stock` Doesn't Filter by `manual_entry` (LOW)

**Files:** `backend/app.py:8087-8110`
**Status:** Potential for misinterpretation

### Description
The `get_opening_stock()` function looks for any `ClosingStock` entry, regardless of whether it was manually entered or auto-zeroed. This means auto-zeroed entries from the first closing stock save are treated as legitimate closing stock values.

According to Rule A + B from the plan:
- Rule A: If a manual closing stock entry exists → use it
- Rule B: If no manual entry exists → return 0

But the code doesn't distinguish between manual and auto-zeroed entries.

### Current Code
```python
closing_entry = ClosingStock.query.filter_by(
    product_id=product_id,
    product_type=product_type,
    date=check_date,
).first()  # <-- No filter for manual_entry=True
```

### Impact
If the first closing stock save auto-zeroed a product, that auto-zeroed entry becomes the "official" closing stock and the opening stock for the next day. This may be intentional (the plan doesn't specify filtering by manual_entry), but it means the stock report treats auto-zeroed entries the same as manually entered ones.

### Fix (if needed)
```python
closing_entry = ClosingStock.query.filter_by(
    product_id=product_id,
    product_type=product_type,
    date=check_date,
    manual_entry=True  # Only consider manual entries
).first()
```

---

## ISSUE 13: `StockAdjustment.previous_stock` / `new_stock` Are Integer (LOW)

**Files:** `backend/models.py:755-756`
**Status:** Type mismatch

### Description
The `StockAdjustment` model stores `previous_stock` and `new_stock` as `db.Integer`, but stock values can be decimal. This truncates fractional quantities in adjustment history records.

### Current Code
```python
previous_stock = db.Column(db.Integer, nullable=False)
new_stock = db.Column(db.Integer, nullable=False)
```

### Fix
```python
previous_stock = db.Column(db.Numeric(10, 3), nullable=False)
new_stock = db.Column(db.Numeric(10, 3), nullable=False)
```

---

## ISSUE 14: Duplicate `parsed_date` Parsing in `create_supplier_return` (LOW)

**Files:** `backend/app.py:9240-9269`
**Status:** Code quality

### Description
The date is parsed twice — once for permission checks and once for record creation. The second parse resets the variable unnecessarily.

### Current Code
```python
# First parse (lines 9230-9238)
business_date = get_business_date()
parsed_date = business_date
date_str = data.get('date')
if date_str:
    try:
        parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        parsed_date = business_date

# ... permission checks use parsed_date ...

# Second parse (lines 9262-9269) — REDUNDANT, resets parsed_date
parsed_date = business_date  # <-- Reset!
date_str = data.get('date')
if date_str:
    try:
        parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        parsed_date = business_date
```

### Fix
Remove the second parse block and reuse `parsed_date` from the first parse.

---

## ISSUE 15: Product Update Routes Ignore `initial_stock` Changes (LOW)

**Files:** `backend/app.py:1884-1933, 2032-2080`
**Status:** Intentional, but worth noting

### Description
When updating a product, `initial_stock` is not included in the update data. Even if it were submitted, there's no logic to adjust `current_stock` based on `initial_stock` changes. This means `initial_stock` is effectively a write-once field.

This is likely intentional — changing `initial_stock` after creation would be unusual — but it's inconsistent with the user expectation that editing a product's initial stock would affect current stock.

---

## Summary of All Issues

| # | Issue | Severity | File:Line | Fix Status |
|---|-------|----------|-----------|------------|
| 1 | DELETE sale does not restore stock | CRITICAL | app.py:1713-1734 | ❌ Not fixed |
| 2 | Customer Return create bypasses `update_product_stock` | HIGH | app.py:8808-8831 | ❌ Not fixed |
| 3 | Supplier Return rejection wrong sign | HIGH | app.py:9627-9641 | ❌ Not fixed |
| 4 | Stock check formula: `+SRTN` should be `-SRTN` | HIGH | app.py:7951, 8025 | ❌ Not fixed |
| 5 | `get_new_stock` uses `created_at` not business date | HIGH | app.py:8112-8138 | ❌ Not fixed |
| 6 | Sale update: customer returns mislabeled as `sale` | MEDIUM | app.py:1422-1559 | ❌ Not fixed |
| 7 | Supplier return quantity truncated to int | MEDIUM | app.py:9259, 9420 | ❌ Not fixed |
| 8 | Closing stock first-save auto-zeroes all products | MEDIUM | app.py:7506-7562 | ❌ Not fixed |
| 9 | Customer Return Approve/Reject stock logic flawed | MEDIUM | app.py:9037-9119 | ❌ Not fixed |
| 10 | Sale DELETE doesn't check finalized status | MEDIUM | app.py:1713 | ❌ Not fixed |
| 11 | Sale unfinalize: customer returns use wrong movement type | MEDIUM | app.py:1382-1421 | ❌ Not fixed |
| 12 | `get_opening_stock` ignores `manual_entry` flag | LOW | app.py:8087-8110 | ⚠️ Needs review |
| 13 | `StockAdjustment` uses Integer for stock fields | LOW | models.py:755-756 | ❌ Not fixed |
| 14 | Duplicate date parsing in `create_supplier_return` | LOW | app.py:9240-9269 | ❌ Not fixed |
| 15 | Product update ignores `initial_stock` changes | LOW | app.py:1884-2080 | ⚠️ Intentional |

---

## Previously Fixed Issues (from `.kiro/specs/stock-fix/plan.md`)

| Fix | Description | Status |
|-----|-------------|--------|
| Fix 1 | `get_opening_stock` Rule A+B (look back 7 days, return 0 if none) | ✅ DONE |
| Fix 2 | Supplier returns update stock | ✅ DONE |
| Fix 3 | Dump UPDATE updates stock | ✅ DONE |
| Fix 4 | Credit return reference fix (StockMovement points to CustomerReturn) | ✅ DONE |
| Fix 5 | Dump quantity sign hardening (abs on quantities) | ✅ DONE |
| Fix 6 | `initial_stock` decimal migration (Integer → Numeric) | ✅ DONE |

---

## Top Priority Fixes (Recommended Order)

1. **ISSUE 1**: Fix DELETE sale to restore stock — **most critical**, causes permanent stock loss
2. **ISSUE 4**: Fix stock check formula `+SRTN` → `-SRTN` — without this, stock report shows phantom shortages for every supplier return
3. **ISSUE 3**: Fix supplier return rejection sign — causes permanent double-deduction
4. **ISSUE 2**: Fix customer return create to use `update_product_stock` — prevents race conditions
5. **ISSUE 9**: Fix customer return approve/reject stock logic — prevents phantom stock changes
6. **ISSUE 5**: Fix `get_new_stock` to use business date — improves stock report accuracy
7. **ISSUE 7**: Fix supplier return quantity to float — prevents decimal truncation
8. **ISSUE 6, 11**: Fix movement type labeling for customer returns in sale update paths
9. **ISSUE 8**: Evaluate auto-zero behavior in closing stock
10. **ISSUE 12, 13, 14, 15**: Low-priority cleanup items
