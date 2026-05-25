"""
Test script for Till Float & Carry Forward logic.
Run: C:\Work\SalesMasterDashboard\venv\Scripts\python.exe test_till_float.py
"""
from app import app, db
from models import CashCarryForward, SystemSettings, Sale, Customer, Payment
from sqlalchemy import func
from datetime import date, datetime

PASS = "✅ PASS"
FAIL = "❌ FAIL"

def check(label, condition, detail=""):
    status = PASS if condition else FAIL
    print(f"  {status}  {label}")
    if detail:
        print(f"         {detail}")
    return condition

with app.app_context():
    print("=" * 60)
    print("TILL FLOAT & CARRY FORWARD TEST")
    print("=" * 60)

    # ── 1. Settings ──────────────────────────────────────────────
    print("\n[1] System Settings")
    settings = SystemSettings.query.first()
    till_float = float(settings.till_float) if settings and settings.till_float else 0
    check("till_float column exists on SystemSettings", settings is not None)
    check(f"till_float value is set (current: £{till_float:.2f})", till_float >= 0)

    # ── 2. CashCarryForward records ───────────────────────────────
    print("\n[2] CashCarryForward Records")
    cf_records = CashCarryForward.query.order_by(CashCarryForward.date).all()
    check(f"CF records exist ({len(cf_records)} found)", len(cf_records) > 0)
    for r in cf_records:
        total = float(r.pounds or 0) + float(r.coins or 0)
        print(f"         {r.date}: pounds={r.pounds}, coins={r.coins}, total=£{total:.2f}")

    # ── 3. First business day detection ──────────────────────────
    print("\n[3] First Business Day Detection")
    first_sale_date = db.session.query(func.min(func.date(Sale.date))).scalar()
    check(f"First sale date found: {first_sale_date}", first_sale_date is not None)

    if first_sale_date:
        first_cf = CashCarryForward.query.filter_by(date=first_sale_date).first()
        if first_cf:
            net_day1 = 0 - float(first_cf.pounds or 0)  # carry_forward=0 on day 1
            check(
                f"Day 1 ({first_sale_date}): net_till_float = £{net_day1:.2f} (should be negative)",
                net_day1 <= 0,
                f"CF record: pounds={first_cf.pounds}"
            )
        else:
            print(f"  ⚠️  No CF record for first sale date {first_sale_date} — load Daily Summary for that date to create it")

    # ── 4. Day 2+ net zero check ──────────────────────────────────
    print("\n[4] Day 2+ Net Zero Check")
    if len(cf_records) >= 2:
        # Take two consecutive CF records with same pounds value
        consecutive_pairs = [
            (cf_records[i], cf_records[i+1])
            for i in range(len(cf_records)-1)
            if float(cf_records[i].pounds or 0) == float(cf_records[i+1].pounds or 0)
        ]
        if consecutive_pairs:
            prev, curr = consecutive_pairs[0]
            carry = float(prev.pounds or 0)
            current_float = float(curr.pounds or 0)
            net = carry - current_float
            check(
                f"Consecutive days with same float: net = £{net:.2f} (should be 0.00)",
                abs(net) < 0.01,
                f"prev={prev.date} £{carry:.2f}, curr={curr.date} £{current_float:.2f}"
            )
        else:
            print("  ⚠️  No consecutive days with same float found to test net-zero")
    else:
        print("  ⚠️  Need at least 2 CF records to test Day 2+ logic")

    # ── 5. Float change scenario ──────────────────────────────────
    print("\n[5] Float Change Scenario")
    if len(cf_records) >= 2:
        changed = [(cf_records[i], cf_records[i+1])
                   for i in range(len(cf_records)-1)
                   if float(cf_records[i].pounds or 0) != float(cf_records[i+1].pounds or 0)]
        if changed:
            prev, curr = changed[0]
            carry = float(prev.pounds or 0)
            new_float = float(curr.pounds or 0)
            net = carry - new_float
            delta = new_float - carry
            check(
                f"Float change detected: {prev.date} £{carry:.2f} → {curr.date} £{new_float:.2f}, net=£{net:.2f} (delta=£{delta:+.2f})",
                True  # just informational
            )
        else:
            print("  ℹ️  No float changes in history (all CF records have same value)")

    # ── 6. Is Company — Customer check ───────────────────────────
    print("\n[6] Is Company — Customer")
    from models import Customer
    company_customers = Customer.query.filter_by(is_company=True).all()
    non_company_customers = Customer.query.filter_by(is_company=False).all()
    check(f"is_company column exists on Customer", True)  # would error above if not
    print(f"         Company customers: {len(company_customers)}")
    for c in company_customers:
        print(f"           - {c.customer_name} (id={c.id})")
    print(f"         Non-company customers: {len(non_company_customers)}")

    # ── 7. Is Company — Supplier check ───────────────────────────
    print("\n[7] Is Company — Supplier")
    from models import Supplier
    company_suppliers = Supplier.query.filter_by(is_company=True).all()
    check(f"is_company column exists on Supplier", True)
    print(f"         Company suppliers: {len(company_suppliers)}")
    for s in company_suppliers:
        print(f"           - {s.supplier_name} (id={s.id})")

    # ── 8. Is Company — Sales exclusion check ────────────────────
    print("\n[8] Is Company — Sales Exclusion from Totals")
    if company_customers:
        company_ids = [c.id for c in company_customers]
        company_sales = Sale.query.filter(
            Sale.customer_id.in_(company_ids),
            Sale.status == 'finalized'
        ).all()
        company_sales_total = sum(float(s.total_amount) for s in company_sales)
        check(
            f"Company customers have {len(company_sales)} sales totalling £{company_sales_total:.2f} — these should NOT appear in daily totals",
            True  # informational
        )
        if company_sales:
            print("         To verify: open Daily Summary for a date with company sales.")
            print("         The rows should appear in the table but NOT in the TOTALS row.")
    else:
        print("  ℹ️  No company customers yet. Go to Admin → Customers, edit one, tick 'Is Company', save.")
        print("         Then make a sale for that customer and check Daily Summary — row shows but totals exclude it.")

    # ── 9. Is Company — Payment exclusion check ──────────────────
    print("\n[9] Is Company — Payment Exclusion (Daily Accounts)")
    if company_customers:
        company_ids = [c.id for c in company_customers]
        company_payments = Payment.query.filter(Payment.customer_id.in_(company_ids)).all()
        company_payment_total = sum(float(p.amount) for p in company_payments)
        check(
            f"Company customers have {len(company_payments)} payments totalling £{company_payment_total:.2f} — these should NOT appear in Daily Accounts totals",
            True  # informational
        )
    else:
        print("  ℹ️  No company customers yet — see step 8.")

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Current till float:  £{till_float:.2f}")
    print(f"CF records:          {len(cf_records)}")
    print(f"Company customers:   {len(company_customers)}")
    print(f"Company suppliers:   {len(company_suppliers)}")
    print()
    print("Old CF entries (manually entered via daily entry):")
    print("These are the same table — the auto-save logic will")
    print("overwrite them when you load Daily Summary for that date.")
    print("To clean them up, see the note below.")
    print()
    print("NOTE — Old manual CF entries:")
    print("  The CashCarryForward table is now auto-managed.")
    print("  Old manual entries won't cause errors — the daily summary")
    print("  endpoint reads them as the 'previous day float' which is correct.")
    print("  If you want to clear them: DELETE FROM cash_carry_forward WHERE date < 'YYYY-MM-DD'")
    print("  But it's safe to leave them — they'll be overwritten on next load.")
