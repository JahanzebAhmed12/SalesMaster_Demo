#!/usr/bin/env python3
"""
Migration script to add manual_entry column to closing_stock table
"""

import sqlite3
import os
from datetime import datetime

def migrate_closing_stock():
    """Add manual_entry column to closing_stock table"""
    
    # Get database path
    db_path = os.path.join(os.path.dirname(__file__), "instance", "salesmaster.db")
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if manual_entry column already exists
        cursor.execute("PRAGMA table_info(closing_stock)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'manual_entry' in columns:
            print("manual_entry column already exists in closing_stock table")
            conn.close()
            return True
        
        # Add the manual_entry column with default value True
        print("Adding manual_entry column to closing_stock table...")
        cursor.execute("""
            ALTER TABLE closing_stock 
            ADD COLUMN manual_entry BOOLEAN NOT NULL DEFAULT 1
        """)
        
        # Update all existing records to be marked as manual entries
        cursor.execute("""
            UPDATE closing_stock 
            SET manual_entry = 1 
            WHERE manual_entry IS NULL
        """)
        
        conn.commit()
        print("Successfully added manual_entry column to closing_stock table")
        print("All existing entries have been marked as manual entries")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"Error during migration: {str(e)}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        return False

if __name__ == "__main__":
    print("Starting ClosingStock table migration...")
    success = migrate_closing_stock()
    if success:
        print("Migration completed successfully!")
    else:
        print("Migration failed!")