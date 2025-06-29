import os
from flask_mail import Mail, Message
from flask import current_app, render_template
from xhtml2pdf import pisa
import io
from datetime import datetime
from models import Company

def init_mail(app):
    app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
    app.config['MAIL_PORT'] = int(os.getenv('MAIL_PORT', 587))
    app.config['MAIL_USE_TLS'] = os.getenv('MAIL_USE_TLS', 'true').lower() == 'true'
    app.config['MAIL_USE_SSL'] = os.getenv('MAIL_USE_SSL', 'false').lower() == 'true'
    app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
    app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
    app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_DEFAULT_SENDER', app.config.get('MAIL_USERNAME'))
    return Mail(app)

def render_invoice_html(sale, customer, company=None, now=None, logo_path=None):
    if company is None:
        # Get company details from database
        company = Company.query.first()
    if now is None:
        now = datetime.utcnow()
    return render_template('invoice_email.html', sale=sale, customer=customer, company=company, now=now, logo_path=logo_path)

def render_customer_statement_html(customer, statement_data, company=None, from_date=None, to_date=None, statement_type="Full Statement", logo_path=None):
    if company is None:
        company = Company.query.first()
    if from_date is None:
        from_date = datetime.utcnow()
    if to_date is None:
        to_date = datetime.utcnow()
    now = datetime.utcnow()
    return render_template('customer_statement_email.html', 
                         customer=customer, 
                         statement_data=statement_data, 
                         company=company, 
                         from_date=from_date, 
                         to_date=to_date, 
                         statement_type=statement_type, 
                         logo_path=logo_path,
                         now=now)

def render_customer_history_html(customer, history_data, company=None, from_date=None, to_date=None, logo_path=None):
    if company is None:
        company = Company.query.first()
    if from_date is None:
        from_date = datetime.utcnow()
    if to_date is None:
        to_date = datetime.utcnow()
    now = datetime.utcnow()
    return render_template('customer_history_email.html', 
                         customer=customer, 
                         history_data=history_data, 
                         company=company, 
                         from_date=from_date, 
                         to_date=to_date, 
                         logo_path=logo_path,
                         now=now)

def render_purchase_invoice_html(invoice, supplier, company=None, now=None, logo_path=None):
    if company is None:
        company = Company.query.first()
    if now is None:
        now = datetime.utcnow()
    return render_template('purchase_invoice_email.html', invoice=invoice, supplier=supplier, company=company, now=now, logo_path=logo_path)

def generate_invoice_pdf(html_content):
    pdf = io.BytesIO()
    pisa_status = pisa.CreatePDF(io.StringIO(html_content), dest=pdf)
    if pisa_status.err:
        return None
    pdf.seek(0)
    return pdf.read()

def generate_statement_pdf(html_content):
    pdf = io.BytesIO()
    pisa_status = pisa.CreatePDF(io.StringIO(html_content), dest=pdf)
    if pisa_status.err:
        return None
    pdf.seek(0)
    return pdf.read()

def generate_history_pdf(html_content):
    pdf = io.BytesIO()
    pisa_status = pisa.CreatePDF(io.StringIO(html_content), dest=pdf)
    if pisa_status.err:
        return None
    pdf.seek(0)
    return pdf.read()

def send_invoice_email(mail, recipient, sale, customer):
    # Get company details
    company = Company.query.first()
    # For email, use static URL for logo
    html_content = render_invoice_html(sale, customer, company, logo_path='/static/printlogo.png')
    # For PDF, use absolute file path for logo
    static_dir = os.path.join(os.path.dirname(__file__), 'static')
    logo_file_path = os.path.join(static_dir, 'printlogo.png')
    pdf_html_content = render_invoice_html(sale, customer, company, logo_path=logo_file_path)
    pdf_bytes = generate_invoice_pdf(pdf_html_content)
    subject = f"Your Invoice #{sale.invoice_number}"
    body = f"Dear Customer,\n\nPlease find attached your invoice #{sale.invoice_number}.\n\nThank you."
    msg = Message(subject, recipients=[recipient], body=body, html=html_content)
    if pdf_bytes:
        msg.attach(f"invoice_{sale.invoice_number}.pdf", "application/pdf", pdf_bytes)
    mail.send(msg)

def send_customer_statement_email(mail, recipient, customer, statement_data, from_date, to_date, statement_type="Full Statement"):
    """Send customer statement email with PDF attachment"""
    try:
        # Get company details
        company = Company.query.first()
        
        # For email, use static URL for logo
        html_content = render_customer_statement_html(customer, statement_data, company, from_date, to_date, statement_type, logo_path='/static/printlogo.png')
        
        # For PDF, use absolute file path for logo
        static_dir = os.path.join(os.path.dirname(__file__), 'static')
        logo_file_path = os.path.join(static_dir, 'printlogo.png')
        pdf_html_content = render_customer_statement_html(customer, statement_data, company, from_date, to_date, statement_type, logo_path=logo_file_path)
        pdf_bytes = generate_statement_pdf(pdf_html_content)
        
        subject = f"Customer Statement - {customer.customer_name}"
        body = f"Dear {customer.customer_name},\n\nPlease find attached your customer statement for the period {from_date.strftime('%d/%m/%Y')} to {to_date.strftime('%d/%m/%Y')}.\n\nThank you."
        
        msg = Message(subject, recipients=[recipient], body=body, html=html_content)
        if pdf_bytes:
            msg.attach(f"customer_statement_{customer.customer_name}_{from_date.strftime('%Y%m%d')}_{to_date.strftime('%Y%m%d')}.pdf", "application/pdf", pdf_bytes)
        
        mail.send(msg)
        return True
    except Exception as e:
        print(f"Failed to send customer statement email: {str(e)}")
        return False

