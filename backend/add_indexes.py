"""Create indexes on existing tables to improve query performance."""
import sys
sys.path.insert(0, r'C:\Work\SalesMasterDashboard\backend')
from app import app
from models import db

INDEXES = {
    'sale': [
        'CREATE INDEX IF NOT EXISTS ix_sale_date ON sale(date)',
        'CREATE INDEX IF NOT EXISTS ix_sale_status ON sale(status)',
        'CREATE INDEX IF NOT EXISTS ix_sale_customer_id ON sale(customer_id)',
        'CREATE INDEX IF NOT EXISTS ix_sale_created_by ON sale(created_by)',
    ],
    'sale_item': [
        'CREATE INDEX IF NOT EXISTS ix_sale_item_sale_id ON sale_item(sale_id)',
        'CREATE INDEX IF NOT EXISTS ix_sale_item_product_id ON sale_item(product_id)',
        'CREATE INDEX IF NOT EXISTS ix_sale_item_non_product_id ON sale_item(non_product_id)',
    ],
    'payment': [
        'CREATE INDEX IF NOT EXISTS ix_payment_customer_id ON payment(customer_id)',
        'CREATE INDEX IF NOT EXISTS ix_payment_sale_id ON payment(sale_id)',
        'CREATE INDEX IF NOT EXISTS ix_payment_payment_date ON payment(payment_date)',
        'CREATE INDEX IF NOT EXISTS ix_payment_payment_source ON payment(payment_source)',
    ],
    'supplier_payment': [
        'CREATE INDEX IF NOT EXISTS ix_supplier_payment_supplier_id ON supplier_payment(supplier_id)',
        'CREATE INDEX IF NOT EXISTS ix_supplier_payment_purchase_invoice_id ON supplier_payment(purchase_invoice_id)',
        'CREATE INDEX IF NOT EXISTS ix_supplier_payment_payment_date ON supplier_payment(payment_date)',
    ],
    'purchase': [
        'CREATE INDEX IF NOT EXISTS ix_purchase_supplier_id ON purchase(supplier_id)',
        'CREATE INDEX IF NOT EXISTS ix_purchase_date ON purchase(date)',
    ],
    'purchase_invoice': [
        'CREATE INDEX IF NOT EXISTS ix_purchase_invoice_purchase_id ON purchase_invoice(purchase_id)',
        'CREATE INDEX IF NOT EXISTS ix_purchase_invoice_date ON purchase_invoice(date)',
        'CREATE INDEX IF NOT EXISTS ix_purchase_invoice_supplier_id ON purchase_invoice(supplier_id)',
    ],
    'purchase_invoice_item': [
        'CREATE INDEX IF NOT EXISTS ix_purchase_invoice_item_invoice_id ON purchase_invoice_item(invoice_id)',
    ],
    'customer_return': [
        'CREATE INDEX IF NOT EXISTS ix_customer_return_date ON customer_return(date)',
        'CREATE INDEX IF NOT EXISTS ix_customer_return_customer_id ON customer_return(customer_id)',
    ],
    'customer': [
        'CREATE INDEX IF NOT EXISTS ix_customer_customer_name ON customer(customer_name)',
    ],
    'suppliers': [
        'CREATE INDEX IF NOT EXISTS ix_supplier_supplier_name ON suppliers(supplier_name)',
    ],
}

with app.app_context():
    created = 0
    skipped = 0
    for table, statements in INDEXES.items():
        for stmt in statements:
            try:
                db.session.execute(db.text(stmt))
                db.session.commit()
                created += 1
                print(f'  OK: {stmt}')
            except Exception as e:
                db.session.rollback()
                # If index already exists, skip
                if 'already exists' in str(e):
                    skipped += 1
                else:
                    print(f'  ERROR: {stmt} -> {e}')
    print(f'\nDone. Created: {created}, Skipped (already exist): {skipped}')
