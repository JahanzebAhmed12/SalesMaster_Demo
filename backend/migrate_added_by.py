"""DB Migration: Add `added_by` column to `sale_items` table."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import app, db
from sqlalchemy import text, inspect

def column_exists(table, column):
    insp = inspect(db.engine)
    cols = [c['name'] for c in insp.get_columns(table)]
    return column in cols

with app.app_context():
    if not column_exists('sale_item', 'added_by'):
        db.session.execute(text('ALTER TABLE sale_item ADD COLUMN added_by VARCHAR(255)'))
        db.session.commit()
        sys.stdout.write("[OK] Added `added_by` column to `sale_item` table.\n")
    else:
        sys.stdout.write("[SKIP] `added_by` column already exists in `sale_item`.\n")