def send_customer_history_email(mail, recipient, customer, history_data, from_date, to_date):
    """Send customer history email with PDF attachment"""
    try:
        # Get company details
        company = Company.query.first()
        
        # For email, use static URL for logo
        html_content = render_customer_history_html(customer, history_data, company, from_date, to_date, logo_path='/static/printlogo.png')
        
        # For PDF, use absolute file path for logo
        static_dir = os.path.join(os.path.dirname(__file__), 'static')
        logo_file_path = os.path.join(static_dir, 'printlogo.png')
        pdf_html_content = render_customer_history_html(customer, history_data, company, from_date, to_date, logo_path=logo_file_path)
        pdf_bytes = generate_history_pdf(pdf_html_content)
        
        subject = f"Customer History - {customer.customer_name}"
        body = f"Dear {customer.customer_name},\n\nPlease find attached your customer history for the period {from_date.strftime('%d/%m/%Y')} to {to_date.strftime('%d/%m/%Y')}.\n\nThank you."
        
        msg = Message(subject, recipients=[recipient], body=body, html=html_content)
        if pdf_bytes:
            msg.attach(f"customer_history_{customer.customer_name}_{from_date.strftime('%Y%m%d')}_{to_date.strftime('%Y%m%d')}.pdf", "application/pdf", pdf_bytes)
        
        mail.send(msg)
        return True
    except Exception as e:
        print(f"Failed to send customer history email: {str(e)}")
        return False

def send_purchase_invoice_email(mail, recipient, invoice, supplier):
    company = Company.query.first()
    html_content = render_purchase_invoice_html(invoice, supplier, company, logo_path='/static/printlogo.png')
    static_dir = os.path.join(os.path.dirname(__file__), 'static')
    logo_file_path = os.path.join(static_dir, 'printlogo.png')
    pdf_html_content = render_purchase_invoice_html(invoice, supplier, company, logo_path=logo_file_path)
    pdf_bytes = generate_invoice_pdf(pdf_html_content)
    subject = f"Your Purchase Invoice #{invoice.id}"
    body = f"Dear {supplier.supplier_name},\n\nPlease find attached your purchase invoice #{invoice.id}.\n\nThank you."
    msg = Message(subject, recipients=[recipient], body=body, html=html_content)
    if pdf_bytes:
        msg.attach(f"purchase_invoice_{invoice.id}.pdf", "application/pdf", pdf_bytes)
    mail.send(msg)

def send_supplier_statement_email(mail, recipient, supplier, statement_data, from_date, to_date, statement_type="All"):
    """Send supplier statement email with PDF attachment"""
    try:
        print(f"[DEBUG] Starting supplier statement email send for: {supplier.supplier_name} to {recipient}")
        
        # Get company details
        company = Company.query.first()
        print(f"[DEBUG] Company details retrieved: {company.companyName if company else 'None'}")
        
        # For email, use static URL for logo
        html_content = render_supplier_statement_html(supplier, statement_data, company, from_date, to_date, statement_type, logo_path='/static/printlogo.png')
        print(f"[DEBUG] HTML content generated, length: {len(html_content)}")
        
        # For PDF, use absolute file path for logo
        static_dir = os.path.join(os.path.dirname(__file__), 'static')
        logo_file_path = os.path.join(static_dir, 'printlogo.png')
        print(f"[DEBUG] Logo file path: {logo_file_path}")
        print(f"[DEBUG] Logo file exists: {os.path.exists(logo_file_path)}")
        
        pdf_html_content = render_supplier_statement_html(supplier, statement_data, company, from_date, to_date, statement_type, logo_path=logo_file_path)
        pdf_bytes = generate_statement_pdf(pdf_html_content)
        print(f"[DEBUG] PDF generated, size: {len(pdf_bytes) if pdf_bytes else 0} bytes")
        
        subject = f"Supplier Statement - {supplier.supplier_name}"
        body = f"Dear {supplier.supplier_name},\n\nPlease find attached your supplier statement for the period {from_date.strftime('%d/%m/%Y')} to {to_date.strftime('%d/%m/%Y')}.\n\nThank you."
        
        print(f"[DEBUG] Creating message with subject: {subject}")
        print(f"[DEBUG] Recipient: {recipient}")
        
        msg = Message(subject, recipients=[recipient], body=body, html=html_content)
        if pdf_bytes:
            attachment_name = f"supplier_statement_{supplier.supplier_name}_{from_date.strftime('%Y%m%d')}_{to_date.strftime('%Y%m%d')}.pdf"
            msg.attach(attachment_name, "application/pdf", pdf_bytes)
            print(f"[DEBUG] PDF attachment added: {attachment_name}")
        
        print(f"[DEBUG] About to send email via mail.send(msg)...")
        mail.send(msg)
        print(f"[DEBUG] Email sent successfully!")
        
        return True
    except Exception as e:
        print(f"[DEBUG] Exception occurred during email sending: {str(e)}")
        print(f"[DEBUG] Exception type: {type(e).__name__}")
        import traceback
        print(f"[DEBUG] Full traceback: {traceback.format_exc()}")
        print(f"Failed to send supplier statement email: {str(e)}")
        return False

def render_supplier_statement_html(supplier, statement_data, company=None, from_date=None, to_date=None, statement_type="All", logo_path=None):
    if company is None:
        company = Company.query.first()
    if from_date is None:
        from_date = datetime.utcnow()
    if to_date is None:
        to_date = datetime.utcnow()
    now = datetime.utcnow()
    return render_template('supplier_statement_email.html', 
                         supplier=supplier, 
                         statement_data=statement_data, 
                         company=company, 
                         from_date=from_date, 
                         to_date=to_date, 
                         statement_type=statement_type, 
                         logo_path=logo_path,
                         now=now)