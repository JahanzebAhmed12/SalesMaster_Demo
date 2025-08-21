#!/usr/bin/env python3
"""
Migration script to add running_balance column to customers table
"""

import sqlite3
import os

def add_running_balance_column():
    """Add running_balance column to customers table"""
    
    # Get the database path
    db_path = os.path.join(os.path.dirname(__file__), 'instance', 'salesmaster.db')
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if the column already exists
        cursor.execute("PRAGMA table_info(customer)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'running_balance' in columns:
            print("running_balance column already exists in customer table")
            return
        
        # Add the running_balance column
        cursor.execute("""
            ALTER TABLE customer 
            ADD COLUMN running_balance DECIMAL(12,2) DEFAULT 0
        """)
        
        # Commit the changes
        conn.commit()
        print("Successfully added running_balance column to customer table")
        
        # Update existing records to have 0 running balance
        cursor.execute("UPDATE customer SET running_balance = 0 WHERE running_balance IS NULL")
        conn.commit()
        print("Updated existing customer records with default running balance of 0")
        
    except Exception as e:
        print(f"Error adding running_balance column: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    add_running_balance_column() 