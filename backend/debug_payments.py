type=%-15s source=%-25s sale_id=%-8s cust=%s' % (
            p.id, float(p.amount), str(p.payment_type), str(p.payment_source), sid, p.customer_name))
    print('Grand total:', sum(float(p.amount) for p in all_p))

    print()
    all_p = db.session.query(
        Payment.id, Payment.amount, Payment.payment_type, Payment.payment_source,
        Payment.sale_id, Customer.customer_name
    ).join(Customer, Payment.customer_id == Customer.id).filter(
        Payment.payment_date == target,
        Payment.payment_mode == 'cash'
    ).order_by(Payment.id).all()

    print('=== ALL cash payments on 2026-05-01 ===')
    for p in all_p:
        sid = str(p.sale_id) if p.sale_id else 'NULL'
        print('id=%-5s amt=%-10.2f     Payment.payment_type == 'on-account'
    ).order_by(Payment.id).all()

    print('=== cash + on-account payments on 2026-05-01 ===')
    total = 0
    for p in payments:
        sid = str(p.sale_id) if p.sale_id else 'NULL'
        print('id=%-5s amt=%-10.2f sale_id=%-8s source=%-25s batch=%-8s cust=%s' % (
            p.id, float(p.amount), sid, str(p.payment_source), str(p.batch_id), p.customer_name))
        total += float(p.amount)
    print('Total:', total)

    # Now ALL cash payments regardless of type
from sqlalchemy import func, or_

with app.app_context():
    target = date(2026, 5, 1)

    # All cash payments on this date with payment_type = on-account
    payments = db.session.query(
        Payment.id, Payment.amount, Payment.payment_mode,
        Payment.sale_id, Payment.payment_type, Payment.payment_source,
        Payment.batch_id, Customer.customer_name
    ).join(Customer, Payment.customer_id == Customer.id).filter(
        Payment.payment_date == target,
        Payment.payment_mode == 'cash',
    from app import app, db
from models import Payment, Customer
from datetime import date