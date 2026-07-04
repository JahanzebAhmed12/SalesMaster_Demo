import os
import json
import base64
import requests
from flask import current_app, render_template
from xhtml2pdf import pisa
import io
from datetime import datetime
from models import Company, SystemSettings

# ---------------------------------------------------------------------------
# Config file helpers (unchanged — still used by /api/email-config routes)
# ---------------------------------------------------------------------------

def load_email_config():
    config_path = os.path.join(os.path.dirname(__file__), 'instance', 'email_config.json')
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            return json.load(f)
    return None

def save_email_config(config):
    config_path = os.path.join(os.path.dirname(__file__), 'instance', 'email_config.json')
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)


# ---------------------------------------------------------------------------
# Brevo HTTP API sender (replaces Resend API)
# ---------------------------------------------------------------------------

def get_brevo_config():
    """Return (api_key, from_address) from email_config.json or env vars."""
    config = load_email_config()
    if config:
        api_key   = config.get('BREVO_API_KEY') or os.getenv('BREVO_API_KEY', '')
        from_addr = config.get('MAIL_DEFAULT_SENDER') or config.get('MAIL_EMAIL', '')
    else:
        api_key   = os.getenv('BREVO_API_KEY', '')
        from_addr = os.getenv('MAIL_DEFAULT_SENDER', os.getenv('MAIL_EMAIL', ''))
    return api_key, from_addr


def send_via_brevo(to_list, subject, html_content, text_content=None,
                   attachments=None):
    """
    Send an email via the Brevo (Sendinblue) HTTP API v3.

    Parameters
    ----------
    to_list     : list[str]  – recipient addresses
    subject     : str
    html_content: str        – HTML body
    text_content: str | None – plain-text fallback (optional)
    attachments : list[dict] – each dict: {filename, content (bytes), content_type}

    Returns
    -------
    True on success, False on failure.
    """
    api_key, from_addr = get_brevo_config()

    if not api_key:
        print('[BREVO ERROR] BREVO_API_KEY not configured in email_config.json')
        return False
    if not from_addr:
        print('[BREVO ERROR] MAIL_DEFAULT_SENDER not configured in email_config.json')
        return False

    payload = {
        'sender':      {'email': from_addr},
        'to':          [{'email': addr} for addr in to_list],
        'subject':     subject,
        'htmlContent': html_content,
    }
    if text_content:
        payload['textContent'] = text_content

    if attachments:
        payload['attachment'] = [
            {
                'name':    att['filename'],
                'content': base64.b64encode(att['content']).decode('utf-8'),
            }
            for att in attachments
        ]

    try:
        resp = requests.post(
            'https://api.brevo.com/v3/smtp/email',
            headers={
                'api-key':       api_key,
                'Content-Type':  'application/json',
            },
            json=payload,
            timeout=15,
        )
        if resp.status_code in (200, 201):
            data = resp.json()
            print(f'[BREVO SUCCESS] messageId={data.get("messageId")} to={to_list}')
            return True
        else:
            print(f'[BREVO ERROR] HTTP {resp.status_code}: {resp.text}')
            return False
    except Exception as e:
        print(f'[BREVO ERROR] Request failed: {e}')
        import traceback
        print(traceback.format_exc())
        return False


# ---------------------------------------------------------------------------
# Stub init_mail — kept so app.py's "mail = init_mail(app)" still works.
# Returns a dummy object; the real sending is done via send_via_brevo().
# ---------------------------------------------------------------------------

class _DummyMail:
    """Placeholder that satisfies "mail.send(msg)" calls that haven't been
    migrated yet, by raising a clear error instead of silently doing nothing."""
    default_sender = ''

    def send(self, msg):
        raise RuntimeError(
            'mail.send() called on the dummy mail object. '
            'Use send_via_brevo() or the dedicated send_*_email() helpers.'
        )

def init_mail(app):
    try:
        config = load_email_config()
        from_addr = ''
        if config:
            from_addr = config.get('MAIL_DEFAULT_SENDER') or config.get('MAIL_EMAIL', '')
            print(f'[EMAIL CONFIG] Mode: Brevo API')
            print(f'[EMAIL CONFIG] From: {from_addr}')
            print(f'[EMAIL CONFIG] API key configured: {bool(config.get("BREVO_API_KEY"))}')
        else:
            print('[EMAIL CONFIG] No config file — using environment variables')
        dummy = _DummyMail()
        dummy.default_sender = from_addr
        return dummy
    except Exception as e:
        print(f'[EMAIL CONFIG ERROR] {e}')
        return _DummyMail()


