from app import app, db
from models import Payment

def add_payment_table():
    with app.app_context():
        # Check if payment table exists
        inspector = db.inspect(db.engine)
        existing_tables = inspector.get_table_names()
        
        if 'payment' not in existing_tables:
            print("Payment table does not exist. Creating it...")
            Payment.__table__.create(db.engine)
            print("Payment table created successfully!")
        else:
            print("Payment table already exists.")

if __name__ == "__main__":
    add_payment_table() 