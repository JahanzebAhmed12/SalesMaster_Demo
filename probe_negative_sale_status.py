import os
import sys
from datetime import date

DB_PATH = '/home/ubuntu/SalesMasterDashboard/stock-audit-negative-status.db'
os.environ['DATABASE_URL'] = f'sqlite:////{DB_PATH.lstrip("/")}'
sys.path.insert(0, '/home/ubuntu/SalesMasterDashboard/backend')

from app import app, db
from flask_jwt_extended import create_access_token
from models import RegularProduct, Customer, Sale, SaleItem, CustomerReturn, StockMovement

DAY = date.today().strftime('%Y-%m-%d')

def stock(product_id):
    return float(RegularProduct.query.get(product_id).current_stock)

def route(client, method, url, payload, token):
    db.session.remove()
    response = getattr(client, method)(url, json=payload, headers={'Authorization': f'Bearer {token}'})
    db.session.remove()
    if response.status_code >= 400:
        raise AssertionError(f'{method.upper()} {url}: {response.status_code} {response.get_json()}')
    return response.get_json()

def assert_stock(label, expected, product_id):
    actual = stock(product_id)
    if abs(actual - expected) > 0.001:
        raise AssertionError(f'{label}: actual={actual}, expected={expected}')
    print(f'PASS {label}: {actual}')

with app.app_context():
    for model in [SaleItem, Sale, CustomerReturn, StockMovement, RegularProduct, Customer]:
        model.query.delete()
    db.session.commit()
    product = RegularProduct(product_code='NEG-STATUS', description='Negative Status Product', initial_stock=100, current_stock=100, status='active')
    customer = Customer(customer_code='NEG-CUST', customer_name='Negative Status Customer')
    db.session.add_all([product, customer])
    db.session.commit()
    token = create_access_token(identity='1')
    client = app.test_client()
    product_id, customer_id = product.id, customer.id

    payload = {
        'customer_id': customer_id, 'customer_type': 'account', 'payment_status': 'pending',
        'subtotal': -30, 'porterage': 0, 'porterage_type': 'per_unit', 'porterage_rate': 0,
        'vat_rate': 0, 'vat_amount': 0, 'total_amount': -30, 'status': 'finalized', 'date': DAY,
        'items': [
            {'product_id': product_id, 'quantity': -2, 'unit_price': 10, 'total_price': -20},
            {'product_id': product_id, 'quantity': -1, 'unit_price': 10, 'total_price': -10},
        ]
    }
    sale = route(client, 'post', '/api/sales', payload, token)
    sale_id = sale['id']
    assert_stock('negative finalized sale create', 103, product_id)
    print('PASS auto customer return rows after create:', CustomerReturn.query.filter_by(sale_id=sale_id).count())

    edit_payload = dict(payload)
    edit_payload['invoice_number'] = sale['invoiceNumber']
    edit_payload['items'] = [
        {'product_id': product_id, 'quantity': -3, 'unit_price': 10, 'total_price': -30},
        {'product_id': product_id, 'quantity': -1, 'unit_price': 10, 'total_price': -10},
    ]
    edit_payload['subtotal'] = -40
    edit_payload['total_amount'] = -40
    route(client, 'put', f'/api/sales/{sale_id}', edit_payload, token)
    assert_stock('negative finalized duplicate-line edit', 104, product_id)
    print('PASS auto customer return rows after edit:', CustomerReturn.query.filter_by(sale_id=sale_id).count())

    draft_payload = dict(edit_payload)
    draft_payload['status'] = 'draft'
    route(client, 'put', f'/api/sales/{sale_id}', draft_payload, token)
    assert_stock('negative finalized to draft', 100, product_id)
    print('PASS auto customer return rows after draft:', CustomerReturn.query.filter_by(sale_id=sale_id).count())

    route(client, 'delete', f'/api/sales/{sale_id}', None, token)
    assert_stock('draft negative sale delete', 100, product_id)
    print('ALL_NEGATIVE_SALE_STATUS_PROBES_PASSED')
