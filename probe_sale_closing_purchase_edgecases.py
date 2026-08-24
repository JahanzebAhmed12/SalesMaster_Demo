import os
import sys
from datetime import date

DB_PATH = '/home/ubuntu/SalesMasterDashboard/stock-audit-edgecases.db'
os.environ['DATABASE_URL'] = f'sqlite:////{DB_PATH.lstrip("/")}'
sys.path.insert(0, '/home/ubuntu/SalesMasterDashboard/backend')

from app import app, db
from flask_jwt_extended import create_access_token
from models import RegularProduct, NonProduct, Customer, Supplier, Purchase, PurchaseInvoice, PurchaseInvoiceItem, Sale, CustomerReturn, ClosingStock, StockMovement

DAY = date.today().strftime('%Y-%m-%d')

def reset():
    for model in [PurchaseInvoiceItem, PurchaseInvoice, Purchase, CustomerReturn, Sale, ClosingStock, StockMovement, RegularProduct, NonProduct, Customer, Supplier]:
        model.query.delete()
    db.session.commit()

def stock(model, product_id):
    return float(model.query.get(product_id).current_stock)

with app.app_context():
    reset()
    regular = RegularProduct(product_code='EDGE-REG', description='Edge Regular', initial_stock=100, current_stock=100, status='active')
    non = NonProduct(product_code='EDGE-NON', description='Edge Non', initial_stock=20, current_stock=20, status='active')
    customer = Customer(customer_code='EDGE-CUST', customer_name='Edge Customer')
    supplier = Supplier(supplier_code='EDGE-SUP', supplier_name='Edge Supplier', supplier_currency='GBP')
    db.session.add_all([regular, non, customer, supplier])
    db.session.commit()
    token = create_access_token(identity='1')
    client = app.test_client()

    # Negative sale: create then delete. The create path creates and relinks a CustomerReturn movement.
    sale_payload = {
        'customer_id': customer.id, 'customer_type': 'account', 'payment_status': 'pending',
        'subtotal': -30, 'porterage': 0, 'porterage_type': 'per_unit', 'porterage_rate': 0,
        'vat_rate': 0, 'vat_amount': 0, 'total_amount': -30, 'status': 'finalized', 'date': DAY,
        'items': [{'product_id': regular.id, 'quantity': -3, 'unit_price': 10, 'total_price': -30}]
    }
    response = client.post('/api/sales', json=sale_payload, headers={'Authorization': f'Bearer {token}'})
    sale_id = response.get_json().get('id') if response.is_json else None
    db.session.expire_all()
    print('negative_sale_create_http=', response.status_code, 'body=', response.get_json())
    print('negative_sale_create_stock=', stock(RegularProduct, regular.id))
    print('negative_sale_create_returns=', CustomerReturn.query.filter_by(sale_id=sale_id).count())
    print('negative_sale_create_movements=', [(m.movement_type, m.reference_type, m.reference_id, float(m.quantity)) for m in StockMovement.query.filter_by(product_id=regular.id, product_type='regular').all()])
    response = client.delete(f'/api/sales/{sale_id}', headers={'Authorization': f'Bearer {token}'})
    db.session.expire_all()
    print('negative_sale_delete_http=', response.status_code, 'body=', response.get_json())
    print('negative_sale_delete_stock=', stock(RegularProduct, regular.id), 'expected=100')
    print('negative_sale_delete_returns=', CustomerReturn.query.filter_by(sale_id=sale_id).count())
    print('negative_sale_delete_movements=', [(m.movement_type, m.reference_type, m.reference_id, float(m.quantity)) for m in StockMovement.query.filter_by(product_id=regular.id, product_type='regular').all()])

    # Closing save then delete: save creates NULL reference_id, delete cannot find it.
    response = client.post('/api/closing-stock', json={'date': DAY, 'items': [{'productId': regular.id, 'productType': 'regular', 'quantity': 80}]}, headers={'Authorization': f'Bearer {token}'})
    db.session.expire_all()
    print('closing_save_http=', response.status_code, 'stock=', stock(RegularProduct, regular.id))
    response = client.post('/api/closing-stock/delete', json={'date': DAY, 'productId': regular.id, 'productType': 'regular'}, headers={'Authorization': f'Bearer {token}'})
    db.session.expire_all()
    print('closing_delete_http=', response.status_code, 'stock=', stock(RegularProduct, regular.id), 'expected=100')
    print('closing_rows=', ClosingStock.query.filter_by(product_id=regular.id, product_type='regular', date=date.today()).count())
    print('closing_movements=', [(m.movement_type, m.reference_type, m.reference_id, float(m.quantity)) for m in StockMovement.query.filter_by(product_id=regular.id, product_type='regular').all()])

    # Purchase invoice with non-product ID equal to regular ID: backend checks regular first.
    purchase = Purchase(supplier_id=supplier.id, supplier_name=supplier.supplier_name, amount=50, date=date.today(), status='pending')
    db.session.add(purchase)
    db.session.commit()
    before_regular, before_non = stock(RegularProduct, regular.id), stock(NonProduct, non.id)
    response = client.post('/api/purchase-invoices', json={
        'purchaseId': purchase.id, 'supplierId': supplier.id,
        'items': [{'productId': non.id, 'productName': non.description, 'quantity': 5, 'unitPrice': 10, 'totalPrice': 50}]
    }, headers={'Authorization': f'Bearer {token}'})
    db.session.expire_all()
    print('non_product_purchase_http=', response.status_code)
    print('non_product_purchase_stock_regular=', stock(RegularProduct, regular.id), 'before=', before_regular)
    print('non_product_purchase_stock_non=', stock(NonProduct, non.id), 'before=', before_non)
    print('non_product_purchase_movements=', [(m.product_id, m.product_type, m.movement_type, float(m.quantity)) for m in StockMovement.query.order_by(StockMovement.id).all()])
