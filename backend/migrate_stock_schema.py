"""DB Migration: Apply schema changes for stock system fixes

Changes:
1. Add `movement_date` column to `stock_movement` table (Date, nullable)
2. Change `previous_stock` and `new_stock` in `stock_adjustment` from Integer to Numeric(10,3)
3. Change `initial_stock` and `current_stock` in `regular_products` and `non_products` from Integer to Numeric(10,3)

SQLite does not support ALTER COLUMN / MODIFY COLUMN for type changes,
so we recreate the affected tables using the standard SQLite pattern:
  CREATE TABLE new (...) -> INSERT INTO new SELECT ... -> DROP old -> RENAME new
"""

import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db
from sqlalchemy import text, inspect

PRODUCT_COLUMNS = """id INTEGER PRIMARY KEY,
                    product_code VARCHAR(50) NOT NULL,
                    sage_code VARCHAR(50),
                    description VARCHAR(200) NOT NULL,
                    selling_price NUMERIC(10, 2),
                    tax_rate NUMERIC(5, 2),
                    vat_code VARCHAR(50),
                    unit_of_purchase VARCHAR(50),
                    unit_of_sale VARCHAR(50),
                    location VARCHAR(100),
                    nominal_code VARCHAR(50),
                    stock_category VARCHAR(50),
                    department_number VARCHAR(50),
                    supplier_ref VARCHAR(50),
                    supplier_part_number VARCHAR(50),
                    reorder_level INTEGER,
                    stock_level_flag BOOLEAN,
                    commodity_code VARCHAR(50),
                    unit_weight NUMERIC(10, 2),
                    stock_take_date DATE,
                    reorder_quantity INTEGER,
                    last_stock_take INTEGER,
                    status VARCHAR(20),
                    initial_stock NUMERIC(10, 3),
                    current_stock NUMERIC(10, 3),
                    created_at DATETIME,
                    updated_at DATETIME"""

PRODUCT_SELECT = """id, product_code, sage_code, description,
                    selling_price, tax_rate, vat_code, unit_of_purchase, unit_of_sale,
                    location, nominal_code, stock_category, department_number,
                    supplier_ref, supplier_part_number, reorder_level, stock_level_flag,
                    commodity_code, unit_weight, stock_take_date, reorder_quantity,
                    last_stock_take, status, initial_stock, current_stock,
                    created_at, updated_at"""

def migrate_product_table(table_name, has_hs_code=False):
    """Recreate a product table with Numeric(10,3) for initial_stock and current_stock."""
    extra_col = "hs_code VARCHAR(50)," if has_hs_code else ""
    extra_sel = "hs_code," if has_hs_code else ""
    try:
        with db.engine.connect() as conn:
            conn.execute(text("PRAGMA foreign_keys=OFF"))
            conn.execute(text(f"""
                CREATE TABLE {table_name}_new (
                    {extra_col}
                    {PRODUCT_COLUMNS}
                )
            """))
            conn.execute(text(f"""
                INSERT INTO {table_name}_new
                SELECT {extra_sel}
                       {PRODUCT_SELECT}
                FROM {table_name}
            """))
            conn.execute(text(f"DROP TABLE {table_name}"))
            conn.execute(text(f"ALTER TABLE {table_name}_new RENAME TO {table_name}"))
            conn.execute(text("PRAGMA foreign_keys=ON"))
            conn.commit()
        print(f"  [OK] {table_name} recreated with Numeric stock columns.")
        return True
    except Exception as e:
        print(f"  [FAIL] Failed to migrate {table_name}: {e}")
        try:
            with db.engine.connect() as conn:
                conn.execute(text(f"DROP TABLE IF EXISTS {table_name}_new"))
                conn.commit()
        except:
            pass
        return False

def column_exists(table_name, column_name):
    inspector = inspect(db.engine)
    if table_name not in inspector.get_table_names():
        return False
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns

def column_type(table_name, column_name):
    inspector = inspect(db.engine)
    for col in inspector.get_columns(table_name):
        if col['name'] == column_name:
            return str(col['type'])
    return None

