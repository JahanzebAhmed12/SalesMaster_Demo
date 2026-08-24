import os
import sys
from datetime import date

DB_PATH = '/home/ubuntu/SalesMasterDashboard/stock-audit-purchase-atomicity.db'
os.environ['DATABASE_URL'] = f'sqlite:////{DB_PATH.lstrip("/")}'
sys.path.insert(0, '/home/ubuntu/SalesMasterDashboard/backend')

from app import app, db
from models import Supplier, Purchase, PurchaseInvoice, PurchaseInvoiceItem, RegularProduct, StockMovement

DAY = date.today().strftime('%Y-%m-%d')

with app.app_context():
    for model in [PurchaseInvoiceItem, PurchaseInvoice, StockMovement, Purchase, RegularProduct, Supplier]:
        model.query.delete()
    db.session.commit()

    supplier = Supplier(supplier_code='ATOMIC-SUP', supplier_name='Atomic Supplier', supplier_currency='GBP')
    product = RegularProduct(product_code='ATOMIC-PROD', description='Atomic Product', initial_stock=100, current_stock=100, status='active')
    db.session.add_all([supplier, product])
    db.session.flush()
    purchase = Purchase(supplier_id=supplier.id, supplier_name=supplier.supplier_name, amount=10, date=date.today(), status='pending')
    db.session.add(purchase)
    db.session.commit()
    supplier_id, product_id, purchase_id = supplier.id, product.id, purchase.id
    client = app.test_client()

    invalid_payload = {
        'purchaseId': purchase_id, 'supplierId': supplier_id, 'date': DAY,
        'remarks': 'atomicity probe',
        'items': [
            {'productId': product_id, 'productName': 'Atomic Product', 'quantity': 10, 'unitPrice': 1, 'totalPrice': 10},
            {'productId': 999999, 'productName': 'Missing Product', 'quantity': 5, 'unitPrice': 1, 'totalPrice': 5},
        ]
    }
    response = client.post('/api/purchase-invoices', json=invalid_payload)
    print('invalid_create_http=', response.status_code)
    if response.status_code != 400:
        raise AssertionError(f'expected 400, got {response.status_code}: {response.get_json()}')
    db.session.remove()
    if float(RegularProduct.query.get(product_id).current_stock) != 100:
        raise AssertionError('stock changed after failed purchase invoice')
    if PurchaseInvoice.query.count() != 0 or PurchaseInvoiceItem.query.count() != 0:
        raise AssertionError('purchase invoice/header or item survived failed request')
    if StockMovement.query.count() != 0:
        raise AssertionError('stock movement survived failed request')
    print('PASS failed purchase rolls back header, items, stock, and movement')

    valid_payload = {
        'purchaseId': purchase_id, 'supplierId': supplier_id, 'date': DAY,
        'remarks': 'atomicity success probe',
        'items': [
            {'productId': product_id, 'productName': 'Atomic Product', 'quantity': 10, 'unitPrice': 1, 'totalPrice': 10},
        ]
    }
    response = client.post('/api/purchase-invoices', json=valid_payload)
    print('valid_create_http=', response.status_code)
    if response.status_code != 201:
        raise AssertionError(f'expected 201, got {response.status_code}: {response.get_json()}')
    db.session.remove()
    if float(RegularProduct.query.get(product_id).current_stock) != 110:
        raise AssertionError('valid purchase did not increase stock exactly once')
    if PurchaseInvoice.query.count() != 1 or PurchaseInvoiceItem.query.count() != 1 or StockMovement.query.count() != 1:
        raise AssertionError('valid purchase did not create exactly one invoice, item, and movement')
    print('PASS valid purchase commits header, item, stock, and movement together')
    print('ALL_PURCHASE_ATOMICITY_PROBES_PASSED')
