# Till Float & Carry Forward — How It Works

## Overview

The **Till Float** is the fixed amount of cash kept in the drawer at all times (e.g. £150). It is set once by an admin and automatically handled in the Daily Summary every business day — no manual entry required.

---

## The Logic

| Day | Carry Forward (from prev day) | Till Float (deducted) | Net Impact on Banking |
|-----|-------------------------------|----------------------|-----------------------|
| Day 1 (first ever) | £0 | -£150 | **-£150** |
| Day 2 | +£150 | -£150 | **£0** |
| Day 3 | +£150 | -£150 | **£0** |
| Day N | +£150 | -£150 | **£0** |

- **Day 1 only**: the till float is deducted from Total Banking (the cash stays in the drawer, not banked).
- **Every subsequent day**: the previous day's float is added back (carry forward) and the current day's float is deducted — net effect is zero.
- If the till float is changed (e.g. from £150 to £160), previous days retain their recorded £150, and future days use £160.

---

## Formula

```
Net Till Float = Carry Forward (prev day's float) - Current Till Float

Total Banking =
    Total Cash Sales
  + Total Cheque
  + Account Paid Cash (Backdate)
  + Net Till Float          ← negative on day 1, zero after
  - Supplier Payments (Paid Out)
  - Expense Payments (Paid Out)
```

---

## Example

**Setup**: Till Float = £150

### Day 1 (first business day)
- Cash Sales: £500
- No previous day → Carry Forward = £0
- Net Till Float = £0 - £150 = **-£150**
- Total Banking = £500 + (-£150) = **£350**
- CashCarryForward record saved: `{date: Day1, pounds: 150}`

### Day 2
- Cash Sales: £400
- Previous day's float = £150 → Carry Forward = £150
- Net Till Float = £150 - £150 = **£0**
- Total Banking = £400 + £0 = **£400**
- CashCarryForward record saved: `{date: Day2, pounds: 150}`

### Admin changes float to £160 on Day 3
- Cash Sales: £450
- Previous day's float (Day 2) = £150 → Carry Forward = £150
- Net Till Float = £150 - £160 = **-£10**
- Total Banking = £450 + (-£10) = **£440**
- CashCarryForward record saved: `{date: Day3, pounds: 160}`

### Day 4 (float is now £160)
- Cash Sales: £420
- Previous day's float (Day 3) = £160 → Carry Forward = £160
- Net Till Float = £160 - £160 = **£0**
- Total Banking = £420 + £0 = **£420**

---

## Implementation Details

### Database

- `system_settings.till_float` — stores the current till float amount (set by admin, one column).
- `cash_carry_forward` — existing table, now auto-populated by the daily summary endpoint. Stores each day's till float so the next day can carry it forward correctly even if the setting changes.

### Backend Changes

**`backend/models.py`**
- Added `till_float = db.Column(db.Numeric(10, 2), default=0)` to `SystemSettings`.
- `to_dict()` returns `tillFloat`.

**`backend/schemas.py`**
- Added `till_float: float = Field(default=0)` to `SystemSettingsSchema`.

**`backend/app.py`**
1. **Startup migration** — adds `till_float` column to `system_settings` if it doesn't exist.
2. **`PUT /api/settings`** — maps `tillFloat` → `till_float`.
3. **Daily Summary endpoint** (both main and PDF) — replaces manual `CashCarryForward` lookup with:
   - Read `till_float` from `SystemSettings`.
   - Find the previous business date (last date with any sales).
   - Look up that date's `CashCarryForward` record to get the carry forward amount.
   - Calculate `net_till_float = carry_forward - till_float`.
   - Auto-save today's till float to `CashCarryForward` so tomorrow can use it.
   - Use `+ net_till_float` in the banking total formula.

### Frontend Changes

**`client/src/pages/admin/admin-functions.tsx`**
- Added "Till Float" settings card (admin only).
- Loads current value from `GET /api/settings` on mount.
- Saves via `PUT /api/settings` with `{ tillFloat: value }`.

---

## Key Behaviours

- **Set once, works forever** — no daily manual entry needed.
- **Changing the float mid-operation** — previous days keep their recorded value; the transition day sees a small one-off difference (the delta between old and new float), and from the day after it normalises to zero again.
- **First day detection** — if no previous business day exists in the sales table, carry forward is £0 and the full till float is deducted.
- **CashCarryForward table** — still used as a historical record of what the till float was on each day, enabling accurate carry forward even when the setting changes.