def run_migration():
    print("=" * 60)
    print("STOCK SYSTEM SCHEMA MIGRATION")
    print(f"Started: {datetime.now()}")
    print("=" * 60)

    with app.app_context():
        # Migration 1: Add movement_date to stock_movement
        print()
        print("[1/3] Adding movement_date column to stock_movement...")
        if column_exists('stock_movement', 'movement_date'):
            print("  [OK] Column 'movement_date' already exists. Skipping.")
        else:
            try:
                with db.engine.connect() as conn:
                    conn.execute(
                        text("ALTER TABLE stock_movement ADD COLUMN movement_date DATE")
                    )
                    conn.commit()
                print("  [OK] Column 'movement_date' added successfully.")
            except Exception as e:
                print(f"  [FAIL] Failed to add column: {e}")
                return False

        # Migration 2: Change stock_adjustment.previous_stock + new_stock Integer -> Numeric(10,3)
        print()
        print("[2/3] Changing stock_adjustment columns to Numeric(10,3)...")
        current_type = column_type('stock_adjustment', 'previous_stock')
        if current_type and 'NUMERIC' in current_type.upper():
            print(f"  [OK] Already Numeric ({current_type}). Skipping.")
        else:
            print(f"  Current type: {current_type} -> Migrating...")
            try:
                with db.engine.connect() as conn:
                    conn.execute(text("PRAGMA foreign_keys=OFF"))
                    conn.execute(text("""
                        CREATE TABLE stock_adjustment_new (
                            id INTEGER PRIMARY KEY,
                            product_id INTEGER NOT NULL,
                            product_type VARCHAR(20) NOT NULL,
                            adjustment_type VARCHAR(20) NOT NULL,
                            quantity NUMERIC(10, 3) NOT NULL,
                            previous_stock NUMERIC(10, 3) NOT NULL,
                            new_stock NUMERIC(10, 3) NOT NULL,
                            reason VARCHAR(200) NOT NULL,
                            remarks TEXT,
                            adjustment_date DATE NOT NULL,
                            created_at DATETIME NOT NULL,
                            created_by INTEGER REFERENCES user(id)
                        )
                    """))
                    conn.execute(text("""
                        INSERT INTO stock_adjustment_new
                        SELECT id, product_id, product_type, adjustment_type,
                               quantity, previous_stock, new_stock,
                               reason, remarks, adjustment_date, created_at, created_by
                        FROM stock_adjustment
                    """))
                    conn.execute(text("DROP TABLE stock_adjustment"))
                    conn.execute(text("ALTER TABLE stock_adjustment_new RENAME TO stock_adjustment"))
                    conn.execute(text("PRAGMA foreign_keys=ON"))
                    conn.commit()
                print("  [OK] stock_adjustment table recreated with Numeric columns.")
            except Exception as e:
                print(f"  [FAIL] Failed to migrate stock_adjustment: {e}")
                try:
                    with db.engine.connect() as conn:
                        conn.execute(text("DROP TABLE IF EXISTS stock_adjustment_new"))
                        conn.commit()
                except:
                    pass
                return False

        # Migration 3: Change regular_products.initial_stock and current_stock Integer -> Numeric(10,3)
        print()
        print("[3/5] Changing regular_products stock columns to Numeric(10,3)...")
        cur_init = column_type('regular_products', 'initial_stock')
        if cur_init and 'NUMERIC' in cur_init.upper():
            print(f"  [OK] Already Numeric ({cur_init}). Skipping.")
        else:
            print(f"  Current type: {cur_init} -> Migrating...")
            if not migrate_product_table('regular_products', has_hs_code=True):
                return False

        # Migration 4: Change non_products.initial_stock and current_stock Integer -> Numeric(10,3)
        print()
        print("[4/5] Changing non_products stock columns to Numeric(10,3)...")
        cur_init = column_type('non_products', 'initial_stock')
        if cur_init and 'NUMERIC' in cur_init.upper():
            print(f"  [OK] Already Numeric ({cur_init}). Skipping.")
        else:
            print(f"  Current type: {cur_init} -> Migrating...")
            if not migrate_product_table('non_products'):
                return False

        # Backfill movement_date from created_at for existing StockMovement records
        print()
        print("  Backfilling movement_date for existing StockMovement records...")
        with db.engine.connect() as conn:
            result = conn.execute(
                text("UPDATE stock_movement SET movement_date = DATE(created_at) WHERE movement_date IS NULL")
            )
            conn.commit()
            rows_updated = result.rowcount
            print(f"  [OK] movement_date backfilled for {rows_updated} existing records.")

        # Summary
        print()
        print("=" * 60)
        print("MIGRATION SUMMARY")
        print("=" * 60)
        mv_ok = column_exists('stock_movement', 'movement_date')
        ps_ok = 'NUMERIC' in (column_type('stock_adjustment', 'previous_stock') or '').upper()
        ns_ok = 'NUMERIC' in (column_type('stock_adjustment', 'new_stock') or '').upper()
        rp_ok = 'NUMERIC' in (column_type('regular_products', 'initial_stock') or '').upper()
        np_ok = 'NUMERIC' in (column_type('non_products', 'initial_stock') or '').upper()
        print(f"  stock_movement.movement_date:            {'[OK] ADDED' if mv_ok else '[FAIL] MISSING'}")
        print(f"  stock_adjustment.previous_stock:         {'[OK] Numeric' if ps_ok else '[FAIL] Wrong type'}")
        print(f"  stock_adjustment.new_stock:              {'[OK] Numeric' if ns_ok else '[FAIL] Wrong type'}")
        print(f"  regular_products.initial_stock:          {'[OK] Numeric' if rp_ok else '[FAIL] Wrong type'}")
        print(f"  regular_products.current_stock:          {'[OK] Numeric' if rp_ok else '[FAIL] Wrong type'}")
        print(f"  non_products.initial_stock:              {'[OK] Numeric' if np_ok else '[FAIL] Wrong type'}")
        print(f"  non_products.current_stock:              {'[OK] Numeric' if np_ok else '[FAIL] Wrong type'}")

        print()
        print(f"Migration completed: {datetime.now()}")
        return mv_ok and ps_ok and ns_ok and rp_ok and np_ok

if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)
