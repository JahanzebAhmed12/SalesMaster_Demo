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

def generate_invoice_pdf(html_content):
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