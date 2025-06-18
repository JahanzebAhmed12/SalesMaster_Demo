from models import User, db
from werkzeug.security import generate_password_hash, check_password_hash

def get_user_by_username(username: str):
    """Get user by username"""
    return User.query.filter_by(username=username).first()

def verify_password(username: str, password: str):
    """Verify user credentials"""
    user = get_user_by_username(username)
    if user and check_password_hash(user.password, password):
        return user
    return None

def create_admin_user():
    """Create admin user if it doesn't exist"""
    admin = User.query.filter_by(username='admin').first()
    if not admin:
        admin = User(
            username='admin',
            password=generate_password_hash('admin123'),
            user_type='admin',
            status='Active'
        )
        db.session.add(admin)
        db.session.commit() 