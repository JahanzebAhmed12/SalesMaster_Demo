#!/usr/bin/env python3
"""
Test script to check mail functionality
"""
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_mail_config():
    """Test mail configuration"""
    print("=== Mail Configuration Test ===")
    
    # Check required environment variables
    required_vars = [
        'MAIL_SERVER',
        'MAIL_PORT', 
        'MAIL_USERNAME',
        'MAIL_PASSWORD'
    ]
    
    config = {}
    missing_vars = []
    
    for var in required_vars:
        value = os.getenv(var)
        if value:
            config[var] = value
            # Mask password for display
            if var == 'MAIL_PASSWORD':
                print(f"{var}: {'*' * len(value)}")
            else:
                print(f"{var}: {value}")
        else:
            missing_vars.append(var)
            print(f"{var}: NOT SET")
    
    if missing_vars:
        print(f"\n❌ Missing required environment variables: {', '.join(missing_vars)}")
        print("\nPlease set these in your .env file:")
        for var in missing_vars:
            print(f"{var}=your_value_here")
        return False
    
    print("\n✅ All required mail configuration variables are set")
    return True

def test_mail_imports():
    """Test if mail dependencies can be imported"""
    print("\n=== Mail Dependencies Test ===")
    
    try:
        from flask_mail import Mail, Message
        print("✅ flask-mail imported successfully")
    except ImportError as e:
        print(f"❌ flask-mail import failed: {e}")
        print("Run: pip install flask-mail")
        return False
    
    try:
        from xhtml2pdf import pisa
        print("✅ xhtml2pdf imported successfully")
    except ImportError as e:
        print(f"❌ xhtml2pdf import failed: {e}")
        print("Run: pip install xhtml2pdf")
        return False
    
    return True

def test_mail_utils():
    """Test mail_utils module"""
    print("\n=== Mail Utils Test ===")
    
    try:
        from mail_utils import init_mail, send_invoice_email
        print("✅ mail_utils imported successfully")
    except ImportError as e:
        print(f"❌ mail_utils import failed: {e}")
        return False
    
    try:
        from flask import Flask
        app = Flask(__name__)
        mail = init_mail(app)
        print("✅ Mail system initialized successfully")
    except Exception as e:
        print(f"❌ Mail initialization failed: {e}")
        return False
    
    return True

def main():
    """Run all tests"""
    print("SalesMaster Dashboard - Mail Functionality Test")
    print("=" * 50)
    
    # Test 1: Configuration
    config_ok = test_mail_config()
    
    # Test 2: Dependencies
    deps_ok = test_mail_imports()
    
    # Test 3: Mail utils
    utils_ok = test_mail_utils()
    
    print("\n" + "=" * 50)
    print("SUMMARY:")
    print(f"Configuration: {'✅ PASS' if config_ok else '❌ FAIL'}")
    print(f"Dependencies: {'✅ PASS' if deps_ok else '❌ FAIL'}")
    print(f"Mail Utils: {'✅ PASS' if utils_ok else '❌ FAIL'}")
    
    if all([config_ok, deps_ok, utils_ok]):
        print("\n🎉 All tests passed! Mail functionality should work.")
        print("\nTo test sending an email:")
        print("1. Start your Flask server")
        print("2. Create a sale with mailInvoice=true")
        print("3. Check the server logs for email status")
    else:
        print("\n❌ Some tests failed. Please fix the issues above.")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 