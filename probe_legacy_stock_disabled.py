import os
import sys

DB_PATH = '/home/ubuntu/SalesMasterDashboard/stock-audit-legacy-disabled.db'
os.environ['DATABASE_URL'] = f'sqlite:////{DB_PATH.lstrip("/")}'
sys.path.insert(0, '/home/ubuntu/SalesMasterDashboard/backend')

from app import app, db
from flask_jwt_extended import create_access_token
from models import RegularProduct, CustomerReturn, SupplierReturn, DumpEntry, StockMovement

with app.app_context():
    for model in [StockMovement, CustomerReturn, SupplierReturn, DumpEntry, RegularProduct]:
        model.query.delete()
    db.session.commit()
    product = RegularProduct(product_code='LEGACY-DISABLED', description='Legacy Disabled Product', initial_stock=100, current_stock=100, status='active')
    db.session.add(product)
    db.session.commit()
    token = create_access_token(identity='1')
    client = app.test_client()

    calls = [
        ('customer_return', '/api/stock/customer-return', {'productId': product.id, 'productType': 'regular', 'quantity': 3}),
        ('dump', '/api/stock/dump', {'productId': product.id, 'productType': 'regular', 'quantity': 2}),
        ('supplier_return', '/api/stock/supplier-return', {'productId': product.id, 'productType': 'regular', 'quantity': 4}),
    ]
    for name, url, payload in calls:
        db.session.remove()
        response = client.post(url, json=payload, headers={'Authorization': f'Bearer {token}'})
        db.session.remove()
        if response.status_code != 410:
            raise AssertionError(f'{name}: expected 410, got {response.status_code} {response.get_json()}')
        print(f'PASS {name}: http={response.status_code}')

    db.session.remove()
    product = RegularProduct.query.get(product.id)
    if float(product.current_stock) != 100:
        raise AssertionError(f'current_stock changed to {product.current_stock}')
    if StockMovement.query.count() != 0:
        raise AssertionError('legacy endpoint created stock movements')
    if CustomerReturn.query.count() or DumpEntry.query.count() or SupplierReturn.query.count():
        raise AssertionError('legacy endpoint created entity rows')
    print('PASS no stock or entity mutation')
    print('ALL_LEGACY_ENDPOINT_PROBES_PASSED')
