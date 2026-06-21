"""
Migration: Add created_by column to payment table
Run once on the server: python migrate_payment_created_by.py
Safe to re-run — checks if column already exists before adding it.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'instance', 'salesmaster.db')

def run_migration():
    print(f"Connecting to: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if column already exists
    cursor.execute("PRAGMA table_info(payment)")
    columns = [row[1] for row in cursor.fetchall()]
    print(f"Existing payment columns: {columns}")

    if 'created_by' in columns:
        print("✅ Column 'created_by' already exists — nothing to do.")
        conn.close()
        return

    print("Adding 'created_by' column to payment table...")
    cursor.execute("""
        ALTER TABLE payment
        ADD COLUMN created_by INTEGER REFERENCES user(id)
    """)
    conn.commit()
    print("✅ Column 'created_by' added successfully.")

    # Verify
    cursor.execute("PRAGMA table_info(payment)")
    columns = [row[1] for row in cursor.fetchall()]
    print(f"Updated payment columns: {columns}")

    conn.close()
    print("Migration complete.")

if __name__ == '__main__':
    run_migration()