# ---------------------------------------------------------------------------
# HTML / PDF rendering helpers (unchanged)
# ---------------------------------------------------------------------------

def render_invoice_html(sale, customer, company=None, now=None,
                        logo_path=None, invoice_footer=None):
    if company is None:
        company = Company.query.first()
    if now is None:
        now = datetime.utcnow()
    return render_template('invoice_email.html', sale=sale, customer=customer,
                           company=company, now=now, logo_path=logo_path,
                           invoice_footer=invoice_footer)

def render_customer_statement_html(customer, statement_data, company=None,
                                   from_date=None, to_date=None,
                                   statement_type='Full Statement',
                                   logo_path=None):
    if company is None:
        company = Company.query.first()
    now = datetime.utcnow()
    return render_template('customer_statement_email.html',
                           customer=customer, statement_data=statement_data,
                           company=company,
                           from_date=from_date or now,
                           to_date=to_date or now,
                           statement_type=statement_type,
                           logo_path=logo_path, now=now)

def render_customer_history_html(customer, history_data, company=None,
                                  from_date=None, to_date=None, logo_path=None):
    if company is None:
        company = Company.query.first()
    now = datetime.utcnow()
    return render_template('customer_history_email.html',
                           customer=customer, history_data=history_data,
                           company=company,
                           from_date=from_date or now,
                           to_date=to_date or now,
                           logo_path=logo_path, now=now)

def render_purchase_invoice_html(invoice, supplier, company=None,
                                  now=None, logo_path=None):
    if company is None:
        company = Company.query.first()
    if now is None:
        now = datetime.utcnow()
    return render_template('purchase_invoice_email.html', invoice=invoice,
                           supplier=supplier, company=company, now=now,
                           logo_path=logo_path)

def render_supplier_statement_html(supplier, statement_data, company=None,
                                    from_date=None, to_date=None,
                                    statement_type='All', logo_path=None):
    if company is None:
        company = Company.query.first()
    now = datetime.utcnow()
    return render_template('supplier_statement_email.html',
                           supplier=supplier, statement_data=statement_data,
                           company=company,
                           from_date=from_date or now,
                           to_date=to_date or now,
                           statement_type=statement_type,
                           logo_path=logo_path, now=now)

def _generate_pdf(html_content):
    buf = io.BytesIO()
    status = pisa.CreatePDF(io.StringIO(html_content), dest=buf)
    if status.err:
        return None
    buf.seek(0)
    return buf.read()

generate_invoice_pdf   = _generate_pdf
generate_statement_pdf = _generate_pdf
generate_history_pdf   = _generate_pdf


# ---------------------------------------------------------------------------
# Public send_* helpers — same signatures as before, now use Brevo
# ---------------------------------------------------------------------------

def _logo_file_path():
    return os.path.join(os.path.dirname(__file__), 'static', 'printlogo.png')


def send_invoice_email(_mail_unused, recipient, sale, customer):
    try:
        company  = Company.query.first()
        settings = SystemSettings.query.first()
        footer   = getattr(settings, 'invoice_footer', '') or ''

        html = render_invoice_html(sale, customer, company,
                                   logo_path='/static/printlogo.png',
                                   invoice_footer=footer)
        pdf  = _generate_pdf(render_invoice_html(sale, customer, company,
                                                  logo_path=_logo_file_path(),
                                                  invoice_footer=footer))

        attachments = ([{'filename': f'invoice_{sale.invoice_number}.pdf',
                          'content':  pdf,
                          'content_type': 'application/pdf'}] if pdf else [])

        return send_via_brevo(
            to_list=[recipient],
            subject=f'Your Invoice #{sale.invoice_number}',
            html_content=html,
            text_content=f'Please find attached invoice #{sale.invoice_number}.',
            attachments=attachments,
        )
    except Exception as e:
        print(f'[EMAIL ERROR] send_invoice_email: {e}')
        import traceback; print(traceback.format_exc())
        return False


