#!/usr/bin/env python3
"""
Fix Print Queue Table - Ensure all columns exist
"""

import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def fix_print_queue_table():
    """Fix the print_queue table to ensure all required columns exist"""
    
    # Database path
    db_path = os.path.join(os.path.dirname(__file__), 'instance', 'salesmaster.db')
    engine = create_engine(f'sqlite:///{db_path}')
    
    try:
        with engine.connect() as conn:
            # Check if print_queue table exists
            result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='print_queue'"))
            table_exists = result.fetchone() is not None
            
            if not table_exists:
                print("Creating print_queue table...")
                conn.execute(text("""
                    CREATE TABLE print_queue (
                        id VARCHAR(36) PRIMARY KEY,
                        invoice_number VARCHAR(50) NOT NULL,
                        print_type VARCHAR(20) DEFAULT 'dot_matrix',
                        status VARCHAR(20) DEFAULT 'pending',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        completed_at DATETIME,
                        print_data TEXT NOT NULL,
                        error_message TEXT,
                        created_by INTEGER,
                        device_type VARCHAR(20) DEFAULT 'mobile',
                        FOREIGN KEY (created_by) REFERENCES user (id)
                    )
                """))
                conn.commit()
                print("✅ Created print_queue table successfully")
            else:
                print("Print_queue table exists, checking columns...")
                
                # Get current table structure
                result = conn.execute(text("PRAGMA table_info(print_queue)"))
                columns = {row[1]: row[2] for row in result.fetchall()}
                print(f"Current columns: {list(columns.keys())}")
                
                # Check if device_type column exists
                if 'device_type' not in columns:
                    print("Adding missing device_type column...")
                    conn.execute(text("ALTER TABLE print_queue ADD COLUMN device_type VARCHAR(20) DEFAULT 'mobile'"))
                    conn.commit()
                    print("✅ Added device_type column")
                
                # Check if other required columns exist
                required_columns = {
                    'id': 'VARCHAR(36)',
                    'invoice_number': 'VARCHAR(50)',
                    'print_type': 'VARCHAR(20)',
                    'status': 'VARCHAR(20)',
                    'created_at': 'DATETIME',
                    'completed_at': 'DATETIME',
                    'print_data': 'TEXT',
                    'error_message': 'TEXT',
                    'created_by': 'INTEGER',
                    'device_type': 'VARCHAR(20)'
                }
                
                missing_columns = []
                for col_name, col_type in required_columns.items():
                    if col_name not in columns:
                        missing_columns.append((col_name, col_type))
                
                if missing_columns:
                    print(f"Adding missing columns: {[col[0] for col in missing_columns]}")
                    for col_name, col_type in missing_columns:
                        default_value = "DEFAULT 'pending'" if col_name == 'status' else \
                                      "DEFAULT 'dot_matrix'" if col_name == 'print_type' else \
                                      "DEFAULT 'mobile'" if col_name == 'device_type' else \
                                      "DEFAULT CURRENT_TIMESTAMP" if col_name == 'created_at' else ""
                        
                        conn.execute(text(f"ALTER TABLE print_queue ADD COLUMN {col_name} {col_type} {default_value}"))
                    conn.commit()
                    print("✅ Added all missing columns")
                else:
                    print("✅ All required columns exist")
                
    except Exception as e:
        print(f"❌ Error fixing print_queue table: {str(e)}")
        return False
    
    return True

if __name__ == "__main__":
    print("🔧 Fixing print_queue table...")
    success = fix_print_queue_table()
    if success:
        print("✅ Print queue table fix completed successfully")
    else:
        print("❌ Print queue table fix failed")
        sys.exit(1)