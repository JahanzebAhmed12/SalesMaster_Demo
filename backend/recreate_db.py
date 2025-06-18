from app import app, db
from models import *

def recreate_database():
    with app.app_context():
        # Drop all tables
        db.drop_all()
        print("Dropped all tables")
        
        # Create all tables
        db.create_all()
        print("Created all tables")
        
        # Import and run the admin user creation
        from users import create_admin_user
        create_admin_user()
        print("Created admin user")

if __name__ == "__main__":
    recreate_database() 