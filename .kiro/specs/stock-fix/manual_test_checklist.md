# Stock System — Manual Test Checklist

Use this alongside `test_stock_full.py` to verify every case manually in the UI.
All tests assume a fresh database. Business date starts at 2026-06-01.

---

## Setup

- [ ] Create user1 (testuser1) and user2 (testuser2)
- [ ] Create supplier1 (Fresh Farms Ltd) and supplier2 (Green Valley Co)
- [ ] Create customer1 (Test Customer A) and customer2 (Test Customer B)
- [ ] Create regular product: Casava Cr (P001)
- [ ] Create regular product: Plantain (P002)
- [ ] Create non-product: Packaging Box (NP001)
- [ ] Create non-product: Label (NP002)
- [ ] Verify all products show current_stock = 0

---

## Day 1 (2026-06-01) — Purchases

- [ ] Create purchase order from supplier1
- [ ] Create purchase invoice: 50 Casava Cr + 30 Plantain
- [ ] Create purchase order from supplier2
- [ ] Create purchase invoice: 100 Packaging Box + 200 Label
- [ ] Open Stock Check for 2026-06-01
  - [ ] Casava Cr: OS=0, NS=50, Sales=0, Stock=50
  - [ ] Plantain: OS=0, NS=30, Sales=0, Stock=30
  - [ ] Packaging Box: OS=0, NS=100, Stock=100
  - [ ] Label: OS=0, NS=200, Stock=200

---

## Day 1 — Sales

- [ ] Create sale (finalized): customer1 buys 10 Casava + 5 Plantain
- [ ] Create sale (finalized): customer2 buys 20 Packaging + 50 Label
- [ ] Stock Check 2026-06-01:
  - [ ] Casava: Sales=10, Stock=40
  - [ ] Plantain: Sales=5, Stock=25
  - [ ] Packaging: Sales=20, Stock=80
  - [ ] Label: Sales=50, Stock=150

---

## Day 1 — Customer Return (via Customer Returns page)

- [ ] Create customer return: customer1 returns 3 Casava Cr, status=completed
- [ ] Stock Check 2026-06-01:
  - [ ] Casava: C.RTN=3, Stock=43

---

## Day 1 — Supplier Return

- [ ] Create supplier return: 5 Plantain back to supplier1
- [ ] Stock Check 2026-06-01:
  - [ ] Plantain: S.RTN=5 (verify field is populated, was always 0 before Fix 2)

---

## Day 1 — Dump Entry

- [ ] Create dump: 2 Casava Cr (wastage)
- [ ] Stock Check 2026-06-01:
  - [ ] Casava: Dmps=2, Stock=41 (OS=0+NS=50-Sales=10+CRTN=3-Dmps=2=41)

---

## Day 1 — Closing Stock (Rule A)

- [ ] Go to Closing Stock page, date = 2026-06-01
- [ ] Enter: Casava=40, Plantain=25, Packaging=80, Label=150
- [ ] Save
- [ ] Stock Check 2026-06-01:
  - [ ] Casava: Cl.Stock=40, Result="short 1" (expected 41, entered 40)
  - [ ] Plantain: Cl.Stock=25, Result=✓ (expected 25)
  - [ ] Packaging: Cl.Stock=80, Result=✓
  - [ ] Label: Cl.Stock=150, Result="short 0" or ✓

---

## Day 2 (2026-06-02) — Rule A: Opening Stock from Closing Stock

- [ ] Stock Check 2026-06-02 (no activity yet):
  - [ ] Casava: OS=40 ← from Day1 closing stock
  - [ ] Plantain: OS=25 ← from Day1 closing stock
  - [ ] Packaging: OS=80
  - [ ] Label: OS=150
  - [ ] All NS=0, Sales=0, Stock=OS

---

## Day 2 — Credit Return via Negative Qty in Sale (Fix 4)

- [ ] Create sale (finalized): 8 Casava sold, -2 Casava returned (negative qty item)
- [ ] Stock Check 2026-06-02:
  - [ ] Casava: Sales=6 (net: 8 sold - 2 returned), C.RTN=2, Stock=40+0-6+2=36
  - [ ] **Before Fix 4**: C.RTN would be 0 (bug). After Fix 4: C.RTN=2 ✓

---

## Day 2 — Dump Update (Fix 3)

- [ ] Create dump: 4 Plantain
- [ ] Stock Check: Plantain Dmps=4, Stock=25-4=21
- [ ] Edit dump: change quantity from 4 to 6
- [ ] Stock Check: Plantain Dmps=6, Stock=25-6=19
  - [ ] **Before Fix 3**: Dmps would still show 4 (bug). After Fix 3: Dmps=6 ✓

---

## Day 3 (2026-06-03) — Rule B: No Closing Stock = Zero Next Day

- [ ] Do NOT enter closing stock for Day 2
- [ ] Stock Check 2026-06-03 (no activity):
  - [ ] Casava: OS=0 ← Rule B (no Day2 closing stock)
  - [ ] Plantain: OS=0
  - [ ] Packaging: OS=0
  - [ ] Label: OS=0
- [ ] Create purchase on Day3: 10 Casava
- [ ] Stock Check 2026-06-03:
  - [ ] Casava: OS=0, NS=10, Stock=10 (starts from zero)

---

## Edge Cases

### Purchase Invoice Update
- [ ] Edit purchase invoice 1: change Casava from 50 to 60
- [ ] Stock Check Day1: Casava NS=60 (not 50)

### Purchase Invoice Delete
- [ ] Create a small purchase invoice (5 Casava)
- [ ] Note NS before delete
- [ ] Delete the invoice
- [ ] Stock Check: NS reduced by 5

### Draft Sale (no stock impact)
- [ ] Create sale with status=draft
- [ ] Stock Check: Sales qty unchanged

### Delete Customer Return
- [ ] Delete the customer return created earlier
- [ ] Stock Check: C.RTN drops back to 0

### Supplier Return Delete
- [ ] Delete the supplier return
- [ ] Stock Check: S.RTN drops to 0, Plantain stock restored

### Dump Delete
- [ ] Delete the dump entry
- [ ] Stock Check: Dmps drops to 0, stock restored

---

## Business Date

- [ ] Check current business date via Settings or header
- [ ] Switch to next business date
- [ ] Verify date changed
- [ ] Reset to system date

---

## Stock Adjustment

- [ ] Go to Stock > Adjust
- [ ] Increase Casava by 5
- [ ] Decrease Casava by 3
- [ ] Verify current_stock updated in product list

---

## Summary of What Each Fix Validates

| Fix | What to check |
|-----|--------------|
| Fix 1 (Rule A) | Day2 OS = Day1 closing stock value |
| Fix 1 (Rule B) | Day3 OS = 0 when no Day2 closing stock |
| Fix 2 | Supplier return S.RTN field populated in stock check |
| Fix 3 | Dump update changes Dmps in stock check |
| Fix 4 | Negative qty sale item appears in C.RTN column |
| Fix 5 | Dump cancellation correctly reduces Dmps |
