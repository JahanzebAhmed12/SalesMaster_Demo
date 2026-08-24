import os
import sys
from datetime import date

DB_PATH = '/home/ubuntu/SalesMasterDashboard/stock-audit-return-statuses.db'
os.environ['DATABASE_URL'] = f'sqlite:////{DB_PATH.lstrip("/")}'
sys.path.insert(0, '/home/ubuntu/SalesMasterDashboard/backend')

from app import app, db
from flask_jwt_extended import create_access_token
from models import RegularProduct, Customer, Supplier, StockMovement, CustomerReturn, SupplierReturn

TODAY = date.today().strftime('%Y-%m-%d')

def stock(product_id):
    return float(RegularProduct.query.get(product_id).current_stock)

def movements(product_id, reference_type, reference_id):
    return [
        (m.movement_type, float(m.quantity))
        for m in StockMovement.query.filter_by(
            product_id=product_id, product_type='regular',
            reference_type=reference_type, reference_id=reference_id
        ).order_by(StockMovement.id).all()
    ]

def call(client, method, url, json=None, token=None):
    return getattr(client, method)(url, json=json, headers={'Authorization': f'Bearer {token}'})

with app.app_context():
    # Isolated setup only.
    RegularProduct.query.delete()
    CustomerReturn.query.delete()
    SupplierReturn.query.delete()
    StockMovement.query.delete()
    Customer.query.delete()
    Supplier.query.delete()
    db.session.commit()

    product = RegularProduct(product_code='RET-STATUS-001', description='Return Status Probe', initial_stock=100, current_stock=100, status='active')
    customer = Customer(customer_code='RET-CUST-001', customer_name='Return Status Customer')
    supplier = Supplier(supplier_code='RET-SUP-001', supplier_name='Return Status Supplier', supplier_currency='GBP')
    db.session.add_all([product, customer, supplier])
    db.session.commit()
    product_id, customer_id, supplier_id = product.id, customer.id, supplier.id
    token = create_access_token(identity='1')
    client = app.test_client()

    def report(label, response, expected_stock=None):
        current = stock(product_id)
        print(f'{label}: http={response.status_code}, current_stock={current}, expected={expected_stock}, body={response.get_json()}')

    # Customer pending -> reject: pending create does not add, reject subtracts incorrectly.
    r = call(client, 'post', '/api/customer-returns', {
        'customerId': customer_id, 'productId': product_id, 'productType': 'regular',
        'description': 'pending customer return', 'quantity': 5, 'unitPrice': 1,
        'status': 'pending', 'date': TODAY
    }, token)
    cr_pending_id = r.get_json().get('id')
    report('customer_pending_create', r, 100)
    r = call(client, 'post', f'/api/customer-returns/{cr_pending_id}/reject', {'rejectionReason': 'probe'}, token)
    report('customer_pending_reject', r, 100)
    r = call(client, 'delete', f'/api/customer-returns/{cr_pending_id}', token=token)
    report('customer_rejected_delete', r, 100)

    # Customer pending quantity edit -> approve: update adds delta despite pending, approve adds full quantity.
    r = call(client, 'post', '/api/customer-returns', {
        'customerId': customer_id, 'productId': product_id, 'productType': 'regular',
        'description': 'editable pending customer return', 'quantity': 5, 'unitPrice': 1,
        'status': 'pending', 'date': TODAY
    }, token)
    cr_edit_id = r.get_json().get('id')
    report('customer_pending2_create', r, 100)
    r = call(client, 'put', f'/api/customer-returns/{cr_edit_id}', {
        'customerId': customer_id, 'productId': product_id, 'productType': 'regular',
        'description': 'editable pending customer return', 'quantity': 7, 'unitPrice': 1,
        'status': 'pending', 'date': TODAY
    }, token)
    report('customer_pending2_edit_5_to_7', r, 100)
    r = call(client, 'post', f'/api/customer-returns/{cr_edit_id}/approve', {}, token)
    report('customer_pending2_approve', r, 107)

    # Supplier pending -> approve: create already subtracts, approval subtracts again.
    r = call(client, 'post', '/api/supplier-returns', {
        'supplierId': supplier_id, 'productId': product_id, 'productType': 'regular',
        'description': 'pending supplier return', 'quantity': 5, 'unitPrice': 1,
        'status': 'pending', 'date': TODAY
    }, token)
    sr_pending_id = r.get_json().get('id')
    report('supplier_pending_create', r, 95)
    r = call(client, 'post', f'/api/supplier-returns/{sr_pending_id}/approve', {}, token)
    report('supplier_pending_approve', r, 95)

    # Supplier pending -> reject -> delete: reject offsets initial create; delete adds again.
    r = call(client, 'post', '/api/supplier-returns', {
        'supplierId': supplier_id, 'productId': product_id, 'productType': 'regular',
        'description': 'rejectable supplier return', 'quantity': 4, 'unitPrice': 1,
        'status': 'pending', 'date': TODAY
    }, token)
    sr_reject_id = r.get_json().get('id')
    report('supplier_pending2_create', r, 86)
    r = call(client, 'post', f'/api/supplier-returns/{sr_reject_id}/reject', {'rejectionReason': 'probe'}, token)
    report('supplier_pending2_reject', r, 86)
    r = call(client, 'delete', f'/api/supplier-returns/{sr_reject_id}', token=token)
    report('supplier_rejected_delete', r, 82)

    print('customer_pending_rejected_movements', movements(product_id, 'customer_return', cr_pending_id))
    print('customer_pending_edited_movements', movements(product_id, 'customer_return', cr_edit_id))
    print('supplier_pending_approved_movements', movements(product_id, 'supplier_return', sr_pending_id))
    print('supplier_pending_rejected_movements', movements(product_id, 'supplier_return', sr_reject_id))
