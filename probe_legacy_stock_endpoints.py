import os
import sys
from datetime import date

DB_PATH = '/home/ubuntu/SalesMasterDashboard/stock-audit-legacy-endpoints.db'
os.environ['DATABASE_URL'] = f'sqlite:////{DB_PATH.lstrip("/")}'
sys.path.insert(0, '/home/ubuntu/SalesMasterDashboard/backend')

from app import app, db
from flask_jwt_extended import create_access_token
from models import RegularProduct, CustomerReturn, SupplierReturn, DumpEntry, StockMovement

with app.app_context():
    RegularProduct.query.delete()
    CustomerReturn.query.delete()
    SupplierReturn.query.delete()
    DumpEntry.query.delete()
    StockMovement.query.delete()
    db.session.commit()
    product = RegularProduct(product_code='LEGACY-001', description='Legacy Endpoint Probe', initial_stock=100, current_stock=100, status='active')
    db.session.add(product)
    db.session.commit()
    token = create_access_token(identity='1')
    client = app.test_client()

    calls = [
        ('customer_return', '/api/stock/customer-return', {'productId': product.id, 'productType': 'regular', 'quantity': 3, 'saleId': None}),
        ('dump', '/api/stock/dump', {'productId': product.id, 'productType': 'regular', 'quantity': 2}),
        ('supplier_return', '/api/stock/supplier-return', {'productId': product.id, 'productType': 'regular', 'quantity': 4, 'purchaseId': None}),
    ]
    for name, url, payload in calls:
        response = client.post(url, json=payload, headers={'Authorization': f'Bearer {token}'})
        db.session.expire_all()
        print(name, 'http=', response.status_code, 'body=', response.get_json())

    db.session.expire_all()
    product = RegularProduct.query.get(product.id)
    print('current_stock=', float(product.current_stock))
    print('customer_return_rows=', CustomerReturn.query.count())
    print('dump_rows=', DumpEntry.query.count())
    print('supplier_return_rows=', SupplierReturn.query.count())
    print('movements=', [(m.movement_type, m.reference_type, m.reference_id, float(m.quantity)) for m in StockMovement.query.order_by(StockMovement.id).all()])
