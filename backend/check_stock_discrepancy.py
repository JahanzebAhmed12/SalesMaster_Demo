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

def get_opening_stock(product_id, product_type, from_date):
    """Look back up to 7 days for the last ClosingStock entry (same as stock check report)."""
    for days_back in range(1, 8):
        check_date = (from_date - timedelta(days=days_back))
        entry = ClosingStock.query.filter_by(
            product_id=product_id,
            product_type=product_type,
            date=check_date,
        ).first()
        if entry:
            return safe_float(entry.quantity)
    return 0.0

def get_new_stock(product_id, product_type, from_date, to_date):
    """Net purchases via StockMovement (same as stock check report)."""
    movements = StockMovement.query.filter(
        StockMovement.product_id == product_id,
        StockMovement.product_type == product_type,
        StockMovement.movement_type.in_(['purchase', 'purchase_reversal']),
        StockMovement.created_at >= from_date,
        StockMovement.created_at <= to_date
    ).all()
    total = 0.0
    for mov in movements:
        qty = safe_float(mov.quantity)
        if mov.movement_type == 'purchase' and qty > 0:
            total += qty
        elif mov.movement_type == 'purchase_reversal' and qty < 0:
            total += qty
    return max(0.0, total)

def get_sales_quantity(product_id, product_type, from_date, to_date):
    """Sales via SaleItem for finalized sales (same as stock check report)."""
    if product_type == 'regular':
        items = db.session.query(SaleItem).join(
            Sale, SaleItem.sale_id == Sale.id
        ).filter(
            SaleItem.product_id == product_id,
            Sale.date >= from_date,
            Sale.date <= to_date,
            Sale.status == 'finalized'
        ).all()
    else:
        items = db.session.query(SaleItem).join(
            Sale, SaleItem.sale_id == Sale.id
        ).filter(
            SaleItem.non_product_id == product_id,
            Sale.date >= from_date,
            Sale.date <= to_date,
            Sale.status == 'finalized'
        ).all()
    total = sum(abs(safe_float(item.quantity)) for item in items if item.quantity > 0)
    return max(0.0, total)

def get_customer_returns_quantity(product_id, product_type, from_date, to_date):
    """Completed customer returns (same as stock check report)."""
    returns = CustomerReturn.query.filter(
        CustomerReturn.product_id == product_id,
        CustomerReturn.product_type == product_type,
        CustomerReturn.date >= from_date,
        CustomerReturn.date <= to_date,
        CustomerReturn.status == 'completed'
    ).all()
    return sum(safe_float(r.quantity) for r in returns if r.quantity > 0)

def get_dumps_quantity(product_id, product_type, from_date, to_date):
    """All dump entries (same as stock check report)."""
    dumps = DumpEntry.query.filter(
        DumpEntry.product_id == product_id,
        DumpEntry.product_type == product_type,
        DumpEntry.date >= from_date,
        DumpEntry.date <= to_date
    ).all()
    total = sum(abs(safe_float(d.quantity)) for d in dumps)
    return max(0.0, total)

def get_supplier_returns_quantity(product_id, product_type, from_date, to_date):
    """All supplier returns (same as stock check report)."""
    returns = SupplierReturn.query.filter(
        SupplierReturn.product_id == product_id,
        SupplierReturn.product_type == product_type,
        SupplierReturn.date >= from_date,
        SupplierReturn.date <= to_date
    ).all()
    return sum(safe_float(r.quantity) for r in returns)

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
    expected = opening + new_stk - sales + crtn - dmps + srtn

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
