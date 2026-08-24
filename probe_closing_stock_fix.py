import os
import sys
from datetime import date

DB_PATH = '/home/ubuntu/SalesMasterDashboard/stock-audit-closing-fix.db'
os.environ['DATABASE_URL'] = f'sqlite:////{DB_PATH.lstrip("/")}'
sys.path.insert(0, '/home/ubuntu/SalesMasterDashboard/backend')

from app import app, db
from flask_jwt_extended import create_access_token
from models import RegularProduct, ClosingStock, StockMovement

DAY = date.today().strftime('%Y-%m-%d')

def current_stock(product_id):
    return float(RegularProduct.query.get(product_id).current_stock)

def request(client, method, url, payload, token):
    db.session.remove()
    response = getattr(client, method)(url, json=payload, headers={'Authorization': f'Bearer {token}'})
    db.session.remove()
    if response.status_code >= 400:
        raise AssertionError(f'{method.upper()} {url}: {response.status_code} {response.get_json()}')
    return response.get_json()

def check(label, actual, expected):
    if abs(actual - expected) > 0.001:
        raise AssertionError(f'{label}: actual={actual}, expected={expected}')
    print(f'PASS {label}: {actual}')

with app.app_context():
    for model in [StockMovement, ClosingStock, RegularProduct]:
        model.query.delete()
    db.session.commit()
    product = RegularProduct(product_code='CLOSE-FIX', description='Closing Fix Product', initial_stock=100, current_stock=100, status='active')
    db.session.add(product)
    db.session.commit()
    product_id = product.id
    token = create_access_token(identity='1')
    client = app.test_client()

    payload = {'date': DAY, 'items': [{'productId': product_id, 'productType': 'regular', 'quantity': 80}]}
    request(client, 'post', '/api/closing-stock', payload, token)
    check('closing save to 80', current_stock(product_id), 80)
    movement = StockMovement.query.filter_by(movement_type='closing_stock_adjustment').one()
    closing = ClosingStock.query.filter_by(product_id=product_id, product_type='regular').one()
    if movement.reference_id != closing.id:
        raise AssertionError(f'movement reference_id={movement.reference_id}, closing_id={closing.id}')
    print('PASS closing movement linked:', movement.reference_id)

    payload['items'][0]['quantity'] = 70
    request(client, 'post', '/api/closing-stock', payload, token)
    check('closing overwrite to 70', current_stock(product_id), 70)
    if StockMovement.query.filter_by(movement_type='closing_stock_adjustment').count() != 2:
        raise AssertionError('expected two linked closing adjustment movements after overwrite')
    print('PASS repeated closing adjustment count: 2')

    request(client, 'post', '/api/closing-stock/delete', {
        'date': DAY, 'productId': product_id, 'productType': 'regular'
    }, token)
    check('closing delete restores pre-save stock', current_stock(product_id), 100)
    if ClosingStock.query.filter_by(product_id=product_id, product_type='regular').count() != 0:
        raise AssertionError('closing row still exists after delete')
    if StockMovement.query.filter_by(movement_type='closing_stock_adjustment').count() != 0:
        raise AssertionError('closing adjustment movements still exist after delete')
    reversal_count = StockMovement.query.filter_by(movement_type='closing_stock_reversal').count()
    if reversal_count != 1:
        raise AssertionError(f'expected one reversal movement, got {reversal_count}')
    print('PASS closing reversal movement count:', reversal_count)

    # Legacy compatibility: simulate the pre-E6 NULL reference_id format.
    legacy_product = RegularProduct(product_code='CLOSE-LEGACY', description='Legacy Closing Fix Product', initial_stock=100, current_stock=80, status='active')
    db.session.add(legacy_product)
    db.session.flush()
    legacy_closing = ClosingStock(product_id=legacy_product.id, product_type='regular', date=date.today(), quantity=80, manual_entry=True)
    legacy_movement = StockMovement(
        product_id=legacy_product.id, product_type='regular', movement_type='closing_stock_adjustment',
        quantity=-20, reference_id=None, reference_type='closing_stock', previous_stock=100,
        new_stock=80, movement_date=date.today(), remarks='Legacy closing adjustment'
    )
    db.session.add_all([legacy_closing, legacy_movement])
    db.session.commit()
    request(client, 'post', '/api/closing-stock/delete', {
        'date': DAY, 'productId': legacy_product.id, 'productType': 'regular'
    }, token)
    check('legacy closing delete restores stock', current_stock(legacy_product.id), 100)
    print('ALL_CLOSING_STOCK_FIX_PROBES_PASSED')
