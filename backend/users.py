# Predefined users
USERS = [
    {
        "id": 1,
        "username": "admin",
        "password": "admin123",
        "role": "admin"
    },
    {
        "id": 2,
        "username": "user",
        "password": "user123",
        "role": "user"
    }
]

def get_user_by_username(username: str):
    """Get user by username"""
    return next((user for user in USERS if user["username"] == username), None)

def verify_password(username: str, password: str):
    """Verify user credentials"""
    user = get_user_by_username(username)
    if user and user["password"] == password:
        return user
    return None 