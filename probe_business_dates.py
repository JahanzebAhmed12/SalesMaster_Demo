import os
import sys
from datetime import date, datetime

DB_PATH = '/home/ubuntu/SalesMasterDashboard/stock-audit-business-dates.db'
os.environ['DATABASE_URL'] = f'sqlite:////{DB_PATH.lstrip("/")}'
sys.path.insert(0, '/home/ubuntu/SalesMasterDashboard/backend')

from app import app, db, get_new_stock
from flask_jwt_extended import create_access_token
from models import RegularProduct, StockMovement

BACKDATE = date(2026, 1, 15)
FROM = datetime(2026, 1, 1)
TO = datetime(2026, 1, 31, 23, 59, 59, 999999)

with app.app_context():
    StockMovement.query.delete()
    RegularProduct.query.delete()
    db.session.commit()
    product = RegularProduct(product_code='DATE-FIX', description='Business Date Product', initial_stock=100, current_stock=110, status='active')
    db.session.add(product)
    db.session.flush()
    movement = StockMovement(
        product_id=product.id, product_type='regular', movement_type='purchase', quantity=10,
        reference_id=1, reference_type='purchase', previous_stock=100, new_stock=110,
        movement_date=BACKDATE, created_at=datetime(2026, 2, 10, 12, 0, 0), remarks='Backdated probe'
    )
    db.session.add(movement)
    db.session.commit()
    product_id = product.id
    token = create_access_token(identity='1')
    client = app.test_client()

    business_total = get_new_stock(product_id, 'regular', FROM, TO)
    if business_total != 10:
        raise AssertionError(f'get_new_stock={business_total}, expected 10')
    print('PASS Stock Check purchase helper uses movement_date:', business_total)

    response = client.get(f'/api/stock/closing?date=2026-01-31')
    if response.status_code != 200:
        raise AssertionError(f'closing endpoint status={response.status_code}: {response.get_json()}')
    closing_row = next(row for row in response.get_json() if row['id'] == product_id and row['productType'] == 'regular')
    if float(closing_row['closingStock']) != 110:
        raise AssertionError(f'historical closing={closing_row["closingStock"]}, expected 110')
    print('PASS historical closing uses movement_date:', closing_row['closingStock'])

    response = client.get('/api/stock/movements?productId=%s&productType=regular&fromDate=2026-01-01&toDate=2026-01-31' % product_id, headers={'Authorization': f'Bearer {token}'})
    if response.status_code != 200 or len(response.get_json()) != 1:
        raise AssertionError(f'movement history response={response.status_code} rows={response.get_json()}')
    print('PASS movement history includes backdated row:', response.get_json()[0]['movementDate'])

    response = client.post('/api/stock/adjust', json={
        'productId': product_id, 'productType': 'regular', 'adjustmentType': 'increase',
        'quantity': 1, 'reason': 'Business date probe', 'adjustmentDate': '2026-01-20'
    }, headers={'Authorization': f'Bearer {token}'})
    if response.status_code != 200:
        raise AssertionError(f'adjustment status={response.status_code}: {response.get_json()}')
    db.session.remove()
    adjustment_movement = StockMovement.query.filter_by(movement_type='adjustment').order_by(StockMovement.id.desc()).first()
    if adjustment_movement.movement_date != date(2026, 1, 20):
        raise AssertionError(f'adjustment movement_date={adjustment_movement.movement_date}, expected 2026-01-20')
    print('PASS manual adjustment movement uses adjustmentDate:', adjustment_movement.movement_date)
    print('ALL_BUSINESS_DATE_PROBES_PASSED')
