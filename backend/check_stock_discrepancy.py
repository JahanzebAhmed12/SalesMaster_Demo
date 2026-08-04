"""Diagnostic script: Compare Stock Check calculation vs regular_products.current_stock

This script calculates expected stock using the same formula as the Stock Check Report,
then compares it against the live current_stock (used by Sales Invoice product search).
It identifies all discrepancies across the date range.
"""

import sys
import os
from datetime import datetime, timedelta, date
from decimal import Decimal

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db
from app import (
    get_opening_stock, get_new_stock, get_sales_quantity,
    get_customer_returns_quantity, get_dumps_quantity,
    get_supplier_returns_quantity, get_adjustments_quantity
)
from models import (
    RegularProduct, NonProduct, ClosingStock, StockMovement,
    SaleItem, Sale, CustomerReturn, DumpEntry, SupplierReturn
)

def safe_float(val):
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0

def check_discrepancies(from_date, to_date):
    """Compare Stock Check formula output vs current_stock for every active product."""
    print(f"{'='*100}")
    print(f"STOCK DISCREPANCY CHECK: {from_date.strftime('%Y-%m-%d')} to {to_date.strftime('%Y-%m-%d')}")
    print(f"{'='*100}")
    print()

    total_discrepancies = 0
    total_checked = 0

    # Check regular products
    products = RegularProduct.query.filter(RegularProduct.status == 'active').all()
    for p in products:
        _check_one(p.id, 'regular', p.description, from_date, to_date,
                   total_checked, total_discrepancies)

    # Check non-products
    products = NonProduct.query.filter(NonProduct.status == 'active').all()
    for p in products:
        _check_one(p.id, 'non', p.description, from_date, to_date,
                   total_checked, total_discrepancies)

    print(f"\n{'='*100}")
    print(f"SUMMARY: Checked {total_checked} products, found {total_discrepancies} discrepancies")
    print(f"{'='*100}")

def _check_one(product_id, product_type, description, from_date, to_date,
               total_checked, total_discrepancies):
    """Check a single product and print discrepancy if found."""
    opening = get_opening_stock(product_id, product_type, from_date)
    new_stk = get_new_stock(product_id, product_type, from_date, to_date)
    sales = get_sales_quantity(product_id, product_type, from_date, to_date)
    crtn = get_customer_returns_quantity(product_id, product_type, from_date, to_date)
    dmps = get_dumps_quantity(product_id, product_type, from_date, to_date)
    srtn = get_supplier_returns_quantity(product_id, product_type, from_date, to_date)
    adj = get_adjustments_quantity(product_id, product_type, from_date, to_date)
    expected = opening + new_stk - sales + crtn - dmps - srtn + adj

    # Get the live current_stock from product table
    if product_type == 'regular':
        product = RegularProduct.query.get(product_id)
    else:
        product = NonProduct.query.get(product_id)

    if not product:
        return total_checked, total_discrepancies

    current_stock = safe_float(product.current_stock)
    diff = current_stock - expected

    total_checked += 1

    if abs(diff) > 0.01:
        total_discrepancies += 1
        print(f"[DISCREPANCY] {product_type}:{product_id} - {description[:50]}")
        print(f"  Opening:{opening:>8.2f}  +Purch:{new_stk:>8.2f}  -Sales:{sales:>8.2f}  +CRtn:{crtn:>8.2f}  -Dmps:{dmps:>8.2f}  +SRtn:{srtn:>8.2f}")
        print(f"  Expected stock: {expected:>8.2f}  |  Live current_stock: {current_stock:>8.2f}  |  Difference: {diff:>+8.2f}")
        print()

    return total_checked, total_discrepancies


if __name__ == '__main__':
    # Calculate dates: from 4 days ago to today
    to_date = date.today()
    from_date = to_date - timedelta(days=4)

    with app.app_context():
        check_discrepancies(from_date, to_date)
