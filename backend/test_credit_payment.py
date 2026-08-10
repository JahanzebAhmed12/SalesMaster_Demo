"""Credit Invoice Payment Flow Test

Verifies that paying a positive invoice while also applying a credit invoice
nets correctly: the credit is applied toward the invoice's outstanding balance,
the invoice is marked paid, the credit invoice no longer appears in the
outstanding invoices list, no spurious negative Payment rows are created, and a
0-amount credit Payment row records the applied credit invoice so it shows in
the payment history.

Run (from backend/): python test_credit_payment.py
Uses an isolated test database via DATABASE_URL.
"""

import sys
import os
from datetime import datetime

import os as _os
os.environ['DATABASE_URL'] = f"sqlite:///{_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'instance', 'test_credit_payment.db')}"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db
from models import Customer, Sale, Payment

PASS = 0
FAIL = 0

def ok(text):
    global PASS
    PASS += 1
    print(f"  [PASS] {text}")

def fail(text):
    global FAIL
    FAIL += 1
    print(f"  [FAIL] {text}")

def check(cond, text):
    ok(text) if cond else fail(text)

def main():
    global PASS, FAIL
    with app.app_context():
        db.drop_all()
        db.create_all()

        # Admin user for JWT
        from models import User
        u = User(username='creditadmin', password='test', user_type='admin', status='Active')
        db.session.add(u)
        db.session.flush()
        admin_id = u.id

        # Customer
        cust = Customer(
            customer_code='CUST-CREDIT-TEST',
            customer_name='Credit Test Customer',
            telephone='000',
            running_balance=0
        )
        db.session.add(cust)
        db.session.flush()

        now = datetime(2026, 6, 15, 10, 0, 0)

        # Positive invoice: 400
        sale400 = Sale(
            invoice_number='401', customer_id=cust.id,
            customer_type='account', payment_status='pending',
            subtotal=400, total_amount=400, status='finalized',
            date=now, created_by=admin_id
        )
        db.session.add(sale400)
        db.session.flush()

        # Credit invoice: -100 (credit note as a negative-total sale)
        credit100 = Sale(
            invoice_number='402', customer_id=cust.id,
            customer_type='account', payment_status='pending',
            subtotal=-100, total_amount=-100, status='finalized',
            date=now, created_by=admin_id
        )
        db.session.add(credit100)
        db.session.flush()
        db.session.commit()

        from flask_jwt_extended import create_access_token
        token = create_access_token(identity=str(admin_id))
        client = app.test_client()
        headers = {'Authorization': f'Bearer {token}'}

        print("\n" + "=" * 70)
        print("  CREDIT INVOICE PAYMENT FLOW TEST")
        print("=" * 70)

        # ── Baseline: outstanding invoices ──────────────────────────────────
        print("\n  Baseline outstanding invoices:")
        resp = client.get(f'/api/customers/{cust.id}/outstanding_invoices', headers=headers)
        body = resp.get_json()
        ids = sorted([s['id'] for s in body])
        check(resp.status_code == 200, "GET outstanding_invoices returns 200")
        check(ids == [sale400.id, credit100.id],
              f"Baseline shows both invoices {ids} (expected {[sale400.id, credit100.id]})")

        # ── Pay 300 net: cash 300 toward 400 invoice, apply -100 credit ─────
        print("\n  Submitting payment (net 300, credit applied):")
        payload = {
            'customerId': cust.id,
            'amount': 300,
            'paymentDate': '2026-06-15',
            'splitPayment': {'cash': 300, 'card': 0, 'bankTransfer': 0, 'cheque': 0},
            'invoiceIds': [sale400.id],
            'onAccountAmount': 0,
            'remarks': 'test',
            'paymentDistribution': [
                {'invoiceId': sale400.id, 'invoiceNumber': '401', 'amount': 300, 'isOnAccount': False, 'paymentMode': 'cash'},
                {'invoiceId': credit100.id, 'invoiceNumber': '402', 'amount': -100, 'isOnAccount': False, 'paymentMode': 'cash'}
            ]
        }
        resp = client.post('/api/payments/customer-bulk', json=payload, headers=headers)
        check(resp.status_code == 201, f"POST customer-bulk returns 201 (got {resp.status_code})")
        if resp.status_code == 201:
            ok("Payment accepted")
        else:
            fail(f"Payment rejected: {resp.get_json()}")

        db.session.refresh(sale400)
        db.session.refresh(credit100)

        # ── Verify invoice 400 fully paid (300 cash + 100 credit) ───────────
        check(float(sale400.paid_amount) == 400.0,
              f"Invoice 400 paid_amount == 400 (got {sale400.paid_amount})")
        check(sale400.payment_status == 'paid',
              f"Invoice 400 payment_status == paid (got {sale400.payment_status})")

        # ── Verify credit invoice consumed ──────────────────────────────────
        check(float(credit100.paid_amount) == -100.0,
              f"Credit invoice paid_amount == -100 (got {credit100.paid_amount})")
        check(credit100.payment_status == 'paid',
              f"Credit invoice payment_status == paid (got {credit100.payment_status})")

        # ── Verify 2 Payment rows: 300 positive + 0-amount credit record ────
        payments = Payment.query.filter(Payment.customer_id == cust.id).all()
        total = sum(float(p.amount) for p in payments)
        neg = [p for p in payments if float(p.amount) < 0]
        check(len(payments) == 2,
              f"Exactly 2 Payment rows created (1 positive + 1 credit record) (got {len(payments)})")
        check(abs(total - 300.0) < 0.01, f"Total payment amount == 300 (got {total})")
        check(len(neg) == 0, f"No negative Payment rows created (got {len(neg)})")
        credit_row = [p for p in payments
                      if p.payment_type == 'credit' and p.sale_id == credit100.id]
        check(len(credit_row) == 1,
              f"A 0-amount credit Payment row links credit invoice 402 (got {len(credit_row)})")
        if credit_row:
            check(float(credit_row[0].amount) == 0.0,
                  f"Credit Payment row amount == 0 (got {credit_row[0].amount})")
            check(credit_row[0].batch_id is not None,
                  f"Credit Payment row has a batch_id (got {credit_row[0].batch_id})")

        # ── Verify payment history surfaces the credit invoice number ───────
        resp = client.get(f'/api/payments/history?customerId={cust.id}', headers=headers)
        body = resp.get_json()
        credit_in_history = [p for p in body
                             if p.get('invoiceNumber') == '402' and p.get('amount') == 0]
        check(resp.status_code == 200, "GET payment history returns 200")
        check(len(credit_in_history) == 1,
              f"Payment history contains the credit invoice 402 as a 0-amount row (got {len(credit_in_history)})")

        batch_id = credit_row[0].batch_id if credit_row else None
        if batch_id:
            resp = client.get(f'/api/payments/batch/{batch_id}', headers=headers)
            body = resp.get_json()
            invoices = body.get('invoiceNumbers', [])
            check(resp.status_code == 200, "GET payment batch returns 200")
            check('401' in invoices and '402' in invoices,
                  f"Batch invoice numbers include both 401 and 402 (got {sorted(invoices)})")

        # ── Verify outstanding invoices no longer contains either ───────────
        print("\n  Outstanding invoices after payment:")
        resp = client.get(f'/api/customers/{cust.id}/outstanding_invoices', headers=headers)
        body = resp.get_json()
        ids = sorted([s['id'] for s in body])
        check(ids == [], f"Outstanding list is empty after netting {ids} (expected [])")

        # ── Delete the batch: cash and applied credit should both revert ────
        print(f"\n  Deleting payment batch {batch_id}:")
        resp = client.delete(f'/api/payments/batch/{batch_id}', headers=headers)
        check(resp.status_code == 200,
              f"DELETE payment batch returns 200 (got {resp.status_code})")

        db.session.expire_all()
        db.session.refresh(sale400)
        db.session.refresh(credit100)

        check(float(sale400.paid_amount) == 0.0,
              f"Invoice 400 paid_amount reverted to 0 (got {sale400.paid_amount})")
        check(sale400.payment_status == 'unpaid',
              f"Invoice 400 payment_status == unpaid after delete (got {sale400.payment_status})")
        check(float(credit100.paid_amount) == 0.0,
              f"Credit invoice paid_amount reverted to 0 (got {credit100.paid_amount})")
        check(credit100.payment_status == 'unpaid',
              f"Credit invoice payment_status == unpaid after delete (got {credit100.payment_status})")

        remaining = Payment.query.filter(Payment.customer_id == cust.id).all()
        check(len(remaining) == 0,
              f"No Payment rows remain after delete (got {len(remaining)})")

        print("\n  Outstanding invoices after delete:")
        resp = client.get(f'/api/customers/{cust.id}/outstanding_invoices', headers=headers)
        body = resp.get_json()
        ids = sorted([s['id'] for s in body])
        check(ids == [sale400.id, credit100.id],
              f"Outstanding list restored for both invoices {ids} (expected {[sale400.id, credit100.id]})")

        # ── Cleanup test DB ─────────────────────────────────────────────────
        db.session.remove()
        db.engine.dispose()
        db_path = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'instance', 'test_credit_payment.db')
        if _os.path.exists(db_path):
            _os.remove(db_path)

        print("\n" + "=" * 70)
        print(f"  RESULTS: PASS={PASS} FAIL={FAIL}")
        print("=" * 70)
        return FAIL == 0


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
