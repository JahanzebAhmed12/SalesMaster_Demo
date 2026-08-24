import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

DB_PATH = '/home/ubuntu/SalesMasterDashboard/stock-audit-concurrency.db'
os.environ['DATABASE_URL'] = f'sqlite:////{DB_PATH.lstrip("/")}'
sys.path.insert(0, '/home/ubuntu/SalesMasterDashboard/backend')

from app import app, db, update_product_stock
from models import RegularProduct, StockMovement, User

with app.app_context():
    RegularProduct.query.delete()
    StockMovement.query.delete()
    db.session.commit()
    product = RegularProduct(product_code='CONCUR-001', description='Concurrency Probe', initial_stock=0, current_stock=0, status='active')
    db.session.add(product)
    db.session.commit()
    product_id = product.id

N_THREADS = 16
N_UPDATES = 20

def worker(worker_id):
    ok = 0
    failures = []
    for i in range(N_UPDATES):
        with app.app_context():
            success, result = update_product_stock(
                product_id=product_id,
                product_type='regular',
                quantity_change=1,
                movement_type='adjustment',
                reference_id=None,
                reference_type='concurrency_probe',
                remarks=f'worker={worker_id},i={i}',
                user_id=None,
            )
            if success:
                try:
                    db.session.commit()
                    ok += 1
                except Exception as exc:
                    db.session.rollback()
                    failures.append(f'commit:{exc}')
            else:
                db.session.rollback()
                failures.append(str(result))
    return ok, failures

results = []
with ThreadPoolExecutor(max_workers=N_THREADS) as pool:
    futures = [pool.submit(worker, i) for i in range(N_THREADS)]
    for future in as_completed(futures):
        results.append(future.result())

with app.app_context():
    product = RegularProduct.query.get(product_id)
    movements = StockMovement.query.filter_by(product_id=product_id, product_type='regular', reference_type='concurrency_probe').all()
    successful = sum(ok for ok, _ in results)
    failure_messages = [msg for _, failures in results for msg in failures]
    print(f'threads={N_THREADS} updates_per_thread={N_UPDATES}')
    print(f'successful_calls={successful}')
    print(f'failure_count={len(failure_messages)}')
    print(f'current_stock={float(product.current_stock)}')
    print(f'movement_rows={len(movements)}')
    print(f'movement_quantity_sum={sum(float(m.quantity) for m in movements)}')
    print(f'first_five_failures={failure_messages[:5]}')