def send_customer_statement_email(_mail_unused, recipient, customer,
                                   statement_data, from_date, to_date,
                                   statement_type='Full Statement'):
    try:
        company = Company.query.first()
        html = render_customer_statement_html(customer, statement_data, company,
                                              from_date, to_date, statement_type,
                                              logo_path='/static/printlogo.png')
        pdf  = _generate_pdf(render_customer_statement_html(
                    customer, statement_data, company,
                    from_date, to_date, statement_type,
                    logo_path=_logo_file_path()))

        fname = (f'customer_statement_{customer.customer_name}_'
                 f'{from_date.strftime("%Y%m%d")}_{to_date.strftime("%Y%m%d")}.pdf')
        attachments = [{'filename': fname, 'content': pdf,
                         'content_type': 'application/pdf'}] if pdf else []

        return send_via_brevo(
            to_list=[recipient],
            subject=f'Customer Statement - {customer.customer_name}',
            html_content=html,
            text_content=(f'Customer statement for '
                          f'{from_date.strftime("%d/%m/%Y")} to '
                          f'{to_date.strftime("%d/%m/%Y")}.'),
            attachments=attachments,
        )
    except Exception as e:
        print(f'[EMAIL ERROR] send_customer_statement_email: {e}')
        return False


def send_customer_history_email(_mail_unused, recipient, customer,
                                 history_data, from_date, to_date):
    try:
        company = Company.query.first()
        html = render_customer_history_html(customer, history_data, company,
                                            from_date, to_date,
                                            logo_path='/static/printlogo.png')
        pdf  = _generate_pdf(render_customer_history_html(
                    customer, history_data, company,
                    from_date, to_date, logo_path=_logo_file_path()))

        fname = (f'customer_history_{customer.customer_name}_'
                 f'{from_date.strftime("%Y%m%d")}_{to_date.strftime("%Y%m%d")}.pdf')
        attachments = [{'filename': fname, 'content': pdf,
                         'content_type': 'application/pdf'}] if pdf else []

        return send_via_brevo(
            to_list=[recipient],
            subject=f'Customer History - {customer.customer_name}',
            html_content=html,
            attachments=attachments,
        )
    except Exception as e:
        print(f'[EMAIL ERROR] send_customer_history_email: {e}')
        return False


def send_purchase_invoice_email(_mail_unused, recipient, invoice, supplier):
    try:
        company = Company.query.first()
        html = render_purchase_invoice_html(invoice, supplier, company,
                                            logo_path='/static/printlogo.png')
        pdf  = _generate_pdf(render_purchase_invoice_html(
                    invoice, supplier, company, logo_path=_logo_file_path()))

        attachments = ([{'filename': f'purchase_invoice_{invoice.id}.pdf',
                          'content':  pdf,
                          'content_type': 'application/pdf'}] if pdf else [])

        return send_via_brevo(
            to_list=[recipient],
            subject=f'Purchase Invoice #{invoice.id}',
            html_content=html,
            attachments=attachments,
        )
    except Exception as e:
        print(f'[EMAIL ERROR] send_purchase_invoice_email: {e}')
        return False


def send_supplier_statement_email(_mail_unused, recipient, supplier,
                                   statement_data, from_date, to_date,
                                   statement_type='All'):
    try:
        company = Company.query.first()
        html = render_supplier_statement_html(supplier, statement_data, company,
                                              from_date, to_date, statement_type,
                                              logo_path='/static/printlogo.png')
        pdf  = _generate_pdf(render_supplier_statement_html(
                    supplier, statement_data, company,
                    from_date, to_date, statement_type,
                    logo_path=_logo_file_path()))

        fname = (f'supplier_statement_{supplier.supplier_name}_'
                 f'{from_date.strftime("%Y%m%d")}_{to_date.strftime("%Y%m%d")}.pdf')
        attachments = [{'filename': fname, 'content': pdf,
                         'content_type': 'application/pdf'}] if pdf else []

        return send_via_brevo(
            to_list=[recipient],
            subject=f'Supplier Statement - {supplier.supplier_name}',
            html_content=html,
            attachments=attachments,
        )
    except Exception as e:
        print(f'[EMAIL ERROR] send_supplier_statement_email: {e}')
        import traceback; print(traceback.format_exc())
        return False
