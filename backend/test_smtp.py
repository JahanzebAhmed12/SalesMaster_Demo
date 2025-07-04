import smtplib
import json
import os

def test_smtp_connection():
    # Load config from the same file the app uses
    config_path = os.path.join(os.path.dirname(__file__), 'instance', 'email_config.json')
    
    if not os.path.exists(config_path):
        print("❌ email_config.json not found!")
        return
    
    with open(config_path, 'r') as f:
        config = json.load(f)
    
    print("📧 Email Config:")
    print(f"   Server: {config.get('MAIL_SERVER', 'smtp.gmail.com')}")
    print(f"   Port: {config.get('MAIL_PORT', 587)}")
    print(f"   Email: {config.get('MAIL_EMAIL', 'NOT SET')}")
    print(f"   Password: {'*' * len(config.get('MAIL_PASSWORD', '')) if config.get('MAIL_PASSWORD') else 'NOT SET'}")
    print(f"   TLS: {config.get('MAIL_USE_TLS', True)}")
    print(f"   SSL: {config.get('MAIL_USE_SSL', False)}")
    
    try:
        # Test SMTP connection
        print("\n🔗 Testing SMTP connection...")
        
        server = smtplib.SMTP(config.get('MAIL_SERVER', 'smtp.gmail.com'), config.get('MAIL_PORT', 587))
        server.set_debuglevel(1)  # Show detailed connection info
        
        if config.get('MAIL_USE_TLS', True):
            print("📡 Starting TLS...")
            server.starttls()
        
        print("🔐 Attempting login...")
        server.login(config.get('MAIL_EMAIL'), config.get('MAIL_PASSWORD'))
        
        print("✅ SMTP authentication successful!")
        
        # Test sending a simple email
        print("📤 Testing email send...")
        from_email = config.get('MAIL_EMAIL')
        to_email = config.get('MAIL_EMAIL')  # Send to yourself for testing
        
        message = f"""From: {from_email}
To: {to_email}
Subject: SMTP Test

This is a test email to verify SMTP configuration.
"""
        
        server.sendmail(from_email, [to_email], message)
        print("✅ Test email sent successfully!")
        
        server.quit()
        
    except smtplib.SMTPAuthenticationError as e:
        print(f"❌ Authentication failed: {e}")
        print("\n💡 Troubleshooting tips:")
        print("   - Check if you're using an App Password (not regular password)")
        print("   - Verify the email address is correct")
        print("   - Make sure 2FA is enabled on your Google account")
        print("   - Try generating a new App Password")
        
    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    test_smtp_connection() 