from flask_cors import CORS
from datetime import datetime, timedelta, time, date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import json
import logging
import os
import traceback
from logging.handlers import TimedRotatingFileHandler
from dotenv import load_dotenv
from flask import make_response
import re
import html
from models import db, User, Sale, SaleHold, Purchase, RegularProduct, NonProduct, Customer, Supplier, SystemSettings, Attendance, SaleItem, Company, Expense, Payroll, Payment, PurchaseInvoice, PurchaseInvoiceItem, SupplierPayment, StockMovement, StockAdjustment, ExpenseEntry, DumpEntry, CustomerReturn, CustomerDiscount, CustomerDiscountAudit, SupplierReturn, CashCarryForward, BankingEntry, BankingBagNumber, UserRestriction, UserBackDateOption, UserTimingRestriction, UserInvoiceRestriction, UserDailyBookType, ClosingStock, Employee, EmployeeDocument, BusinessDate, HolidayRequest, Equipment, PrintQueue, Leave, SaleEditLock, InvoiceDocumentNumber, VoidedInvoiceDocument


from schemas import (
    SaleSchema, PurchaseSchema, RegularProductSchema, NonProductSchema, CustomerSchema, SupplierSchema,
    SystemSettingsSchema, AttendanceSchema, CompanySchema, ExpenseSchema, PaymentSchema, SupplierPaymentSchema, StockMovementSchema, StockAdjustmentSchema, ExpenseEntrySchema, DumpEntrySchema, CustomerReturnSchema, SupplierReturnSchema, UserRestrictionSchema, EmployeeSchema, HolidayRequestSchema, EquipmentSchema
)
from models import Company, Supplier, PurchaseInvoice, PurchaseInvoiceItem, Purchase
from flask import Flask, request, jsonify, session, current_app, send_file, has_request_context
import os
import uuid
from werkzeug.utils import secure_filename
from users import verify_password, create_admin_user
from migrations.customer_discount_v1 import upgrade as upgrade_customer_discount_schema
from migrations.invoice_document_numbers_v1 import upgrade as upgrade_invoice_document_numbers_schema
from werkzeug.security import generate_password_hash, check_password_hash
from flask_migrate import Migrate
from flask_jwt_extended import create_access_token, jwt_required, JWTManager, get_jwt_identity
from calendar import monthrange
from sqlalchemy import func, or_, extract, literal
import calendar
import time
import requests
    # Generate PDF with a proper table
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import Table, TableStyle, SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from flask import render_template
from mail_utils import init_mail, send_invoice_email, send_customer_statement_email, send_customer_history_email, send_purchase_invoice_email, send_supplier_statement_email, load_email_config, save_email_config
from invoice_pdf_routes import add_pdf_routes
from export_routes import add_export_routes
from datetime import datetime, timedelta
from sqlalchemy import func, and_, or_, update, inspect, case
from sqlalchemy.exc import IntegrityError
from flask import make_response
# Load environment variables
load_dotenv()

app = Flask(__name__)

# Stock-audit logs are deliberately separate from Flask's console logger so the
# server can retain a searchable history of stock mutations and reconciliation
# calculations without mixing it with request noise.
STOCK_AUDIT_LOG_DIR = os.getenv(
    "STOCK_AUDIT_LOG_DIR",
    os.path.join(os.path.dirname(__file__), "logs"),
)
STOCK_AUDIT_LOG_PATH = os.path.join(STOCK_AUDIT_LOG_DIR, "stock-audit.log")
try:
    STOCK_AUDIT_LOG_RETENTION_DAYS = max(1, int(os.getenv("STOCK_AUDIT_LOG_RETENTION_DAYS", "30")))
except ValueError:
    STOCK_AUDIT_LOG_RETENTION_DAYS = 30

STOCK_AUDIT_LOG_LEVEL_NAME = os.getenv("STOCK_AUDIT_LOG_LEVEL", "INFO").upper()
STOCK_AUDIT_LOG_LEVEL = getattr(logging, STOCK_AUDIT_LOG_LEVEL_NAME, logging.INFO)

os.makedirs(STOCK_AUDIT_LOG_DIR, exist_ok=True)
stock_audit_logger = logging.getLogger("salesmaster.stock_audit")
stock_audit_logger.setLevel(STOCK_AUDIT_LOG_LEVEL)
stock_audit_logger.propagate = False
stock_audit_handler = next(
    (
        handler for handler in stock_audit_logger.handlers
        if isinstance(handler, TimedRotatingFileHandler)
        and getattr(handler, "baseFilename", None) == os.path.abspath(STOCK_AUDIT_LOG_PATH)
    ),
    None,
)
if stock_audit_handler is None:
    stock_audit_handler = TimedRotatingFileHandler(
        STOCK_AUDIT_LOG_PATH,
        when="midnight",
        interval=1,
        backupCount=STOCK_AUDIT_LOG_RETENTION_DAYS,
        encoding="utf-8",
        utc=True,
    )
    stock_audit_handler.setFormatter(logging.Formatter("%(message)s"))
    stock_audit_logger.addHandler(stock_audit_handler)


def stock_audit_log(event, level=logging.INFO, **fields):
    """Write one structured stock-observability event without secrets.

    Discrepancy-only mode: routine per-product / per-request success noise
    (mutations, snapshots, every stock-check row, started/completed markers)
    is dropped so the file only shows discrepancies (+ errors). The last
    operation that may have caused a discrepancy is attached to the
    discrepancy line itself via ``log_stock_discrepancy_once`` instead of
    logging every mutation.
    """
    if event in STOCK_AUDIT_NOISY_EVENTS and not event.startswith("test_"):
        return
    payload = {
        "timestamp": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
        "event": event,
        **fields,
    }
    if has_request_context():
        payload.update({
            "request_method": request.method,
            "request_path": request.path,
            "request_id": request.headers.get("X-Request-ID"),
        })
    stock_audit_logger.log(level, json.dumps(payload, sort_keys=True, default=str))


# Routine success events silenced by discrepancy-only mode. Errors /
# rejections / failures are NOT in this set so they still reach the file.
STOCK_AUDIT_NOISY_EVENTS = frozenset({
    "stock_mutation_started",
    "stock_mutation_applied",
    "stock_movement_queued",
    "stock_mutation_retry",
    "current_stock_cleanup_adjustment_started",
    "current_stock_cleanup_adjustment_applied",
    "current_stock_initialized",
    "current_stock_snapshot_started",
    "current_stock_snapshot_row",
    "current_stock_snapshot_completed",
    "current_stock_override_started",
    "current_stock_override_applied",
    "stock_check_started",
    "stock_check_products_loaded",
    "stock_check_row",
    "stock_check_completed",
    # Superseded by the merged single-line discrepancy event below.
    "current_stock_stock_check_discrepancy",
})

# (business_date_str, product_id, product_type) already written to the file
# and not yet resolved. Prevents repeat lines on every refresh while the
# discrepancy persists until closing stock is entered.
_logged_discrepancy_keys = set()
_hydrated_discrepancy_dates = set()


def _discrepancy_key(business_date_str, product_id, product_type):
    return (str(business_date_str), int(product_id), str(product_type))


def _hydrate_logged_discrepancy_keys(business_date_str):
    """Rebuild in-memory dedup state from the log file after restarts."""
    try:
        wanted = str(business_date_str)
        if wanted in _hydrated_discrepancy_dates:
            return
        path = STOCK_AUDIT_LOG_PATH
        if not os.path.exists(path):
            return
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except Exception:
                    continue
                if record.get("business_date") != wanted:
                    continue
                key = _discrepancy_key(
                    wanted, record.get("product_id"), record.get("product_type")
                )
                if record.get("event") == "stock_check_discrepancy":
                    _logged_discrepancy_keys.add(key)
                elif record.get("event") == "stock_discrepancy_resolved":
                    _logged_discrepancy_keys.discard(key)
        _hydrated_discrepancy_dates.add(wanted)
    except Exception:
        pass


def get_last_stock_operation(product_id, product_type, to_dt=None):
    """Return the last StockMovement for a product (the likely cause)."""
    try:
        query = StockMovement.query.filter_by(
            product_id=product_id, product_type=product_type
        )
        if to_dt is not None:
            to_date_only = to_dt.date() if isinstance(to_dt, datetime) else to_dt
            query = query.filter(
                (StockMovement.movement_date.is_(None))
                | (StockMovement.movement_date <= to_date_only)
            )
        movement = query.order_by(
            StockMovement.movement_date.desc(),
            StockMovement.created_at.desc(),
            StockMovement.id.desc(),
        ).first()
        if not movement:
            return None
        return {
            "movement_type": movement.movement_type,
            "reference_type": movement.reference_type,
            "reference_id": movement.reference_id,
            "quantity": safe_float(movement.quantity),
            "previous_stock": safe_float(movement.previous_stock),
            "new_stock": safe_float(movement.new_stock),
            "movement_date": movement.movement_date.isoformat()
            if movement.movement_date else None,
            "created_at": movement.created_at.isoformat()
            if movement.created_at else None,
            "created_by": movement.created_by,
            "remarks": movement.remarks,
        }
    except Exception:
        return None


def log_stock_discrepancy_once(report_id, product_id, product_type,
                               product_description, business_date_str,
                               breakdown, to_dt=None):
    """Log a discrepancy once per product per business date.

    Returns True when a new line was written, False when it was already
    logged (still unresolved) and skipped.
    """
    key = _discrepancy_key(business_date_str, product_id, product_type)
    if key in _logged_discrepancy_keys:
        return False
    last_operation = get_last_stock_operation(product_id, product_type, to_dt)
    stock_audit_log(
        "stock_check_discrepancy",
        level=logging.WARNING,
        report_id=report_id,
        business_date=str(business_date_str),
        product_id=product_id,
        product_type=product_type,
        product_description=product_description,
        last_operation=last_operation,
        **breakdown,
    )
    _logged_discrepancy_keys.add(key)
    return True


def log_stock_discrepancy_resolved_if_needed(report_id, product_id, product_type,
                                            business_date_str, closing_stock=None,
                                            current_stock=None):
    """Log a resolution line when a previously discrepant product is now clean."""
    key = _discrepancy_key(business_date_str, product_id, product_type)
    if key not in _logged_discrepancy_keys:
        return False
    stock_audit_log(
        "stock_discrepancy_resolved",
        report_id=report_id,
        business_date=str(business_date_str),
        product_id=product_id,
        product_type=product_type,
        closing_stock=closing_stock,
        current_stock=current_stock,
    )
    _logged_discrepancy_keys.discard(key)
    return True


# Configure session
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-here')  # Change this in production
META_TOKEN = os.getenv('META_TOKEN')
PHONE_NUMBER_ID = os.getenv('PHONE_NUMBER_ID')
# Configure CORS
cors_origins = ["http://localhost:5173"]
if os.getenv("FRONTEND_ORIGIN"):
    cors_origins.append(os.environ["FRONTEND_ORIGIN"])
CORS(app,
     resources={r"/api/*": {
         "origins": cors_origins,
         "methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
         "allow_headers": ["Content-Type", "Authorization"],
         "supports_credentials": True
     }})

# Handle preflight OPTIONS requests
@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = make_response()
        origin = request.headers.get("Origin")
        if origin in cors_origins:
            response.headers.add("Access-Control-Allow-Origin", origin)
        response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
        response.headers.add("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,PATCH,OPTIONS")
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response

# Database configuration
# DATABASE_URL env var allows running tests / deployments against an isolated database.
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL',
    f'sqlite:///{os.path.join(os.path.dirname(__file__), "instance", "salesmaster.db")}'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_size': 10,
    'max_overflow': 20,
    'connect_args': {
        'timeout': 60,  # Increased timeout to 60 seconds
        'check_same_thread': False,  # Allow multiple threads
        # Keep SQLite transactions enabled so request-level rollback is real.
        'cached_statements': 128,  # Cache prepared statements
    }
}

# File upload configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads', 'employee_documents')
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx', 'txt'}
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16MB

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Initialize database
db.init_app(app)
migrate = Migrate(app, db)

# Initialize mail system
mail = init_mail(app)

# Database health check function
def check_database_health():
    """Check if database is healthy and accessible"""
    try:
        # Test database connection using SQLAlchemy ORM
        from sqlalchemy import text
        db.session.execute(text("SELECT 1"))
        db.session.commit()
        return True
    except Exception as e:
        db.session.rollback()
        return False

def ensure_sale_item_highlight_column():
    """Add the row-highlight column to databases created before this feature."""
    inspector = inspect(db.engine)
    if 'sale_item' not in inspector.get_table_names():
        return
    columns = {column['name'] for column in inspector.get_columns('sale_item')}
    if 'highlighted' not in columns:
        db.session.execute(db.text(
            "ALTER TABLE sale_item ADD COLUMN highlighted BOOLEAN NOT NULL DEFAULT 0"
        ))
        db.session.commit()


def ensure_print_service_settings_columns():
    """Add print-service settings to databases created before this feature."""
    inspector = inspect(db.engine)
    if 'system_settings' not in inspector.get_table_names():
        return
    columns = {column['name'] for column in inspector.get_columns('system_settings')}
    additions = {
        'print_service_url': "VARCHAR(500) NOT NULL DEFAULT 'https://tropifruituk.net'",
        'print_service_printer_name': "VARCHAR(255) NOT NULL DEFAULT 'EPSON LQ-350 ESC/P2'",
        'print_service_poll_interval_ms': "INTEGER NOT NULL DEFAULT 10000",
    }
    changed = False
    for column_name, definition in additions.items():
        if column_name not in columns:
            db.session.execute(db.text(
                f"ALTER TABLE system_settings ADD COLUMN {column_name} {definition}"
            ))
            changed = True
    if changed:
        db.session.commit()


def _allocate_invoice_document_number():
    sequence = InvoiceDocumentNumber.query.filter_by(id=1).with_for_update().first()
    if not sequence:
        existing_numbers = []
        for (value,) in db.session.query(Sale.invoice_number).all():
            if value and str(value).strip().isdigit():
                existing_numbers.append(int(str(value).strip()))
        for model, column in (
            (CustomerReturn, CustomerReturn.document_invoice_number),
            (CustomerDiscount, CustomerDiscount.document_invoice_number),
            (VoidedInvoiceDocument, VoidedInvoiceDocument.invoice_number),
        ):
            for (value,) in db.session.query(column).all():
                if value and str(value).strip().isdigit():
                    existing_numbers.append(int(str(value).strip()))
        largest_allocation = db.session.query(func.max(InvoiceDocumentNumber.id)).scalar() or 0
        sequence = InvoiceDocumentNumber(
            id=1,
            last_number=max(max(existing_numbers, default=0), int(largest_allocation)),
        )
        db.session.add(sequence)
        db.session.flush()
    sequence.last_number += 1
    db.session.flush()
    return str(sequence.last_number)


def _record_voided_invoice_document(
    invoice_number,
    document_type,
    document_date,
    customer_name=None,
    original_invoice_number=None,
    salesman=None,
):
    number = str(invoice_number or "").strip()
    if not number or VoidedInvoiceDocument.query.filter_by(invoice_number=number).first():
        return
    db.session.add(VoidedInvoiceDocument(
        invoice_number=number,
        document_type=document_type,
        date=document_date.date() if isinstance(document_date, datetime) else document_date,
        customer_name=customer_name or "",
        original_invoice_number=original_invoice_number,
        salesman=salesman or "",
    ))


def ensure_voided_invoice_document_schema():
    inspector = inspect(db.engine)
    if not inspector.has_table(VoidedInvoiceDocument.__tablename__):
        return
    columns = {column['name'] for column in inspector.get_columns(VoidedInvoiceDocument.__tablename__)}
    if 'date_unknown' not in columns:
        db.session.execute(db.text(
            "ALTER TABLE voided_invoice_document "
            "ADD COLUMN date_unknown BOOLEAN NOT NULL DEFAULT 0"
        ))
        db.session.commit()


def _backfill_missing_invoice_document_numbers():
    occupied_numbers = set()
    for model, column in (
        (Sale, Sale.invoice_number),
        (CustomerReturn, CustomerReturn.document_invoice_number),
        (CustomerDiscount, CustomerDiscount.document_invoice_number),
        (VoidedInvoiceDocument, VoidedInvoiceDocument.invoice_number),
    ):
        for (value,) in db.session.query(column).all():
            number = str(value or '').strip()
            if number.isdigit():
                occupied_numbers.add(int(number))

    sequence = InvoiceDocumentNumber.query.filter_by(id=1).first()
    maximum = sequence.last_number if sequence else max(occupied_numbers, default=0)
    minimum = min(occupied_numbers, default=1)
    missing_numbers = [
        number for number in range(minimum, maximum + 1)
        if number not in occupied_numbers
    ]
    for number in missing_numbers:
        db.session.add(VoidedInvoiceDocument(
            invoice_number=str(number),
            document_type='unknown',
            date=date.min,
            date_unknown=True,
        ))
    if missing_numbers:
        db.session.commit()


def _backfill_deleted_customer_discount_voids():
    deleted_discounts = CustomerDiscount.query.filter(
        CustomerDiscount.is_deleted.is_(True),
    ).all()
    for discount in deleted_discounts:
        _record_voided_invoice_document(
            discount.document_invoice_number,
            "discount",
            discount.date,
            discount.customer.customer_name if discount.customer else None,
            discount.sale.invoice_number if discount.sale else None,
            discount.creator.username if discount.creator else None,
        )
    if deleted_discounts:
        db.session.commit()


def _initialize_invoice_document_numbers():
    """Seed the shared auto-increment series and number legacy adjustments."""
    existing_numbers = []
    for (value,) in db.session.query(Sale.invoice_number).all():
        if value and str(value).strip().isdigit():
            existing_numbers.append(int(str(value).strip()))
    for column in (
        CustomerReturn.document_invoice_number,
        CustomerDiscount.document_invoice_number,
        VoidedInvoiceDocument.invoice_number,
    ):
        for (value,) in db.session.query(column).all():
            if value and str(value).strip().isdigit():
                existing_numbers.append(int(str(value).strip()))

    largest_allocation = db.session.query(func.max(InvoiceDocumentNumber.id)).scalar() or 0
    largest_number = max(max(existing_numbers, default=0), int(largest_allocation))
    sequence = InvoiceDocumentNumber.query.filter_by(id=1).first()
    if not sequence:
        db.session.add(InvoiceDocumentNumber(id=1, last_number=largest_number))
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            if not InvoiceDocumentNumber.query.filter_by(id=1).first():
                raise
    elif sequence.last_number < largest_number:
        sequence.last_number = largest_number
        db.session.commit()

    negative_sale_ids = {
        sale_id for (sale_id,) in db.session.query(SaleItem.sale_id)
        .filter(SaleItem.quantity < 0)
        .distinct()
        .all()
    }
    legacy_documents = []
    for customer_return in CustomerReturn.query.filter(
        CustomerReturn.document_invoice_number.is_(None)
    ).all():
        is_sale_line_return = (
            customer_return.sale_id in negative_sale_ids
            and customer_return.return_reason == "Return via negative quantity sale"
        )
        if not is_sale_line_return:
            legacy_documents.append((customer_return.date, 0, customer_return.id, customer_return))
    for discount in CustomerDiscount.query.filter(
        CustomerDiscount.document_invoice_number.is_(None)
    ).all():
        legacy_documents.append((discount.date, 1, discount.id, discount))

    if legacy_documents:
        for _, _, _, document in sorted(legacy_documents, key=lambda item: item[:3]):
            document.document_invoice_number = _allocate_invoice_document_number()
        db.session.commit()


# Initialize database with health check
with app.app_context():
    # Check database health before creating tables
    if not check_database_health():
        print("Warning: Database connection issues detected")
    
    db.create_all()
    upgrade_customer_discount_schema(
        db.engine,
        CustomerDiscount.__table__,
        CustomerDiscountAudit.__table__,
    )
    upgrade_invoice_document_numbers_schema(db.engine, InvoiceDocumentNumber.__table__)
    ensure_voided_invoice_document_schema()
    _initialize_invoice_document_numbers()
    _backfill_deleted_customer_discount_voids()
    _backfill_missing_invoice_document_numbers()
    ensure_sale_item_highlight_column()
    ensure_print_service_settings_columns()
    create_admin_user()

    # Create print_queue table if it doesn't exist
    try:
        db.session.execute(db.text("SELECT 1 FROM print_queue LIMIT 1"))
    except Exception:
        print("Creating print_queue table...")
        db.create_all()
        print("Successfully created print_queue table")

# Print Queue API Routes for Mobile Print Proxy
@app.route('/api/print-queue/add', methods=['POST'])
@jwt_required()
def add_print_job():
    """Add a print job to the queue - Only for mobile devices"""
    data = request.get_json()
    user_id = get_jwt_identity()
    
    try:
        # Detect device type for logging purposes only
        user_agent = request.headers.get('User-Agent', '').lower()
        is_mobile = any(mobile in user_agent for mobile in ['mobile', 'android', 'iphone', 'ipad'])
        
        job_id = str(uuid.uuid4())
        
        # Create print job
        print_job = PrintQueue(
            id=job_id,
            invoice_number=data.get('invoice_number'),
            print_type=data.get('print_type', 'dot_matrix'),
            print_data=json.dumps(data.get('print_data')),
            created_by=user_id,
            device_type='mobile' if is_mobile else 'desktop'
        )
        
        db.session.add(print_job)
        db.session.commit()
        
        return jsonify({
            'job_id': job_id,
            'status': 'queued',
            'message': 'Print job added to queue successfully'
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to add print job: {str(e)}'}), 500

@app.route('/api/print-queue/pending', methods=['GET'])
def get_pending_print_jobs():
    """Get pending print jobs for PC Print Service"""
    try:
        # Return all pending jobs (from any device type)
        jobs = PrintQueue.query.filter(
            PrintQueue.status == 'pending'
        ).order_by(PrintQueue.created_at.asc()).all()
        
        return jsonify([{
            'id': job.id,
            'invoice_number': job.invoice_number,
            'print_type': job.print_type,
            'print_data': json.loads(job.print_data),
            'created_at': job.created_at.isoformat()
        } for job in jobs]), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to get pending jobs: {str(e)}'}), 500

@app.route('/api/print-queue/<job_id>/status', methods=['POST'])
def update_print_job_status(job_id):
    """Update print job status"""
    data = request.get_json()
    
    try:
        job = PrintQueue.query.get(job_id)
        if not job:
            return jsonify({'error': 'Print job not found'}), 404
        
        job.status = data.get('status')
        job.error_message = data.get('error_message')
        
        if job.status in ['completed', 'failed']:
            job.completed_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to update job status: {str(e)}'}), 500

@app.route('/api/print-queue/<job_id>/status', methods=['GET'])
def get_print_job_status(job_id):
    """Get print job status for mobile to check"""
    try:
        job = PrintQueue.query.get(job_id)
        if not job:
            return jsonify({'error': 'Print job not found'}), 404
        
        return jsonify({
            'status': job.status,
            'completed_at': job.completed_at.isoformat() if job.completed_at else None,
            'error_message': job.error_message
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to get job status: {str(e)}'}), 500

# Configure Flask-JWT-Extended
app.config["JWT_SECRET_KEY"] = os.getenv('JWT_SECRET_KEY', 'salesmaster-jwt-secret-key-change-in-production-2024')
# Long-lived token — 24 hours. Combined with silent refresh on the frontend,
# a user working all day will never be logged out by token expiry.
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=24)
jwt = JWTManager(app)

# ── Auth-event audit log ──────────────────────────────────────────────
# Every login / logout / token-refresh / 401-422 is appended to
# backend/auth_events.log as one grep-friendly line, e.g.:
#   2026-09-23 14:02:11 | 401 | GET /api/held-invoices | ip=127.0.0.1 | token=user=ali EXPIRED-26.3h-ago
# Open that file any time to see exactly when a device was logged out and why.
import logging as _logging
from logging.handlers import RotatingFileHandler as _RotatingFileHandler

_auth_log = _logging.getLogger("auth_events")
if not _auth_log.handlers:
    _auth_log.setLevel(_logging.INFO)
    _auth_log_handler = _RotatingFileHandler(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "auth_events.log"),
        maxBytes=2_000_000, backupCount=5, encoding="utf-8",
    )
    _auth_log_handler.setFormatter(_logging.Formatter("%(asctime)s | %(message)s", "%Y-%m-%d %H:%M:%S"))
    _auth_log.addHandler(_auth_log_handler)
    _auth_log.propagate = False


def _describe_request_token():
    """Classify the request's Bearer token for the audit log. Never raises."""
    try:
        h = request.headers.get("Authorization", "")
        if not h:
            return "no-auth-header"
        parts = h.split(None, 1)
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return "malformed-auth-header"
        t = parts[1].strip()
        if t in ("", "null", "undefined"):
            return "literal-null-token"
        from flask_jwt_extended import decode_token
        import time as _time
        try:
            d = decode_token(t, allow_expired=True)
        except Exception:
            return "undecodable-token"
        sub = d.get("sub")
        username = "?"
        try:
            u = User.query.get(int(sub)) if sub is not None else None
            username = u.username if u else f"unknown-id-{sub}"
        except Exception:
            pass
        exp = d.get("exp")
        if exp is not None and _time.time() > int(exp):
            ago_h = (_time.time() - int(exp)) / 3600
            return f"user={username} EXPIRED-{ago_h:.1f}h-ago"
        return f"user={username} invalid-signature-or-unknown"
    except Exception:
        return "token-describe-error"


@app.after_request
def log_auth_events(response):
    """Append auth-relevant events to backend/auth_events.log. Read-only:
    never alters the response, and never breaks a request (all guarded)."""
    try:
        p = request.path
        m = request.method
        ip = (request.headers.get("X-Forwarded-For", request.remote_addr or "?") or "?").split(",")[0].strip()
        if p == "/api/auth/login" and m == "POST":
            uname = ((request.get_json(silent=True) or {}).get("username")) or "?"
            if response.status_code == 200:
                _auth_log.info(f"LOGIN-OK | user={uname} | ip={ip}")
            else:
                _auth_log.info(f"LOGIN-FAIL | user={uname} | status={response.status_code} | ip={ip}")
        elif p == "/api/auth/logout" and m == "POST":
            reason = ((request.get_json(silent=True) or {}).get("reason")) or "unknown"
            _auth_log.info(f"LOGOUT | reason={reason} | ip={ip} | token={_describe_request_token()}")
        elif p == "/api/auth/refresh" and m == "POST":
            if response.status_code == 200:
                _auth_log.info(f"REFRESH-OK session-rescued | ip={ip} | token={_describe_request_token()}")
            else:
                _auth_log.info(f"REFRESH-FAIL session-doomed | status={response.status_code} | ip={ip} | token={_describe_request_token()}")
        elif p.startswith("/api/") and response.status_code in (401, 422):
            _auth_log.info(f"{response.status_code} | {m} {p} | ip={ip} | token={_describe_request_token()}")
    except Exception:
        pass
    return response

# A-02: require authentication for backend API requests by default.
# Deliberately public operational endpoints and the currently deferred
# email/print/PDF compatibility routes are listed explicitly below. All other
# /api/* routes must present a valid JWT before their handlers execute.
_PUBLIC_API_EXACT = {
    ("/api/health", "GET"),
    ("/api/server-time", "GET"),
    ("/api/auth/login", "POST"),
    ("/api/auth/logout", "POST"),
    # Refresh MUST bypass the JWT gate: the gate's verify_jwt_in_request()
    # rejects expired tokens before the handler runs, which dead-codes the
    # 2-hour grace window below. Exempting it lets an expired-but-signed
    # token be exchanged for a fresh one, so a single 401 on a background
    # poll (e.g. /api/held-invoices while making an invoice) is survivable
    # instead of forcing a logout. The handler still validates the signature,
    # the grace window, and that the account is Active.
    ("/api/auth/refresh", "POST"),
    # Email configuration protection is tracked separately (A-04) and is
    # intentionally left unchanged in this scoped A-02 implementation.
    ("/api/email-config", "GET"),
    ("/api/email-config", "PUT"),
    # Print receipt pages use company branding without requiring a second
    # authenticated API call for public company details.
    ("/api/company-details", "GET"),
    # Business date is needed on almost every page and is not sensitive;
    # making it public prevents the 30s poll from triggering 401 storms and
    # logging out active users when their token briefly expires/is missing.
    ("/api/business-date", "GET"),
}

_PUBLIC_API_PATTERNS = (
    # Print queue/PDF protection is tracked separately (A-06) and remains
    # compatible with the existing unauthenticated print-service contract.
    re.compile(r"^/api/print-queue/pending$"),
    re.compile(r"^/api/print-queue/[^/]+/status$"),
    re.compile(r"^/api/generate-invoice-pdf$"),
    re.compile(r"^/api/generate-preview-pdf$"),
    re.compile(r"^/api/generate-empty-invoice-pdf$"),
    re.compile(r"^/api/generate-preview-excel$"),
    re.compile(r"^/api/generate-empty-invoice-excel$"),
    re.compile(r"^/api/sales/[^/]+/invoice$"),
    re.compile(r"^/api/sales/[^/]+/excel$"),
    re.compile(r"^/api/purchase-invoices/[^/]+/print$"),
    re.compile(r"^/api/supplier-returns/[^/]+/print$"),
    re.compile(r"^/api/customer-returns/print$"),
    re.compile(r"^/api/customer-discounts/print$"),
    re.compile(r"^/api/reports/daily-summary/pdf$"),
)


def _is_public_api_request():
    if request.method == "OPTIONS":
        return True
    if (request.path, request.method) in _PUBLIC_API_EXACT:
        return True
    return any(pattern.fullmatch(request.path) for pattern in _PUBLIC_API_PATTERNS)


@app.before_request
def enforce_api_authentication():
    """Protect API routes by default while preserving explicit public contracts."""
    if not request.path.startswith("/api/") or _is_public_api_request():
        return None
    # verify_jwt_in_request() uses Flask-JWT-Extended's standard JSON 401/422
    # responses, keeping behavior consistent with existing @jwt_required routes.
    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()
    return None

# Security Headers Middleware
@app.after_request
def add_security_headers(response):
    """Add security headers to all responses"""
    # Content Security Policy - restrictive but functional for this app
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    
    # Prevent clickjacking
    response.headers['X-Frame-Options'] = 'DENY'
    
    # Prevent MIME type sniffing
    response.headers['X-Content-Type-Options'] = 'nosniff'
    
    # Enable XSS protection
    response.headers['X-XSS-Protection'] = '1; mode=block'
    
    # Referrer policy
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    
    # Permissions policy (formerly Feature Policy)
    response.headers['Permissions-Policy'] = (
        "geolocation=(), "
        "microphone=(), "
        "camera=(), "
        "payment=(), "
        "usb=(), "
        "magnetometer=(), "
        "gyroscope=(), "
        "speaker=()"
    )
    
    # HTTPS enforcement (only in production)
    if not app.debug:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    
    return response

# Input Sanitization Helper Functions
def sanitize_input(text):
    """Sanitize user input to prevent XSS attacks"""
    if not isinstance(text, str):
        return text
    # HTML escape the input
    sanitized = html.escape(text)
    # Remove potentially dangerous characters
    sanitized = re.sub(r'[<>"\']', '', sanitized)
    return sanitized.strip()

def validate_email(email):
    """Validate email format"""
    if not email:
        return False
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_phone(phone):
    """Validate phone number format"""
    if not phone:
        return True  # Phone is optional
    # Allow digits, spaces, hyphens, parentheses, and plus sign
    pattern = r'^[\d\s\-\(\)\+]+$'
    return re.match(pattern, phone) is not None

# Configure user identity loader
@jwt.user_identity_loader
def user_identity_lookup(user_id):
    return str(user_id)

# Daily Book Sales Payment Update Endpoint
@app.route('/api/sales/update-payment-method', methods=['POST'])
@jwt_required()
def update_sale_payment_method():
    """Update payment method for sales by modifying existing payment records"""
    data = request.get_json()
    
    try:
        sale_ids = data.get('saleIds', [])
        new_payment_method = data.get('paymentMethod')  # 'cash', 'bank', 'bank_transfer', 'cheque', 'account'
        user_id = get_jwt_identity()
        
        if not sale_ids or not new_payment_method:
            return jsonify({"error": "Sale IDs and payment method are required"}), 400
        
        valid_methods = ['cash', 'bank', 'bank_transfer', 'cheque', 'account']
        if new_payment_method not in valid_methods:
            return jsonify({"error": f"Invalid payment method. Must be one of: {valid_methods}"}), 400
        
        updated_sales = []
        
        for sale_id in sale_ids:
            sale = Sale.query.get(sale_id)
            if not sale:
                continue
                
            # Check permissions
            backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
            today = get_business_date()  # Use business date as reference, not calendar date
            sale_date = sale.date.date() if hasattr(sale.date, 'date') else sale.date
            
            if backdate_opt and not backdate_opt.editing and sale_date < today:
                return jsonify({"error": f"You do not have permission to edit sales for previous dates (Sale {sale.invoice_number})"}), 403
            
            # Note: current_editing permission does NOT block payment method updates in Daily Book Sales
            
            old_customer_type = sale.customer_type
            
            # Get existing payments for this sale (exclude reversals)
            existing_payments = Payment.query.filter(
                Payment.sale_id == sale.id,
                Payment.payment_mode != 'reversal'
            ).all()
            
            # Calculate current paid amount
            current_paid = sum(p.amount for p in existing_payments if p.amount > 0)
            outstanding_balance = sale.total_amount - current_paid
            
            # Handle payment logic based on new payment method
            if new_payment_method == 'account':
                # For account payment, remove existing payment records
                if existing_payments:
                    for payment in existing_payments:
                        db.session.delete(payment)
                sale.payment_status = 'pending'
                
            else:
                # For cash/bank/transfer/cheque payments
                if existing_payments:
                    # Update existing payment records instead of creating new ones
                    total_existing_amount = sum(p.amount for p in existing_payments)
                    
                    if len(existing_payments) == 1:
                        # Single payment record - just update it
                        payment = existing_payments[0]
                        payment.payment_mode = new_payment_method
                        payment.amount = sale.total_amount
                        payment.remarks = f'Payment method updated from {old_customer_type} to {new_payment_method} via Daily Book Sales'
                        
                    else:
                        # Multiple payment records - consolidate into one
                        # Keep the first payment record, delete others
                        main_payment = existing_payments[0]
                        main_payment.payment_mode = new_payment_method
                        main_payment.amount = sale.total_amount
                        main_payment.remarks = f'Payment consolidated and updated from {old_customer_type} to {new_payment_method} via Daily Book Sales'
                        
                        # Delete other payment records
                        for payment in existing_payments[1:]:
                            db.session.delete(payment)
                            
                else:
                    # No existing payments - create new payment record
                    payment = Payment(
                        customer_id=sale.customer_id,
                        sale_id=sale.id,
                        amount=sale.total_amount,
                        payment_mode=new_payment_method,
                        payment_date=sale_date,
                        remarks=f'Payment created for {new_payment_method} via Daily Book Sales (changed from {old_customer_type})',
                        payment_source='daily_book_sales'
                    )
                    db.session.add(payment)
                
                sale.payment_status = 'paid'
            
            # Update the sale's customer type
            sale.customer_type = new_payment_method
            
            # Add a note about the change for audit trail
            change_note = f"Payment method changed from {old_customer_type} to {new_payment_method} via Daily Book Sales by user {user_id}"
            if sale.notes:
                sale.notes += f"\n{change_note}"
            else:
                sale.notes = change_note
            
            updated_sales.append({
                'id': sale.id,
                'invoice_number': sale.invoice_number,
                'old_method': old_customer_type,
                'new_method': new_payment_method,
                'outstanding_balance': float(outstanding_balance)
            })
        
        db.session.commit()
        
        return jsonify({
            "message": f"Successfully updated payment method for {len(updated_sales)} sales",
            "updated_sales": updated_sales
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to update payment methods: {str(e)}"}), 500
@app.route('/api/sales/split-payment', methods=['POST'])
@jwt_required()
def update_sale_split_payment():
    """Update sale to split payment between cash and card with proper payment records"""
    data = request.get_json()
    
    try:
        sale_id = data.get('saleId')
        cash_amount = float(data.get('cashAmount', 0))
        card_amount = float(data.get('cardAmount', 0))
        user_id = get_jwt_identity()
        
        if not sale_id:
            return jsonify({"error": "Sale ID is required"}), 400
        
        sale = Sale.query.get(sale_id)
        if not sale:
            return jsonify({"error": "Sale not found"}), 404
        
        # Check permissions
        backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
        today = get_business_date()  # Use business date as reference, not calendar date
        sale_date = sale.date.date() if hasattr(sale.date, 'date') else sale.date
        
        if backdate_opt and not backdate_opt.editing and sale_date < today:
            return jsonify({"error": "You do not have permission to edit sales for previous dates"}), 403
        
        # Note: current_editing permission does NOT block split payment updates in Daily Book Sales
        
        # Validate amounts
        total_amount = cash_amount + card_amount
        if abs(total_amount - float(sale.total_amount)) > 0.01:
            return jsonify({"error": f"Split amounts ({total_amount}) must equal invoice total ({sale.total_amount})"}), 400
        
        # Get existing payments for this sale (exclude reversals)
        existing_payments = Payment.query.filter(
            Payment.sale_id == sale.id,
            Payment.payment_mode != 'reversal'
        ).all()
        
        # Delete all existing payment records
        if existing_payments:
            for payment in existing_payments:
                db.session.delete(payment)
        
        # Create split payments only if amounts are greater than 0
        if cash_amount > 0:
            cash_payment = Payment(
                customer_id=sale.customer_id,
                sale_id=sale.id,
                amount=cash_amount,
                payment_mode='cash',
                payment_date=sale_date,
                remarks=f'Split payment - Cash portion (£{cash_amount:.2f}) via Daily Book Sales',
                payment_source='daily_book_sales'
            )
            db.session.add(cash_payment)
        
        if card_amount > 0:
            card_payment = Payment(
                customer_id=sale.customer_id,
                sale_id=sale.id,
                amount=card_amount,
                payment_mode='bank',
                payment_date=sale_date,
                remarks=f'Split payment - Card portion (£{card_amount:.2f}) via Daily Book Sales',
                payment_source='daily_book_sales'
            )
            db.session.add(card_payment)
        
        # Set customer type based on dominant payment method
        if cash_amount > card_amount:
            sale.customer_type = 'cash'
        elif card_amount > cash_amount:
            sale.customer_type = 'bank'
        else:
            # Equal amounts, default to cash
            sale.customer_type = 'cash'
        
        # Set payment status
        if cash_amount > 0 or card_amount > 0:
            sale.payment_status = 'paid'
        else:
            sale.payment_status = 'pending'  # Edge case where both amounts are 0
        
        # Add note about split payment
        split_note = f"Split payment: Cash £{cash_amount:.2f}, Card £{card_amount:.2f} via Daily Book Sales by user {user_id}"
        if sale.notes:
            sale.notes += f"\n{split_note}"
        else:
            sale.notes = split_note
        
        db.session.commit()
        
        return jsonify({
            "message": "Split payment applied successfully",
            "sale_id": sale.id,
            "invoice_number": sale.invoice_number,
            "cash_amount": cash_amount,
            "card_amount": card_amount,
            "dominant_method": sale.customer_type,
            "total_split_amount": total_amount
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to apply split payment: {str(e)}"}), 500
# Stock management helper functions
def safe_float(value):
    """Safely convert Decimal or any numeric value to float"""
    from decimal import Decimal
    if isinstance(value, Decimal):
        return float(value)
    elif value is None:
        return 0.0
    else:
        return float(value)

def cleanup_sale_stock_movements(sale_id):
    """Clean up duplicate stock movements for a sale, keeping only the latest movement per product and movement type"""
    try:
        # Get all stock movements for this sale
        movements = StockMovement.query.filter(
            StockMovement.reference_id == sale_id,
            StockMovement.reference_type == 'sale'
        ).order_by(StockMovement.created_at.desc()).all()
        
        # Group movements by product AND movement type (sale_adjustment should not be considered duplicate of sale)
        product_movements = {}
        for movement in movements:
            key = (movement.product_id, movement.product_type, movement.movement_type)
            if key not in product_movements:
                product_movements[key] = []
            product_movements[key].append(movement)
        
        # For each product+movement_type combination, keep only the latest movement and delete duplicates
        for key, product_movement_list in product_movements.items():
            if len(product_movement_list) > 1:
                # Sort by creation time (latest first)
                product_movement_list.sort(key=lambda x: x.created_at, reverse=True)
                
                # Keep the latest movement, delete the rest
                latest_movement = product_movement_list[0]
                duplicates = product_movement_list[1:]
                
                product_id, product_type, movement_type = key
                print(f"[DEBUG] Cleaning up {len(duplicates)} duplicate {movement_type} movements for product ({product_id}, {product_type}) in sale {sale_id}")
                
                # Calculate the cumulative quantity change from duplicates
                duplicate_quantity = sum(safe_float(m.quantity) for m in duplicates)
                
                # Adjust the product stock to remove the effect of duplicates
                if product_type == 'regular':
                    product = RegularProduct.query.get(product_id)
                else:
                    product = NonProduct.query.get(product_id)
                
                if product:
                    # Reverse the effect of duplicate movements
                    current_stock = safe_float(product.current_stock)
                    new_stock = current_stock - duplicate_quantity
                    operation_id = uuid.uuid4().hex
                    stock_audit_log(
                        "current_stock_cleanup_adjustment_started",
                        operation_id=operation_id,
                        product_id=product_id,
                        product_type=product_type,
                        movement_type=movement_type,
                        previous_stock=current_stock,
                        quantity_change=-duplicate_quantity,
                        reason="remove_duplicate_stock_movements",
                    )
                    product.current_stock = new_stock
                    stock_audit_log(
                        "current_stock_cleanup_adjustment_applied",
                        operation_id=operation_id,
                        product_id=product_id,
                        product_type=product_type,
                        movement_type=movement_type,
                        previous_stock=current_stock,
                        new_stock=new_stock,
                        quantity_change=-duplicate_quantity,
                        reason="remove_duplicate_stock_movements",
                        transaction_state="pending_commit",
                    )
                    print(f"[DEBUG] Adjusted stock for product {product_id} by {-duplicate_quantity} (removing duplicate {movement_type} movements)")
                
                # Delete duplicate movements
                for duplicate in duplicates:
                    db.session.delete(duplicate)
        
        return True
    except Exception as e:
        print(f"[ERROR] Error cleaning up stock movements: {e}")
        return False

def update_product_stock(product_id, product_type, quantity_change, movement_type, reference_id=None, reference_type=None, remarks=None, user_id=None, movement_date=None):
    """Update product stock and create movement record within existing transaction"""
    operation_id = uuid.uuid4().hex
    stock_audit_log(
        "stock_mutation_started",
        operation_id=operation_id,
        product_id=product_id,
        product_type=product_type,
        quantity_change=safe_float(quantity_change),
        movement_type=movement_type,
        reference_id=reference_id,
        reference_type=reference_type,
        user_id=user_id,
        movement_date=str(movement_date) if movement_date else None,
    )
    print(f"[DEBUG] update_product_stock called: product_id={product_id}, product_type={product_type}, quantity_change={quantity_change}, movement_type={movement_type}")
    max_retries = 3
    retry_delay = 0.05  # 50ms
    
    for attempt in range(max_retries):
        try:
            # Normalize the API value for both SQL arithmetic and movement
            # serialization. Numeric product columns must be updated with a
            # Decimal-compatible value rather than a Python float.
            from decimal import Decimal
            quantity_change_float = safe_float(quantity_change)
            quantity_change_decimal = Decimal(str(quantity_change_float))
            product_model = RegularProduct if product_type == 'regular' else NonProduct
            allow_negative_stock = movement_type in [
                'adjustment', 'sale', 'customer_return',
                'customer_return_cancellation', 'customer_return_adjustment',
                'dump', 'dump_cancellation',
                'dump_adjustment', 'purchase', 'purchase_reversal',
                'sale_adjustment', 'sale_cancellation',
                'supplier_return', 'supplier_return_adjustment', 'supplier_return_cancellation'
            ]

            # Perform the increment inside SQL. The database evaluates the current
            # value at the time of the write, so concurrent callers cannot overwrite
            # each other's increments with stale Python-side values.
            stock_update = update(product_model).where(product_model.id == product_id)
            if not allow_negative_stock:
                stock_update = stock_update.where(
                    product_model.current_stock + quantity_change_decimal >= 0
                )
            stock_update = stock_update.values(
                current_stock=product_model.current_stock + quantity_change_decimal
            ).returning(product_model.current_stock)
            updated_row = db.session.execute(stock_update).first()

            if not updated_row:
                product = db.session.query(product_model).filter(
                    product_model.id == product_id
                ).first()
                if not product:
                    raise ValueError(f"Product not found: {product_id}")
                previous_stock = safe_float(product.current_stock)
                print(f"[DEBUG] Stock validation FAILED - blocking negative stock for movement_type={movement_type}")
                raise ValueError(
                    f"Insufficient stock for product {product.description}. "
                    f"Available: {previous_stock}, Required: {abs(quantity_change)}"
                )

            # The returned value is the post-update value for this exact atomic
            # increment. Derive the matching pre-update snapshot for the movement.
            new_stock = safe_float(updated_row[0])
            previous_stock = new_stock - quantity_change_float
            stock_audit_log(
                "stock_mutation_applied",
                operation_id=operation_id,
                attempt=attempt + 1,
                transaction_state="pending_commit",
                product_id=product_id,
                product_type=product_type,
                movement_type=movement_type,
                quantity_change=quantity_change_float,
                previous_stock=previous_stock,
                new_stock=new_stock,
                reference_id=reference_id,
                reference_type=reference_type,
                user_id=user_id,
                movement_date=str(movement_date) if movement_date else None,
            )
            print(f"[DEBUG] Stock validation PASSED for movement_type={movement_type}")
            print(f"[DEBUG] Updated product stock: {previous_stock} -> {new_stock}")

            # Separate movement_date (business date) from created_at (system timestamp).
            movement_date_only = movement_date.date() if isinstance(movement_date, datetime) else (movement_date if movement_date else None)

            movement = StockMovement(
                product_id=product_id,
                product_type=product_type,
                movement_type=movement_type,
                quantity=quantity_change_float,
                reference_id=reference_id,
                reference_type=reference_type,
                previous_stock=previous_stock,
                new_stock=new_stock,
                movement_date=movement_date_only,
                remarks=remarks,
                created_by=user_id,
                created_at=datetime.now()
            )
            db.session.add(movement)
            stock_audit_log(
                "stock_movement_queued",
                operation_id=operation_id,
                product_id=product_id,
                product_type=product_type,
                movement_type=movement_type,
                quantity=quantity_change_float,
                previous_stock=previous_stock,
                new_stock=new_stock,
                reference_id=reference_id,
                reference_type=reference_type,
                transaction_state="pending_commit",
            )
            print(f"[DEBUG] Created stock movement: {movement_type}, quantity={quantity_change_float}, reference_id={reference_id}")

            # Don't commit here - let the calling function handle the transaction.
            return True, new_stock

        except Exception as e:
            # Retry if SQLite is temporarily locked. Roll back the failed statement
            # before retrying so the session can issue a new transaction.
            if 'database is locked' in str(e).lower() and attempt < max_retries - 1:
                stock_audit_log(
                    "stock_mutation_retry",
                    level=logging.WARNING,
                    operation_id=operation_id,
                    attempt=attempt + 1,
                    error=str(e),
                    product_id=product_id,
                    product_type=product_type,
                    movement_type=movement_type,
                )
                db.session.rollback()
                time.sleep(retry_delay * (attempt + 1))
                continue
            stock_audit_log(
                "stock_mutation_rejected",
                level=logging.ERROR,
                operation_id=operation_id,
                attempt=attempt + 1,
                error=str(e),
                product_id=product_id,
                product_type=product_type,
                quantity_change=safe_float(quantity_change),
                movement_type=movement_type,
                reference_id=reference_id,
                reference_type=reference_type,
                user_id=user_id,
            )
            return False, str(e)

def _return_stock_effect(return_kind, status, quantity):
    """Return the signed stock effect represented by a return record.

    Customer returns are included by Stock Check only when completed. Supplier
    returns are currently included by Stock Check for every stored status, so
    their signed effect remains a stock decrease regardless of status. Keeping
    this policy in one helper makes create/update/status/delete transitions
    idempotent without changing the existing closing-stock behavior.
    """
    quantity_float = safe_float(quantity)
    if return_kind == 'customer':
        return quantity_float if status == 'completed' else 0.0
    if return_kind == 'supplier':
        return -quantity_float
    raise ValueError(f"Unknown return kind: {return_kind}")


def _apply_return_stock_transition(return_kind, reference_id, old_product_id,
                                   old_product_type, old_status, old_quantity,
                                   new_product_id, new_product_type, new_status,
                                   new_quantity, user_id, movement_date,
                                   movement_type, remarks):
    """Apply only the stock-effect delta between two return record states."""
    old_effect = _return_stock_effect(return_kind, old_status, old_quantity)
    new_effect = _return_stock_effect(return_kind, new_status, new_quantity)
    old_key = (old_product_id, old_product_type)
    new_key = (new_product_id, new_product_type)
    reference_type = 'customer_return' if return_kind == 'customer' else 'supplier_return'

    operations = []
    if old_key == new_key:
        operations.append((new_product_id, new_product_type, new_effect - old_effect))
    else:
        operations.append((old_product_id, old_product_type, -old_effect))
        operations.append((new_product_id, new_product_type, new_effect))

    for product_id, product_type, quantity_change in operations:
        if abs(quantity_change) <= 0.001:
            continue
        success, result = update_product_stock(
            product_id=product_id,
            product_type=product_type,
            quantity_change=quantity_change,
            movement_type=movement_type,
            reference_id=reference_id,
            reference_type=reference_type,
            remarks=remarks,
            user_id=user_id,
            movement_date=movement_date
        )
        if not success:
            return False, result

    return True, new_effect


def get_product_stock(product_id, product_type):
    """Get current stock for a product"""
    try:
        if product_type == 'regular':
            product = RegularProduct.query.get(product_id)
        else:
            product = NonProduct.query.get(product_id)
        
        if not product:
            return None
        
        return product.current_stock
    except Exception as e:
        return None

def get_closing_time():
    settings = SystemSettings.query.first()
    if settings and settings.closing_time:
        return settings.closing_time
    return time(23, 59)  # Default closing time

def get_business_date(now=None):
    """Get current business date — always prefer the DB record if it exists."""
    business_date_record = BusinessDate.query.first()
    if business_date_record and business_date_record.current_date:
        return business_date_record.current_date
    # Fallback: no DB record yet — use calendar date
    now = now or datetime.now()
    return now.date()

CENT = Decimal("0.01")


def _money_decimal(value):
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def _active_discount_total_for_sale(sale_id, through_date=None, exclude_id=None):
    query = db.session.query(func.coalesce(func.sum(CustomerDiscount.amount), 0)).filter(
        CustomerDiscount.sale_id == sale_id,
        CustomerDiscount.is_deleted.is_(False),
    )
    if through_date:
        query = query.filter(CustomerDiscount.date <= through_date)
    if exclude_id is not None:
        query = query.filter(CustomerDiscount.id != exclude_id)
    return _money_decimal(query.scalar())


def _active_discount_total_for_item(sale_item_id, exclude_id=None):
    query = db.session.query(func.coalesce(func.sum(CustomerDiscount.amount), 0)).filter(
        CustomerDiscount.sale_item_id == sale_item_id,
        CustomerDiscount.is_deleted.is_(False),
    )
    if exclude_id is not None:
        query = query.filter(CustomerDiscount.id != exclude_id)
    return _money_decimal(query.scalar())


def _sale_paid_amount(sale, through_date=None):
    if _money_decimal(sale.total_amount) < 0:
        return _money_decimal(sale.paid_amount)
    query = db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.sale_id == sale.id,
        or_(Payment.payment_mode.is_(None), Payment.payment_mode != "credit_note"),
    )
    if through_date:
        query = query.filter(Payment.payment_date <= through_date)
    payment_total = _money_decimal(query.scalar())
    recorded_total = _money_decimal(sale.paid_amount)
    return max(Decimal("0.00"), payment_total, recorded_total)


def _sale_return_total(sale_id, through_date=None):
    query = db.session.query(func.coalesce(func.sum(CustomerReturn.total_value), 0)).filter(
        CustomerReturn.sale_id == sale_id,
        CustomerReturn.status == "completed",
    )
    if through_date:
        query = query.filter(CustomerReturn.date <= through_date)
    return _money_decimal(query.scalar())


def _sale_outstanding(sale, through_date=None, exclude_discount_id=None):
    return (
        _money_decimal(sale.total_amount)
        - _sale_paid_amount(sale, through_date)
        - _sale_return_total(sale.id, through_date)
        - _active_discount_total_for_sale(sale.id, through_date, exclude_discount_id)
    ).quantize(CENT)


def _sale_available_discount_value(sale, exclude_discount_id=None):
    """Return the unreturned, undiscounted value, independent of payments."""
    invoice_value = (
        _money_decimal(sale.total_amount)
        - _sale_return_total(sale.id)
        - _active_discount_total_for_sale(sale.id, exclude_id=exclude_discount_id)
    )
    sale_items = [
        item for item in sale.items
        if _money_decimal(item.total_price) > 0
    ]
    line_discounts = {}
    if sale_items:
        line_discount_query = db.session.query(
            CustomerDiscount.sale_item_id,
            func.coalesce(func.sum(CustomerDiscount.amount), 0),
        ).filter(
            CustomerDiscount.sale_item_id.in_([item.id for item in sale_items]),
            CustomerDiscount.is_deleted.is_(False),
        )
        if exclude_discount_id is not None:
            line_discount_query = line_discount_query.filter(
                CustomerDiscount.id != exclude_discount_id
            )
        line_discounts = dict(line_discount_query.group_by(CustomerDiscount.sale_item_id).all())
    line_value = sum(
        max(
            Decimal("0.00"),
            _money_decimal(item.total_price)
            - _money_decimal(line_discounts.get(item.id)),
        )
        for item in sale_items
    )
    return max(Decimal("0.00"), min(invoice_value, line_value)).quantize(CENT)


def _check_discount_date_permission(user_id, target_date, operation, existing_date=None):
    business_date = get_business_date()
    if target_date > business_date:
        return "Discount date cannot be after the current business date."

    options = UserBackDateOption.query.filter_by(user_id=int(user_id)).first()
    dates_to_check = [target_date]
    if existing_date is not None:
        dates_to_check.append(existing_date)

    for entry_date in set(dates_to_check):
        if entry_date < business_date:
            allowed = bool(options and (options.deleting if operation == "delete" else options.editing))
            if not allowed:
                action = "delete" if operation == "delete" else "edit"
                return f"You do not have permission to {action} backdated discounts."
        elif operation in ("edit", "delete") and options and not options.current_editing:
            return "You do not have permission to edit discounts for the current business date."
    return None


def _check_customer_discount_access(user_id):
    restrictions = UserRestriction.query.filter(
        UserRestriction.user_id == int(user_id),
        UserRestriction.section.in_(("data_entry", "customer_discount")),
        UserRestriction.allowed.is_(False),
    ).all()
    if restrictions:
        return "You do not have permission to access customer discounts."
    return None


def _parse_discount_date(value, default_date):
    if value in (None, ""):
        return default_date
    try:
        parsed = date.fromisoformat(str(value))
    except ValueError:
        raise ValueError("Discount date must use YYYY-MM-DD format.")
    if parsed.isoformat() != str(value):
        raise ValueError("Discount date must use YYYY-MM-DD format.")
    return parsed


def _parse_discount_amount(value):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Discount amount must be a valid positive amount.")
    if not amount.is_finite() or amount <= 0:
        raise ValueError("Discount amount must be a finite amount greater than zero.")
    rounded = amount.quantize(CENT, rounding=ROUND_HALF_UP)
    if amount != rounded:
        raise ValueError("Discount amount cannot have more than two decimal places.")
    return rounded


def _refresh_sale_payment_status(sale):
    outstanding = _sale_outstanding(sale)
    paid = _sale_paid_amount(sale)
    if outstanding <= Decimal("0.00"):
        sale.payment_status = "paid"
    elif paid > 0:
        sale.payment_status = "partial"
    else:
        sale.payment_status = "unpaid" if sale.payment_status == "unpaid" else "pending"


def get_next_business_date(current_date):
    """Calculate next business date (including weekends)"""
    if isinstance(current_date, datetime):
        current_date = current_date.date()
    
    # Simply add one day - include weekends
    next_date = current_date + timedelta(days=1)
    return next_date

def set_business_date(new_date, is_manual=True):
    """Set the business date manually"""
    business_date_record = BusinessDate.query.first()
    if not business_date_record:
        business_date_record = BusinessDate()
        db.session.add(business_date_record)
    
    business_date_record.current_date = new_date
    business_date_record.is_manual_override = is_manual
    db.session.commit()
    return business_date_record

# Health check endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint to test database connectivity"""
    try:
        # Test database connection using SQLAlchemy ORM
        from sqlalchemy import text
        db.session.execute(text("SELECT 1"))
        db.session.commit()
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "unhealthy", "database": "disconnected", "error": str(e)}), 500

# Server time endpoint
@app.route('/api/server-time', methods=['GET'])
def server_time():
    return jsonify({"serverTime": datetime.utcnow().isoformat() + "Z"})

# Auth routes
@app.route('/api/auth/login', methods=['POST'])
def login():
    from datetime import datetime
    
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username).first()
    if user and check_password_hash(user.password, password):
        # Check if user account is active
        if user.status != 'Active':
            return jsonify({
                'error': 'Account is inactive. Please contact administrator.'
            }), 403
            
        # Check timing restrictions
        timing_restriction = UserTimingRestriction.query.filter_by(user_id=user.id).first()
        if timing_restriction and timing_restriction.enabled:
            current_time = datetime.now().strftime('%H:%M')
            start_time = timing_restriction.start_time
            end_time = timing_restriction.end_time
            
            # Handle time comparison (considering overnight periods)
            if start_time <= end_time:
                # Same day period (e.g., 09:00 to 17:00)
                if not (start_time <= current_time <= end_time):
                    return jsonify({
                        'error': f'Access denied. You can only login between {start_time} and {end_time}'
                    }), 403
            else:
                # Overnight period (e.g., 22:00 to 06:00)
                if not (current_time >= start_time or current_time <= end_time):
                    return jsonify({
                        'error': f'Access denied. You can only login between {start_time} and {end_time}'
                    }), 403
        
        # Debugging: Print type of user.id before creating token
        print(f"Type of user.id: {type(user.id)}, value: {user.id}")
        # Create access token
        access_token = create_access_token(identity=str(user.id))
        
        # Store user info in session
        session['user_id'] = user.id
        session['username'] = user.username
        session['user_type'] = user.user_type
        
        user_dict = user.to_dict()
        return jsonify({
            'id': user_dict['id'],
            'username': user_dict['username'],
            'userType': user_dict['userType'],
            'status': user_dict['status'],
            'token': access_token
        })
    return jsonify({'error': 'Invalid credentials'}), 401

# @app.route('/api/auth/me', methods=['GET'])
# def get_current_user():
#     if 'user_id' not in session:
#         return jsonify({'error': 'Not authenticated'}), 401
    
#     user = User.query.get(session['user_id'])
#     if not user:
#         return jsonify({'error': 'User not found'}), 404
        
#     return jsonify({
#         'id': user.id,
#         'username': user.username,
#         'userType': user.user_type,
#         'status': user.status
#     })

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out successfully'})


@app.route('/api/auth/refresh', methods=['POST'])
def refresh_token():
    """Issue a fresh token for an authenticated user.

    Called by the frontend before / shortly after the current token expires
    so the user is never interrupted mid-session while actively working.
    Accepts already-expired tokens within a grace window (handled via
    decode_token(allow_expired=True)) so a single 401 on a background
    poll (e.g. /api/business-date) does not force an immediate logout
    while the user is typing.
    """
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Missing or invalid Authorization header'}), 401
    token = auth_header.split(' ', 1)[1].strip()
    if not token or token == 'null' or token == 'undefined':
        return jsonify({'error': 'Missing token'}), 401

    # Allow expired tokens for refresh — decode without verifying exp first,
    # then enforce a grace window manually.
    try:
        from flask_jwt_extended import decode_token
        # decode_token will verify signature but allow expired token
        decoded = decode_token(token, allow_expired=True)
        user_id = decoded.get('sub')
        exp = decoded.get('exp')
        if not user_id:
            return jsonify({'error': 'Invalid token'}), 401
        # Grace window: allow refresh up to 2 hours after expiry.
        # Prevents indefinite use of very old tokens while still covering
        # the case where the user was active and the token just expired
        # between the 30-min refresh interval and the next poll.
        if exp is not None:
            import time as _time
            now_ts = int(_time.time())
            grace_seconds = 2 * 60 * 60  # 2 hours
            if now_ts > int(exp) + grace_seconds:
                return jsonify({'error': 'Token expired — please login again'}), 401
    except Exception as e:
        # Fallback: try normal verification for non-expired tokens
        try:
            from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
            verify_jwt_in_request()
            user_id = get_jwt_identity()
        except Exception:
            return jsonify({'error': 'Invalid token'}), 401

    user = User.query.get(user_id)
    if not user or user.status != 'Active':
        return jsonify({'error': 'Account inactive'}), 403
    new_token = create_access_token(identity=str(user_id))
    return jsonify({'token': new_token}), 200

# Sales routes
SALE_HOLD_TTL = timedelta(hours=24)


def _expire_sale_holds(commit=False):
    """Mark expired holds released so they no longer reserve inventory."""
    now = datetime.utcnow()
    expired = SaleHold.query.filter(
        SaleHold.status == 'active',
        SaleHold.expires_at <= now,
    ).all()
    for hold in expired:
        hold.status = 'expired'
        hold.updated_at = now
    if expired:
        db.session.flush()
        if commit:
            db.session.commit()
    return len(expired)


def _hold_item_values(item):
    """Read both the frontend camelCase and backend snake_case item shapes."""
    product_id = item.get('productId', item.get('product_id'))
    non_product_id = item.get('nonProductId', item.get('non_product_id'))
    quantity = item.get('quantity', 0)
    try:
        quantity = float(quantity or 0)
    except (TypeError, ValueError):
        quantity = 0.0
    return product_id, non_product_id, quantity


def _reservation_totals(exclude_hold_id=None):
    """Aggregate positive sale quantities from active server-side holds."""
    _expire_sale_holds()
    totals = {}
    holds = SaleHold.query.filter_by(status='active').all()
    for hold in holds:
        if exclude_hold_id and hold.hold_id == exclude_hold_id:
            continue
        payload = hold.payload or {}
        for item in payload.get('saleItems', payload.get('items', [])) or []:
            product_id, non_product_id, quantity = _hold_item_values(item)
            if quantity <= 0:
                continue
            if product_id is not None:
                key = ('regular', int(product_id))
            elif non_product_id is not None:
                key = ('non', int(non_product_id))
            else:
                continue
            totals[key] = totals.get(key, 0.0) + quantity
    return [
        {'productId': product_id, 'productType': product_type, 'quantity': quantity}
        for (product_type, product_id), quantity in sorted(totals.items())
    ]


def _release_sale_hold(hold_id, sale_id=None):
    """Release a hold inside the caller's transaction after sale validation."""
    if not hold_id:
        return
    hold = SaleHold.query.filter_by(hold_id=str(hold_id), status='active').first()
    if hold:
        hold.status = 'released'
        hold.updated_at = datetime.utcnow()
        if sale_id is not None:
            hold.sale_id = sale_id
        db.session.flush()


@app.route('/api/held-invoices', methods=['GET'])
@jwt_required()
def get_held_invoices():
    try:
        _expire_sale_holds(commit=True)
        holds = SaleHold.query.filter_by(status='active').order_by(SaleHold.updated_at.desc()).all()
        return jsonify([hold.to_dict() for hold in holds]), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to load held invoices: {str(e)}'}), 500


@app.route('/api/held-invoices', methods=['POST'])
@jwt_required()
def upsert_held_invoice():
    """Create or renew one shared hold idempotently.

    A hold changes neither current_stock nor StockMovement. It is only a
    durable reservation used by the availability query until released, saved
    as a finalized sale, or expired.
    """
    try:
        data = request.get_json(silent=True) or {}
        user_id = int(get_jwt_identity())
        hold_id = str(data.get('holdId') or data.get('hold_id') or uuid.uuid4().hex)
        if len(hold_id) > 64:
            return jsonify({'error': 'Hold ID is too long'}), 400

        sale_items = data.get('saleItems', data.get('items', []))
        if not isinstance(sale_items, list) or not sale_items:
            return jsonify({'error': 'At least one invoice item is required'}), 400

        sanitized_items = []
        for item in sale_items:
            if not isinstance(item, dict):
                return jsonify({'error': 'Invalid invoice item'}), 400
            product_id, non_product_id, quantity = _hold_item_values(item)
            try:
                if product_id is not None:
                    int(product_id)
                if non_product_id is not None:
                    int(non_product_id)
            except (TypeError, ValueError):
                return jsonify({'error': 'Invalid product identifier'}), 400
            if product_id is None and non_product_id is None:
                return jsonify({'error': 'Each held item must reference a product'}), 400
            if product_id is not None and non_product_id is not None:
                return jsonify({'error': 'An item cannot reference both product types'}), 400
            if not isinstance(quantity, (int, float)) or quantity != quantity:
                return jsonify({'error': 'Invalid item quantity'}), 400
            sanitized_items.append(dict(item))

        current_sale = data.get('currentSale')
        sale_id = None
        if isinstance(current_sale, dict):
            sale_id = current_sale.get('id')
            invoice_number = current_sale.get('invoiceNumber')
            existing_sale = None
            if sale_id:
                existing_sale = Sale.query.get(sale_id)
            elif invoice_number:
                existing_sale = Sale.query.filter_by(invoice_number=invoice_number).first()
            # Include the canonical saved items in an edit hold. This allows
            # E26 to re-add the original deducted quantity consistently.
            if existing_sale:
                sale_id = existing_sale.id
                current_sale = existing_sale.to_dict()

        payload = {
            'customerId': data.get('customerId'),
            'vehicleDetails': data.get('vehicleDetails') or '',
            'gateNumber': data.get('gateNumber') or '',
            'notes': data.get('notes') or '',
            'saleItems': sanitized_items,
            'currentSale': current_sale if isinstance(current_sale, dict) else None,
        }
        now = datetime.utcnow()
        hold = SaleHold.query.get(hold_id)
        if hold:
            hold.customer_id = int(data['customerId']) if data.get('customerId') else None
            hold.sale_id = sale_id
            hold.updated_by = user_id
            hold.payload = payload
            hold.status = 'active'
            hold.updated_at = now
            hold.expires_at = now + SALE_HOLD_TTL
        else:
            hold = SaleHold(
                hold_id=hold_id,
                customer_id=int(data['customerId']) if data.get('customerId') else None,
                sale_id=sale_id,
                created_by=user_id,
                updated_by=user_id,
                payload=payload,
                status='active',
                created_at=now,
                updated_at=now,
                expires_at=now + SALE_HOLD_TTL,
            )
            db.session.add(hold)
        db.session.commit()
        return jsonify(hold.to_dict()), 201
    except (TypeError, ValueError) as e:
        db.session.rollback()
        return jsonify({'error': f'Invalid hold payload: {str(e)}'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to save held invoice: {str(e)}'}), 500


@app.route('/api/held-invoices/<string:hold_id>', methods=['DELETE'])
@jwt_required()
def release_held_invoice(hold_id):
    try:
        hold = SaleHold.query.filter_by(hold_id=hold_id, status='active').first()
        if not hold:
            return jsonify({'message': 'Held invoice already released or not found'}), 200
        hold.status = 'released'
        hold.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({'success': True, 'holdId': hold_id}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to release held invoice: {str(e)}'}), 500


@app.route('/api/stock/reservations', methods=['GET'])
@jwt_required()
def get_stock_reservations():
    try:
        exclude_hold_id = request.args.get('excludeHoldId')
        return jsonify({
            'reservations': _reservation_totals(exclude_hold_id),
            'asOf': datetime.utcnow().isoformat(),
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to load stock reservations: {str(e)}'}), 500


@app.route('/api/sales', methods=['GET'])
@jwt_required()
def get_sales():
    sales = Sale.query.options(
        db.joinedload(Sale.customer),
        db.joinedload(Sale.user),
        db.subqueryload(Sale.items),
    ).all()
    return jsonify([sale.to_dict() for sale in sales])

def send_invoice_email_placeholder(email, sale):
    # Deprecated: use mail_utils.send_invoice_email
    pass

@app.route('/api/sales', methods=['POST'])
@jwt_required()
def create_sale():
    max_retries = 3
    retry_delay = 0.1  # 100ms
    
    for attempt in range(max_retries):
        try:
            # Start a new transaction with proper isolation
            db.session.begin()
            
            data = request.get_json()
            hold_id = data.get('hold_id') or data.get('holdId')
            # Remove non-sale fields from data before schema validation
            data.pop('invoice_number', None)
            data.pop('hold_id', None)
            data.pop('holdId', None)
            sale_data = SaleSchema(**data)
            
            # Validate customer exists
            customer = Customer.query.get(sale_data.customer_id)
            if not customer:
                db.session.rollback()
                return jsonify({"error": "Customer not found"}), 404
            
            user_id = get_jwt_identity()
            business_date = get_business_date()
            
            # Check backdate editing permission
            backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
            today = get_business_date()  # Use business date as reference, not calendar date
            # If editing not allowed and sale date is before current business date, block
            if backdate_opt and not backdate_opt.editing and business_date < today:
                db.session.rollback()
                return jsonify({"error": "You do not have permission to create sales for previous dates."}), 403
            
            # Check current date editing permission
            if backdate_opt and not getattr(backdate_opt, 'current_editing', True) and business_date == today:
                db.session.rollback()
                return jsonify({"error": "You do not have permission to create sales for today."}), 403
            
            next_invoice = _allocate_invoice_document_number()
            
            # Use business date if provided, otherwise use current business date
            sale_date = None
            if hasattr(sale_data, 'date') and sale_data.date:
                try:
                    sale_date = datetime.strptime(sale_data.date, '%Y-%m-%d').date()
                except:
                    sale_date = get_business_date()
            else:
                sale_date = get_business_date()
            
            # Create sale with all data at once
            new_sale = Sale(
                invoice_number=next_invoice,
                customer_id=sale_data.customer_id,
                customer_type=sale_data.customer_type,
                payment_status=sale_data.payment_status,
                subtotal=sale_data.subtotal,
                porterage=sale_data.porterage,
                porterage_type=sale_data.porterage_type or 'per_unit',
                porterage_rate=sale_data.porterage_rate or 0,
                vat_rate=sale_data.vat_rate,
                vat_amount=sale_data.vat_amount,
                total_amount=sale_data.total_amount,
                vehicle_details=sale_data.vehicle_details,
                gate_number=sale_data.gate_number,
                notes=sale_data.notes,
                status=sale_data.status,
                created_by=user_id,
                date=datetime.combine(sale_date, datetime.now().time())
            )
            
            # Add sale to session
            db.session.add(new_sale)
            db.session.flush()  # Get new_sale.id without committing
            
            # Process all sale items at once
            sale_items = []
            stock_updates = []
            
            for item_data in sale_data.items:
                # Determine product name
                product_name = None
                if item_data.product_id:
                    product = RegularProduct.query.get(item_data.product_id)
                    if product:
                        product_name = product.description
                elif item_data.non_product_id:
                    product = NonProduct.query.get(item_data.non_product_id)
                    if product:
                        product_name = product.description
                # Get username for added_by
                item_user = User.query.get(user_id)
                item_username = item_user.username if item_user else None
                new_item = SaleItem(
                    sale_id=new_sale.id,
                    product_id=item_data.product_id,
                    non_product_id=item_data.non_product_id,
                    quantity=item_data.quantity,
                    unit_price=item_data.unit_price,
                    total_price=item_data.total_price,
                    notes=item_data.notes,
                    added_by=item_data.added_by or item_username,
                    highlighted=item_data.highlighted
                )
                # Attach productName for template use
                new_item.productName = product_name
                sale_items.append(new_item)
                
                # Prepare stock updates if sale is finalized
                if sale_data.status == 'finalized':
                    if item_data.product_id:
                        if item_data.quantity > 0:
                            # Normal sale - reduce stock
                            stock_updates.append({
                                'product_id': item_data.product_id,
                                'product_type': 'regular',
                                'quantity_change': -item_data.quantity,
                                'movement_type': 'sale',
                                'remarks': f"Sale invoice: {next_invoice}"
                            })
                        else:
                            # Negative quantity - customer return, increase stock
                            stock_updates.append({
                                'product_id': item_data.product_id,
                                'product_type': 'regular',
                                'quantity_change': abs(item_data.quantity),
                                'movement_type': 'customer_return',
                                'remarks': f"Customer return via sale invoice: {next_invoice}",
                                'is_return': True,
                                'item_data': item_data
                            })
                    elif item_data.non_product_id:
                        if item_data.quantity > 0:
                            # Normal sale - reduce stock
                            stock_updates.append({
                                'product_id': item_data.non_product_id,
                                'product_type': 'non',
                                'quantity_change': -item_data.quantity,
                                'movement_type': 'sale',
                                'remarks': f"Sale invoice: {next_invoice}"
                            })
                        else:
                            # Negative quantity - customer return, increase stock
                            stock_updates.append({
                                'product_id': item_data.non_product_id,
                                'product_type': 'non',
                                'quantity_change': abs(item_data.quantity),
                                'movement_type': 'customer_return',
                                'remarks': f"Customer return via sale invoice: {next_invoice}",
                                'is_return': True,
                                'item_data': item_data
                            })
            
            # Add all sale items at once
            db.session.add_all(sale_items)
            
            # Process stock updates efficiently
            stock_warnings = []
            customer_returns_created = []
            
            for stock_update in stock_updates:
                success, result = update_product_stock(
                    product_id=stock_update['product_id'],
                    product_type=stock_update['product_type'],
                    quantity_change=stock_update['quantity_change'],
                    movement_type=stock_update['movement_type'],
                    reference_id=new_sale.id,
                    reference_type='sale',
                    remarks=stock_update['remarks'],
                    user_id=user_id,
                    movement_date=new_sale.date  # Pass the sale date to stock movement
                )
                if not success and 'Insufficient stock' in str(result):
                    # db.session.rollback()
                    stock_warnings.append(str(result))
                elif not success:
                    db.session.rollback()
                    return jsonify({"error": f"Stock update failed: {result}"}), 400
                
                # If this is a return (negative quantity), create customer return entry
                if stock_update.get('is_return', False):
                    try:
                        item_data = stock_update['item_data']
                        
                        # Get product details for description
                        product_description = None
                        if item_data.product_id:
                            product = RegularProduct.query.get(item_data.product_id)
                            if product:
                                product_description = product.description
                        elif item_data.non_product_id:
                            product = NonProduct.query.get(item_data.non_product_id)
                            if product:
                                product_description = product.description
                        
                        # Generate customer return reference number
                        last_return = CustomerReturn.query.order_by(CustomerReturn.id.desc()).first()
                        ref_number = f"CR{1 if not last_return else last_return.id + 1:04d}"
                        
                        # Create customer return entry
                        customer_return = CustomerReturn(
                            ref_number=ref_number,
                            date=sale_date,
                            customer_id=new_sale.customer_id,
                            sale_id=new_sale.id,
                            product_id=item_data.product_id if item_data.product_id else item_data.non_product_id,
                            product_type=stock_update['product_type'],
                            description=product_description or f"Product ID: {item_data.product_id or item_data.non_product_id}",
                            invoice_number=next_invoice,
                            remarks=f"Customer return via negative quantity in sale invoice {next_invoice}",
                            quantity=abs(item_data.quantity),
                            unit_price=abs(item_data.unit_price),
                            total_value=abs(item_data.total_price),
                            return_reason="Return via negative quantity sale",
                            credit_note_issued=False,
                            credit_note_amount=0,
                            status='completed',
                            created_by=user_id
                        )
                        
                        db.session.add(customer_return)
                        db.session.flush()  # Get customer_return.id

                        # Fix 4: update the StockMovement reference to point to the CustomerReturn
                        # (was previously pointing to the sale, causing it to be missed in stock check C.RTN)
                        cr_movement = StockMovement.query.filter_by(
                            reference_id=new_sale.id,
                            reference_type='sale',
                            product_id=stock_update['product_id'],
                            movement_type='customer_return'
                        ).order_by(StockMovement.created_at.desc()).first()
                        if cr_movement:
                            cr_movement.reference_id = customer_return.id
                            cr_movement.reference_type = 'customer_return'

                        customer_returns_created.append(ref_number)
                        
                    except Exception as e:
                        # A negative sale is only valid when its customer-return
                        # entity is created in the same transaction. Roll back
                        # the sale and stock movement instead of committing an
                        # invisible return effect.
                        db.session.rollback()
                        return jsonify({"error": f"Failed to create customer return for negative sale: {str(e)}"}), 400
            
            # A finalized sale consumes its own reservation. This occurs in
            # the same transaction as sale and stock writes, so a failed sale
            # leaves the hold active and available to resume.
            if sale_data.status == 'finalized':
                _release_sale_hold(hold_id, new_sale.id)

            # Commit everything at once
            db.session.commit()
            
            # Update customer running balance
            try:
                customer = Customer.query.get(new_sale.customer_id)
                if customer:
                    # Add the sale total to the customer's running balance
                    current_balance = float(customer.running_balance or 0)
                    new_balance = current_balance + float(new_sale.total_amount)
                    customer.running_balance = new_balance
                    db.session.commit()
                    print(f"Updated customer {customer.customer_name} running balance: {current_balance} + {new_sale.total_amount} = {new_balance}")
            except Exception as e:
                print(f"Warning: Failed to update customer running balance: {str(e)}")
                # Don't fail the sale creation if running balance update fails
            
            # Return the result
            result = new_sale.to_dict()
            if stock_warnings:
                result['stockWarnings'] = stock_warnings
                
            # Mail invoice if requested
            if request.json.get('mailInvoice'):
                customer = Customer.query.get(new_sale.customer_id)
                if customer:
                    try:
                        # Get email data from request
                        email_data = request.json.get('emailData')
                        all_emails = []
                        
                        if email_data:
                            # Use emails from emailData (customer emails + additional emails)
                            customer_emails = email_data.get('customerEmails', '')
                            additional_emails = email_data.get('additionalEmails', '')
                            
                            # Add customer emails
                            if customer_emails:
                                all_emails.extend([email.strip() for email in customer_emails.split(',') if email.strip()])
                            
                            # Add additional emails
                            if additional_emails:
                                all_emails.extend([email.strip() for email in additional_emails.split(',') if email.strip()])
                        
                        # Always check customer's stored email as fallback/additional source
                        if customer.email:
                            customer_stored_emails = [email.strip() for email in customer.email.split(',') if email.strip()]
                            # Add any customer stored emails that aren't already in the list
                            for email in customer_stored_emails:
                                if email and email not in all_emails:
                                    all_emails.append(email)
                        
                        # Remove duplicates while preserving order
                        unique_emails = []
                        for email in all_emails:
                            if email and email not in unique_emails:
                                unique_emails.append(email)
                        
                        # Send emails
                        if unique_emails:
                            for email in unique_emails:
                                send_invoice_email(mail, email, new_sale, customer)
                            print(f"Email sent successfully to {', '.join(unique_emails)}")
                        else:
                            print("No valid email addresses found")
                            
                    except Exception as e:
                        print(f"Failed to send email: {str(e)}")
                        # Don't fail the sale creation if email fails
            return jsonify(result), 201
            
        except Exception as e:
            db.session.rollback()
            # Retry if database is locked
            if 'database is locked' in str(e).lower() and attempt < max_retries - 1:
                time.sleep(retry_delay * (attempt + 1))
                continue
            # Return specific error messages
            error_msg = str(e)
            if 'UNIQUE constraint failed' in error_msg:
                return jsonify({"error": "Invoice number already exists. Please try again."}), 400
            elif 'FOREIGN KEY constraint failed' in error_msg:
                return jsonify({"error": "Invalid customer or product reference."}), 400
            else:
                return jsonify({"error": f"Failed to create sale: {error_msg}"}), 500

def _edit_lock_payload(lock, include_token=False):
    payload = lock.to_dict()
    payload['locked'] = True
    if include_token:
        payload['lockToken'] = lock.lock_token
    return payload


def _edit_lock_conflict(lock):
    payload = _edit_lock_payload(lock)
    payload.update({
        'error': 'Invoice is currently being edited by another user.',
        'code': 'INVOICE_EDIT_LOCKED',
    })
    return jsonify(payload), 409


@app.route('/api/sales/<int:id>/edit-lock', methods=['POST'])
@jwt_required()
def acquire_sale_edit_lock(id):
    """Acquire or reuse the exclusive edit lock for an existing sale."""
    user_id = int(get_jwt_identity())
    sale = Sale.query.get_or_404(id)
    user = User.query.get(user_id)
    settings = SystemSettings.query.first()
    if settings and settings.lock_invoices and (not user or user.user_type != 'admin'):
        return jsonify({
            'error': 'Invoice editing is restricted. Open this invoice in read-only mode.',
            'code': 'INVOICE_EDIT_READ_ONLY',
        }), 403
    if sale.payment_status in ('paid', 'overpaid') and (not user or user.user_type != 'admin'):
        return jsonify({
            'error': 'This paid invoice can only be edited by an administrator.',
            'code': 'INVOICE_EDIT_READ_ONLY',
        }), 403

    existing_lock = SaleEditLock.query.options(
        db.joinedload(SaleEditLock.user)
    ).filter_by(sale_id=sale.id).first()

    if existing_lock:
        if existing_lock.user_id != user_id:
            return _edit_lock_conflict(existing_lock)
        return jsonify(_edit_lock_payload(existing_lock, include_token=True)), 200

    lock = SaleEditLock(
        sale_id=sale.id,
        user_id=user_id,
        lock_token=uuid.uuid4().hex,
    )
    db.session.add(lock)
    try:
        # The unique sale_id constraint makes acquisition safe when two users
        # click Edit at the same time; one transaction wins the lock.
        db.session.commit()
    except Exception as error:
        db.session.rollback()
        existing_lock = SaleEditLock.query.options(
            db.joinedload(SaleEditLock.user)
        ).filter_by(sale_id=sale.id).first()
        if existing_lock:
            if existing_lock.user_id != user_id:
                return _edit_lock_conflict(existing_lock)
            return jsonify(_edit_lock_payload(existing_lock, include_token=True)), 200
        print(f"[ERROR] Failed to acquire invoice edit lock: {error}")
        return jsonify({'error': 'Unable to acquire invoice edit lock'}), 500

    return jsonify(_edit_lock_payload(lock, include_token=True)), 201


@app.route('/api/sales/<int:id>/edit-lock', methods=['DELETE'])
@jwt_required()
def release_sale_edit_lock(id):
    """Release an edit lock only when the requesting user owns its token."""
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    lock_token = data.get('lockToken') or data.get('editLockToken')
    lock = SaleEditLock.query.filter_by(sale_id=id).first()

    if not lock:
        return jsonify({'locked': False}), 200
    if lock.user_id != user_id or not lock_token or lock.lock_token != lock_token:
        return jsonify({
            'error': 'Only the user who owns this invoice lock can release it.',
            'code': 'INVOICE_EDIT_LOCK_FORBIDDEN',
        }), 403

    db.session.delete(lock)
    db.session.commit()
    return jsonify({'locked': False}), 200


@app.route('/api/sales/<string:invoice_number>', methods=['GET'])
@jwt_required()
def get_sale_by_invoice(invoice_number):
    try:
        sale = Sale.query.options(db.joinedload(Sale.user)).filter_by(invoice_number=invoice_number).first()
        if not sale:
            return jsonify({"message": "Sale not found"}), 404
        
        response_data = sale.to_dict()
        response_data['discountTotal'] = float(_active_discount_total_for_sale(sale.id))
        response_data['outstandingAmount'] = float(_sale_outstanding(sale))
        edit_lock = SaleEditLock.query.options(
            db.joinedload(SaleEditLock.user)
        ).filter_by(sale_id=sale.id).first()
        if edit_lock:
            response_data['editLock'] = _edit_lock_payload(edit_lock)

        return jsonify(response_data), 200
    except Exception as e:
        print(f"[ERROR] Exception in get_sale_by_invoice: {str(e)}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/sales/<int:id>', methods=['PUT'])
@jwt_required()
def update_sale(id):
    data = request.get_json()
    hold_id = data.get('hold_id') or data.get('holdId') if isinstance(data, dict) else None
    edit_lock_token = data.get('edit_lock_token') or data.get('editLockToken') if isinstance(data, dict) else None
    print(f"[DEBUG] Received sale update request for ID {id}")
    print(f"[DEBUG] Request data: {data}")
    try:
        if isinstance(data, dict):
            data.pop('hold_id', None)
            data.pop('holdId', None)
            data.pop('edit_lock_token', None)
            data.pop('editLockToken', None)
        sale_data = SaleSchema(**data)
        sale = Sale.query.options(db.joinedload(Sale.user)).get_or_404(id)
        if CustomerDiscount.query.filter_by(sale_id=sale.id).first():
            return jsonify({"error": "This invoice has customer discount history and cannot be rebuilt."}), 409
        user_id = int(get_jwt_identity())
        edit_lock = SaleEditLock.query.options(db.joinedload(SaleEditLock.user)).filter_by(sale_id=sale.id).first()
        if not edit_lock:
            return jsonify({
                'error': 'This invoice is not locked for editing. Reopen it in editable mode before saving.',
                'code': 'INVOICE_EDIT_LOCK_REQUIRED',
            }), 409
        if edit_lock.user_id != user_id or not edit_lock_token or edit_lock.lock_token != edit_lock_token:
            if edit_lock.user_id != user_id:
                return _edit_lock_conflict(edit_lock)
            return jsonify({
                'error': 'The invoice edit lock token is invalid or no longer valid.',
                'code': 'INVOICE_EDIT_LOCK_INVALID',
            }), 409
        
        # Check backdate editing permission
        backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
        today = get_business_date()  # Use business date as reference, not calendar date
        # If editing not allowed and sale.date is in the past, block
        if backdate_opt and not backdate_opt.editing and sale.date.date() < today:
            return jsonify({"error": "You do not have permission to edit sales for previous dates."}), 403
        
        # Check current date editing permission
        if backdate_opt and not getattr(backdate_opt, 'current_editing', True) and sale.date.date() == today:
            return jsonify({"error": "You do not have permission to edit sales for today."}), 403

        # Block editing paid invoices for non-admin users
        if sale.payment_status in ('paid', 'overpaid'):
            user = User.query.get(user_id)
            if not user or user.user_type != 'admin':
                return jsonify({"error": "This invoice has been paid and cannot be edited. Only admin users can modify paid invoices."}), 403

        # Initialize stock warnings list
        if sale.payment_status in ('paid', 'overpaid'):
            user = User.query.get(user_id)
            if not user or user.user_type != 'admin':
                return jsonify({"error": "This invoice has been paid and cannot be edited. Only admin users can modify paid invoices."}), 403

        # Initialize stock warnings list
        stock_warnings = []

        # Only auto-generated negative-line returns are rebuilt from the
        # edited invoice. Manually recorded customer returns linked to the sale
        # must remain independent transactions.
        auto_customer_returns = CustomerReturn.query.filter_by(
            sale_id=sale.id,
            return_reason='Return via negative quantity sale'
        ).all()

        # Store old status and items to check changes
        old_status = sale.status
        new_status = sale_data.status
        # Create detailed item comparison for better change detection
        # Aggregated per product so duplicate line items (same product twice)
        # are summed instead of silently overwritten.
        old_items_detailed = {}
        for item in sale.items:
            key = (item.product_id, item.non_product_id)
            old_items_detailed[key] = old_items_detailed.get(key, 0.0) + safe_float(item.quantity)
        
        new_items_detailed = {}
        for item in sale_data.items:
            key = (item.product_id, item.non_product_id)
            new_items_detailed[key] = new_items_detailed.get(key, 0.0) + safe_float(item.quantity)
        
        # Calculate actual quantity changes (only for items in BOTH old and new)
        # Items only in old are handled by the "removed from invoice" loop below
        quantity_changes = {}
        for key in new_items_detailed:
            if key in old_items_detailed:
                old_qty = old_items_detailed[key]
                new_qty = new_items_detailed[key]
                print(f"[DEBUG] Product {key}: old_qty={old_qty}, new_qty={new_qty}")
                if abs(old_qty - new_qty) > 0.001:
                    change = new_qty - old_qty
                    quantity_changes[key] = change
                    print(f"[DEBUG] Detected quantity change for {key}: {change}")
        
        # Debug logging
        print(f"[DEBUG] Sale ID: {sale.id}, Invoice: {sale.invoice_number}")
        print(f"[DEBUG] Old items detailed: {old_items_detailed}")
        print(f"[DEBUG] New items detailed: {new_items_detailed}")
        print(f"[DEBUG] Quantity changes: {quantity_changes}")
        print(f"[DEBUG] Old status: {old_status}, New status: {new_status}")
        print(f"[DEBUG] Will process stock updates: {len(quantity_changes) > 0 and old_status == 'finalized' and new_status == 'finalized'}")
        
        # Save original time before any updates
        original_time = sale.date.time() if sale.date else datetime.now().time()
        
        # Update sale fields (excluding date which we handle separately)
        for key, value in sale_data.dict(exclude={'items', 'date'}).items():
            setattr(sale, key, value)
        
        # Update date if provided, otherwise preserve original date+time
        if sale_data.date:
            try:
                if isinstance(sale_data.date, str):
                    if 'T' in sale_data.date:
                        parsed_date = datetime.fromisoformat(sale_data.date.replace('Z', '+00:00'))
                    else:
                        parsed_date = datetime.strptime(sale_data.date, '%Y-%m-%d')
                    sale.date = parsed_date.replace(
                        hour=original_time.hour,
                        minute=original_time.minute,
                        second=original_time.second
                    )
                else:
                    sale.date = sale_data.date
            except (ValueError, TypeError):
                sale.date = datetime.combine(get_business_date(), original_time)
        else:
            sale.date = datetime.combine(get_business_date(), original_time)
        
        # Update sale items
        sale.items = []  # Clear existing items
        # Get username for added_by
        item_user = User.query.get(user_id)
        item_username = item_user.username if item_user else None
        for item_data in sale_data.items:
            # Determine product name
            product_name = None
            if item_data.product_id:
                product = RegularProduct.query.get(item_data.product_id)
                if product:
                    product_name = product.description
            elif item_data.non_product_id:
                product = NonProduct.query.get(item_data.non_product_id)
                if product:
                    product_name = product.description
            sale_item = SaleItem(
                product_id=item_data.product_id,
                non_product_id=item_data.non_product_id,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                total_price=item_data.total_price,
                notes=item_data.notes,
                added_by=item_data.added_by or item_username,
                highlighted=item_data.highlighted
            )
            # Attach productName for template use
            sale_item.productName = product_name
            sale.items.append(sale_item)
        
        # Handle stock updates based on status and quantity changes
        if old_status != 'finalized' and new_status == 'finalized':
            # Stock should be updated when status changes to finalized
            for item_data in sale_data.items:
                if item_data.product_id:
                    # Regular product
                    if item_data.quantity > 0:
                        # Normal sale - reduce stock
                        success, result = update_product_stock(
                            product_id=item_data.product_id,
                            product_type='regular',
                            quantity_change=-safe_float(item_data.quantity),
                            movement_type='sale',
                            reference_id=sale.id,
                            reference_type='sale',
                            remarks=f"Sale invoice finalized: {sale.invoice_number}",
                            user_id=user_id,
                            movement_date=sale.date
                        )
                    else:
                        # Negative quantity - customer return, increase stock
                        success, result = update_product_stock(
                            product_id=item_data.product_id,
                            product_type='regular',
                            quantity_change=abs(safe_float(item_data.quantity)),
                            movement_type='customer_return',
                            reference_id=sale.id,
                            reference_type='sale',
                            remarks=f"Customer return via sale invoice: {sale.invoice_number}",
                            movement_date=sale.date,
                            user_id=user_id
                        )
                        
                    if not success:
                        if 'Insufficient stock' in result:
                            stock_warnings.append(f"Insufficient stock for product ID {item_data.product_id}: {result}")
                        else:
                            return jsonify({"error": f"Stock update failed: {result}"}), 400
                            
                elif item_data.non_product_id:
                    # Non-product
                    if item_data.quantity > 0:
                        # Normal sale - reduce stock
                        success, result = update_product_stock(
                            product_id=item_data.non_product_id,
                            product_type='non',
                            quantity_change=-safe_float(item_data.quantity),
                            movement_type='sale',
                            reference_id=sale.id,
                            reference_type='sale',
                            remarks=f"Sale invoice finalized: {sale.invoice_number}",
                            user_id=user_id,
                            movement_date=sale.date
                        )
                    else:
                        # Negative quantity - customer return, increase stock
                        success, result = update_product_stock(
                            product_id=item_data.non_product_id,
                            product_type='non',
                            quantity_change=abs(safe_float(item_data.quantity)),
                            movement_type='customer_return',
                            reference_id=sale.id,
                            reference_type='sale',
                            remarks=f"Customer return via sale invoice: {sale.invoice_number}",
                            user_id=user_id,
                            movement_date=sale.date
                        )
                        
                    if not success:
                        if 'Insufficient stock' in result:
                            stock_warnings.append(f"Insufficient stock for non-product ID {item_data.non_product_id}: {result}")
                        else:
                            return jsonify({"error": f"Stock update failed: {result}"}), 400
        elif old_status == 'finalized' and new_status != 'finalized':
            # If status is changing from finalized to something else, we should restore stock
            # This handles cases where a finalized sale is cancelled or changed back to draft.
            # Reverse the ACTUAL net effect recorded in the movement ledger rather than
            # relying on the (already rewritten) item list, so duplicate/stale movements
            # are fully unwound regardless of how the sale was edited.
            existing = _get_sale_stock_movements(sale.id)
            per_product = {}
            for m in existing:
                key = (m.product_id, m.product_type)
                per_product[key] = per_product.get(key, 0.0) + safe_float(m.quantity)

            for (product_id, product_type), net_effect in per_product.items():
                if abs(net_effect) < 0.001:
                    continue
                reversal_type = 'sale_cancellation' if net_effect < 0 else 'customer_return_cancellation'
                success, result = update_product_stock(
                    product_id=product_id,
                    product_type=product_type,
                    quantity_change=-net_effect,
                    movement_type=reversal_type,
                    reference_id=sale.id,
                    reference_type='sale',
                    remarks=f"Sale invoice status changed from finalized: {sale.invoice_number}",
                    user_id=user_id,
                    movement_date=sale.date
                )
                if not success:
                    if 'Insufficient stock' in result:
                        stock_warnings.append(f"Stock restoration warning for product {product_id}: {result}")
                    else:
                        return jsonify({"error": f"Stock restoration failed: {result}"}), 400
        elif old_status == 'finalized' and new_status == 'finalized':
            # Reconcile stock for a finalized invoice update.
            # The net stock effect of a sale on a product is derived from the
            # signed movement ledger (sales reduce stock, customer returns
            # increase it). We read the CURRENT net effect from ALL existing
            # movements for this sale+product (both sale and return families),
            # compute the TARGET effect from the new items, apply the difference,
            # then collapse all stale/duplicate movements into a single clean
            # record so the ledger always matches the item list exactly.
            print(f"[DEBUG] Processing finalized invoice update. Quantity changes: {quantity_changes}")

            all_keys = set(old_items_detailed.keys()) | set(new_items_detailed.keys())
            for key in all_keys:
                product_id, non_product_id = key
                actual_product_id = product_id if product_id else non_product_id
                product_type = 'regular' if product_id else 'non'
                new_qty = new_items_detailed.get(key, 0.0)

                # Current net effect from existing movements (both families)
                existing = [movement for movement in _get_sale_stock_movements(sale.id)
                            if movement.product_id == actual_product_id
                            and movement.product_type == product_type]
                current_net = sum(safe_float(m.quantity) for m in existing)

                # Target net effect: negative for sales, positive for returns
                if new_qty > 0:
                    target = -safe_float(new_qty)
                elif new_qty < 0:
                    target = abs(safe_float(new_qty))
                else:
                    target = 0.0

                delta = target - current_net
                if abs(delta) > 0.001:
                    print(f"[DEBUG] Reconcile product {actual_product_id}: current_net={current_net}, target={target}, delta={delta}")
                    adj_type = 'sale' if new_qty > 0 else 'customer_return'
                    success, result = update_product_stock(
                        product_id=actual_product_id,
                        product_type=product_type,
                        quantity_change=delta,
                        movement_type=adj_type,
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Sale invoice updated: {sale.invoice_number}",
                        user_id=user_id,
                        movement_date=sale.date
                    )
                    if not success:
                        if 'Insufficient stock' in result:
                            stock_warnings.append(f"Insufficient stock for product ID {actual_product_id}: {result}")
                        else:
                            return jsonify({"error": f"Stock update failed: {result}"}), 400

                # Collapse stale movements into a single clean record equal to target
                if existing:
                    existing_ids = [m.id for m in existing]
                    for m in existing:
                        db.session.delete(m)
                    # Remove the delta movement created above (replaced by the clean record)
                    stale = StockMovement.query.filter(
                        StockMovement.reference_id == sale.id,
                        StockMovement.reference_type == 'sale',
                        StockMovement.product_id == actual_product_id,
                        StockMovement.product_type == product_type,
                        StockMovement.movement_type.in_(_SALE_FAMILY + _RETURN_FAMILY),
                        ~StockMovement.id.in_(existing_ids)
                    ).all()
                    for m in stale:
                        db.session.delete(m)
                    if abs(target) > 0.001:
                        mtype = 'sale' if target < 0 else 'customer_return'
                        db.session.flush()
                        product = RegularProduct.query.get(actual_product_id) if product_type == 'regular' else NonProduct.query.get(actual_product_id)
                        new_stock = safe_float(product.current_stock)
                        db.session.add(StockMovement(
                            product_id=actual_product_id,
                            product_type=product_type,
                            movement_type=mtype,
                            quantity=target,
                            reference_id=sale.id,
                            reference_type='sale',
                            previous_stock=new_stock - target,
                            new_stock=new_stock,
                            movement_date=sale.date,
                            remarks=f"Sale invoice updated: {sale.invoice_number}",
                            created_by=user_id,
                            created_at=datetime.now()
                        ))
        
        # Remove old auto-generated return rows only after their linked stock
        # movements were included in the reconciliation above.
        for old_customer_return in auto_customer_returns:
            db.session.delete(old_customer_return)
        db.session.flush()

        # Re-create customer return entries for any negative-quantity items
        customer_returns_created = []
        for item in sale_data.items:
            if new_status == 'finalized' and safe_float(item.quantity) < 0:
                try:
                    product_id = item.product_id or item.non_product_id
                    product_type = 'regular' if item.product_id else 'non'
                    product_description = None
                    if item.product_id:
                        product = RegularProduct.query.get(item.product_id)
                    else:
                        product = NonProduct.query.get(item.non_product_id)
                    product_description = product.description if product else f"Product ID: {product_id}"

                    last_return = CustomerReturn.query.order_by(CustomerReturn.id.desc()).first()
                    ref_number = f"CR{1 if not last_return else last_return.id + 1:04d}"

                    customer_return = CustomerReturn(
                        ref_number=ref_number,
                        date=sale.date.date() if hasattr(sale.date, 'date') else sale.date,
                        customer_id=sale.customer_id,
                        sale_id=sale.id,
                        product_id=product_id,
                        product_type=product_type,
                        description=product_description,
                        invoice_number=sale.invoice_number,
                        remarks=f"Customer return via negative quantity in sale invoice {sale.invoice_number}",
                        quantity=abs(item.quantity),
                        unit_price=abs(item.unit_price),
                        total_value=abs(item.total_price),
                        return_reason="Return via negative quantity sale",
                        credit_note_issued=False,
                        credit_note_amount=0,
                        status='completed',
                        created_by=user_id
                    )
                    db.session.add(customer_return)
                    db.session.flush()
                    _relink_negative_sale_return_movement(sale.id, customer_return)
                    customer_returns_created.append(ref_number)
                except Exception as e:
                    # Do not commit an edited sale whose negative line cannot
                    # be represented by a completed CustomerReturn entity.
                    db.session.rollback()
                    return jsonify({"error": f"Failed to create customer return for negative sale: {str(e)}"}), 400

        # A finalized sale consumes its own reservation in the same
        # transaction as the sale update and stock reconciliation.
        if new_status == 'finalized':
            _release_sale_hold(hold_id, sale.id)

        # A successful update completes the exclusive edit session. Keeping
        # deletion in this transaction preserves the lock when an update fails.
        db.session.delete(edit_lock)
        db.session.commit()
        # Mail invoice if requested
        if request.json.get('mailInvoice'):
            customer = Customer.query.get(sale.customer_id)
            if customer:
                try:
                    # Get email data from request
                    email_data = request.json.get('emailData')
                    all_emails = []
                    
                    if email_data:
                        # Use emails from emailData (customer emails + additional emails)
                        customer_emails = email_data.get('customerEmails', '')
                        additional_emails = email_data.get('additionalEmails', '')
                        
                        # Add customer emails
                        if customer_emails:
                            all_emails.extend([email.strip() for email in customer_emails.split(',') if email.strip()])
                        
                        # Add additional emails
                        if additional_emails:
                            all_emails.extend([email.strip() for email in additional_emails.split(',') if email.strip()])
                    else:
                        # Fallback to customer's stored email if no emailData
                        if customer.email:
                            all_emails = [email.strip() for email in customer.email.split(',') if email.strip()]
                    
                    # Remove duplicates while preserving order
                    unique_emails = []
                    for email in all_emails:
                        if email and email not in unique_emails:
                            unique_emails.append(email)
                    
                    # Send emails
                    if unique_emails:
                        for email in unique_emails:
                            send_invoice_email(mail, email, sale, customer)
                        print(f"Email sent successfully to {', '.join(unique_emails)}")
                    else:
                        print("No valid email addresses found")
                        
                except Exception as e:
                    print(f"Failed to send email: {str(e)}")
                    # Don't fail the sale update if email fails
        
        # Return sale data with stock warnings if any
        data = sale.to_dict()
        if stock_warnings:
            data['stockWarnings'] = stock_warnings
        return jsonify(data)
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/sales/<int:id>', methods=['PATCH'])
@jwt_required()
def patch_sale(id):
    """Partial update for sale - only update specific fields"""
    data = request.get_json()
    try:
        sale = Sale.query.get_or_404(id)
        user_id = get_jwt_identity()
        if CustomerDiscount.query.filter_by(sale_id=sale.id).first():
            return jsonify({"error": "This invoice has customer discount history and cannot be edited."}), 409
        
        # Check backdate editing permission
        backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
        today = get_business_date()  # Use business date as reference, not calendar date
        # If editing not allowed and sale.date is in the past, block
        if backdate_opt and not backdate_opt.editing and sale.date.date() < today:
            return jsonify({"error": "You do not have permission to edit sales for previous dates."}), 403
        
        # Check current date editing permission
        if backdate_opt and not getattr(backdate_opt, 'current_editing', True) and sale.date.date() == today:
            return jsonify({"error": "You do not have permission to edit sales for today."}), 403
        
        # Only update the fields provided in the request
        allowed_fields = ['customer_type', 'payment_status', 'notes', 'vehicle_details', 'gate_number']
        
        for field in allowed_fields:
            if field in data:
                setattr(sale, field, data[field])
        
        # Handle date separately to preserve existing time
        if 'date' in data:
            try:
                parsed_date = datetime.strptime(data['date'], '%Y-%m-%d')
                sale.date = parsed_date.replace(
                    hour=sale.date.hour,
                    minute=sale.date.minute,
                    second=sale.date.second
                )
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400
        
        # Special handling for payment status logic
        if 'customer_type' in data:
            # When changing customer_type, also update payment_status appropriately
            if data['customer_type'] == 'account':
                # For account customers, set to pending if not already paid
                if sale.payment_status not in ['paid', 'overpaid']:
                    sale.payment_status = 'pending'
            elif data['customer_type'] in ['cash', 'bank']:
                # For cash/bank customers, set to paid if not already set
                if sale.payment_status not in ['paid', 'overpaid']:
                    sale.payment_status = 'paid'
        
        db.session.commit()
        return jsonify(sale.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/sales/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_sale(id):
    sale = Sale.query.get_or_404(id)
    try:
        user_id = get_jwt_identity()
        if CustomerDiscount.query.filter_by(sale_id=sale.id).first():
            return jsonify({"error": "This invoice has customer discount history and cannot be deleted."}), 409

        # Restore stock if the sale was finalized
        if sale.status == 'finalized':
            # Reverse the ACTUAL net effect recorded in the movement ledger rather than
            # relying on the item list, so duplicate/stale movements are fully unwound.
            existing = _get_sale_stock_movements(sale.id)
            per_product = {}
            for m in existing:
                key = (m.product_id, m.product_type)
                per_product[key] = per_product.get(key, 0.0) + safe_float(m.quantity)

            for (product_id, product_type), net_effect in per_product.items():
                if abs(net_effect) < 0.001:
                    continue
                reversal_type = 'sale_cancellation' if net_effect < 0 else 'customer_return_cancellation'
                success, result = update_product_stock(
                    product_id=product_id,
                    product_type=product_type,
                    quantity_change=-net_effect,
                    movement_type=reversal_type,
                    reference_id=sale.id,
                    reference_type='sale',
                    remarks=f"Sale deleted: {sale.invoice_number}",
                    user_id=user_id,
                    movement_date=sale.date
                )
                if not success:
                    print(f"[WARN] Failed to restore stock for product {product_id} on sale delete: {result}")

        # Delete associated customer return records
        customer_returns = CustomerReturn.query.filter_by(sale_id=sale.id).all()
        for cr in customer_returns:
            _record_voided_invoice_document(
                cr.document_invoice_number,
                "return",
                cr.date,
                cr.customer.customer_name if cr.customer else None,
                cr.invoice_number,
                cr.user.username if cr.user else None,
            )
            db.session.delete(cr)

        _record_voided_invoice_document(
            sale.invoice_number,
            "invoice",
            sale.date,
            sale.customer.customer_name if sale.customer else None,
            salesman=sale.user.username if sale.user else None,
        )

        # Delete all sale items
        for item in sale.items:
            db.session.delete(item)

        db.session.delete(sale)
        db.session.commit()
        return jsonify({'message': 'Sale deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

# Purchase routes
@app.route('/api/purchases', methods=['GET'])
def get_purchases():
    purchases = Purchase.query.all()
    return jsonify([purchase.to_dict() for purchase in purchases])

@app.route('/api/purchases', methods=['POST'])
@jwt_required()
def create_purchase():
    data = request.get_json()
    try:
        user_id = get_jwt_identity()
        backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
        business_date = get_business_date()
        if backdate_opt and not getattr(backdate_opt, 'current_editing', True):
            return jsonify({'error': 'You do not have permission to create purchases for today.'}), 403
        
        purchase_data = PurchaseSchema(**data)
        # Get supplier name from supplier_id
        supplier = Supplier.query.get(purchase_data.supplier_id)
        if not supplier:
            return jsonify({'message': 'Supplier not found'}), 404
        # Use business date
        purchase = Purchase(
            supplier_id=purchase_data.supplier_id,
            supplier_name=supplier.supplier_name,
            amount=purchase_data.amount,
            date=business_date,
            status='pending'
        )
        db.session.add(purchase)
        db.session.commit()
        return jsonify(purchase.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Invalid purchase data: {str(e)}'}), 400

@app.route('/api/purchases/<int:id>', methods=['GET'])
@jwt_required()
def get_purchase(id):
    try:
        purchase = Purchase.query.get_or_404(id)
        return jsonify(purchase.to_dict())
    except Exception as e:
        return jsonify({"error": str(e)}), 500
        
# Product routes
@app.route('/api/products', methods=['GET'])
def get_products():
    regular_products = RegularProduct.query.all()
    non_products = NonProduct.query.all()
    return jsonify({
        'regularProducts': [product.to_dict() for product in regular_products],
        'nonProducts': [product.to_dict() for product in non_products]
    })

@app.route('/api/regular_products', methods=['GET'])
def get_regular_products():
    try:
        products = RegularProduct.query.all()
        return jsonify([product.to_dict() for product in products]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/products/regular/<int:id>', methods=['GET'])
def get_regular_product(id):
    try:
        product = RegularProduct.query.get_or_404(id)
        return jsonify(product.to_dict())
    except Exception as e:
        return jsonify({'message': str(e)}), 404

@app.route('/api/products/regular', methods=['POST'])
def create_regular_product():
    data = request.get_json()
    print("Received product data:", data)  # Debug log
    try:
        # Convert camelCase to snake_case for the schema
        product_data = {
            'product_code': data.get('productCode'),
            'sage_code': data.get('sageCode'),
            'hs_code': data.get('hsCode'),
            'description': data.get('description'),
            'selling_price': data.get('sellingPrice'),
            'tax_rate': data.get('taxRate'),
            'vat_code': data.get('vatCode'),
            'unit_of_purchase': data.get('unitOfPurchase'),
            'unit_of_sale': data.get('unitOfSale'),
            'location': data.get('location'),
            'nominal_code': data.get('nominalCode'),
            'stock_category': data.get('stockCategory'),
            'department_number': data.get('departmentNumber'),
            'supplier_ref': data.get('supplierRef'),
            'supplier_part_number': data.get('supplierPartNumber'),
            'reorder_level': data.get('reorderLevel'),
            'stock_level_flag': data.get('stockLevelFlag'),
            'commodity_code': data.get('commodityCode'),
            'unit_weight': data.get('unitWeight'),
            'stock_take_date': data.get('stockTakeDate'),
            'reorder_quantity': data.get('reorderQuantity'),
            'last_stock_take': data.get('lastStockTake'),
            'status': data.get('status', 'active'),
            'initial_stock': data.get('initialStock', 0)  # New field
        }
        
        # Validate the data using the schema
        validated_data = RegularProductSchema(**product_data)
        print("Validated product data:", validated_data.dict())  # Debug log
        
        # Create the product
        product = RegularProduct(**validated_data.dict())
        
        # Set current_stock to initial_stock
        product.current_stock = validated_data.initial_stock
        
        db.session.add(product)
        db.session.commit()
        
        # Create initial stock movement record if initial stock > 0
        if validated_data.initial_stock > 0:
            movement = StockMovement(
                product_id=product.id,
                product_type='regular',
                movement_type='adjustment',
                quantity=validated_data.initial_stock,
                reference_id=None,
                reference_type='initial_stock',
                previous_stock=0,
                new_stock=validated_data.initial_stock,
                movement_date=datetime.now().date(),
                remarks=f"Initial stock set to {validated_data.initial_stock}",
                created_by=None  # System created
            )
            db.session.add(movement)
            db.session.commit()

        stock_audit_log(
            "current_stock_initialized",
            product_id=product.id,
            product_type="regular",
            current_stock=safe_float(product.current_stock),
            initial_stock=safe_float(validated_data.initial_stock),
            movement_type="adjustment",
            reference_type="initial_stock",
            user_id=get_jwt_identity(),
            transaction_state="committed",
        )
        print("Product created successfully:", product.to_dict())  # Debug log
        return jsonify(product.to_dict())
    except Exception as e:
        db.session.rollback()
        print("Error creating product:", str(e))  # Debug log
        return jsonify({'message': str(e)}), 400

@app.route('/api/products/regular/<int:id>', methods=['PUT'])
def update_regular_product(id):
    data = request.get_json()
    print("Received update data:", data)  # Debug log
    try:
        # Convert camelCase to snake_case for the schema
        product_data = {
            'product_code': data.get('productCode'),
            'sage_code': data.get('sageCode'),
            'hs_code': data.get('hsCode'),
            'description': data.get('description'),
            'selling_price': data.get('sellingPrice'),
            'tax_rate': data.get('taxRate'),
            'vat_code': data.get('vatCode'),
            'unit_of_purchase': data.get('unitOfPurchase'),
            'unit_of_sale': data.get('unitOfSale'),
            'location': data.get('location'),
            'nominal_code': data.get('nominalCode'),
            'stock_category': data.get('stockCategory'),
            'department_number': data.get('departmentNumber'),
            'supplier_ref': data.get('supplierRef'),
            'supplier_part_number': data.get('supplierPartNumber'),
            'reorder_level': data.get('reorderLevel'),
            'stock_level_flag': data.get('stockLevelFlag'),
            'commodity_code': data.get('commodityCode'),
            'unit_weight': data.get('unitWeight'),
            'stock_take_date': data.get('stockTakeDate'),
            'reorder_quantity': data.get('reorderQuantity'),
            'last_stock_take': data.get('lastStockTake'),
            'status': data.get('status', 'active')
        }
        
        # Validate the data using the schema
        validated_data = RegularProductSchema(**product_data)
        print("Validated update data:", validated_data.dict())  # Debug log
        
        # Get the existing product
        product = RegularProduct.query.get_or_404(id)
        
        # Update the product fields
        for key, value in validated_data.dict().items():
            setattr(product, key, value)
        
        db.session.commit()
        print("Product updated successfully:", product.to_dict())  # Debug log
        return jsonify(product.to_dict())
    except Exception as e:
        db.session.rollback()
        print("Error updating product:", str(e))  # Debug log
        return jsonify({'message': str(e)}), 400

@app.route('/api/products/regular/<int:id>', methods=['DELETE'])
def delete_regular_product(id):
    try:
        product = RegularProduct.query.get_or_404(id)
        db.session.delete(product)
        db.session.commit()
        return jsonify({'message': 'Product deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

# Non-Product routes
@app.route('/api/non_products', methods=['GET'])
def get_non_products():
    try:
        products = NonProduct.query.all()
        return jsonify([product.to_dict() for product in products]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/products/non/<int:id>', methods=['GET'])
def get_non_product(id):
    try:
        product = NonProduct.query.get_or_404(id)
        return jsonify(product.to_dict())
    except Exception as e:
        return jsonify({'message': str(e)}), 404

@app.route('/api/products/non', methods=['POST'])
def create_non_product():
    data = request.get_json()
    print("Received non-product data:", data)  # Debug log
    try:
        # Convert camelCase to snake_case for the schema
        non_product_data = {
            'product_code': data.get('productCode'),
            'sage_code': data.get('sageCode'),
            'description': data.get('description'),
            'selling_price': data.get('sellingPrice'),
            'tax_rate': data.get('taxRate'),
            'vat_code': data.get('vatCode'),
            'unit_of_purchase': data.get('unitOfPurchase'),
            'unit_of_sale': data.get('unitOfSale'),
            'location': data.get('location'),
            'nominal_code': data.get('nominalCode'),
            'stock_category': data.get('stockCategory'),
            'department_number': data.get('departmentNumber'),
            'supplier_ref': data.get('supplierRef'),
            'supplier_part_number': data.get('supplierPartNumber'),
            'reorder_level': data.get('reorderLevel'),
            'stock_level_flag': data.get('stockLevelFlag'),
            'commodity_code': data.get('commodityCode'),
            'unit_weight': data.get('unitWeight'),
            'stock_take_date': data.get('stockTakeDate'),
            'reorder_quantity': data.get('reorderQuantity'),
            'last_stock_take': data.get('lastStockTake'),
            'status': data.get('status', 'active'),
            'initial_stock': data.get('initialStock', 0)  # New field
        }
        
        # Validate the data using the schema
        validated_data = NonProductSchema(**non_product_data)
        print("Validated non-product data:", validated_data.dict())  # Debug log
        
        # Create the non-product
        non_product = NonProduct(**validated_data.dict())
        
        # Set current_stock to initial_stock
        non_product.current_stock = validated_data.initial_stock
        
        db.session.add(non_product)
        db.session.commit()
        
        # Create initial stock movement record if initial stock > 0
        if validated_data.initial_stock > 0:
            movement = StockMovement(
                product_id=non_product.id,
                product_type='non',
                movement_type='adjustment',
                quantity=validated_data.initial_stock,
                reference_id=None,
                reference_type='initial_stock',
                previous_stock=0,
                new_stock=validated_data.initial_stock,
                movement_date=datetime.now().date(),
                remarks=f"Initial stock set to {validated_data.initial_stock}",
                created_by=None  # System created
            )
            db.session.add(movement)
            db.session.commit()

        stock_audit_log(
            "current_stock_initialized",
            product_id=non_product.id,
            product_type="non",
            current_stock=safe_float(non_product.current_stock),
            initial_stock=safe_float(validated_data.initial_stock),
            movement_type="adjustment",
            reference_type="initial_stock",
            user_id=get_jwt_identity(),
            transaction_state="committed",
        )
        print("Non-product created successfully:", non_product.to_dict())  # Debug log
        return jsonify(non_product.to_dict())
    except Exception as e:
        db.session.rollback()
        print("Error creating non-product:", str(e))  # Debug log
        return jsonify({'message': str(e)}), 400

@app.route('/api/products/non/<int:id>', methods=['PUT'])
def update_non_product(id):
    data = request.get_json()
    print("Received update data:", data)  # Debug log
    try:
        # Convert camelCase to snake_case for the schema
        non_product_data = {
            'product_code': data.get('productCode'),
            'sage_code': data.get('sageCode'),
            'description': data.get('description'),
            'selling_price': data.get('sellingPrice'),
            'tax_rate': data.get('taxRate'),
            'vat_code': data.get('vatCode'),
            'unit_of_purchase': data.get('unitOfPurchase'),
            'unit_of_sale': data.get('unitOfSale'),
            'location': data.get('location'),
            'nominal_code': data.get('nominalCode'),
            'stock_category': data.get('stockCategory'),
            'department_number': data.get('departmentNumber'),
            'supplier_ref': data.get('supplierRef'),
            'supplier_part_number': data.get('supplierPartNumber'),
            'reorder_level': data.get('reorderLevel'),
            'stock_level_flag': data.get('stockLevelFlag'),
            'commodity_code': data.get('commodityCode'),
            'unit_weight': data.get('unitWeight'),
            'stock_take_date': data.get('stockTakeDate'),
            'reorder_quantity': data.get('reorderQuantity'),
            'last_stock_take': data.get('lastStockTake'),
            'status': data.get('status', 'active')
        }
        
        # Validate the data using the schema
        validated_data = NonProductSchema(**non_product_data)
        print("Validated update data:", validated_data.dict())  # Debug log
        
        # Get the existing non-product
        non_product = NonProduct.query.get_or_404(id)
        
        # Update the non-product fields
        for key, value in validated_data.dict().items():
            setattr(non_product, key, value)
        
        db.session.commit()
        print("Non-product updated successfully:", non_product.to_dict())  # Debug log
        return jsonify(non_product.to_dict())
    except Exception as e:
        db.session.rollback()
        print("Error updating non-product:", str(e))  # Debug log
        return jsonify({'message': str(e)}), 400

@app.route('/api/products/non/<int:id>', methods=['DELETE'])
def delete_non_product(id):
    try:
        product = NonProduct.query.get_or_404(id)
        db.session.delete(product)
        db.session.commit()
        return jsonify({'message': 'Product deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

# Customer routes
@app.route('/api/customers', methods=['GET'])
def get_customers():
    search = request.args.get('search', '').strip()
    query = Customer.query
    if search:
        like = f"{search.lower()}%"
        query = query.filter(
            db.or_(
                db.func.lower(Customer.customer_name).like(like),
                db.func.lower(Customer.customer_code).like(like)
            )
        )
    customers = query.all()
    return jsonify([customer.to_dict() for customer in customers]), 200

def validate_multiple_emails(email_string):
    """Validate multiple email addresses separated by commas"""
    if not email_string or not email_string.strip():
        return True, None
    
    emails = [email.strip() for email in email_string.split(',')]
    import re
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    
    for email in emails:
        if email and not re.match(email_pattern, email):
            return False, f'Invalid email format: {email}'
    
    return True, None

@app.route('/api/customers', methods=['POST'])
def create_customer():
    data = request.get_json()
    
    # Helper function to get value with fallback to different field name formats
    def get_field_value(data, field_name, default=None):
        # Try camelCase first, then snake_case
        if field_name == 'customer_code':
            return data.get('customerCode') or data.get('customer_code') or default
        elif field_name == 'customer_name':
            return data.get('customerName') or data.get('customer_name') or default
        elif field_name == 'sage_code':
            return data.get('sageCode') or data.get('sage_code') or default
        elif field_name == 'customer_city':
            return data.get('customerCity') or data.get('customer_city') or default
        elif field_name == 'customer_country':
            return data.get('customerCountry') or data.get('customer_country') or default
        elif field_name == 'customer_currency':
            return data.get('customerCurrency') or data.get('customer_currency') or default
        elif field_name == 'own_branch':
            return data.get('ownBranch') or data.get('own_branch') or default
        elif field_name == 'vat_number':
            return data.get('vatNumber') or data.get('vat_number') or default
        elif field_name == 'credit_limit':
            return data.get('creditLimit') or data.get('credit_limit') or default
        elif field_name == 'settlement_days':
            return data.get('settlementDays') or data.get('settlement_days') or default
        elif field_name == 'settlement_discount':
            return data.get('settlementDiscount') or data.get('settlement_discount') or default
        elif field_name == 'web_address':
            return data.get('webAddress') or data.get('web_address') or default
        elif field_name == 'is_active':
            return data.get('isActive') or data.get('is_active') or default
        elif field_name == 'running_balance':
            return data.get('runningBalance') or data.get('running_balance') or default
        else:
            # For other fields, try both formats
            return data.get(field_name) or data.get(field_name.replace('_', '').lower()) or default
    
    # Validate required fields
    customer_code = get_field_value(data, 'customer_code')
    customer_name = get_field_value(data, 'customer_name')
    
    if not customer_code or not customer_name:
        return jsonify({'error': 'Customer code and name are required'}), 400
    
    # Validate email format if provided
    email = get_field_value(data, 'email')
    if email:
        if not validate_multiple_emails(email):
            return jsonify({'error': 'Invalid email format'}), 400
    
    try:
        customer = Customer(
            customer_code=customer_code,
            sage_code=get_field_value(data, 'sage_code', ''),
            customer_name=customer_name,
            address=get_field_value(data, 'address', ''),
            telephone=get_field_value(data, 'telephone', ''),
            fax=get_field_value(data, 'fax', ''),
            email=email or '',
            customer_city=get_field_value(data, 'customer_city', ''),
            customer_country=get_field_value(data, 'customer_country', ''),
            customer_currency=get_field_value(data, 'customer_currency', 'GBP'),
            remarks=get_field_value(data, 'remarks', ''),
            own_branch=get_field_value(data, 'own_branch', 'no'),
            vat_number=get_field_value(data, 'vat_number', ''),
            credit_limit=get_field_value(data, 'credit_limit', 0),
            terms=get_field_value(data, 'terms', ''),
            settlement_days=get_field_value(data, 'settlement_days', 0),
            settlement_discount=get_field_value(data, 'settlement_discount', 0),
            web_address=get_field_value(data, 'web_address', ''),
            others=get_field_value(data, 'others', ''),
            running_balance=get_field_value(data, 'running_balance', 0),
            is_active=get_field_value(data, 'is_active', 'yes'),
            is_company=data.get('is_company', False)
        )
        
        db.session.add(customer)
        db.session.commit()
        
        return jsonify(customer.to_dict()), 201
        
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'Customer code already exists'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/customers/<int:id>', methods=['GET'])
def get_customer(id):
    customer = Customer.query.get_or_404(id)
    return jsonify(customer.to_dict())

@app.route('/api/customers/<int:id>', methods=['PUT'])
def update_customer(id):
    data = request.get_json()
    try:
        # Validate multiple emails if provided
        if data.get('email'):
            is_valid, error_msg = validate_multiple_emails(data['email'])
            if not is_valid:
                return jsonify({'message': error_msg}), 400
        
        customer_data = CustomerSchema(**data)
        customer = Customer.query.get_or_404(id)
        
        # Update customer fields
        for key, value in customer_data.dict().items():
            setattr(customer, key, value)
        
        db.session.commit()
        return jsonify(customer.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/customers/<int:id>', methods=['DELETE'])
def delete_customer(id):
    customer = Customer.query.get_or_404(id)
    try:
        db.session.delete(customer)
        db.session.commit()
        return jsonify({'message': 'Customer deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

# Supplier routes
@app.route('/api/suppliers', methods=['GET'])
def get_suppliers():
    try:
        search = request.args.get('search', '').strip()
        query = Supplier.query
        if search:
            query = query.filter(
                db.or_(
                    Supplier.supplier_name.ilike(f'%{search}%'),
                    Supplier.supplier_code.ilike(f'%{search}%')
                )
            )
        suppliers = query.order_by(Supplier.supplier_name).all()
        return jsonify([supplier.to_dict() for supplier in suppliers])
    except Exception as e:
        return jsonify({'message': str(e)}), 500

@app.route('/api/suppliers/<int:id>', methods=['GET'])
def get_supplier(id):
    try:
        supplier = Supplier.query.get_or_404(id)
        return jsonify(supplier.to_dict())
    except Exception as e:
        return jsonify({'message': str(e)}), 404

@app.route('/api/suppliers', methods=['POST'])
def create_supplier():
    data = request.get_json()
    try:
        supplier_data = SupplierSchema(**data)
        supplier = Supplier(**supplier_data.dict())
        db.session.add(supplier)
        db.session.commit()
        return jsonify(supplier.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/suppliers/<int:id>', methods=['PUT'])
def update_supplier(id):
    data = request.get_json()
    try:
        supplier_data = SupplierSchema(**data)
        supplier = Supplier.query.get_or_404(id)
        
        # Update supplier fields
        for key, value in supplier_data.dict().items():
            setattr(supplier, key, value)
        
        db.session.commit()
        return jsonify(supplier.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/suppliers/<int:id>', methods=['DELETE'])
def delete_supplier(id):
    try:
        supplier = Supplier.query.get_or_404(id)
        db.session.delete(supplier)
        db.session.commit()
        return jsonify({'message': 'Supplier deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

# Dashboard stats
@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    try:
        today = datetime.now().date()
        # Efficient queries
        today_sales = db.session.query(func.sum(Sale.total_amount)).filter(
            func.date(Sale.date) == today
        ).scalar() or 0
        today_discounts = db.session.query(func.sum(CustomerDiscount.amount)).join(
            Sale, CustomerDiscount.sale_id == Sale.id
        ).filter(
            CustomerDiscount.date == today,
            CustomerDiscount.is_deleted.is_(False),
            Sale.status == 'finalized',
        ).scalar() or 0

        today_purchases = db.session.query(func.sum(Purchase.amount)).filter(
            func.date(Purchase.date) == today
        ).scalar() or 0

        total_purchases = db.session.query(func.sum(Purchase.amount)).scalar() or 0
        total_sales = db.session.query(func.sum(Sale.total_amount)).scalar() or 0
        total_discounts = db.session.query(func.sum(CustomerDiscount.amount)).join(
            Sale, CustomerDiscount.sale_id == Sale.id
        ).filter(
            CustomerDiscount.is_deleted.is_(False),
            Sale.status == 'finalized',
        ).scalar() or 0
        today_sales = float(today_sales) - float(today_discounts)
        total_sales = float(total_sales) - float(total_discounts)
        profit_margin = ((total_sales - total_purchases) / total_sales * 100) if total_sales > 0 else 0

        regular_count = db.session.query(func.count(RegularProduct.id)).scalar() or 0
        non_count = db.session.query(func.count(NonProduct.id)).scalar() or 0
        stock_items = regular_count + non_count

        # Recent transactions: last 5 sales, newest first
        sales = Sale.query.order_by(Sale.date.desc()).limit(5).all()
        recent_transactions = []
        for sale in sales:
            customer_name = sale.customer.customer_name if sale.customer else ""
            recent_transactions.append({
                "id": sale.id,
                "customerName": customer_name,
                "amount": float(sale.total_amount) - float(_active_discount_total_for_sale(sale.id)),
                "date": sale.date.isoformat() if sale.date else None,
                "status": sale.status
            })

        return jsonify({
            "todaySales": today_sales,
            "todayPurchases": today_purchases,
            "totalPurchases": total_purchases,
            "profitMargin": profit_margin,
            "stockItems": stock_items,
            "recentTransactions": recent_transactions
        })
    except Exception as e:
        return jsonify({'message': 'Failed to fetch dashboard stats', 'error': str(e)}), 500

# Chart data
@app.route('/api/dashboard/charts', methods=['GET'])
def get_chart_data():
    
    range_param = request.args.get('range', '7days')
    now = datetime.now()
    if range_param == '7days':
        days = 7
        date_list = [(now.date() - timedelta(days=i)) for i in range(days)]
        date_list.reverse()
        label_fmt = '%a'
    elif range_param == '30days':
        days = 30
        date_list = [(now.date() - timedelta(days=i)) for i in range(days)]
        date_list.reverse()
        label_fmt = '%d %b'
    elif range_param == '3months':
        # 3 months, group by week
        weeks = 12
        date_list = [(now.date() - timedelta(weeks=i)) for i in range(weeks)]
        date_list.reverse()
        label_fmt = 'Wk %W'
    else:
        return jsonify({'message': 'Invalid range parameter'}), 400

    # Sales: group by day/week
    if range_param == '3months':
        sales = (
            db.session.query(
                func.strftime('%Y-%W', Sale.date).label('period'),
                func.sum(Sale.total_amount).label('total')
            )
            .group_by('period')
            .all()
        )
        sales_map = {period: total for period, total in sales}
        discounts = (
            db.session.query(
                func.strftime('%Y-%W', CustomerDiscount.date).label('period'),
                func.sum(CustomerDiscount.amount).label('total')
            )
            .join(Sale, CustomerDiscount.sale_id == Sale.id)
            .filter(
                CustomerDiscount.is_deleted.is_(False),
                Sale.status == 'finalized',
            )
            .group_by('period')
            .all()
        )
        for period, total in discounts:
            sales_map[period] = float(sales_map.get(period, 0) or 0) - float(total or 0)
        purchases = (
            db.session.query(
                func.strftime('%Y-%W', PurchaseInvoice.date).label('period'),
                func.sum(PurchaseInvoiceItem.total_price).label('total')
            )
            .join(PurchaseInvoiceItem, PurchaseInvoice.id == PurchaseInvoiceItem.invoice_id)
            .group_by('period')
            .all()
        )
        purchases_map = {period: total for period, total in purchases}
        labels = [d.strftime(label_fmt) for d in date_list]
        sales_by_period = [float(sales_map.get(d.strftime('%Y-%W'), 0)) for d in date_list]
        purchases_by_period = [float(purchases_map.get(d.strftime('%Y-%W'), 0)) for d in date_list]
        profit_by_period = [s - p for s, p in zip(sales_by_period, purchases_by_period)]
    else:
        sales = (
            db.session.query(
                func.date(Sale.date).label('day'),
                func.sum(Sale.total_amount).label('total')
            )
            .filter(
                func.date(Sale.date) >= date_list[0],
                func.date(Sale.date) <= date_list[-1]
            )
            .group_by('day')
            .all()
        )
        sales_map = {str(day): total for day, total in sales}
        discounts = (
            db.session.query(
                func.date(CustomerDiscount.date).label('day'),
                func.sum(CustomerDiscount.amount).label('total')
            )
            .join(Sale, CustomerDiscount.sale_id == Sale.id)
            .filter(
                CustomerDiscount.date >= date_list[0],
                CustomerDiscount.date <= date_list[-1],
                CustomerDiscount.is_deleted.is_(False),
                Sale.status == 'finalized',
            )
            .group_by('day')
            .all()
        )
        for day, total in discounts:
            day = str(day)
            sales_map[day] = float(sales_map.get(day, 0) or 0) - float(total or 0)
        purchases = (
            db.session.query(
                func.date(PurchaseInvoice.date).label('day'),
                func.sum(PurchaseInvoiceItem.total_price).label('total')
            )
            .join(PurchaseInvoiceItem, PurchaseInvoice.id == PurchaseInvoiceItem.invoice_id)
            .filter(
                func.date(PurchaseInvoice.date) >= date_list[0],
                func.date(PurchaseInvoice.date) <= date_list[-1]
            )
            .group_by('day')
            .all()
        )
        purchases_map = {str(day): total for day, total in purchases}
        labels = [d.strftime(label_fmt) for d in date_list]
        sales_by_period = [float(sales_map.get(str(d), 0)) for d in date_list]
        purchases_by_period = [float(purchases_map.get(str(d), 0)) for d in date_list]
        profit_by_period = [s - p for s, p in zip(sales_by_period, purchases_by_period)]

    profit_range = request.args.get('profitRange', 'month')
    if profit_range == 'month':
        profit_labels = [f"{now.date().strftime('%b')} {i}" for i in range(1, now.day + 1)]
        profit_data = profit_by_period
    elif profit_range == 'lastmonth':
        last_month = now.date() - timedelta(days=now.day)
        profit_labels = [f"{last_month.strftime('%b')} {i}" for i in range(1, last_month.day + 1)]
        profit_data = [0] * last_month.day
    elif profit_range == 'quarter':
        quarter_start = now.date() - timedelta(days=now.date().weekday())
        profit_labels = [f"Wk {i}" for i in range(1, 14)]
        profit_data = [0] * 13
        for i in range(13):
            week_start = quarter_start + timedelta(weeks=i)
            week_end = week_start + timedelta(days=6)
            week_sales = sum(sales_by_period[j] for j in range(len(date_list)) if week_start <= date_list[j] <= week_end)
            week_purchases = sum(purchases_by_period[j] for j in range(len(date_list)) if week_start <= date_list[j] <= week_end)
            profit_data[i] = week_sales - week_purchases

    return jsonify({
        'salesPurchase': {
            'labels': labels,
            'salesData': sales_by_period,
            'purchaseData': purchases_by_period
        },
        'profitTrend': {
            'labels': profit_labels,
            'data': profit_data
        }
    })

# System Settings routes
@app.route('/api/settings', methods=['GET'])
def get_settings():
    settings = SystemSettings.query.first()
    if not settings:
        settings = SystemSettings()
        db.session.add(settings)
        db.session.commit()
    return jsonify(settings.to_dict())

@app.route('/api/settings', methods=['PUT'])
def update_settings():
    data = request.get_json()
    print('[DEBUG] Incoming settings data:', data)
    try:
        # Map camelCase to snake_case for backend compatibility
        if 'closingTime' in data:
            data['closing_time'] = data.pop('closingTime')
        if 'autoDateSwitch' in data:
            data['auto_date_switch'] = data.pop('autoDateSwitch')
        if 'weekendHandling' in data:
            data['weekend_handling'] = data.pop('weekendHandling')
        if 'withPorterage' in data:
            data['with_porterage'] = data.pop('withPorterage')
        if 'porterageCharge' in data:
            data['porterage_charge'] = data.pop('porterageCharge')
        if 'invoicePrintFormat' in data:
            data['invoice_print_format'] = data.pop('invoicePrintFormat')
        if 'lockInvoices' in data:
            data['lock_invoices'] = data.pop('lockInvoices')
        if 'tillFloat' in data:
            data['till_float'] = data.pop('tillFloat')
        if 'invoiceFooter' in data:
            data['invoice_footer'] = data.pop('invoiceFooter')
        if 'printServiceUrl' in data:
            data['print_service_url'] = data.pop('printServiceUrl')
        if 'printServicePrinterName' in data:
            data['print_service_printer_name'] = data.pop('printServicePrinterName')
        if 'printServicePollingIntervalMs' in data:
            data['print_service_poll_interval_ms'] = data.pop('printServicePollingIntervalMs')
        # Print all incoming fields and types
        for k, v in data.items():
            print(f'[DEBUG] Field: {k}, Value: {v}, Type: {type(v)}')
        # Check for required fields
        required = ['closing_time', 'timezone', 'auto_date_switch', 'weekend_handling']
        for field in required:
            if field not in data:
                print(f'[WARNING] Missing required field: {field}')
        # Parse closing_time if it's a string (e.g., "18:00")
        if 'closing_time' in data:
            print('[DEBUG] closing_time before parsing:', data['closing_time'], type(data['closing_time']))
            if isinstance(data['closing_time'], str):
                from datetime import datetime
                data['closing_time'] = datetime.strptime(data['closing_time'], "%H:%M").time()
            print('[DEBUG] closing_time after parsing:', data['closing_time'], type(data['closing_time']))
        # Track which fields were actually provided (after camelCase→snake_case mapping)
        provided_keys = set(data.keys())
        settings_data = SystemSettingsSchema(**data)
        print('[DEBUG] Parsed settings_data:', settings_data.dict())
        settings = SystemSettings.query.first()
        if not settings:
            settings = SystemSettings()
            db.session.add(settings)
        for key, value in settings_data.dict().items():
            if key not in provided_keys:
                continue  # only update fields the client actually sent
            print(f'[DEBUG] Setting attribute {key} = {value} ({type(value)})')
            setattr(settings, key, value)
        db.session.commit()
        print('[DEBUG] Settings after commit:', settings.to_dict())
        return jsonify(settings.to_dict())
    except Exception as e:
        import traceback
        print('[ERROR] Exception in update_settings:', str(e))
        print(traceback.format_exc())
        return jsonify({'message': str(e)}), 400

PRINT_SERVICE_DEFAULTS = {
    'salesMasterUrl': 'https://tropifruituk.net',
    'printerName': 'EPSON LQ-350 ESC/P2',
    'pollIntervalMs': 10000,
}


def _require_print_service_admin():
    user = User.query.get(get_jwt_identity())
    if not user or (user.user_type or '').lower() != 'admin' or (user.status or '').lower() != 'active':
        return None, (jsonify({'error': 'Administrator access is required.'}), 403)
    return user, None


def _read_print_service_settings_payload(data):
    data = data or {}
    values = {
        'salesMasterUrl': data.get('salesMasterUrl', data.get('print_service_url', PRINT_SERVICE_DEFAULTS['salesMasterUrl'])),
        'printerName': data.get('printerName', data.get('print_service_printer_name', PRINT_SERVICE_DEFAULTS['printerName'])),
        'pollIntervalMs': data.get('pollIntervalMs', data.get('print_service_poll_interval_ms', PRINT_SERVICE_DEFAULTS['pollIntervalMs'])),
    }
    url = str(values['salesMasterUrl']).strip().rstrip('/')
    printer_name = str(values['printerName']).strip()
    try:
        poll_interval_ms = int(values['pollIntervalMs'])
    except (TypeError, ValueError):
        raise ValueError('Polling interval must be a whole number of milliseconds.')

    from urllib.parse import urlparse
    parsed_url = urlparse(url)
    if parsed_url.scheme not in ('http', 'https') or not parsed_url.netloc:
        raise ValueError('SalesMaster URL must be a valid http:// or https:// URL.')
    if len(url) > 500:
        raise ValueError('SalesMaster URL must be 500 characters or fewer.')
    if not printer_name or len(printer_name) > 255:
        raise ValueError('Printer name is required and must be 255 characters or fewer.')
    if poll_interval_ms < 1000 or poll_interval_ms > 3600000:
        raise ValueError('Polling interval must be between 1,000 and 3,600,000 milliseconds.')

    return {
        'salesMasterUrl': url,
        'printerName': printer_name,
        'pollIntervalMs': poll_interval_ms,
    }


def _get_print_service_settings_record():
    settings = SystemSettings.query.first()
    if not settings:
        settings = SystemSettings()
        db.session.add(settings)
        db.session.commit()
    return settings


@app.route('/api/print-service/settings', methods=['GET'])
@jwt_required()
def get_print_service_settings():
    _, error = _require_print_service_admin()
    if error:
        return error
    settings = _get_print_service_settings_record()
    return jsonify({
        'salesMasterUrl': settings.print_service_url or PRINT_SERVICE_DEFAULTS['salesMasterUrl'],
        'printerName': settings.print_service_printer_name or PRINT_SERVICE_DEFAULTS['printerName'],
        'pollIntervalMs': settings.print_service_poll_interval_ms or PRINT_SERVICE_DEFAULTS['pollIntervalMs'],
    })


@app.route('/api/print-service/settings', methods=['PUT'])
@jwt_required()
def update_print_service_settings():
    _, error = _require_print_service_admin()
    if error:
        return error
    try:
        values = _read_print_service_settings_payload(request.get_json(silent=True))
        settings = _get_print_service_settings_record()
        settings.print_service_url = values['salesMasterUrl']
        settings.print_service_printer_name = values['printerName']
        settings.print_service_poll_interval_ms = values['pollIntervalMs']
        settings.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify(values)
    except ValueError as exc:
        db.session.rollback()
        return jsonify({'error': str(exc)}), 400
    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': str(exc)}), 500


@app.route('/api/print-service/package', methods=['POST'])
@jwt_required()
def download_print_service_package():
    _, error = _require_print_service_admin()
    if error:
        return error
    try:
        request_data = request.get_json(silent=True) or {}
        settings = _get_print_service_settings_record()
        values = _read_print_service_settings_payload({
            'salesMasterUrl': request_data.get('salesMasterUrl', settings.print_service_url),
            'printerName': request_data.get('printerName', settings.print_service_printer_name),
            'pollIntervalMs': request_data.get('pollIntervalMs', settings.print_service_poll_interval_ms),
        })

        from io import BytesIO
        from zipfile import ZIP_DEFLATED, ZipFile
        from datetime import datetime

        service_dir = os.path.join(os.path.dirname(__file__), '..', 'print-service')
        package_files = [
            'auto-chrome-service.js',
            'service-install.js',
            'service-uninstall.js',
            'INSTALL-SERVICE.bat',
            'UNINSTALL-SERVICE.bat',
            'setup-print-config.bat',
            'start-auto-chrome.bat',
            'package.json',
            'README.md',
        ]
        package_buffer = BytesIO()
        with ZipFile(package_buffer, 'w', ZIP_DEFLATED) as archive:
            for file_name in package_files:
                file_path = os.path.join(service_dir, file_name)
                if not os.path.isfile(file_path):
                    raise FileNotFoundError(f'Print-service package file is missing: {file_name}')
                archive.write(file_path, arcname=file_name)
            archive.writestr('config.json', json.dumps({
                'salesMasterUrl': values['salesMasterUrl'],
                'printerName': values['printerName'],
                'pollIntervalMs': values['pollIntervalMs'],
            }, indent=2) + '\n')
            archive.writestr('PACKAGE-CONFIGURATION.txt', (
                'SalesMaster Print Service — generated per-PC configuration\n'
                f"SalesMaster URL: {values['salesMasterUrl']}\n"
                f"Printer name: {values['printerName']}\n"
                f"Polling interval: {values['pollIntervalMs']} ms\n\n"
                'Run INSTALL-SERVICE.bat as Administrator on the target Windows PC.\n'
                'Node.js, Google Chrome, the printer driver, and SumatraPDF are required.\n'
                'Only one active print-service poller should consume the shared print queue.\n'
            ))
        package_buffer.seek(0)
        date_suffix = datetime.utcnow().strftime('%Y%m%d-%H%M%S')
        return send_file(
            package_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'salesmaster-print-service-{date_suffix}.zip',
        )
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'error': f'Failed to create print-service package: {exc}'}), 500


# Attendance routes
@app.route('/api/attendance', methods=['GET'])
def get_attendance():
    # Check for date range parameters first (takes precedence)
    from_date_str = request.args.get('from_date')
    to_date_str = request.args.get('to_date')
    
    # Fall back to year/month/week parameters if date range not provided
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    week = request.args.get('week', type=int)
    
    # Also support employee_id filter
    employee_id = request.args.get('employee_id', type=int)
    
    print(f"DEBUG: /api/attendance from_date={from_date_str}, to_date={to_date_str}, year={year}, month={month}, week={week}, employee_id={employee_id}")

    query = Attendance.query
    
    # Apply employee filter if provided
    if employee_id:
        query = query.filter(Attendance.user_id == employee_id)

    # Handle date range parameters (takes precedence over year/month/week)
    if from_date_str and to_date_str:
        try:
            from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
            to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
            print(f"DEBUG: Using date range: {from_date} to {to_date}")
            query = query.filter(Attendance.date >= from_date, Attendance.date <= to_date)
        except ValueError as e:
            print(f"ERROR: Invalid date format. Expected YYYY-MM-DD. Error: {e}")
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    # Fall back to year/month/week parameters
    elif year and month:
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = datetime(year, month + 1, 1) - timedelta(days=1)
        print(f"DEBUG: Using month range: {start_date.date()} to {end_date.date()}")
        query = query.filter(Attendance.date >= start_date.date(), Attendance.date <= end_date.date())
    elif year and week:
        def iso_to_gregorian(iso_year, iso_week, iso_day):
            fourth_jan = datetime(iso_year, 1, 4)
            delta = timedelta(days=iso_day - fourth_jan.isoweekday())
            return fourth_jan + timedelta(weeks=iso_week - 1) + delta
        start_date = iso_to_gregorian(year, week, 1)  # Monday
        end_date = iso_to_gregorian(year, week, 7)    # Sunday
        print(f"DEBUG: Using week range: {start_date.date()} to {end_date.date()}")
        query = query.filter(Attendance.date >= start_date.date(), Attendance.date <= end_date.date())
    else:
        # Default to today if no date range specified
        today = datetime.now().date()
        print(f"DEBUG: No date range specified, defaulting to today: {today}")
        query = query.filter(Attendance.date == today)
    
    # Order by date ascending
    query = query.order_by(Attendance.date.asc())
    
    # Execute query and return results
    attendance_records = query.all()
    print(f"DEBUG: Found {len(attendance_records)} attendance records")
    
    # Convert to list of dictionaries
    result = [record.to_dict() for record in attendance_records]
    return jsonify(result)

@app.route('/api/attendance', methods=['POST'])
def create_attendance():
    data = request.get_json()
    try:
        attendance_data = AttendanceSchema(**data)
        attendance = Attendance(**attendance_data.dict())
        db.session.add(attendance)
        db.session.commit()
        return jsonify(attendance.to_dict())
    except Exception as e:
        return jsonify({'message': 'Invalid attendance data'}), 400

@app.route('/api/attendance/<int:id>', methods=['PUT'])
def update_attendance(id):
    data = request.get_json()
    try:
        attendance_data = AttendanceSchema(**data)
        attendance = Attendance.query.get_or_404(id)
        
        for key, value in attendance_data.dict().items():
            setattr(attendance, key, value)
        
        db.session.commit()
        return jsonify(attendance.to_dict())
    except Exception as e:
        return jsonify({'message': 'Invalid attendance data'}), 400

# Company Details routes
@app.route('/api/company-details', methods=['GET'])
def get_company_details():
    company = Company.query.first()
    if not company:
        # Create default company if none exists
        company = Company(
            companyName="TROPIFRUIT UK LTD",
            address1="3 Dolphin Way, Purfleet",
            address2="RM19 1NZ",
            telephone="+44 (0) 68006",
            website="https://tropifruit.co.uk/",
            email="info@tropifruit.co.uk",
            vatNo="GB746395552",
            compRegNo="07887301"
        )
        db.session.add(company)
        db.session.commit()
    return jsonify(company.to_dict())

@app.route('/api/company-details', methods=['PUT'])
def update_company_details():
    data = request.get_json()
    try:
        company_data = CompanySchema(**data)
        company = Company.query.first()
        if not company:
            company = Company()
            db.session.add(company)
        
        # Update company fields directly
        for key, value in company_data.dict().items():
            setattr(company, key, value)
        
        db.session.commit()
        return jsonify(company.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

# Expense routes
@app.route('/api/expenses', methods=['GET'])
def get_expenses():
    try:
        expenses = Expense.query.all()
        return jsonify([expense.to_dict() for expense in expenses])
    except Exception as e:
        return jsonify({'message': str(e)}), 500

@app.route('/api/expenses/<int:id>', methods=['GET'])
def get_expense(id):
    try:
        expense = Expense.query.get_or_404(id)
        return jsonify(expense.to_dict())
    except Exception as e:
        return jsonify({'message': str(e)}), 404

@app.route('/api/expenses/<int:id>/has-entries', methods=['GET'])
def expense_has_entries(id):
    """Check if an expense has any expense entries"""
    try:
        count = ExpenseEntry.query.filter_by(expense_id=id).count()
        return jsonify({'hasEntries': count > 0, 'count': count})
    except Exception as e:
        return jsonify({'message': str(e)}), 500

@app.route('/api/expenses', methods=['POST'])
def create_expense():
    data = request.get_json()
    try:
        expense_data = ExpenseSchema(**data)
        expense = Expense(
            expense_code=expense_data.expenseCode,
            sage_code=expense_data.sageCode,
            expense_name=expense_data.expenseName,
            is_active=expense_data.isActive
        )
        db.session.add(expense)
        db.session.commit()
        return jsonify(expense.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/expenses/<int:id>', methods=['PUT'])
def update_expense(id):
    data = request.get_json()
    try:
        expense_data = ExpenseSchema(**data)
        expense = Expense.query.get_or_404(id)

        # Update expense fields — map camelCase schema fields to snake_case model columns
        expense.expense_name = expense_data.expenseName
        expense.sage_code = expense_data.sageCode
        expense.is_active = expense_data.isActive
        
        db.session.commit()
        return jsonify(expense.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/expenses/<int:id>', methods=['DELETE'])
def delete_expense(id):
    try:
        expense = Expense.query.get_or_404(id)
        db.session.delete(expense)
        db.session.commit()
        return jsonify({'message': 'Expense deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

# User routes
@app.route('/api/users', methods=['GET'])
def get_users():
    users = User.query.all()
    return jsonify([user.to_dict() for user in users])

@app.route('/api/users/<int:id>', methods=['GET'])
def get_user(id):
    user = User.query.get_or_404(id)
    return jsonify(user.to_dict())

@app.route('/api/users', methods=['POST'])
def create_user():
    data = request.get_json()
    print('DEBUG: Received user data:', data)
    try:
        # Validate required fields
        if not data.get('username'):
            return jsonify({'message': 'Username is required'}), 400
        if not data.get('password'):
            return jsonify({'message': 'Password is required'}), 400

        # Check if username already exists
        if User.query.filter_by(username=data['username']).first():
            return jsonify({'message': 'Username already exists'}), 400
        
        # Check if email already exists (if provided)
        if data.get('email') and User.query.filter_by(email=data['email']).first():
            return jsonify({'message': 'Email already exists'}), 400

        # Create new user
        user = User(
            username=data['username'],
            password=generate_password_hash(data['password']),
            user_type=data.get('userType', 'user'),
            status=data.get('status', 'Active'),
            email=data.get('email'),
            phone=data.get('phone'),
            daily_wage=data.get('dailyWage')
        )
        print('DEBUG: User object to be committed:', user.to_dict())
        db.session.add(user)
        db.session.commit()
        return jsonify(user.to_dict())
    except Exception as e:
        db.session.rollback()
        print('DEBUG: Exception occurred:', str(e))
        return jsonify({'message': f'Error creating user: {str(e)}'}), 400

@app.route('/api/users/<int:id>', methods=['PUT'])
def update_user(id):
    data = request.get_json()
    try:
        user = User.query.get_or_404(id)
        
        # Check if username is being changed and if it already exists
        if data.get('username') and data['username'] != user.username:
            if User.query.filter_by(username=data['username']).first():
                return jsonify({'message': 'Username already exists'}), 400
            user.username = data['username']
        
        # Check if email is being changed and if it already exists
        if data.get('email') and data['email'] != user.email:
            if User.query.filter_by(email=data['email']).first():
                return jsonify({'message': 'Email already exists'}), 400
            user.email = data['email']
        
        # Update other fields
        if 'password' in data:
            user.password = generate_password_hash(data['password'])
        if 'userType' in data:
            user.user_type = data['userType']
        if 'status' in data:
            user.status = data['status']
        if 'phone' in data:
            user.phone = data['phone']
        if 'dailyWage' in data:
            user.daily_wage = data['dailyWage']
        
        db.session.commit()
        return jsonify(user.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/users/<int:id>', methods=['DELETE'])
def delete_user(id):
    try:
        user = User.query.get_or_404(id)
        
        # Delete related records first to avoid foreign key constraint issues
        
        # Delete user-specific configuration records (these have NOT NULL constraints)
        UserBackDateOption.query.filter_by(user_id=id).delete()
        UserRestriction.query.filter_by(user_id=id).delete()
        UserTimingRestriction.query.filter_by(user_id=id).delete()
        UserInvoiceRestriction.query.filter_by(user_id=id).delete()
        UserDailyBookType.query.filter_by(user_id=id).delete()
        
        # Delete attendance records (these have NOT NULL user_id constraint)
        Attendance.query.filter_by(user_id=id).delete()
        
        # Delete payroll records (these have NOT NULL user_id constraint)
        Payroll.query.filter_by(user_id=id).delete()
        
        # Handle Leave records - delete leaves created by this user
        Leave.query.filter_by(user_id=id).delete()
        
        # For leaves approved by this user, set approved_by to NULL (this should be nullable)
        Leave.query.filter_by(approved_by=id).update({'approved_by': None})
        
        # Set created_by fields to NULL for records created by this user
        # (These should be nullable fields)
        Sale.query.filter_by(created_by=id).update({'created_by': None})
        StockMovement.query.filter_by(created_by=id).update({'created_by': None})
        StockAdjustment.query.filter_by(created_by=id).update({'created_by': None})
        ExpenseEntry.query.filter_by(created_by=id).update({'created_by': None})
        DumpEntry.query.filter_by(created_by=id).update({'created_by': None})
        CustomerReturn.query.filter_by(created_by=id).update({'created_by': None})
        SupplierReturn.query.filter_by(created_by=id).update({'created_by': None})
        PrintQueue.query.filter_by(created_by=id).update({'created_by': None})
        
        # Now delete the user
        db.session.delete(user)
        db.session.commit()
        return jsonify({'message': 'User deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Error deleting user: {str(e)}'}), 400

# Monthly Reports endpoints
@app.route('/api/reports/attendance', methods=['GET'])
def get_attendance_report():
    """Get attendance data for date range with employee details"""
    from_date_str = request.args.get('from_date')
    to_date_str = request.args.get('to_date')
    employee_id = request.args.get('employee_id', type=int)
    
    if not from_date_str or not to_date_str:
        return jsonify({'error': 'from_date and to_date are required'}), 400
    
    try:
        from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
        to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    
    # Get all active employees
    employees_query = Employee.query.filter(Employee.is_active == 'yes')
    if employee_id:
        employees_query = employees_query.filter(Employee.id == employee_id)
    
    employees = employees_query.all()
    result = []
    
    for employee in employees:
        # Get attendance records for this employee in the date range
        attendance_records = Attendance.query.filter(
            Attendance.user_id == employee.id,
            Attendance.date >= from_date,
            Attendance.date <= to_date
        ).all()
        
        # Calculate attendance statistics
        present_days = len([a for a in attendance_records if a.status == 'present'])
        absent_days = len([a for a in attendance_records if a.status == 'absent'])
        leave_days = len([a for a in attendance_records if a.status == 'leave'])
        holiday_days = len([a for a in attendance_records if a.status == 'holiday'])
        
        # Calculate total working days in the range
        total_days = (to_date - from_date).days + 1
        attendance_percentage = (present_days / total_days * 100) if total_days > 0 else 0
        
        # Get present dates for payroll calculation
        present_dates = [a.date.strftime('%Y-%m-%d') for a in attendance_records if a.status == 'present']
        
        # Create daily attendance map for detailed reports
        daily_attendance = {}
        current_date = from_date
        while current_date <= to_date:
            date_str = current_date.strftime('%Y-%m-%d')
            # Find attendance record for this date
            attendance_record = next((a for a in attendance_records if a.date == current_date), None)
            if attendance_record:
                daily_attendance[date_str] = {
                    'status': attendance_record.status,
                    'leave_type': attendance_record.leave_type,
                    'holiday_name': attendance_record.holiday_name
                }
            else:
                daily_attendance[date_str] = {'status': '-', 'leave_type': None, 'holiday_name': None}  # No record
            current_date += timedelta(days=1)
        
        employee_data = {
            'employee': {
                'id': employee.id,
                'name': employee.full_name,
                'fullName': employee.full_name,
                'title': employee.title,
                'status': 'active',
                'salary': float(employee.salary) if employee.salary else 0,
                'dailyWage': float(employee.salary) if employee.salary else 0
            },
            'attendance': {
                'presentDays': present_days,
                'absentDays': absent_days,
                'leaveDays': leave_days,
                'holidayDays': holiday_days,
                'attendancePercentage': round(attendance_percentage, 1),
                'totalHours': present_days * 8  # Assuming 8 hours per day
            },
            'presentDays': present_days,
            'presentDates': present_dates,
            'dailyAttendance': daily_attendance,  # Add daily attendance data
            'pay': present_days * (float(employee.salary) if employee.salary else 0)
        }
        
        result.append(employee_data)
    
    return jsonify(result)

@app.route('/api/reports/attendance-stats', methods=['GET'])
def get_attendance_stats():
    """Get attendance statistics for date range"""
    from_date_str = request.args.get('from_date')
    to_date_str = request.args.get('to_date')
    
    if not from_date_str or not to_date_str:
        return jsonify({'error': 'from_date and to_date are required'}), 400
    
    try:
        from_date = datetime.strptime(from_date_str, '%Y-%m-%d').date()
        to_date = datetime.strptime(to_date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    
    # Calculate working days
    working_days = (to_date - from_date).days + 1
    
    # Get all attendance records in the date range
    attendance_records = Attendance.query.filter(
        Attendance.date >= from_date,
        Attendance.date <= to_date
    ).all()
    
    # Calculate statistics
    total_present = len([a for a in attendance_records if a.status == 'present'])
    total_leaves = len([a for a in attendance_records if a.status == 'leave'])
    total_employees = Employee.query.filter(Employee.is_active == 'yes').count()
    
    # Calculate average attendance percentage
    if total_employees > 0 and working_days > 0:
        avg_attendance = (total_present / (total_employees * working_days)) * 100
    else:
        avg_attendance = 0
    
    return jsonify({
        'workingDays': working_days,
        'totalLeaves': total_leaves,
        'avgAttendance': round(avg_attendance, 1)
    })

@app.route('/api/users/attendance', methods=['GET'])
def get_users_attendance():
    today = datetime.now().date()
    users = User.query.all()
    result = []
    
    for user in users:
        attendance = Attendance.query.filter_by(
            user_id=user.id,
            date=today
        ).first()
        
        result.append({
            'id': user.id,
            'username': user.username,
            'userType': user.user_type,
            'status': user.status,
            'dailyWage': float(user.daily_wage) if user.daily_wage else None,
            'attendance': {
                'status': attendance.status if attendance else 'absent',
                'leaveType': attendance.leave_type if attendance else None,
                'holidayName': attendance.holiday_name if attendance else None
            }
        })
    
    return jsonify(result)

@app.route('/api/users/attendance/<int:user_id>', methods=['POST'])
def mark_attendance(user_id):
    data = request.get_json()
    today = datetime.now().date()
    
    # Validate required fields
    if not data or 'status' not in data:
        return jsonify({'error': 'Status is required'}), 400
    
    # Validate status
    valid_statuses = ['present', 'absent', 'leave', 'holiday']
    if data['status'] not in valid_statuses:
        return jsonify({'error': 'Invalid status'}), 400
    
    # Validate leave type if status is leave
    if data['status'] == 'leave' and not data.get('leaveType'):
        return jsonify({'error': 'Leave type is required for leave status'}), 400
    
    # Validate holiday name if status is holiday
    if data['status'] == 'holiday' and not data.get('holidayName'):
        return jsonify({'error': 'Holiday name is required for holiday status'}), 400
    
    # Check if attendance record exists for today
    attendance = Attendance.query.filter_by(
        user_id=user_id,
        date=today
    ).first()
    
    if attendance:
        # Update existing record
        attendance.status = data['status']
        attendance.leave_type = data.get('leaveType')
        attendance.holiday_name = data.get('holidayName')
        
        # Set check-in time if marking as present
        if data['status'] == 'present' and not attendance.check_in:
            attendance.check_in = datetime.now()
    else:
        # Create new record
        attendance = Attendance(
            user_id=user_id,
            date=today,
            status=data['status'],
            leave_type=data.get('leaveType'),
            holiday_name=data.get('holidayName'),
            check_in=datetime.now() if data['status'] == 'present' else None
        )
        db.session.add(attendance)
    
    try:
        db.session.commit()
        return jsonify(attendance.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/employees/attendance', methods=['GET'])
def get_employees_attendance():
    today = datetime.now().date()
    employees = Employee.query.filter(Employee.is_active == 'yes').all()
    result = []
    
    for employee in employees:
        attendance = Attendance.query.filter_by(
            user_id=employee.id,  # Using user_id as the foreign key
            date=today
        ).first()
        
        result.append({
            'id': employee.id,
            'name': employee.full_name,
            'fullName': employee.full_name,
            'title': employee.title,
            'status': 'Active',
            'dailyWage': float(employee.salary) if employee.salary else 0,
            'attendance': {
                'status': attendance.status if attendance else 'absent',
                'leaveType': attendance.leave_type if attendance else None,
                'holidayName': attendance.holiday_name if attendance else None
            }
        })
    
    return jsonify(result)

@app.route('/api/employees/attendance/<int:employee_id>', methods=['POST'])
def mark_employee_attendance(employee_id):
    data = request.get_json()
    
    # Validate required fields
    if not data or 'status' not in data:
        return jsonify({'error': 'Status is required'}), 400
    
    # Validate status
    valid_statuses = ['present', 'absent', 'leave', 'holiday']
    if data['status'] not in valid_statuses:
        return jsonify({'error': 'Invalid status'}), 400
    
    # Validate leave type if status is leave
    if data['status'] == 'leave' and not data.get('leaveType'):
        return jsonify({'error': 'Leave type is required for leave status'}), 400
    
    # Validate holiday name if status is holiday
    if data['status'] == 'holiday' and not data.get('holidayName'):
        return jsonify({'error': 'Holiday name is required for holiday status'}), 400
    
    # Check if employee exists
    employee = Employee.query.get(employee_id)
    if not employee:
        return jsonify({'error': 'Employee not found'}), 404
    
    # Parse date range or default to today
    try:
        if 'date' in data:
            # Single date
            date = datetime.strptime(data['date'], '%Y-%m-%d').date()
            date_range = [date]
        elif 'startDate' in data and 'endDate' in data:
            # Date range
            start_date = datetime.strptime(data['startDate'], '%Y-%m-%d').date()
            end_date = datetime.strptime(data['endDate'], '%Y-%m-%d').date()
            if start_date > end_date:
                return jsonify({'error': 'Start date cannot be after end date'}), 400
            date_range = [start_date + timedelta(days=x) for x in range((end_date - start_date).days + 1)]
        else:
            # Default to today
            date_range = [datetime.now().date()]
    except ValueError as e:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    
    results = []
    
    for current_date in date_range:
        # Check if attendance record exists for this date
        attendance = Attendance.query.filter_by(
            user_id=employee_id,
            date=current_date
        ).first()
        
        if attendance:
            # Update existing record
            attendance.status = data['status']
            attendance.leave_type = data.get('leaveType')
            attendance.holiday_name = data.get('holidayName')
            
            # Set check-in time if marking as present and no check-in exists
            if data['status'] == 'present' and not attendance.check_in:
                attendance.check_in = datetime.now()
        else:
            # Create new record
            attendance = Attendance(
                user_id=employee_id,
                date=current_date,
                status=data['status'],
                leave_type=data.get('leaveType'),
                holiday_name=data.get('holidayName'),
                check_in=datetime.now() if data['status'] == 'present' else None
            )
            db.session.add(attendance)
        
        results.append(attendance)
    
    try:
        db.session.commit()
        # Convert to dict after commit so created_at/updated_at are populated
        result_dicts = [att.to_dict() for att in results]
        if len(result_dicts) == 1:
            return jsonify(result_dicts[0])
        return jsonify({'message': f'Successfully updated {len(result_dicts)} attendance records', 'data': result_dicts})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/employees/<int:id>/daily-wage', methods=['PUT'])
def update_employee_daily_wage(id):
    data = request.get_json()
    try:
        employee = Employee.query.get_or_404(id)
        
        if 'dailyWage' not in data:
            return jsonify({'message': 'Daily wage is required'}), 400
            
        # Validate daily wage is a positive number
        try:
            daily_wage = float(data['dailyWage'])
            if daily_wage < 0:
                return jsonify({'message': 'Daily wage must be positive'}), 400
        except ValueError:
            return jsonify({'message': 'Daily wage must be a valid number'}), 400
        
        employee.daily_wage = daily_wage
        db.session.commit()
        
        return jsonify({
            'id': employee.id,
            'name': employee.full_name,
            'dailyWage': float(employee.daily_wage) if employee.daily_wage else None
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

# Employee routes
@app.route('/api/employees', methods=['GET'])
def get_employees():
    # ... (rest of the code remains the same)
    try:
        # Test if employee_documents table exists
        try:
            db.session.execute(db.text("SELECT COUNT(*) FROM employee_documents LIMIT 1"))
        except Exception as table_error:
            print(f"employee_documents table might not exist: {str(table_error)}")
            # Create tables if they don't exist
            try:
                db.create_all()
                print("Database tables created/updated")
            except Exception as create_error:
                print(f"Error creating tables: {str(create_error)}")
        
        employees = Employee.query.all()
        result = []
        for employee in employees:
            try:
                result.append(employee.to_dict())
            except Exception as emp_error:
                print(f"Error serializing employee {employee.id}: {str(emp_error)}")
                # Add a basic employee dict without documents if serialization fails
                result.append({
                    'id': employee.id,
                    'fullName': employee.full_name,
                    'title': employee.title,
                    'department': employee.department,
                    'position': employee.position,
                    'mobileNumber': employee.mobile_number,
                    'startDate': employee.start_date.isoformat() if employee.start_date else None,
                    'term': employee.term,
                    'status': employee.status,
                    'isActive': employee.is_active,
                    'documents': [],  # Empty documents array as fallback
                    'error': f"Document loading failed: {str(emp_error)}"
                })
        return jsonify(result)
    except Exception as e:
        print(f"Error in get_employees: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'message': str(e)}), 500

@app.route('/api/employees/<int:id>', methods=['GET'])
def get_employee(id):
    try:
        employee = Employee.query.get_or_404(id)
        return jsonify(employee.to_dict())
    except Exception as e:
        return jsonify({'message': str(e)}), 404

@app.route('/api/employees', methods=['POST'])
@jwt_required()
def create_employee():
    data = request.get_json()
    try:
        employee_data = EmployeeSchema(**data)
        
        # Create new employee
        employee = Employee(
            full_name=employee_data.fullName,
            title=employee_data.title,
            home_address=employee_data.homeAddress,
            home_phone_number=employee_data.homePhoneNumber,
            mobile_number=employee_data.mobileNumber,
            date_of_birth=employee_data.dateOfBirth,
            marital_status=employee_data.maritalStatus,
            national_insurance_number=employee_data.nationalInsuranceNumber,
            start_date=employee_data.startDate,
            department=employee_data.department,
            position=employee_data.position,
            salary=employee_data.salary,
            probation_period=employee_data.probationPeriod,
            line_manager=employee_data.lineManager,
            term=employee_data.term,
            status=employee_data.status,
            bank_name=employee_data.bankName,
            branch_name=employee_data.branchName,
            branch_address=employee_data.branchAddress,
            account_number=employee_data.accountNumber,
            sort_code=employee_data.sortCode,
            fork_lift_certificate_company_name=employee_data.forkLiftCertificateCompanyName,
            licence_certificate_number=employee_data.licenceCertificateNumber,
            market_permit_number=employee_data.marketPermitNumber,
            entitlement_days=employee_data.entitlementDays,
            # Next of Kin Information
            next_of_kin_name=employee_data.nextOfKinName,
            next_of_kin_phone_number=employee_data.nextOfKinPhoneNumber,
            next_of_kin_email=employee_data.nextOfKinEmail,
            next_of_kin_address=employee_data.nextOfKinAddress,
            next_of_kin_relationship=employee_data.nextOfKinRelationship,
            email=employee_data.email,
            is_active=employee_data.isActive
        )
        
        db.session.add(employee)
        db.session.flush()  # Get employee ID
        
        # Add documents
        if employee_data.documents:
            for doc_data in employee_data.documents:
                document = EmployeeDocument(
                    employee_id=employee.id,
                    document_name=doc_data.documentName,
                    start_date=doc_data.startDate,
                    end_date=doc_data.endDate
                )
                db.session.add(document)
        
        db.session.commit()
        return jsonify(employee.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/employees/<int:id>', methods=['PUT'])
@jwt_required()
def update_employee(id):
    data = request.get_json()
    try:
        employee_data = EmployeeSchema(**data)
        employee = Employee.query.get_or_404(id)
        
        # Update employee fields
        employee.full_name = employee_data.fullName
        employee.title = employee_data.title
        employee.home_address = employee_data.homeAddress
        employee.home_phone_number = employee_data.homePhoneNumber
        employee.mobile_number = employee_data.mobileNumber
        employee.date_of_birth = employee_data.dateOfBirth
        employee.marital_status = employee_data.maritalStatus
        employee.national_insurance_number = employee_data.nationalInsuranceNumber
        employee.start_date = employee_data.startDate
        employee.department = employee_data.department
        employee.position = employee_data.position
        employee.salary = employee_data.salary
        employee.probation_period = employee_data.probationPeriod
        employee.line_manager = employee_data.lineManager
        employee.term = employee_data.term
        employee.status = employee_data.status
        employee.bank_name = employee_data.bankName
        employee.branch_name = employee_data.branchName
        employee.branch_address = employee_data.branchAddress
        employee.account_number = employee_data.accountNumber
        employee.sort_code = employee_data.sortCode
        employee.fork_lift_certificate_company_name = employee_data.forkLiftCertificateCompanyName
        employee.licence_certificate_number = employee_data.licenceCertificateNumber
        employee.market_permit_number = employee_data.marketPermitNumber
        employee.entitlement_days = employee_data.entitlementDays
        # Next of Kin Information
        employee.next_of_kin_name = employee_data.nextOfKinName
        employee.next_of_kin_phone_number = employee_data.nextOfKinPhoneNumber
        employee.next_of_kin_email = employee_data.nextOfKinEmail
        employee.next_of_kin_address = employee_data.nextOfKinAddress
        employee.next_of_kin_relationship = employee_data.nextOfKinRelationship
        employee.email = employee_data.email
        employee.is_active = employee_data.isActive
        
        # Skip document updates - documents are managed separately via upload API
        # This prevents accidentally clearing file data when updating employee info
        
        db.session.commit()
        return jsonify(employee.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/employees/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_employee(id):
    try:
        employee = Employee.query.get_or_404(id)
        db.session.delete(employee)
        db.session.commit()
        return jsonify({'message': 'Employee deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/employees/<int:employee_id>/entitlement', methods=['GET'])
@jwt_required()
def get_employee_entitlement(employee_id):
    """Get employee holiday entitlement information for current holiday year"""
    try:
        employee = Employee.query.get_or_404(employee_id)
        
        # For simplicity, we'll use current calendar year as the entitlement period
        # In a more advanced system, you'd store the actual entitlement period dates
        current_year = datetime.now().year
        entitlement_start = datetime(current_year, 1, 1).date()
        entitlement_end = datetime(current_year, 12, 31).date()
        
        # Calculate total days used in current period (excluding archived requests)
        # Only count requests that don't have the "archived" marker in comments
        total_used = db.session.query(func.sum(HolidayRequest.days_granted)).filter(
            HolidayRequest.employee_id == employee_id,
            HolidayRequest.status == 'granted',
            HolidayRequest.last_date_at_work >= entitlement_start,
            HolidayRequest.last_date_at_work <= entitlement_end,
            # Exclude archived requests from previous periods
            ~HolidayRequest.manager_comments.like('%[Archived from previous period%')
        ).scalar() or 0
        
        # Get entitlement days (default to 25 if not set)
        entitlement_days = employee.entitlement_days or 25
        remaining_days = entitlement_days - total_used
        
        return jsonify({
            'employeeId': employee_id,
            'employeeName': employee.full_name,
            'entitlementDays': entitlement_days,
            'usedDays': int(total_used),
            'remainingDays': max(0, remaining_days),
            'currentYear': current_year,
            'entitlementPeriod': {
                'start': entitlement_start.isoformat(),
                'end': entitlement_end.isoformat()
            },
            'lastUpdated': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500



# Employee Document routes
@app.route('/api/employees/<int:employee_id>/documents', methods=['POST'])
@jwt_required()
def upload_employee_document(employee_id):
    """Upload a document for an employee"""
    try:
        # Check if employee exists
        employee = Employee.query.get_or_404(employee_id)
        
        # Ensure employee_documents table exists
        try:
            db.session.execute(db.text("SELECT COUNT(*) FROM employee_documents LIMIT 1"))
        except Exception as table_error:
            try:
                db.create_all()
            except Exception as create_error:
                return jsonify({'error': 'Database setup failed', 'details': str(create_error)}), 500
        
        # Check if file is in request
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        document_name = request.form.get('documentName', '')
        start_date = request.form.get('startDate')
        end_date = request.form.get('endDate')
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not document_name:
            return jsonify({'error': 'Document name is required'}), 400
        
        if file and allowed_file(file.filename):
            # Ensure upload directory exists
            upload_dir = app.config['UPLOAD_FOLDER']
            os.makedirs(upload_dir, exist_ok=True)
            
            # Generate unique filename
            file_extension = file.filename.rsplit('.', 1)[1].lower()
            unique_filename = f"{uuid.uuid4()}.{file_extension}"
            file_path = os.path.join(upload_dir, unique_filename)
            
            # Save file
            file.save(file_path)
            
            # Verify file was saved
            if not os.path.exists(file_path):
                return jsonify({'error': 'Failed to save file'}), 500
            
            file_size = os.path.getsize(file_path)
            
            # Parse dates safely
            parsed_start_date = None
            parsed_end_date = None
            
            try:
                if start_date:
                    parsed_start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            except Exception:
                pass
                
            try:
                if end_date:
                    parsed_end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
            except Exception:
                pass
            
            # Create document record with retry logic
            max_retries = 3
            retry_delay = 0.1
            
            for attempt in range(max_retries):
                try:
                    # Close any existing transactions
                    db.session.rollback()
                    
                    # Use SQLAlchemy ORM
                    document = EmployeeDocument(
                        employee_id=employee_id,
                        document_name=document_name,
                        file_name=file.filename,
                        file_path=unique_filename,
                        file_size=file_size,
                        file_type=file.content_type or 'application/octet-stream',
                        start_date=parsed_start_date,
                        end_date=parsed_end_date
                    )
                    
                    db.session.add(document)
                    db.session.commit()
                    
                    # Create response
                    document_dict = {
                        'id': document.id,
                        'documentName': document.document_name,
                        'fileName': document.file_name,
                        'filePath': document.file_path,
                        'fileSize': document.file_size,
                        'fileType': document.file_type,
                        'hasFile': bool(document.file_path)
                    }
                    
                    return jsonify({
                        'message': 'Document uploaded successfully',
                        'document': document_dict
                    }), 201
                        
                except Exception as db_error:
                    db.session.rollback()
                    
                    if "database is locked" in str(db_error).lower() and attempt < max_retries - 1:
                        import time
                        time.sleep(retry_delay * (attempt + 1))
                        continue
                    else:
                        return jsonify({'error': f'Database error: {str(db_error)}'}), 500
            
            # If we get here, all retries failed
            return jsonify({'error': 'Failed to save document after multiple attempts'}), 500
        else:
            return jsonify({'error': f'File type not allowed. Allowed types: {ALLOWED_EXTENSIONS}'}), 400
            
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/employees/<int:employee_id>/documents', methods=['GET'])
def get_employee_documents(employee_id):
    """Get all documents for an employee"""
    try:
        # Check if employee exists
        employee = Employee.query.get_or_404(employee_id)
        
        # Test if employee_documents table exists and create if needed
        try:
            db.session.execute(db.text("SELECT COUNT(*) FROM employee_documents LIMIT 1"))
        except Exception as table_error:
            print(f"employee_documents table issue: {str(table_error)}")
            try:
                db.create_all()
                print("Database tables created/updated for documents")
            except Exception as create_error:
                print(f"Error creating tables: {str(create_error)}")
                return jsonify({'error': 'Database table creation failed', 'details': str(create_error)}), 500
        
        # Query documents with error handling
        try:
            documents = EmployeeDocument.query.filter_by(employee_id=employee_id).all()
            result = []
            for doc in documents:
                try:
                    result.append(doc.to_dict())
                except Exception as doc_error:
                    print(f"Error serializing document {doc.id}: {str(doc_error)}")
                    # Add basic document info if serialization fails
                    result.append({
                        'id': doc.id,
                        'documentName': doc.document_name or 'Unknown Document',
                        'fileName': getattr(doc, 'file_name', None),
                        'hasFile': bool(getattr(doc, 'file_path', None)),
                        'error': f"Serialization failed: {str(doc_error)}"
                    })
            return jsonify(result)
        except Exception as query_error:
            print(f"Error querying documents: {str(query_error)}")
            return jsonify([])  # Return empty array if query fails
            
    except Exception as e:
        print(f"Error in get_employee_documents: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/employees/documents/<int:document_id>', methods=['GET'])
def download_employee_document(document_id):
    """Download an employee document"""
    try:
        # Ensure tables exist
        try:
            db.session.execute(db.text("SELECT COUNT(*) FROM employee_documents LIMIT 1"))
        except Exception:
            db.create_all()
            
        document = EmployeeDocument.query.get_or_404(document_id)
        
        # Check if file_path exists
        if not document.file_path:
            return jsonify({'error': 'No file associated with this document'}), 404
            
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], document.file_path)
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found on server'}), 404
        
        return send_file(
            file_path,
            as_attachment=True,
            download_name=document.file_name or f"document_{document_id}",
            mimetype=document.file_type or 'application/octet-stream'
        )
    except Exception as e:
        print(f"Error in download_employee_document: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/employees/documents/<int:document_id>', methods=['DELETE'])
@jwt_required()
def delete_employee_document(document_id):
    """Delete an employee document"""
    try:
        document = EmployeeDocument.query.get_or_404(document_id)
        
        # Delete file from filesystem
        if document.file_path:
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], document.file_path)
            if os.path.exists(file_path):
                os.remove(file_path)
        
        # Delete database record
        db.session.delete(document)
        db.session.commit()
        
        return jsonify({'message': 'Document deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/employees/documents/<int:document_id>/view', methods=['GET'])
def view_employee_document(document_id):
    """View an employee document (for PDFs and images)"""
    try:
        # Check if document exists first
        document = EmployeeDocument.query.get(document_id)
        if not document:
            return jsonify({'error': f'Document {document_id} not found'}), 404
            
        # Check if file_path exists
        if not document.file_path:
            return jsonify({'error': 'No file associated with this document'}), 404
            
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], document.file_path)
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found on server'}), 404
        return send_file(
            file_path,
            mimetype=document.file_type or 'application/octet-stream',
            as_attachment=False  # Display in browser instead of download
        )
    except Exception as e:
        print(f"Error in view_employee_document: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500



# Debug route to check database content and connection
@app.route('/api/debug/documents/<int:employee_id>', methods=['GET'])
def debug_employee_documents(employee_id):
    """Debug route to check what's in the database"""
    try:
        # Show which database is being used
        db_path = app.config['SQLALCHEMY_DATABASE_URI']
        
        documents = EmployeeDocument.query.filter_by(employee_id=employee_id).all()
        result = []
        for doc in documents:
            result.append({
                'id': doc.id,
                'employee_id': doc.employee_id,
                'document_name': doc.document_name,
                'file_name': doc.file_name,
                'file_path': doc.file_path,
                'file_size': doc.file_size,
                'file_type': doc.file_type,
                'created_at': doc.created_at.isoformat() if doc.created_at else None,
                'file_exists': os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], doc.file_path)) if doc.file_path else False
            })
        return jsonify({
            'employee_id': employee_id,
            'documents': result,
            'upload_folder': app.config['UPLOAD_FOLDER'],
            'database_uri': db_path,
            'database_file': actual_db_file,
            'database_exists': os.path.exists(actual_db_file)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Employee Document Expiration Alerts
@app.route('/api/employees/documents/expiring', methods=['GET'])
@jwt_required()
def get_expiring_employee_documents():
    """Get employee documents expiring within a week"""
    try:
        from datetime import datetime, timedelta
        
        # Calculate date range (today to 7 days from now)
        today = datetime.now().date()
        week_from_now = today + timedelta(days=7)
        
        # Query for documents expiring within a week
        expiring_docs = db.session.query(
            EmployeeDocument.id,
            EmployeeDocument.document_name,
            EmployeeDocument.end_date,
            Employee.full_name.label('employee_name'),
            Employee.id.label('employee_id')
        ).join(
            Employee, EmployeeDocument.employee_id == Employee.id
        ).filter(
            EmployeeDocument.end_date.isnot(None),  # Only documents with end dates
            EmployeeDocument.end_date >= today,     # Not already expired
            EmployeeDocument.end_date <= week_from_now  # Expiring within a week
        ).order_by(
            EmployeeDocument.end_date.asc()  # Sort by expiration date
        ).all()
        
        # Format the results
        alerts = []
        for doc in expiring_docs:
            days_until_expiry = (doc.end_date - today).days
            alerts.append({
                'id': doc.id,
                'employeeId': doc.employee_id,
                'employeeName': doc.employee_name,
                'documentName': doc.document_name,
                'endDate': doc.end_date.isoformat(),
                'daysUntilExpiry': days_until_expiry,
                'isExpiringSoon': days_until_expiry <= 3,  # Mark as urgent if 3 days or less
                'alertType': 'document_expiry'
            })
        
        return jsonify(alerts)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Equipment routes
@app.route('/api/equipment', methods=['GET'])
@jwt_required()
def get_equipment():
    try:
        equipment_list = Equipment.query.filter_by(is_active='yes').all()
        return jsonify([equipment.to_dict() for equipment in equipment_list])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/equipment/<int:id>', methods=['GET'])
@jwt_required()
def get_equipment_item(id):
    try:
        equipment = Equipment.query.get_or_404(id)
        return jsonify(equipment.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 404

@app.route('/api/equipment', methods=['POST'])
@jwt_required()
def create_equipment():
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('description'):
            return jsonify({'error': 'Description is required'}), 400
       
        if not data.get('endDate'):
            return jsonify({'error': 'End date is required'}), 400
        
        # Parse dates
        from datetime import datetime
        
        start_date = None
        if data.get('startDate'):
            start_date = datetime.strptime(data['startDate'], '%Y-%m-%d').date()
        end_date = datetime.strptime(data['endDate'], '%Y-%m-%d').date()
        
        # Validate date range
        if start_date and end_date <= start_date:
            return jsonify({'error': 'End date must be after start date'}), 400
        
        equipment = Equipment(
            description=data['description'],
            start_date=start_date,
            end_date=end_date,
            is_active='yes'
        )
        
        db.session.add(equipment)
        db.session.commit()
        
        return jsonify(equipment.to_dict()), 201
        
    except ValueError as e:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/equipment/<int:id>', methods=['PUT'])
@jwt_required()
def update_equipment(id):
    try:
        equipment = Equipment.query.get_or_404(id)
        data = request.get_json()
        
        # Validate required fields
        if not data.get('description'):
            return jsonify({'error': 'Description is required'}), 400
       
        if not data.get('endDate'):
            return jsonify({'error': 'End date is required'}), 400
        
        # Parse dates
        from datetime import datetime
        start_date = None
        if data.get('startDate'):
            start_date = datetime.strptime(data['startDate'], '%Y-%m-%d').date()
        end_date = datetime.strptime(data['endDate'], '%Y-%m-%d').date()
        
        # Validate date range
        if start_date and end_date <= start_date:
            return jsonify({'error': 'End date must be after start date'}), 400
        
        equipment.description = data['description']
        equipment.start_date = start_date
        equipment.end_date = end_date
        equipment.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify(equipment.to_dict())
        
    except ValueError as e:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/equipment/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_equipment(id):
    try:
        equipment = Equipment.query.get_or_404(id)
        equipment.is_active = 'no'
        equipment.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({'message': 'Equipment deleted successfully'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# Equipment Expiration Alerts
@app.route('/api/equipment/expiring', methods=['GET'])
@jwt_required()
def get_expiring_equipment():
    """Get equipment expiring within a week"""
    try:
        from datetime import datetime, timedelta
        
        # Calculate date range (today to 7 days from now)
        today = datetime.now().date()
        week_from_now = today + timedelta(days=7)
        
        # Query for equipment expiring within a week
        expiring_equipment = Equipment.query.filter(
            Equipment.is_active == 'yes',
            Equipment.end_date >= today,     # Not already expired
            Equipment.end_date <= week_from_now  # Expiring within a week
        ).order_by(
            Equipment.end_date.asc()  # Sort by expiration date
        ).all()
        
        # Format the results
        alerts = []
        for equipment in expiring_equipment:
            days_until_expiry = (equipment.end_date - today).days
            alerts.append({
                'id': equipment.id,
                'description': equipment.description,
                'endDate': equipment.end_date.isoformat(),
                'daysUntilExpiry': days_until_expiry,
                'isExpiringSoon': days_until_expiry <= 3,  # Mark as urgent if 3 days or less
                'alertType': 'equipment_expiry'
            })
        
        return jsonify(alerts)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Business Date Management Routes
@app.route('/api/business-date', methods=['GET'])
def get_business_date_api():
    """Get current and next business dates"""
    try:
        current_date = get_business_date()
        next_date = get_next_business_date(current_date)
        
        return jsonify({
            'currentDate': current_date.isoformat(),
            'nextDate': next_date.isoformat(),
            'isNextDay': next_date > current_date
        })
    except Exception as e:
        return jsonify({'message': str(e)}), 500

@app.route('/api/business-date/switch', methods=['POST'])
@jwt_required()
def switch_business_date():
    """Switch to next business date"""
    try:
        # Get current business date
        current_date = get_business_date()
        next_date = get_next_business_date(current_date)
        
        # Set the new business date manually
        set_business_date(next_date, is_manual=True)
        
        return jsonify({
            'message': 'Business date switched successfully',
            'newDate': next_date.isoformat(),
            'previousDate': current_date.isoformat()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 500

@app.route('/api/business-date/reset', methods=['POST'])
@jwt_required()
def reset_business_date():
    """Reset business date to current system date"""
    try:
        # Clear any manual override
        business_date_record = BusinessDate.query.first()
        if business_date_record:
            db.session.delete(business_date_record)
            db.session.commit()
        
        # Get current date (will now use system date)
        current_date = get_business_date()
        
        return jsonify({
            'message': 'Business date reset to current system date',
            'currentDate': current_date.isoformat()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 500
        # This is a simple implementation - you might want to add a specific field for manual date override
        settings.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'message': 'Business date switched successfully',
            'newDate': next_date.isoformat()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 500

def get_next_business_date(current_date):
    """Calculate next business date (skipping only Sunday)"""
    next_date = current_date + timedelta(days=1)
    
    # Skip only Sunday (Sunday = 6), Saturday is a working day
    while next_date.weekday() == 6:
        next_date += timedelta(days=1)
    
    return next_date

# Monthly Reports Routes
@app.route('/api/reports/monthly-stats', methods=['GET'])
def get_monthly_stats():
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    
    if not year or not month:
        return jsonify({'error': 'Year and month are required'}), 400
    
    # Get all days in the month
    start_date = datetime(year, month, 1)
    if month == 12:
        end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = datetime(year, month + 1, 1) - timedelta(days=1)
    
    # Calculate working days (all days)
    working_days = (end_date - start_date).days + 1
    
    # Get attendance records for the month
    attendance_records = Attendance.query.filter(
        Attendance.date >= start_date.date(),
        Attendance.date <= end_date.date()
    ).all()
    
    # Calculate statistics
    total_leaves = sum(1 for record in attendance_records if record.status == 'leave')
    total_present = sum(1 for record in attendance_records if record.status == 'present')
    total_employees = Employee.query.filter(Employee.is_active == 'yes').count()
    
    avg_attendance = (total_present / (working_days * total_employees)) * 100 if total_employees > 0 else 0
    
    return jsonify({
        'workingDays': working_days,
        'totalLeaves': total_leaves,
        'avgAttendance': round(avg_attendance, 2)
    })

@app.route('/api/reports/payroll', methods=['GET'])
def get_payroll_report():
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')
    employee_id = request.args.get('employeeId', type=int)
    result = []
    query = Employee.query.filter(Employee.is_active == 'yes')
    if employee_id:
        query = query.filter(Employee.id == employee_id)
    employees = query.all()

    # If from_date and to_date are provided, use them for filtering
    if from_date and to_date:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d")
        for employee in employees:
            present_days = Attendance.query.filter(
                Attendance.user_id == employee.id,
                Attendance.date >= from_dt.date(),
                Attendance.date <= to_dt.date(),
                Attendance.status == 'present'
            ).all()
            present_dates = [a.date.isoformat() for a in present_days]
            present_count = len(present_dates)
            daily_wage = float(employee.salary) if employee.salary else 0
            pay = present_count * daily_wage
            result.append({
                'employee': {
                    'id': employee.id,
                    'fullName': employee.full_name,
                    'position': employee.position,
                    'status': employee.status,
                    'salary': daily_wage
                },
                'presentDays': present_count,
                'presentDates': present_dates,
                'pay': pay
            })
        if result and all(r['presentDays'] == 0 for r in result):
            return jsonify([])
        return jsonify(result)
    # Fallback to year/month logic
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    if not year or not month:
        return jsonify({'error': 'Year and month are required'}), 400
    start_date = datetime(year, month, 1)
    if month == 12:
        end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = datetime(year, month + 1, 1) - timedelta(days=1)
    for employee in employees:
        present_days = Attendance.query.filter(
            Attendance.user_id == employee.id,
            Attendance.date >= start_date.date(),
            Attendance.date <= end_date.date(),
            Attendance.status == 'present'
        ).all()
        present_dates = [a.date.isoformat() for a in present_days]
        present_count = len(present_dates)
        daily_wage = float(employee.salary) if employee.salary else 0
        pay = present_count * daily_wage
        result.append({
            'employee': {
                'id': employee.id,
                'fullName': employee.full_name,
                'position': employee.position,
                'status': employee.status,
                'salary': daily_wage
            },
            'presentDays': present_count,
            'presentDates': present_dates,
            'pay': pay
        })
    if result and all(r['presentDays'] == 0 for r in result):
        return jsonify([])
    return jsonify(result)

@app.route('/api/reports/weekly-stats', methods=['GET'])
def get_weekly_stats():
    year = request.args.get('year', type=int)
    week = request.args.get('week', type=int)
    
    if not year or not week:
        return jsonify({'error': 'Year and week are required'}), 400
    
    # Get the start and end dates for the week
    start_date = datetime.strptime(f'{year}-W{week}-1', '%Y-W%W-%w')
    end_date = start_date + timedelta(days=6)
    
    # Get attendance records for the week
    attendance_records = Attendance.query.filter(
        Attendance.date >= start_date.date(),
        Attendance.date <= end_date.date()
    ).all()
    
    # Calculate statistics
    total_leaves = sum(1 for record in attendance_records if record.status == 'leave')
    total_present = sum(1 for record in attendance_records if record.status == 'present')
    total_employees = User.query.count()
    
    # All days are working days
    working_days = 7
    avg_attendance = (total_present / (working_days * total_employees)) * 100 if total_employees > 0 else 0
    
    return jsonify({
        'workingDays': working_days,
        'totalLeaves': total_leaves,
        'avgAttendance': round(avg_attendance, 2)
    })

@app.route('/api/reports/weekly-payroll', methods=['GET'])
def get_weekly_payroll():
    year = request.args.get('year', type=int)
    week = request.args.get('week', type=int)
    employee_id = request.args.get('employeeId', type=int)
    
    if not year or not week:
        return jsonify({'error': 'Year and week are required'}), 400
    
    # Get the start and end dates for the week
    start_date = datetime.strptime(f'{year}-W{week}-1', '%Y-W%W-%w')
    end_date = start_date + timedelta(days=6)
    print(f"DEBUG: /api/reports/weekly-payroll start_date={start_date.date()}, end_date={end_date.date()}")
    
    # Get users (filter by employee_id if provided)
    query = User.query
    if employee_id:
        query = query.filter(User.id == employee_id)
    users = query.all()
    
    result = []
    for user in users:
        # Get attendance records for the user in the specified week
        attendance_records = Attendance.query.filter(
            Attendance.user_id == user.id,
            Attendance.date >= start_date.date(),
            Attendance.date <= end_date.date()
        ).all()
        
        # Calculate attendance statistics
        present_days = sum(1 for record in attendance_records if record.status == 'present')
        absent_days = sum(1 for record in attendance_records if record.status == 'absent')
        leave_days = sum(1 for record in attendance_records if record.status == 'leave')
        holiday_days = sum(1 for record in attendance_records if record.status == 'holiday')
        
        # All days are working days
        working_days = 7
        
        # Calculate attendance percentage
        attendance_percentage = (present_days / working_days) * 100
        
        # Calculate payroll
        daily_wage = float(user.daily_wage) if user.daily_wage else 0
        gross_pay = present_days * daily_wage
        
        # Calculate tax (20%) and National Insurance (12%)
        tax = gross_pay * 0.20
        national_insurance = gross_pay * 0.12
        net_pay = gross_pay - tax - national_insurance
        
        result.append({
            'employee': {
                'id': user.id,
                'name': user.username,
                'employeeId': user.id,
                'department': user.user_type
            },
            'attendance': {
                'presentDays': present_days,
                'absentDays': absent_days,
                'leaveDays': leave_days,
                'holidayDays': holiday_days,
                'attendancePercentage': round(attendance_percentage, 2)
            },
            'payroll': {
                'workingDays': working_days,
                'dailyWage': daily_wage,
                'grossPay': round(gross_pay, 2),
                'tax': round(tax, 2),
                'nationalInsurance': round(national_insurance, 2),
                'netPay': round(net_pay, 2)
            }
        })
    
    return jsonify(result)

# Payment routes
@app.route('/api/payments', methods=['POST'])
@jwt_required()
def create_payment():
    try:
        data = request.get_json()
        print("Received payment data:", data)  # Debug log
        
        payment_data = PaymentSchema(**data)
        print("Validated payment data:", payment_data.dict())  # Debug log
        user_id = get_jwt_identity()

        customer = Customer.query.get(payment_data.customer_id)
        if not customer:
            return jsonify({"error": "Customer not found"}), 404
        split_payment = data.get('splitPayment', {})
        total_split = sum(split_payment.values()) if split_payment else 0

        # If sale_id is provided, link payment to a specific sale/invoice
        sale = None
        if payment_data.sale_id:
            sale = Sale.query.get(payment_data.sale_id)
            if not sale:
                return jsonify({"error": "Sale (invoice) not found"}), 404

            payment_to_apply = total_split if total_split > 0 else payment_data.amount
            available_balance = _sale_outstanding(sale)
            if payment_to_apply > 0 and _money_decimal(payment_to_apply) > available_balance:
                return jsonify({
                    "error": "Payment exceeds the invoice's outstanding balance after discounts and returns."
                }), 400

            # Update sale's payment status and paid_amount
            current_paid = float(sale.paid_amount or 0)
            new_paid = current_paid + float(payment_to_apply)
            effective_total = _money_decimal(sale.total_amount) - _active_discount_total_for_sale(sale.id) - _sale_return_total(sale.id)
            
            if new_paid >= float(effective_total):
                sale.payment_status = "paid"
                sale.paid_amount = new_paid
                sale.status = "finalized"  # Mark as finalized when fully paid
                # If payment is cash, update customer_type to cash
                if payment_data.payment_mode.lower() == "cash" and sale.customer_type != "cash":
                    print(f"[DEBUG] Updating sale {sale.id} customer_type from {sale.customer_type} to cash due to full cash payment.")
                    sale.customer_type = "cash"
                elif payment_data.payment_mode.lower() in ["bank", "card"] and sale.customer_type != "bank":
                    print(f"[DEBUG] Updating sale {sale.id} customer_type from {sale.customer_type} to bank due to full bank payment.")
                    sale.customer_type = "bank"
                elif payment_data.payment_mode.lower() == "bank_transfer" and sale.customer_type != "bank_transfer":
                    print(f"[DEBUG] Updating sale {sale.id} customer_type from {sale.customer_type} to bank_transfer due to full bank transfer payment.")
                    sale.customer_type = "bank_transfer"
                elif payment_data.payment_mode.lower() == "cheque" and sale.customer_type != "cheque":
                    print(f"[DEBUG] Updating sale {sale.id} customer_type from {sale.customer_type} to cheque due to full cheque payment.")
                    sale.customer_type = "cheque"
            else:
                sale.payment_status = "partial"
                sale.paid_amount = new_paid
            db.session.add(sale)

        # Handle split payment if provided
        if total_split > 0 and split_payment:
            # Create separate payment records for each payment type
            mode_map = {
                'cash': 'cash',
                'card': 'bank', 
                'bankTransfer': 'bank_transfer',
                'cheque': 'cheque'
            }
            
            # Generate batch ID for split payments
            last_batch = db.session.query(Payment.batch_id).filter(
                Payment.batch_id.isnot(None)
            ).order_by(Payment.batch_id.desc()).first()
            batch_id = (last_batch[0] + 1) if last_batch else 1
            
            for payment_type, split_amount in split_payment.items():
                if split_amount != 0:  # Allow both positive and negative amounts
                    new_payment = Payment(
                        customer_id=payment_data.customer_id,
                        sale_id=payment_data.sale_id,
                        amount=split_amount,
                        payment_mode=mode_map.get(payment_type, 'cash'),
                        payment_date=payment_data.payment_date,
                        payment_type='on-account',
                        remarks=payment_data.remarks,
                        batch_id=batch_id,
                        created_by=user_id
                    )
                    db.session.add(new_payment)
        else:
            # Single payment mode
            new_payment = Payment(
                customer_id=payment_data.customer_id,
                sale_id=payment_data.sale_id,
                amount=payment_data.amount,
                payment_mode=payment_data.payment_mode,
                payment_date=payment_data.payment_date,
                payment_type='on-account',
                remarks=payment_data.remarks,
                created_by=user_id
            )
            print("Created payment object:", new_payment.to_dict())  # Debug log
            db.session.add(new_payment)
        
        db.session.commit()
        
        # Update customer running balance
        try:
            customer = Customer.query.get(payment_data.customer_id)
            if customer:
                # Subtract the payment amount from the customer's running balance
                current_balance = float(customer.running_balance or 0)
                new_balance = current_balance - float(payment_to_apply)
                customer.running_balance = new_balance
                db.session.commit()
                print(f"Updated customer {customer.customer_name} running balance: {current_balance} - {payment_data.amount} = {new_balance}")
        except Exception as e:
            print(f"Warning: Failed to update customer running balance: {str(e)}")
            # Don't fail the payment creation if running balance update fails
        
        return jsonify(new_payment.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        print("Error creating payment:", str(e))  # Debug log
        import traceback
        print("Full traceback:", traceback.format_exc())  # Debug log
        return jsonify({"error": str(e)}), 500

def handle_delete_payment_batch(batch_id, user_id):
    """Delete a batch of payments and revert all related transactions"""
    print(f"[DELETE DEBUG] Delete payment batch called for batch_id: {batch_id}")
    try:
        print(f"[DELETE DEBUG] User ID: {user_id}")
        # Get all payments in this batch
        payments = Payment.query.filter_by(batch_id=batch_id).all()
        if not payments:
            return jsonify({"error": "Payment batch not found"}), 404
        
        # Check if user has permission to delete (same logic as edit)
        payment_date = payments[0].payment_date
        
        # Check backdate editing permission
        backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
        today = get_business_date()
        
        # If editing not allowed and payment_date is in the past, block
        if backdate_opt and not backdate_opt.editing and payment_date < today:
            return jsonify({"error": "You do not have permission to delete payments for previous dates."}), 403
        
        # Check current date editing permission
        if backdate_opt and not getattr(backdate_opt, 'current_editing', True) and payment_date == today:
            return jsonify({"error": "You do not have permission to delete payments for today."}), 403
        
        # Revert sale payment statuses for invoice payments and restore any
        # credit invoices consumed by this batch.
        #
        # When a credit invoice is applied, its amount is baked into the
        # positive invoice's paid_amount (via the credit_applied logic in
        # create_customer_bulk_payment) without a matching Payment row. So
        # instead of merely subtracting the batch's rows, each affected
        # invoice's paid_amount is recomputed from its remaining Payment rows.
        # That automatically removes the embedded credit contribution. Credit
        # rows (0-amount records of an applied credit invoice) restore the
        # credit sale back to outstanding.
        batch_payments_by_sale = {}
        for payment in payments:
            if payment.sale_id and payment.payment_type != 'credit':
                batch_payments_by_sale.setdefault(payment.sale_id, []).append(payment)

        for sale_id, batch_rows in batch_payments_by_sale.items():
            sale = Sale.query.get(sale_id)
            if not sale:
                continue
            batch_total = sum(float(p.amount) for p in batch_rows)
            remaining_total = sum(
                float(p.amount) for p in sale.payments
                if p.payment_type != 'credit'
            ) - batch_total
            new_paid = round(min(max(0.0, remaining_total), float(sale.total_amount or 0)), 2)
            sale.paid_amount = new_paid

            if new_paid == 0:
                sale.payment_status = "unpaid"
            elif new_paid < float(sale.total_amount):
                sale.payment_status = "partial"
            else:
                sale.payment_status = "paid"

            # Reset customer_type to 'account' when payments are deleted
            if sale.customer_type != 'account':
                sale.customer_type = 'account'
            db.session.add(sale)

        # Restore credit invoices that were consumed by this batch
        for payment in payments:
            if payment.payment_type == 'credit' and payment.sale_id:
                sale = Sale.query.get(payment.sale_id)
                if sale and float(sale.paid_amount or 0) < 0:
                    sale.paid_amount = 0
                    sale.payment_status = "unpaid"
                    if sale.customer_type != 'account':
                        sale.customer_type = 'account'
                    db.session.add(sale)

        # Delete all payments in the batch
        Payment.query.filter_by(batch_id=batch_id).delete()
        for sale_id in batch_payments_by_sale:
            sale = Sale.query.get(sale_id)
            if sale:
                _refresh_sale_payment_status(sale)
        
        db.session.commit()
        
        return jsonify({
            "success": True, 
            "message": f"Successfully deleted {len(payments)} payments from batch {batch_id}"
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete payment batch: {str(e)}"}), 500

@app.route('/api/payments/batch/<int:batch_id>', methods=['PUT', 'DELETE', 'OPTIONS'])
@jwt_required()
def manage_payment_batch(batch_id):
    if request.method == 'OPTIONS':
        # Handle preflight request
        response = jsonify({'message': 'Preflight request accepted'})
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:5173')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'PUT,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response
        
    try:
        # Add JWT requirement after OPTIONS check
        from flask_jwt_extended import jwt_required, get_jwt_identity
        jwt_required()(lambda: None)()
        user_id = get_jwt_identity()
        
        if request.method == 'DELETE':
            # Handle DELETE request
            return handle_delete_payment_batch(batch_id, user_id)
        
        # Handle PUT request
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        # Get all payments in this batch
        payments = Payment.query.filter_by(batch_id=batch_id).all()
        if not payments:
            return jsonify({"error": "Payment batch not found"}), 404
        
        # Check permissions (same as delete)
        payment_date = payments[0].payment_date
        backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
        today = get_business_date()
        
        if backdate_opt and not backdate_opt.editing and payment_date < today:
            return jsonify({"error": "You do not have permission to edit payments for previous dates."}), 403
        
        if backdate_opt and not getattr(backdate_opt, 'current_editing', True) and payment_date == today:
            return jsonify({"error": "You do not have permission to edit payments for today."}), 403
        
        try:
            # Store original sale customer_types to preserve daily book categorization
            original_sale_types = {}
            for payment in payments:
                if payment.sale_id:
                    sale = Sale.query.get(payment.sale_id)
                    if sale:
                        original_sale_types[payment.sale_id] = sale.customer_type
            
            # Revert sale payment statuses for old payments.
            # Credit rows are 0-amount records of an applied credit invoice and
            # are skipped here so the credit sale's paid_amount is not reset.
            for payment in payments:
                if payment.sale_id and payment.payment_type != 'credit':
                    sale = Sale.query.get(payment.sale_id)
                    if sale:
                        current_paid = float(sale.paid_amount or 0)
                        new_paid = max(0, current_paid - float(payment.amount))
                        sale.paid_amount = new_paid
                        
                        if new_paid == 0:
                            sale.payment_status = "unpaid"
                        elif new_paid < float(sale.total_amount):
                            sale.payment_status = "partial"
                        else:
                            sale.payment_status = "paid"
                        
                        db.session.add(sale)
            
            # Calculate old total amount before deleting payments
            old_total_amount = sum(float(p.amount) for p in payments)
            
            # Capture existing credit-application rows so they survive the edit
            existing_credit_rows = [
                {'sale_id': p.sale_id, 'payment_mode': p.payment_mode}
                for p in payments if p.payment_type == 'credit' and p.sale_id
            ]
            
            # Delete existing payments in batch
            Payment.query.filter_by(batch_id=batch_id).delete()
            
            # Use the same sequential logic as customer-bulk endpoint
            customer_id = data.get('customerId') or payments[0].customer_id
            amount = data.get('amount', 0)
            payment_date = data.get('paymentDate')
            split_payment = data.get('splitPayment', {})
            invoice_ids = data.get('invoiceIds', [])
            on_account_amount = data.get('onAccountAmount', 0)
            remarks = data.get('remarks', '')
            payment_distribution = data.get('paymentDistribution', [])
            
            # Debug logging
            print(f"[EDIT DEBUG] Received data:")
            print(f"  - amount: {amount}")
            print(f"  - split_payment: {split_payment}")
            print(f"  - invoice_ids: {invoice_ids}")
            print(f"  - on_account_amount: {on_account_amount}")
            print(f"  - payment_distribution: {payment_distribution}")
            
            # Parse payment date
            if payment_date:
                try:
                    payment_date_obj = datetime.strptime(payment_date, '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({"error": "Invalid payment date format"}), 400
            else:
                payment_date_obj = payments[0].payment_date
            
            # Create new payments using the same logic as create endpoint
            payments_created = []
            
            # Use payment distribution from frontend if available
            if payment_distribution:
                print(f"[EDIT DEBUG] Using payment distribution from frontend: {payment_distribution}")
                
                # Create payments based on the frontend's sequential payment distribution
                for payment_item in payment_distribution:
                    invoice_id = payment_item.get('invoiceId')
                    is_on_account = payment_item.get('isOnAccount', False)
                    
                    if is_on_account:
                        # On-account payment (could be applied to an invoice or pure credit)
                        payment = Payment(
                            customer_id=customer_id,
                            sale_id=invoice_id if invoice_id else None,  # May have invoice_id if auto-applied
                            amount=float(payment_item.get('amount', 0)),
                            payment_mode=payment_item.get('paymentMode', 'cash'),
                            payment_date=payment_date_obj,
                            batch_id=batch_id,
                            payment_type='on-account',
                            payment_source='customer_payment',
                            remarks=f"{remarks} - On-account payment (Updated)" if remarks else "On-account payment (Updated)"
                        )
                        
                        # If on-account payment is applied to an invoice, update the sale
                        if invoice_id:
                            sale = Sale.query.get(invoice_id)
                            if sale:
                                current_paid = float(sale.paid_amount or 0)
                                new_paid = current_paid + float(payment_item.get('amount', 0))
                                
                                if new_paid >= float(sale.total_amount):
                                    sale.payment_status = "paid"
                                    sale.paid_amount = new_paid
                                    sale.status = "finalized"
                                else:
                                    sale.payment_status = "partial"
                                    sale.paid_amount = new_paid
                                
                                # Preserve original customer_type
                                sale.customer_type = original_sale_types.get(invoice_id, sale.customer_type)
                                db.session.add(sale)
                    else:
                        # Direct invoice payment (explicitly selected by user)
                        if not invoice_id:
                            print(f"[EDIT DEBUG] WARNING: Direct payment without invoice_id: {payment_item}")
                            continue
                            
                        payment = Payment(
                            customer_id=customer_id,
                            sale_id=invoice_id,
                            amount=float(payment_item.get('amount', 0)),
                            payment_mode=payment_item.get('paymentMode', 'cash'),
                            payment_date=payment_date_obj,
                            batch_id=batch_id,
                            payment_type='direct',  # IMPORTANT: Mark as direct payment
                            payment_source='customer_payment',
                            remarks=f"{remarks} - Invoice payment (Updated)" if remarks else "Invoice payment (Updated)"
                        )
                        
                        # Update sale payment status
                        sale = Sale.query.get(invoice_id)
                        if sale:
                            current_paid = float(sale.paid_amount or 0)
                            new_paid = current_paid + float(payment_item.get('amount', 0))
                            
                            if new_paid >= float(sale.total_amount):
                                sale.payment_status = "paid"
                                sale.paid_amount = new_paid
                                sale.status = "finalized"
                                # Preserve original customer_type for daily book categorization
                                sale.customer_type = original_sale_types.get(invoice_id, payment_item.get('paymentMode', 'cash'))
                            else:
                                sale.payment_status = "partial"
                                sale.paid_amount = new_paid
                                # Preserve original customer_type
                                sale.customer_type = original_sale_types.get(invoice_id, sale.customer_type)
                            
                            db.session.add(sale)
                    
                    db.session.add(payment)
                    payments_created.append(payment)
                    print(f"[EDIT DEBUG] Created payment: {payment_item.get('paymentMode')} £{payment_item.get('amount')} for invoice {invoice_id} (isOnAccount={is_on_account})")
            
            else:
                print(f"[EDIT DEBUG] No payment distribution from frontend, using fallback logic")
                # Fallback: Use the same sequential logic as the bulk payment endpoint
                # Get available payment methods
                payment_modes = [
                    ('cash', split_payment.get('cash', 0)),
                    ('bank', split_payment.get('bank', 0)),  # Frontend sends 'bank', not 'card'
                    ('bank_transfer', split_payment.get('bankTransfer', 0)),
                    ('cheque', split_payment.get('cheque', 0))
                ]
                print(f"[EDIT DEBUG] All payment modes: {payment_modes}")
                payment_modes = [(mode, amount) for mode, amount in payment_modes if amount > 0]
                print(f"[EDIT DEBUG] Filtered payment modes (>0): {payment_modes}")
                
                # Get invoices to pay (from invoice_ids)
                invoices_to_pay = []
                if invoice_ids:
                    print(f"[EDIT DEBUG] Processing invoice_ids: {invoice_ids}")
                    for invoice_id in invoice_ids:
                        sale = Sale.query.get(invoice_id)
                        if sale:
                            invoices_to_pay.append(sale)
                            print(f"[EDIT DEBUG] Added invoice {invoice_id} to pay list")
                        else:
                            print(f"[EDIT DEBUG] Invoice {invoice_id} not found")
                else:
                    print(f"[EDIT DEBUG] No invoice_ids provided")
                
                # Sort invoices by date (oldest first for sequential payment)
                invoices_to_pay.sort(key=lambda x: x.date)
                
                # For edit mode, preserve exact split payment amounts instead of using sequential logic
                print(f"[EDIT DEBUG] Creating separate payment records for each payment method")
                
                # Apply sequential payment logic (same as creation) but preserve exact split amounts
                remaining_payments = payment_modes.copy()
                
                for invoice in invoices_to_pay:
                    # Since we reverted all payments for this batch, use the current paid_amount from the sale
                    initial_invoice_balance = float(_sale_outstanding(invoice))
                    initial_paid = float(_sale_paid_amount(invoice))
                    invoice_balance = initial_invoice_balance
                    
                    print(f"[EDIT DEBUG] Invoice {invoice.id}: total={invoice.total_amount}, paid_amount={invoice.paid_amount}, balance={invoice_balance}")
                    
                    if invoice_balance <= 0:
                        print(f"[EDIT DEBUG] Skipping invoice {invoice.id} - already fully paid")
                        continue
                    
                    # Apply available payment methods to this invoice sequentially
                    for i, (mode, mode_amount) in enumerate(remaining_payments):
                        if mode_amount <= 0 or invoice_balance <= 0:
                            continue
                        
                        payment_amount = min(mode_amount, invoice_balance)
                        if payment_amount > 0:
                            # Create individual payment record for this amount and method
                            payment = Payment(
                                customer_id=customer_id,
                                sale_id=invoice.id,
                                amount=payment_amount,
                                payment_mode=mode,
                                payment_date=payment_date_obj,
                                batch_id=batch_id,
                                payment_type='direct',
                                remarks=f"{remarks} - Invoice payment (Updated)"
                            )
                            db.session.add(payment)
                            payments_created.append(payment)
                            print(f"[EDIT DEBUG] Created payment: {mode} £{payment_amount} for invoice {invoice.id}")
                            
                            # Update remaining amounts
                            remaining_payments[i] = (mode, mode_amount - payment_amount)
                            invoice_balance -= payment_amount
                    
                    # Update sale payment status for this invoice
                    new_paid = initial_paid + (initial_invoice_balance - invoice_balance)
                    
                    if new_paid >= float(invoice.total_amount):
                        invoice.payment_status = "paid"
                        invoice.paid_amount = new_paid
                        invoice.status = "finalized"
                    else:
                        invoice.payment_status = "partial"
                        invoice.paid_amount = new_paid
                    
                    # Preserve original customer_type
                    invoice.customer_type = original_sale_types.get(invoice.id, invoice.customer_type)
                    db.session.add(invoice)
                    print(f"[EDIT DEBUG] Updated invoice {invoice.id}: paid_amount={invoice.paid_amount}, status={invoice.payment_status}")
                
                # Handle any remaining payment amounts as on-account
                for mode, remaining_amount in remaining_payments:
                    if remaining_amount > 0:
                        payment = Payment(
                            customer_id=customer_id,
                            sale_id=None,
                            amount=remaining_amount,
                            payment_mode=mode,
                            payment_date=payment_date_obj,
                            batch_id=batch_id,
                            payment_type='on-account',
                            remarks=f"{remarks} - On-account payment (Updated)"
                        )
                        db.session.add(payment)
                        payments_created.append(payment)
                        print(f"[EDIT DEBUG] Created on-account payment: {mode} £{remaining_amount}")

            # Re-add the credit-application rows captured before the delete so
            # applied credit invoices stay visible in the payment history.
            for credit_row in existing_credit_rows:
                credit_payment = Payment(
                    customer_id=customer_id,
                    sale_id=credit_row['sale_id'],
                    amount=0,
                    payment_mode=credit_row['payment_mode'],
                    payment_date=payment_date_obj,
                    batch_id=batch_id,
                    payment_type='credit',
                    payment_source='customer_payment',
                    remarks=f"{remarks} (Credit applied)" if remarks else "Credit applied",
                    created_by=user_id
                )
                db.session.add(credit_payment)
                payments_created.append(credit_payment)

            for sale_id in {
                payment.sale_id for payment in payments_created
                if payment.sale_id and payment.payment_type != 'credit'
            }:
                sale = Sale.query.get(sale_id)
                if sale:
                    _refresh_sale_payment_status(sale)

            # Commit the transaction
            db.session.commit()
            
            return jsonify({
                "message": "Payment batch updated successfully",
                "batchId": batch_id,
                "totalAmount": float(amount),
                "paymentCount": len(payments_created)
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Error updating payment batch {batch_id}:", str(e))
            import traceback
            print("Full traceback:", traceback.format_exc())
            return jsonify({"error": str(e)}), 500
            
    except Exception as e:
        db.session.rollback()
        print(f"Error in update_payment_batch endpoint for batch {batch_id}:", str(e))
        import traceback
        print("Full traceback:", traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/api/payments/bulk', methods=['POST'])
@jwt_required()
def create_bulk_payment():
    """Create bulk payments with sequential payment distribution"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        print("Received bulk payment data:", data)  # Debug log
        
        # Validate required fields
        customer_id = data.get('customerId')
        amount = data.get('amount', 0)
        payment_date = data.get('paymentDate')
        split_payment = data.get('splitPayment', {})
        invoice_ids = data.get('invoiceIds', [])
        on_account_amount = data.get('onAccountAmount', 0)
        remarks = data.get('remarks', '')
        payment_distribution = data.get('paymentDistribution', [])
        
        if not customer_id or not payment_date:
            return jsonify({"error": "Customer ID and payment date are required"}), 400
        
        # Parse payment date
        try:
            payment_date_obj = datetime.strptime(payment_date, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({"error": "Invalid payment date format"}), 400
        
        # Generate batch ID for grouping payments - use sequential ID
        # Get the highest existing batch_id and increment by 1
        max_batch_id = db.session.query(func.max(Payment.batch_id)).scalar() or 0
        batch_id = max_batch_id + 1
        
        payments_created = []
        
        # Use payment distribution from frontend if available (new sequential logic)
        if payment_distribution:
            print(f"Using sequential payment distribution from frontend: {payment_distribution}")
            
            # Create payments based on the frontend's sequential payment distribution
            for payment_item in payment_distribution:
                if payment_item.get('isOnAccount', False):
                    # On-account payment
                    payment = Payment(
                        customer_id=customer_id,
                        sale_id=None,  # No specific invoice
                        amount=float(payment_item.get('amount', 0)),
                        payment_mode=payment_item.get('paymentMode', 'cash'),
                        payment_date=payment_date_obj,
                        batch_id=batch_id,
                        payment_type='on-account',
                        payment_source='customer_payment',
                        remarks=remarks,
                        created_by=user_id
                    )
                else:
                    # Invoice payment
                    payment = Payment(
                        customer_id=customer_id,
                        sale_id=payment_item.get('invoiceId'),
                        amount=float(payment_item.get('amount', 0)),
                        payment_mode=payment_item.get('paymentMode', 'cash'),
                        payment_date=payment_date_obj,
                        batch_id=batch_id,
                        payment_type='direct',
                        payment_source='customer_payment',
                        remarks=remarks,
                        created_by=user_id
                    )
                    
                    # Update sale payment status
                    sale = Sale.query.get(payment_item.get('invoiceId'))
                    if sale:
                        current_paid = float(sale.paid_amount or 0)
                        new_paid = current_paid + float(payment_item.get('amount', 0))
                        
                        if new_paid >= float(sale.total_amount):
                            sale.payment_status = "paid"
                            sale.paid_amount = new_paid
                            sale.status = "finalized"
                            sale.customer_type = payment_item.get('paymentMode', 'cash')
                        else:
                            sale.payment_status = "partial"
                            sale.paid_amount = new_paid
                        
                        db.session.add(sale)
                
                db.session.add(payment)
                payments_created.append(payment)
        
        else:
            # Fallback to proportional distribution (original logic)
            print("No payment distribution provided, using proportional distribution")
            
            # Create payments for each payment mode with amount > 0
            payment_modes = {
                'cash': split_payment.get('cash', 0),
                'bank': split_payment.get('card', 0),  # Card payments stored as 'bank'
                'bank_transfer': split_payment.get('bankTransfer', 0),
                'cheque': split_payment.get('cheque', 0)
            }
            
            # Calculate total invoice amount for distribution
            total_invoice_amount = 0
            if invoice_ids:
                invoices = Sale.query.filter(Sale.id.in_(invoice_ids)).all()
                for invoice in invoices:
                    # Calculate outstanding balance
                    paid_amount = sum(float(p.amount) for p in invoice.payments)
                    outstanding = float(_sale_outstanding(invoice))
                    total_invoice_amount += max(0, outstanding)  # Only positive outstanding amounts
            
            # Distribute payments proportionally between invoices and on-account
            total_payment_amount = sum(payment_modes.values())
            
            for mode, mode_amount in payment_modes.items():
                if mode_amount <= 0:
                    continue
                    
                # Calculate how much of this payment mode goes to invoices vs on-account
                if total_payment_amount > 0:
                    invoice_portion = (total_invoice_amount / total_payment_amount) * mode_amount
                    on_account_portion = (on_account_amount / total_payment_amount) * mode_amount
                else:
                    invoice_portion = 0
                    on_account_portion = mode_amount
                
                # Create payment for invoices if there are any
                if invoice_portion > 0 and invoice_ids:
                    # Distribute among selected invoices proportionally
                    remaining_amount = invoice_portion
                    
                    for invoice_id in invoice_ids:
                        if remaining_amount <= 0:
                            break
                            
                        invoice = Sale.query.get(invoice_id)
                        if not invoice:
                            continue
                        
                        # Calculate outstanding balance for this invoice
                        paid_amount = sum(float(p.amount) for p in invoice.payments)
                        outstanding = float(_sale_outstanding(invoice))
                        
                        if outstanding <= 0:
                            continue
                        
                        # Calculate payment amount for this invoice
                        if total_invoice_amount > 0:
                            invoice_payment = min(remaining_amount, outstanding, 
                                                (outstanding / total_invoice_amount) * invoice_portion)
                        else:
                            invoice_payment = min(remaining_amount, outstanding)
                        
                        if invoice_payment > 0:
                            payment = Payment(
                                customer_id=customer_id,
                                sale_id=invoice_id,
                                amount=invoice_payment,
                                payment_mode=mode,
                                payment_date=payment_date_obj,
                                batch_id=batch_id,
                                payment_type='direct',
                                remarks=remarks,
                                created_by=user_id
                            )
                            db.session.add(payment)
                            payments_created.append(payment)
                            
                            # Update the invoice's customer_type based on the payment mode
                            invoice = Sale.query.get(invoice_id)
                            if invoice:
                                # Only update if the payment fully or partially pays the invoice
                                if invoice_payment > 0:
                                    # If this payment fully pays the invoice, update the customer_type
                                    if invoice_payment >= float(invoice.total_amount) - float(invoice.paid_amount or 0):
                                        invoice.customer_type = mode
                                    # If this is a partial payment and there's no existing payment, update the customer_type
                                    elif float(invoice.paid_amount or 0) == 0:
                                        invoice.customer_type = mode
                                    db.session.add(invoice)
                            
                            remaining_amount -= invoice_payment
                
                # Create on-account payment if there's an on-account portion
                if on_account_portion > 0:
                    payment = Payment(
                        customer_id=customer_id,
                        sale_id=None,  # No specific invoice
                        amount=on_account_portion,
                        payment_mode=mode,
                        payment_date=payment_date_obj,
                        batch_id=batch_id,
                        payment_type='on-account',
                        remarks=remarks,
                        created_by=user_id
                    )
                    db.session.add(payment)
                    payments_created.append(payment)
        
        for sale_id in {
            payment.sale_id for payment in payments_created
            if payment.sale_id and payment.payment_type != 'credit'
        }:
            sale = Sale.query.get(sale_id)
            if sale:
                _refresh_sale_payment_status(sale)

        # Commit all payments
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": f"Created {len(payments_created)} payments",
            "paymentId": batch_id,
            "paymentsCreated": len(payments_created)
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print("Error creating bulk payment:", str(e))
        import traceback
        print("Full traceback:", traceback.format_exc())
        return jsonify({"error": f"Failed to create payments: {str(e)}"}), 500

@app.route('/api/payments', methods=['GET'])
@jwt_required()
def get_payments():
    try:
        payments = Payment.query.all()
        return jsonify([payment.to_dict() for payment in payments]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/customers/<int:customer_id>/outstanding_invoices', methods=['GET'])
@jwt_required()
def get_customer_outstanding_invoices(customer_id):
    try:
        customer = Customer.query.get(customer_id)
        if not customer:
            return jsonify({"error": "Customer not found"}), 404

        # Fetch all sales for this customer
        all_sales = Sale.query.filter(
            Sale.customer_id == customer_id,
            or_(Sale.status == 'pending', Sale.status == 'paid', Sale.status == 'finalized')
        ).all()
        
        outstanding_sales = []
        for sale in all_sales:
            if float(sale.total_amount) < 0:
                # Credit invoice: the applied amount is tracked on paid_amount because
                # no Payment rows are created when a credit is applied
                outstanding_balance = _sale_outstanding(sale)
            else:
                outstanding_balance = _sale_outstanding(sale)
            
            # Include sales with outstanding balance (positive or negative for credit invoices)
            if abs(outstanding_balance) > 0.01:  # Allow for small rounding differences
                sale_data = sale.to_dict()
                sale_data['outstandingAmount'] = float(outstanding_balance)
                sale_data['discountTotal'] = float(_active_discount_total_for_sale(sale.id))
                outstanding_sales.append(sale_data)

        return jsonify(outstanding_sales), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route('/api/payments/batch/<int:batch_id>', methods=['GET'])
@jwt_required()
def get_payments_by_batch(batch_id):
    try:
        payments = Payment.query.filter(Payment.batch_id == batch_id).all()
        
        if not payments:
            return jsonify({"error": "Payment batch not found"}), 404
        
        # Get customer info from first payment
        customer = payments[0].customer if payments else None
        
        # Return individual payment records with payment type information
        payment_details = []
        invoice_list = []
        
        for payment in payments:
            # Get invoice information
            invoice_number = None
            if payment.sale:
                invoice_number = payment.sale.invoice_number
                invoice_list.append(invoice_number)
            else:
                invoice_number = 'On Account'
            
            payment_details.append({
                'id': payment.id,
                'batchId': batch_id,
                'paymentMode': payment.payment_mode,
                'paymentType': payment.payment_type,
                'amount': float(payment.amount),
                'paymentDate': payment.payment_date.isoformat(),
                'invoiceNumber': invoice_number,
                'invoiceId': payment.sale_id,
                'invoiceAmount': float(payment.amount),
                'customerName': customer.customer_name if customer else 'Unknown',
                'remarks': payment.remarks or '',
                'createdBy': payment.created_by,
                'createdByUsername': payment.creator.username if payment.creator else None,
            })
        
        return jsonify({
            'batchId': batch_id,
            'payments': payment_details,
            'totalAmount': sum(float(p.amount) for p in payments),
            'paymentCount': len(payment_details),  # Count of payment modes, not individual payments
            'customer': customer.to_dict() if customer else None,
            'invoiceNumbers': list(set(invoice_list))  # Unique invoice numbers
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/customers/<int:customer_id>/paid_invoices', methods=['GET'])
@jwt_required()
def get_customer_paid_invoices(customer_id):
    try:
        customer = Customer.query.get(customer_id)
        if not customer:
            return jsonify({"error": "Customer not found"}), 404

        # Fetch sales where the invoice is fully paid (total_amount <= paid_amount)
        # and has a payment status of 'paid' or status is 'finalized'
        paid_sales = Sale.query.filter(
            Sale.customer_id == customer_id,
            or_(
                and_(Sale.payment_status == 'paid', Sale.status == 'finalized'),
                and_(Sale.total_amount <= (Sale.paid_amount or 0), Sale.paid_amount > 0)
            )
        ).order_by(Sale.date.desc()).all()

        # Enrich the response with payment details
        result = []
        for sale in paid_sales:
            sale_dict = sale.to_dict()
            
            # Get payment details for this sale
            payments = Payment.query.filter(Payment.sale_id == sale.id).all()
            payment_modes = [p.payment_mode for p in payments]
            
            # Add payment mode information
            sale_dict['paymentModes'] = payment_modes
            sale_dict['hasPayments'] = len(payments) > 0
            
            result.append(sale_dict)

        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/payments/history', methods=['GET'])
@jwt_required()
def get_payment_history():
    try:
        # Get query parameters
        customer_id = request.args.get('customerId', type=int)
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        payment_mode = request.args.get('paymentMode')
        payment_type = request.args.get('paymentType')
        
        # Build query
        query = Payment.query
        
        # Always exclude payments made via daily book sales from customer payment history
        # These payments affect outstanding balances but don't show in customer payment history
        query = query.filter(
            or_(
                Payment.payment_source != 'daily_book_sales',
                Payment.payment_source.is_(None)  # Include legacy payments without payment_source
            )
        )
        
        # Filter by customer if provided
        if customer_id:
            query = query.filter(Payment.customer_id == customer_id)
        
        # Filter by date range if provided
        if from_date:
            query = query.filter(Payment.payment_date >= from_date)
        if to_date:
            query = query.filter(Payment.payment_date <= to_date)
        
        # Filter by payment mode if provided
        if payment_mode and payment_mode != 'All':
            query = query.filter(Payment.payment_mode.ilike(payment_mode))
        
        # Filter by payment type if provided (for on-account filtering)
        if payment_type == 'on-account':
            # Show only on-account payments (including legacy on-account payments where sale_id is NULL)
            query = query.filter(or_(
                Payment.payment_type == 'on-account',
                and_(Payment.payment_type.is_(None), Payment.sale_id.is_(None))
            ))
        elif payment_type == 'direct':
            # Show only direct payments (including legacy direct payments where sale_id is not NULL)
            query = query.filter(or_(
                Payment.payment_type == 'direct',
                and_(Payment.payment_type.is_(None), Payment.sale_id.isnot(None))
            ))
        
        # Order by payment date descending
        query = query.options(
            db.joinedload(Payment.customer),
            db.joinedload(Payment.sale)
        ).order_by(Payment.payment_date.desc())
        
        payments = query.all()
        
        # Create detailed payment history with invoice information
        payment_history = []
        for payment in payments:
            # Get customer name
            customer_name = payment.customer.customer_name if payment.customer else 'Unknown'
            
            # Get invoice information if linked
            invoice_number = None
            invoice_date = None
            invoice_amount = None
            if payment.sale:
                invoice_number = payment.sale.invoice_number
                invoice_date = payment.sale.date.isoformat() if payment.sale.date else None
                invoice_amount = float(payment.sale.total_amount) if payment.sale.total_amount else 0
            
            payment_history.append({
                'id': payment.id,
                'batchId': payment.batch_id,
                'paymentDate': payment.payment_date.isoformat(),
                'paymentMode': payment.payment_mode,
                'paymentType': payment.payment_type,
                'amount': float(payment.amount),
                'customerName': customer_name,
                'customerId': payment.customer_id,
                'invoiceNumber': invoice_number,
                'invoiceDate': invoice_date,
                'invoiceAmount': invoice_amount,
                'remarks': payment.remarks,
                'createdAt': payment.created_at.isoformat() if payment.created_at else None,
                'saleId': payment.sale_id,  # <-- Added saleId for frontend invoice matching
            })
        
        return jsonify(payment_history), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/reports/daily-book-sales', methods=['GET'])
@jwt_required()
def daily_book_sales():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    payment_type = request.args.get('paymentType', 'All')
    salesman = request.args.get('salesman', 'all')
    search = request.args.get('search', '')
    query = Sale.query.join(Customer).join(User, Sale.created_by == User.id).options(
        db.contains_eager(Sale.customer),
        db.subqueryload(Sale.items),
        db.subqueryload(Sale.payments),
    )
    if from_date and to_date:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Sale.date >= from_dt, Sale.date < to_dt)
    elif from_date:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        query = query.filter(Sale.date >= from_dt)
    elif to_date:
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Sale.date < to_dt)
    if salesman and salesman != 'all':
        query = query.filter(User.username == salesman)
    if search:
        query = query.filter(
            (Sale.invoice_number.ilike(f'%{search}%')) |
            (Customer.customer_name.ilike(f'%{search}%'))
        )
    # Only show finalized sales
    query = query.filter(Sale.status == 'finalized')
    
    sales = query.order_by(Sale.invoice_number.desc()).all()
    result = []
    slNo = 0
    negative_sale_ids = set()
    for sale in sales:
        boxes = sum(item.quantity for item in sale.items)
        # Check if invoice was paid via customer payment page (has batch_id payments)
        customer_payment_payments = [p for p in sale.payments if p.batch_id]
        daily_book_payments = [p for p in sale.payments if not p.batch_id]
        
        # For invoices paid via customer payment, always show in accounts regardless of date
        is_paid_via_customer_payment = len(customer_payment_payments) > 0
        
        total_amount = float(sale.total_amount)
        
        if is_paid_via_customer_payment:
            # Invoices paid via customer payment always go to accounts
            if total_amount >= 0:
                account_amount = total_amount
                credit_amount = 0
            else:
                account_amount = 0
                credit_amount = abs(total_amount)
            cash_amount = 0
            bank_amount = 0
            bank_transfer_amount = 0
            cheque_amount = 0
        else:
            # Use customer_type to determine category (for non-customer-payment invoices or past dates)
            if sale.customer_type and sale.customer_type.lower() == 'account':
                if total_amount >= 0:
                    account_amount = total_amount
                    credit_amount = 0
                else:
                    account_amount = 0
                    credit_amount = abs(total_amount)
                cash_amount = 0
                bank_amount = 0
                bank_transfer_amount = 0
                cheque_amount = 0
            else:
                account_amount = 0
                credit_amount = 0
                
                # Calculate payment amounts from actual payment records (for split payments)
                cash_amount = sum(float(p.amount) for p in daily_book_payments if p.payment_mode == 'cash')
                bank_amount = sum(float(p.amount) for p in daily_book_payments if p.payment_mode == 'bank')
                bank_transfer_amount = sum(float(p.amount) for p in daily_book_payments if p.payment_mode == 'bank_transfer')
                cheque_amount = sum(float(p.amount) for p in daily_book_payments if p.payment_mode == 'cheque')

        is_negative_invoice = total_amount < 0 or any(
            item.quantity < 0 or item.total_price < 0 for item in sale.items
        )
        if is_negative_invoice:
            negative_sale_ids.add(sale.id)
            account_amount = 0
            cash_amount = 0
            bank_amount = 0
            bank_transfer_amount = 0
            cheque_amount = 0
            credit_amount = abs(total_amount)
        
        # Show all customers - removed gate number restriction
        customer_display_name = ''
        if sale.customer and sale.customer.customer_name:
            customer_display_name = sale.customer.customer_name
        
        # Check if invoice has any payments and determine payment source
        has_payments = len(sale.payments) > 0
        payment_source = None
        is_paid_via_customer_payment = False
        
        if has_payments:
            # Check if any payment has a batch_id (indicates customer payment page)
            for payment in sale.payments:
                if payment.batch_id:
                    is_paid_via_customer_payment = True
                    payment_source = 'customer_payment'
                    break
            if not payment_source:
                payment_source = 'daily_book'
        
        # Determine payment status for visual indicators (include ALL payments)
        total_paid = sum(float(p.amount) for p in sale.payments)  # All payments for status calculation
        is_fully_paid = total_paid >= float(sale.total_amount) * 0.99  # Allow for small rounding differences
        
        # Post-computation payment type filter using actual computed amounts
        if payment_type and payment_type != 'All':
            if payment_type == 'Cash' and cash_amount <= 0:
                continue
            elif payment_type == 'Card' and bank_amount <= 0:
                continue
            elif payment_type == 'Bank Transfer' and bank_transfer_amount <= 0:
                continue
            elif payment_type == 'Cheque' and cheque_amount <= 0:
                continue
            elif payment_type == 'Account' and account_amount <= 0:
                continue
            elif payment_type == 'Credit' and credit_amount <= 0:
                continue
        
        slNo += 1
        result.append({
            'id': sale.id,
            'slNo': slNo,
            'date': sale.date.strftime('%Y-%m-%d'),
            'salesman': sale.user.username if sale.user else '',
            'boxes': boxes,
            'invoiceNo': sale.invoice_number,
            'customerName': customer_display_name,
            'customerOthers': sale.customer.others if sale.customer and sale.customer.others else None,
            'gateNumber': sale.gate_number,
            'customerId': sale.customer_id,
            'vat': float(sale.vat_amount),
            'amount': account_amount,
            'cash': cash_amount,
            'bank': bank_amount,
            'bankTransfer': bank_transfer_amount,
            'cheque': cheque_amount,
            'credit': credit_amount,
            'hasPayments': has_payments,
            'paymentSource': payment_source,
            'isPaidViaCustomerPayment': is_paid_via_customer_payment,
            'isFullyPaid': is_fully_paid,
            'totalPaid': total_paid,
            'isCompany': bool(sale.customer.is_company) if sale.customer else False,
        })

    returns_query = CustomerReturn.query.join(
        Customer, CustomerReturn.customer_id == Customer.id
    ).outerjoin(
        User, CustomerReturn.created_by == User.id
    ).filter(
        CustomerReturn.status == 'completed'
    )
    if from_date and to_date:
        returns_query = returns_query.filter(
            CustomerReturn.date >= datetime.strptime(from_date, "%Y-%m-%d").date(),
            CustomerReturn.date <= datetime.strptime(to_date, "%Y-%m-%d").date()
        )
    elif from_date:
        returns_query = returns_query.filter(
            CustomerReturn.date >= datetime.strptime(from_date, "%Y-%m-%d").date()
        )
    elif to_date:
        returns_query = returns_query.filter(
            CustomerReturn.date <= datetime.strptime(to_date, "%Y-%m-%d").date()
        )
    if salesman and salesman != 'all':
        returns_query = returns_query.filter(User.username == salesman)
    if search:
        returns_query = returns_query.filter(
            CustomerReturn.invoice_number.ilike(f'%{search}%') |
            CustomerReturn.document_invoice_number.ilike(f'%{search}%') |
            Customer.customer_name.ilike(f'%{search}%')
        )

    for customer_return in returns_query.order_by(CustomerReturn.id.desc()).all():
        # Negative-quantity sales already appear above as credit rows. Their
        # linked return entity records stock movement and must not be duplicated.
        if customer_return.sale_id in negative_sale_ids:
            continue

        credit_amount = abs(float(customer_return.total_value or 0))
        if payment_type == 'Credit' and credit_amount <= 0:
            continue
        if payment_type and payment_type not in ('All', 'Credit'):
            continue

        slNo += 1
        result.append({
            'id': -customer_return.id,
            'slNo': slNo,
            'date': customer_return.date.isoformat(),
            'salesman': customer_return.user.username if customer_return.user else '',
            'boxes': -abs(float(customer_return.quantity or 0)),
            'invoiceNo': customer_return.document_invoice_number or customer_return.invoice_number or f'CR-{customer_return.ref_number}',
            'originalInvoiceNo': customer_return.invoice_number,
            'customerName': customer_return.customer.customer_name if customer_return.customer else '',
            'customerOthers': customer_return.customer.others if customer_return.customer else None,
            'gateNumber': None,
            'customerId': customer_return.customer_id,
            'vat': 0,
            'amount': 0,
            'cash': 0,
            'bank': 0,
            'bankTransfer': 0,
            'cheque': 0,
            'credit': credit_amount,
            'hasPayments': False,
            'paymentSource': None,
            'isPaidViaCustomerPayment': False,
            'isFullyPaid': True,
            'totalPaid': 0,
            'isCompany': bool(customer_return.customer.is_company) if customer_return.customer else False,
            'isCustomerReturn': True,
        })

    discounts_query = CustomerDiscount.query.join(
        Customer, CustomerDiscount.customer_id == Customer.id
    ).join(
        Sale, CustomerDiscount.sale_id == Sale.id
    ).outerjoin(
        User, CustomerDiscount.created_by == User.id
    ).filter(
        CustomerDiscount.is_deleted.is_(False)
    )
    if from_date:
        discounts_query = discounts_query.filter(
            CustomerDiscount.date >= datetime.strptime(from_date, "%Y-%m-%d").date()
        )
    if to_date:
        discounts_query = discounts_query.filter(
            CustomerDiscount.date <= datetime.strptime(to_date, "%Y-%m-%d").date()
        )
    if salesman and salesman != 'all':
        discounts_query = discounts_query.filter(User.username == salesman)
    if search:
        discounts_query = discounts_query.filter(
            Sale.invoice_number.ilike(f'%{search}%') |
            CustomerDiscount.document_invoice_number.ilike(f'%{search}%') |
            Customer.customer_name.ilike(f'%{search}%')
        )

    for discount in discounts_query.order_by(CustomerDiscount.id.desc()).all():
        if payment_type and payment_type not in ('All', 'Credit'):
            continue
        slNo += 1
        result.append({
            'id': -1000000000 - discount.id,
            'slNo': slNo,
            'date': discount.date.isoformat(),
            'salesman': discount.creator.username if discount.creator else '',
            'boxes': 0,
            'invoiceNo': discount.document_invoice_number or '',
            'originalInvoiceNo': discount.sale.invoice_number if discount.sale else '',
            'discountReference': discount.reference,
            'customerName': discount.customer.customer_name if discount.customer else '',
            'customerOthers': discount.customer.others if discount.customer else None,
            'gateNumber': None,
            'customerId': discount.customer_id,
            'vat': 0,
            'amount': 0,
            'cash': 0,
            'bank': 0,
            'bankTransfer': 0,
            'cheque': 0,
            'credit': float(discount.amount or 0),
            'hasPayments': False,
            'paymentSource': None,
            'isPaidViaCustomerPayment': False,
            'isFullyPaid': True,
            'totalPaid': 0,
            'isCompany': bool(discount.customer.is_company) if discount.customer else False,
            'isCustomerDiscount': True,
        })

    voids_query = VoidedInvoiceDocument.query
    if from_date:
        voids_query = voids_query.filter(
            or_(
                VoidedInvoiceDocument.date_unknown.is_(True),
                VoidedInvoiceDocument.date >= datetime.strptime(from_date, "%Y-%m-%d").date(),
            )
        )
    if to_date:
        voids_query = voids_query.filter(
            or_(
                VoidedInvoiceDocument.date_unknown.is_(True),
                VoidedInvoiceDocument.date <= datetime.strptime(to_date, "%Y-%m-%d").date(),
            )
        )
    if salesman and salesman != 'all':
        voids_query = voids_query.filter(
            or_(
                VoidedInvoiceDocument.date_unknown.is_(True),
                VoidedInvoiceDocument.salesman == salesman,
            )
        )
    if search:
        voids_query = voids_query.filter(
            VoidedInvoiceDocument.invoice_number.ilike(f'%{search}%') |
            VoidedInvoiceDocument.customer_name.ilike(f'%{search}%')
        )
    for voided in voids_query.order_by(VoidedInvoiceDocument.date.desc(), VoidedInvoiceDocument.invoice_number.desc()).all():
        slNo += 1
        result.append({
            'id': -2000000000 - voided.id,
            'slNo': slNo,
            'date': voided.date.isoformat() if not voided.date_unknown else None,
            'salesman': voided.salesman,
            'boxes': 0,
            'invoiceNo': voided.invoice_number,
            'originalInvoiceNo': voided.original_invoice_number or '',
            'customerName': voided.customer_name,
            'customerOthers': None,
            'gateNumber': None,
            'customerId': 0,
            'vat': 0,
            'amount': 0,
            'cash': 0,
            'bank': 0,
            'bankTransfer': 0,
            'cheque': 0,
            'credit': 0,
            'hasPayments': False,
            'paymentSource': None,
            'isPaidViaCustomerPayment': False,
            'isFullyPaid': False,
            'totalPaid': 0,
            'isCompany': False,
            'isVoid': True,
            'isUnknownDate': bool(voided.date_unknown),
            'voidedDocumentType': voided.document_type,
        })
    return jsonify(result)

@app.route('/api/reports/daily-sales-full-view', methods=['GET'])
@jwt_required()
def daily_sales_full_view():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    search = request.args.get('search', '')
    sort_order = request.args.get('sortOrder', 'asc')
    
    query = Sale.query.join(Customer).join(User, Sale.created_by == User.id)
    
    # Filter by date range
    if from_date and to_date:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Sale.date >= from_dt, Sale.date < to_dt)
    elif from_date:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        query = query.filter(Sale.date >= from_dt)
    elif to_date:
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Sale.date < to_dt)
    
    # Filter by search
    if search:
        query = query.filter(
            (Sale.invoice_number.ilike(f'%{search}%')) |
            (Customer.customer_name.ilike(f'%{search}%'))
        )
    
    # Only show finalized sales
    query = query.filter(Sale.status == 'finalized')
    from sqlalchemy import func, cast, Integer, Date
    if sort_order == 'desc':
        sales = query.order_by(cast(Sale.date, Date).desc(), cast(Sale.invoice_number, Integer).desc()).all()
    else:
        sales = query.order_by(cast(Sale.date, Date).asc(), cast(Sale.invoice_number, Integer).asc()).all()
    
    result = []
    for sale in sales:
        # Add invoice header row
        result.append({
            'date': sale.date.strftime('%Y-%m-%d'),
            'invoiceNo': sale.invoice_number,
            'customerName': sale.customer.customer_name if sale.customer else '',
            'productName': '',
            'quantity': 0,
            'unitPrice': 0,
            'total': 0,
            'isInvoiceHeader': True,
            'notes': sale.notes or ''
        })
        
        # Add product rows for this invoice
        invoice_total = 0
        for item in sale.items:
            # Get product name
            product_name = ''
            if item.product_id:
                product = RegularProduct.query.get(item.product_id)
                if product:
                    product_name = product.description
            elif item.non_product_id:
                product = NonProduct.query.get(item.non_product_id)
                if product:
                    product_name = product.description
            invoice_total += float(item.total_price) if item.total_price else 0

            # Check if this row matches search (if search is provided)
            matches_search = True
            if search:
                matches_search = (
                    search.lower() in sale.invoice_number.lower() or
                    search.lower() in (sale.customer.customer_name if sale.customer else '').lower() or
                    search.lower() in product_name.lower()
                )
            
            if matches_search:
                result.append({
                    'date': sale.date.strftime('%Y-%m-%d'),
                    'invoiceNo': sale.invoice_number,
                    'customerName': sale.customer.customer_name if sale.customer else '',
                    'productName': product_name,
                    'productId': item.product_id if item.product_id else item.non_product_id,
                    'quantity': item.quantity,
                    'unitPrice': float(item.unit_price) if item.unit_price else 0,
                    'total': float(item.total_price) if item.total_price else 0,
                    'isInvoiceHeader': False,
                    'isInvoiceTotal' : False,
                    'notes': item.notes or ''
                })
        result.append({
        'date': '',
        'invoiceNo': '',
        'customerName': '',
        'productName': 'Total',
        'quantity': '',
        'unitPrice': '',
        'total': invoice_total,
        'isInvoiceHeader': False,
        'isInvoiceTotal': True,
        'notes': ''
    })

    voids_query = VoidedInvoiceDocument.query
    if from_date:
        voids_query = voids_query.filter(
            or_(
                VoidedInvoiceDocument.date_unknown.is_(True),
                VoidedInvoiceDocument.date >= datetime.strptime(from_date, "%Y-%m-%d").date(),
            )
        )
    if to_date:
        voids_query = voids_query.filter(
            or_(
                VoidedInvoiceDocument.date_unknown.is_(True),
                VoidedInvoiceDocument.date <= datetime.strptime(to_date, "%Y-%m-%d").date(),
            )
        )
    if search:
        voids_query = voids_query.filter(
            VoidedInvoiceDocument.invoice_number.ilike(f'%{search}%') |
            VoidedInvoiceDocument.customer_name.ilike(f'%{search}%')
        )
    for voided in voids_query.order_by(
        VoidedInvoiceDocument.date.asc(),
        VoidedInvoiceDocument.invoice_number.asc(),
    ).all():
        result.append({
            'date': voided.date.isoformat() if not voided.date_unknown else None,
            'invoiceNo': voided.invoice_number,
            'customerName': voided.customer_name,
            'productName': '',
            'quantity': 0,
            'unitPrice': 0,
            'total': 0,
            'isInvoiceHeader': True,
            'isInvoiceTotal': False,
            'isVoid': True,
            'isUnknownDate': bool(voided.date_unknown),
            'notes': (
                "VOIDED DOCUMENT - DATE UNKNOWN" if voided.date_unknown
                else f"VOIDED {voided.document_type.upper()} DOCUMENT"
            ),
        })

    invoice_groups = []
    for row in result:
        if row.get('isInvoiceHeader'):
            invoice_groups.append([row])
        elif invoice_groups:
            invoice_groups[-1].append(row)

    def invoice_group_sort_key(group):
        header = group[0]
        invoice_number = str(header.get('invoiceNo') or '')
        try:
            invoice_key = (1, int(invoice_number))
        except ValueError:
            invoice_key = (0, invoice_number.casefold())
        return (header.get('date') or '', invoice_key)

    invoice_groups.sort(
        key=invoice_group_sort_key,
        reverse=sort_order == 'desc',
    )
    result = [row for group in invoice_groups for row in group]
    
    return jsonify(result)

@app.route('/api/reports/product-sales-history', methods=['GET'])
@jwt_required()
def product_sales_history():
    product_id = request.args.get('productId', type=int)
    customer_id = request.args.get('customerId', type=int)
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    if not product_id or not from_date or not to_date:
        return jsonify({'error': 'Missing required parameters'}), 400
    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
    # Find all sale items for this product (and customer if provided) in the date range
    query = SaleItem.query.join(Sale).options(
        db.contains_eager(SaleItem.sale).joinedload(Sale.customer)
    ).filter(
        Sale.status == 'finalized',
        Sale.date >= from_dt,
        Sale.date < to_dt,
        ((SaleItem.product_id == product_id) | (SaleItem.non_product_id == product_id))
    )
    if customer_id:
        query = query.filter(Sale.customer_id == customer_id)
    items = query.all()
    # Bulk-load product names to avoid N+1
    product_ids = {item.product_id for item in items if item.product_id}
    non_product_ids = {item.non_product_id for item in items if item.non_product_id}
    products = {p.id: p for p in RegularProduct.query.filter(RegularProduct.id.in_(product_ids)).all()} if product_ids else {}
    non_products = {p.id: p for p in NonProduct.query.filter(NonProduct.id.in_(non_product_ids)).all()} if non_product_ids else {}
    
    result = []
    for item in items:
        sale = item.sale
        customer = sale.customer
        # Get product name from pre-loaded dicts
        if item.product_id:
            product = products.get(item.product_id)
            product_name = product.description if product else ''
        elif item.non_product_id:
            product = non_products.get(item.non_product_id)
            product_name = product.description if product else ''
        else:
            product_name = ''
        result.append({
            'invoiceNo': sale.invoice_number,
            'date': sale.date.strftime('%Y-%m-%d') if sale.date else '',
            'customerName': customer.customer_name if customer else '',
            'customerType': sale.customer_type,
            'gateNumber': sale.gate_number,
            'productDescription': product_name,
            'quantity': item.quantity,
            'unitPrice': float(item.unit_price),
            'originalUnitPrice': float(item.unit_price),
            'total': float(item.total_price),
            'discountTotal': 0,
            'effectiveTotal': float(item.total_price),
            'effectiveUnitPrice': float(item.unit_price),
            'isCompany': customer.is_company if customer else False
        })

    discounts_query = CustomerDiscount.query.join(
        SaleItem, CustomerDiscount.sale_item_id == SaleItem.id
    ).join(
        Sale, CustomerDiscount.sale_id == Sale.id
    ).filter(
        CustomerDiscount.is_deleted.is_(False),
        Sale.status == 'finalized',
        CustomerDiscount.date >= from_dt.date(),
        CustomerDiscount.date < to_dt.date(),
        (SaleItem.product_id == product_id) | (SaleItem.non_product_id == product_id),
    )
    if customer_id:
        discounts_query = discounts_query.filter(Sale.customer_id == customer_id)
    for discount in discounts_query.order_by(CustomerDiscount.date.asc(), CustomerDiscount.id.asc()).all():
        line = discount.sale_item
        product_name = (
            line.product.description if line and line.product
            else line.non_product.description if line and line.non_product
            else ''
        )
        result.append({
            'invoiceNo': discount.sale.invoice_number if discount.sale else '',
            'date': discount.date.isoformat(),
            'customerName': discount.customer.customer_name if discount.customer else '',
            'customerType': discount.sale.customer_type if discount.sale else '',
            'gateNumber': discount.sale.gate_number if discount.sale else None,
            'productDescription': product_name,
            'quantity': 0,
            'unitPrice': 0,
            'originalUnitPrice': 0,
            'total': -float(discount.amount or 0),
            'discountTotal': float(discount.amount or 0),
            'effectiveTotal': -float(discount.amount or 0),
            'effectiveUnitPrice': 0,
            'discountReference': discount.reference,
            'isCustomerDiscount': True,
            'isCompany': bool(discount.customer.is_company) if discount.customer else False,
        })
    return jsonify(result)

@app.route('/api/reports/product-purchase-full-view', methods=['GET'])
@jwt_required()
def product_purchase_full_view():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    search = request.args.get('search', '')

    query = Purchase.query.join(Supplier)
    if from_date and to_date:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Purchase.date >= from_dt, Purchase.date < to_dt)
    elif from_date:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        query = query.filter(Purchase.date >= from_dt)
    elif to_date:
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Purchase.date < to_dt)
    if search:
        query = query.filter(
            (Supplier.supplier_name.ilike(f'%{search}%')) |
            (Purchase.id.ilike(f'%{search}%'))
        )
    purchases = query.order_by(Purchase.date.desc()).all()
    result = []
    for purchase in purchases:
        # Get all invoices for this purchase
        invoices = PurchaseInvoice.query.filter_by(purchase_id=purchase.id).all()
        for invoice in invoices:
            # Header row for each supplier/invoice
            result.append({
                'date': invoice.date.strftime('%Y-%m-%d') if invoice.date else '',
                'supplier': purchase.supplier.supplier_name if purchase.supplier else '',
                'invNo': invoice.id,
                'awb': '',  # Add AWB if you have it
                'product': '',
                'quantity': 0,
                'unitPrice': 0,
                'sellingPrice': 0,
                'total': 0,
                'isHeader': True,
                'isTotal': False,
                'isCompany': bool(purchase.supplier.is_company) if purchase.supplier and purchase.supplier.is_company is not None else False,
                'notes': invoice.remarks or ''
            })
            total_qty = 0
            total_amt = 0
            for item in invoice.items:
                qty = item.quantity or 0
                price = float(item.unit_price) if item.unit_price else 0
                total = float(item.total_price) if item.total_price else 0
                total_qty += qty
                total_amt += total
                # Get product name and ID
                product_name = ''
                product_id = None
                if hasattr(item, 'product_id') and item.product_id:
                    product = RegularProduct.query.get(item.product_id)
                    if product:
                        product_name = product.description
                        product_id = item.product_id
                elif hasattr(item, 'non_product_id') and item.non_product_id:
                    product = NonProduct.query.get(item.non_product_id)
                    if product:
                        product_name = product.description
                        product_id = item.non_product_id
                elif hasattr(item, 'product_name'):
                    product_name = item.product_name
                
                result.append({
                    'date': '',
                    'supplier': '',
                    'invNo': invoice.id,
                    'awb': '',  # Add AWB if you have it
                    'product': product_name,
                    'productId': product_id,
                    'quantity': qty,
                    'unitPrice': price,
                    'sellingPrice': 0,  # Add if you have it
                    'total': total,
                    'isHeader': False,
                    'isTotal': False,
                    'isCompany': bool(purchase.supplier.is_company) if purchase.supplier and purchase.supplier.is_company is not None else False,
                    'notes': item.remarks or ''
                })
            # Total row for this invoice
            result.append({
                'date': '',
                'supplier': '',
                'invNo': '',
                'awb': '',
                'product': f'{total_qty} Items',
                'quantity': total_qty,
                'unitPrice': '',
                'sellingPrice': '',
                'total': total_amt,
                'isHeader': False,
                'isTotal': True,
                'isCompany': bool(purchase.supplier.is_company) if purchase.supplier and purchase.supplier.is_company is not None else False,
                'notes': ''
            })
    return jsonify(result)

@app.route('/api/reports/customer-statement', methods=['GET'])
@jwt_required()
def customer_statement():
    customer_id = request.args.get('customerId', type=int)
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    statement_type = request.args.get('type', 'Full Statement')

    # Validate
    if not customer_id or not from_date or not to_date:
        return jsonify({'error': 'Missing required parameters'}), 400

    from datetime import datetime, timedelta
    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)

    # Fetch sales and payments for this customer in the date range
    sales = Sale.query.filter(
        Sale.customer_id == customer_id,
        Sale.date >= from_dt,
        Sale.date < to_dt,
        Sale.status == 'finalized'
    ).order_by(Sale.date.asc(), Sale.id.asc()).all()

    customer_returns = CustomerReturn.query.filter(
        CustomerReturn.customer_id == customer_id,
        CustomerReturn.date >= from_dt.date(),
        CustomerReturn.date < to_dt.date(),
        CustomerReturn.status == 'completed',
    ).order_by(CustomerReturn.date.asc(), CustomerReturn.id.asc()).all()
    negative_sale_ids = {
        sale_id for (sale_id,) in db.session.query(SaleItem.sale_id)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(
            Sale.customer_id == customer_id,
            SaleItem.quantity < 0,
        )
        .distinct()
        .all()
    }
    
    # Get all payments (both invoice-specific and on-account)
    payments = Payment.query.filter(
        Payment.customer_id == customer_id,
        Payment.payment_date >= from_dt.date(),
        Payment.payment_date < to_dt.date()
    ).order_by(Payment.payment_date.asc(), Payment.id.asc()).all()

    # Build statement entries
    statement = []
    running_balance = 0
    sl_no = 1

    # Combine and sort by date (sales and payments)
    entries = []
    
    # Add sales entries
    for sale in sales:
        # Determine if this is a credit invoice (negative total amount)
        sale_amount = float(sale.total_amount)
        is_credit = sale_amount < 0
        
        entries.append({
            'date': sale.date,
            'type': 'sale',
            'invoiceNo': sale.invoice_number,
            'description': 'Credit Note' if is_credit else 'Sale Invoice',
            'accountInv': sale_amount if sale.customer_type == 'account' and not is_credit else 0,
            'cashInv': sale_amount if sale.customer_type != 'account' and not is_credit else 0,
            'paid': 0,
            'accountAdj': abs(sale_amount) if is_credit else 0,  # Credit invoices go to accountAdj as positive
            'discountAdj': 0,
            'balance': sale_amount,  # Positive for invoices, negative for credits
            'sale_id': sale.id,
            'sort_priority': 1,  # Sales get priority 1
            'timestamp': sale.date.timestamp() if hasattr(sale.date, 'timestamp') else sale.date.replace(tzinfo=None).timestamp()
        })

    statement_return_refs = set()
    for customer_return in customer_returns:
        # Negative-quantity sales already appear as credit rows; their linked
        # return records are only for inventory tracking.
        if customer_return.sale_id in negative_sale_ids:
            continue

        statement_return_refs.add(customer_return.ref_number)
        return_amount = abs(float(customer_return.total_value or 0))
        return_datetime = datetime.combine(customer_return.date, datetime.min.time())
        original_invoice = customer_return.invoice_number
        entries.append({
            'date': return_datetime,
            'type': 'customer_return',
            'invoiceNo': (
                customer_return.document_invoice_number
                or original_invoice
                or customer_return.ref_number
            ),
            'description': (
                f'Customer Return - Invoice {original_invoice}'
                if original_invoice
                else f'Customer Return - {customer_return.ref_number}'
            ),
            'accountInv': 0,
            'cashInv': 0,
            'paid': 0,
            'accountAdj': return_amount,
            'discountAdj': 0,
            'balance': -return_amount,
            'sale_id': customer_return.sale_id,
            'sort_priority': 2,
            'timestamp': return_datetime.timestamp(),
        })

    discounts = CustomerDiscount.query.filter(
        CustomerDiscount.customer_id == customer_id,
        CustomerDiscount.date >= from_dt.date(),
        CustomerDiscount.date < to_dt.date(),
        CustomerDiscount.is_deleted.is_(False),
    ).order_by(CustomerDiscount.date.asc(), CustomerDiscount.id.asc()).all()
    for discount in discounts:
        discount_datetime = datetime.combine(discount.date, datetime.min.time())
        entries.append({
            'date': discount_datetime,
            'type': 'customer_discount',
            'invoiceNo': discount.sale.invoice_number if discount.sale else '',
            'description': (
                f'Customer Discount - Invoice {discount.sale.invoice_number}'
                if discount.sale else f'Customer Discount - {discount.reference}'
            ),
            'accountInv': 0,
            'cashInv': 0,
            'paid': 0,
            'accountAdj': 0,
            'discountAdj': float(discount.amount or 0),
            'balance': -float(discount.amount or 0),
            'sale_id': discount.sale_id,
            'sort_priority': 2,
            'timestamp': discount_datetime.timestamp(),
        })
    
    # Customer Payment may split one method across several invoices. Show one
    # statement row per method for the batch, rather than one row per invoice.
    batch_payment_groups = {}
    payment_method_labels = {
        'cash': 'Cash',
        'bank': 'Card',
        'card': 'Card',
        'bank_transfer': 'Bank Transfer',
        'cheque': 'Cheque',
    }

    # Add payment entries
    for payment in payments:
        if payment.payment_mode == 'credit_note' and any(
            ref_number in (payment.remarks or '')
            for ref_number in statement_return_refs
        ):
            # The associated completed return is represented above as a credit
            # adjustment, so its bookkeeping payment must not be counted again.
            continue
        if payment.payment_type == 'credit':
            # 0-amount credit-application row: the credit is already shown above
            # as a Credit Note sale entry, so skip the redundant 0-amount line.
            continue
        payment_datetime = datetime.combine(payment.payment_date, datetime.min.time())
        is_customer_payment_batch = (
            payment.payment_source == 'customer_payment'
            and payment.batch_id is not None
        )
        payment_mode = (payment.payment_mode or '').lower()
        payment_method = payment_method_labels.get(
            payment_mode,
            (payment.payment_mode or 'Payment').replace('_', ' ').title(),
        )

        if is_customer_payment_batch:
            group_key = (payment.batch_id, payment.payment_date, payment_mode)
            group = batch_payment_groups.setdefault(group_key, {
                'amount': 0.0,
                'payment_method': payment_method,
            })
            group['amount'] += float(payment.amount)
            continue
        
        if payment.sale_id:
            # Payment linked to specific invoice
            invoice_no = payment.sale.invoice_number if payment.sale else f'INV-{payment.sale_id}'
            description = f'Payment Received - {invoice_no}'
            sort_priority = 2  # Invoice payments get priority 2
        else:
            # On-account payment (creates credit balance)
            invoice_no = ''
            description = 'Payment Received - On Account'
            sort_priority = 3  # On-account payments get priority 3
        
        entries.append({
            'date': payment_datetime,
            'type': 'payment',
            'invoiceNo': invoice_no,
            'description': description,
            'accountInv': 0,
            'cashInv': 0,
            'paid': float(payment.amount),
            'accountAdj': 0,
            'discountAdj': 0,
            'balance': -float(payment.amount),  # Payments reduce balance (negative)
            'sale_id': payment.sale_id,
            'payment_id': payment.id,
            'batch_id': None,
            'sort_priority': sort_priority,
            'timestamp': payment_datetime.timestamp()
        })

    for (batch_id, payment_date, _payment_mode), group in batch_payment_groups.items():
        payment_datetime = datetime.combine(payment_date, datetime.min.time())
        amount = group['amount']
        entries.append({
            'date': payment_datetime,
            'type': 'payment',
            'invoiceNo': str(batch_id),
            'description': f"Payment Received - {group['payment_method']}",
            'accountInv': 0,
            'cashInv': 0,
            'paid': amount,
            'accountAdj': 0,
            'discountAdj': 0,
            'balance': -amount,
            'sale_id': None,
            'payment_id': None,
            'batch_id': batch_id,
            'sort_priority': 2,
            'timestamp': payment_datetime.timestamp(),
        })
    
    # Sort by date, then by priority (sales first, then invoice payments, then on-account)
    # For same timestamp, ensure invoices come before their payments
    entries.sort(key=lambda x: (x['timestamp'], x['sort_priority'], x.get('invoiceNo', '')))

    # Calculate running balance
    for entry in entries:
        running_balance += entry['balance']
        statement.append({
            'id': sl_no,
            'slNo': sl_no,
            'date': entry['date'].strftime("%Y-%m-%d"),
            'invoiceNo': entry['invoiceNo'],
            'description': entry['description'],
            'accountInv': entry['accountInv'],
            'cashInv': entry['cashInv'],
            'paid': entry['paid'],
            'accountAdj': entry['accountAdj'],
            'discountAdj': entry['discountAdj'],
            'balance': entry['balance'],
            'runningBalance': running_balance,
            'batchId': entry.get('batch_id')
        })
        sl_no += 1

    # Filter by statement type if needed
    if statement_type == "Outstanding Only":
        # Show entries where running balance is positive (customer owes money)
        statement = [s for s in statement if s['runningBalance'] > 0]
    elif statement_type == "Paid Only":
        # Show only payment entries
        statement = [s for s in statement if s['paid'] > 0]

    return jsonify(statement)

@app.route('/api/reports/customer-history', methods=['GET'])
@jwt_required()
def customer_history():
    customer_id = request.args.get('customerId', type=int)
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    filter_type = request.args.get('filterType', 'All')

    if not customer_id or not from_date or not to_date:
        return jsonify({'error': 'Missing required parameters'}), 400

    from datetime import datetime, timedelta
    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)

    # Get all transactions for this customer in the date range
    history = []
    running_balance = 0
    sl_no = 1
    
    # 1. Get ALL sales (both paid and unpaid)
    all_sales = Sale.query.filter(
        Sale.customer_id == customer_id,
        Sale.date >= from_dt,
        Sale.date < to_dt,
        Sale.status == 'finalized'
    ).order_by(Sale.date.asc()).all()
    
    # 2. Get all on-account payments (from any source)
    on_account_payments = Payment.query.filter(
        Payment.customer_id == customer_id,
        Payment.payment_date >= from_dt.date(),
        Payment.payment_date < to_dt.date(),
        Payment.sale_id.is_(None)  # On-account payments have no sale_id
    ).order_by(Payment.payment_date.asc()).all()
    
    # Combine and sort all transactions by date
    all_transactions = []
    
    # Add ALL sales transactions (both paid and unpaid)
    for sale in all_sales:
        # Get all payments for this sale
        sale_payments = Payment.query.filter(
            Payment.sale_id == sale.id
        ).all()
        
        # Calculate payments by mode
        cash_payments = sum(float(p.amount) for p in sale_payments if p.payment_mode == 'cash')
        card_payments = sum(float(p.amount) for p in sale_payments if p.payment_mode == 'bank')
        bank_transfer_payments = sum(float(p.amount) for p in sale_payments if p.payment_mode == 'bank_transfer')
        cheque_payments = sum(float(p.amount) for p in sale_payments if p.payment_mode == 'cheque')
        
        # Calculate total paid from all sources
        total_paid = sum(float(p.amount) for p in sale_payments if p.amount > 0)
        
        # Determine how to display the invoice based on customer type
        if sale.customer_type == 'account':
            # Account invoices show in account column
            account_inv = float(sale.total_amount)
            cash_inv = 0
        else:
            # Cash invoices show in cash column
            account_inv = 0
            cash_inv = float(sale.total_amount)
        
        # Calculate balance (remaining amount owed)
        balance = float(sale.total_amount) - total_paid
        
        all_transactions.append({
            'date': sale.date,
            'type': 'sale',
            'invoiceNo': sale.invoice_number,
            'accountInv': account_inv,
            'cashInv': cash_inv,
            'paid': total_paid,
            'balance': balance if sale.customer_type == 'account' else 0  # Only account sales have running balance
        })
    
    # Add on-account payment transactions
    for payment in on_account_payments:
        # On-account payments are credits that reduce the customer's outstanding balance
        all_transactions.append({
            'date': datetime.combine(payment.payment_date, datetime.min.time()),
            'type': 'on_account_payment',
            'invoiceNo': 'On Account',
            'accountInv': 0,
            'cashInv': 0,
            'paid': float(payment.amount),
            'balance': -float(payment.amount)  # Negative balance for credit
        })

    customer_discounts = CustomerDiscount.query.filter(
        CustomerDiscount.customer_id == customer_id,
        CustomerDiscount.date >= from_dt.date(),
        CustomerDiscount.date < to_dt.date(),
        CustomerDiscount.is_deleted.is_(False),
    ).all()
    for discount in customer_discounts:
        all_transactions.append({
            'date': datetime.combine(discount.date, datetime.min.time()),
            'type': 'customer_discount',
            'invoiceNo': discount.sale.invoice_number if discount.sale else '',
            'accountInv': 0,
            'cashInv': 0,
            'paid': 0,
            'balance': -float(discount.amount or 0),
        })
    
    # Sort all transactions by date
    all_transactions.sort(key=lambda x: x['date'])
    
    # Apply filter type if specified
    if filter_type != "All":
        filtered_transactions = []
        for transaction in all_transactions:
            if filter_type == "Account" and (
                transaction['accountInv'] > 0
                or transaction['type'] in ('on_account_payment', 'customer_discount')
            ):
                filtered_transactions.append(transaction)
            elif filter_type == "Cash" and transaction['cashInv'] > 0:
                filtered_transactions.append(transaction)
            elif filter_type == "All":
                filtered_transactions.append(transaction)
        all_transactions = filtered_transactions
    
    # Build final history with running balance
    for transaction in all_transactions:
        running_balance += transaction['balance']
        
        history.append({
            'id': sl_no,
            'slNo': sl_no,
            'date': transaction['date'].strftime("%Y-%m-%d"),
            'invoiceNo': transaction['invoiceNo'],
            'accountInv': transaction['accountInv'],
            'cashInv': transaction['cashInv'],
            'paid': transaction['paid'],
            'balance': transaction['balance'],
            'runningBalance': running_balance
        })
        sl_no += 1

    return jsonify(history)

@app.route('/api/reports/product-sales', methods=['GET'])
def product_sales_report():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    search = request.args.get('search', '')
    
    # Build base query for SaleItems joined with Sale, RegularProduct, NonProduct
    # Quantity: all customers (including company)
    # Total/AvgPrice: non-company customers only

    # Subquery 1: total quantity per product (all customers)
    qty_query = (
        db.session.query(
            SaleItem.product_id.label('product_id'),
            SaleItem.non_product_id.label('non_product_id'),
            func.sum(SaleItem.quantity).label('total_qty')
        )
        .join(Sale, SaleItem.sale_id == Sale.id)
        .join(Customer, Sale.customer_id == Customer.id)
        .filter(Sale.status == 'finalized')
    )

    # Subquery 2: total amount per product (non-company customers only)
    amt_query = (
        db.session.query(
            SaleItem.product_id.label('product_id'),
            SaleItem.non_product_id.label('non_product_id'),
            func.sum(SaleItem.total_price).label('total_amt'),
            func.sum(SaleItem.quantity).label('non_co_qty')
        )
        .join(Sale, SaleItem.sale_id == Sale.id)
        .join(Customer, Sale.customer_id == Customer.id)
        .filter(Sale.status == 'finalized', Customer.is_company == False)
    )

    # Apply date filters to both
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            try:
                from_dt = datetime.strptime(from_date, "%Y-%m-%d")
            except ValueError:
                from_dt = datetime.strptime(from_date.split()[0], "%Y-%m-%d")
        qty_query = qty_query.filter(Sale.date >= from_dt)
        amt_query = amt_query.filter(Sale.date >= from_dt)
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            try:
                to_dt = datetime.strptime(to_date, "%Y-%m-%d")
            except ValueError:
                to_dt = datetime.strptime(to_date.split()[0], "%Y-%m-%d")
        to_dt = to_dt + timedelta(days=1)
        qty_query = qty_query.filter(Sale.date < to_dt)
        amt_query = amt_query.filter(Sale.date < to_dt)

    if search:
        from sqlalchemy import or_
        qty_query = qty_query.outerjoin(RegularProduct, SaleItem.product_id == RegularProduct.id).outerjoin(NonProduct, SaleItem.non_product_id == NonProduct.id).filter(
            or_(RegularProduct.description.ilike(f'%{search}%'), NonProduct.description.ilike(f'%{search}%'))
        )
        amt_query = amt_query.outerjoin(RegularProduct, SaleItem.product_id == RegularProduct.id).outerjoin(NonProduct, SaleItem.non_product_id == NonProduct.id).filter(
            or_(RegularProduct.description.ilike(f'%{search}%'), NonProduct.description.ilike(f'%{search}%'))
        )

    qty_query = qty_query.group_by(SaleItem.product_id, SaleItem.non_product_id)
    amt_query = amt_query.group_by(SaleItem.product_id, SaleItem.non_product_id)

    qty_sq = qty_query.subquery()
    amt_sq = amt_query.subquery()

    # Main query: join both subqueries with product info
    query = (
        db.session.query(
            func.coalesce(qty_sq.c.product_id, amt_sq.c.product_id).label('product_id'),
            func.coalesce(qty_sq.c.non_product_id, amt_sq.c.non_product_id).label('non_product_id'),
            func.coalesce(RegularProduct.sage_code, NonProduct.sage_code, '').label('sage_code'),
            func.coalesce(RegularProduct.description, NonProduct.description, '').label('product_description'),
            func.coalesce(qty_sq.c.total_qty, 0).label('quantity'),
            func.coalesce(amt_sq.c.total_amt, 0).label('total'),
            func.coalesce(amt_sq.c.non_co_qty, 0).label('non_co_qty'),
        )
        .select_from(qty_sq)
        .outerjoin(amt_sq, and_(
            func.coalesce(qty_sq.c.product_id, -1) == func.coalesce(amt_sq.c.product_id, -1),
            func.coalesce(qty_sq.c.non_product_id, -1) == func.coalesce(amt_sq.c.non_product_id, -1)
        ))
        .outerjoin(RegularProduct, qty_sq.c.product_id == RegularProduct.id)
        .outerjoin(NonProduct, qty_sq.c.non_product_id == NonProduct.id)
    )
    query = query.order_by(func.coalesce(amt_sq.c.total_amt, 0).desc())
    results = query.all()

    discount_query = db.session.query(
        SaleItem.product_id,
        SaleItem.non_product_id,
        func.sum(CustomerDiscount.amount),
    ).join(
        Sale, CustomerDiscount.sale_id == Sale.id
    ).join(
        SaleItem, CustomerDiscount.sale_item_id == SaleItem.id
    ).join(
        Customer, Sale.customer_id == Customer.id
    ).filter(
        CustomerDiscount.is_deleted.is_(False),
        Sale.status == 'finalized',
        Customer.is_company == False,
    )
    if from_date:
        discount_query = discount_query.filter(CustomerDiscount.date >= from_dt.date())
    if to_date:
        discount_query = discount_query.filter(CustomerDiscount.date < to_dt.date())
    if search:
        discount_query = discount_query.outerjoin(
            RegularProduct, SaleItem.product_id == RegularProduct.id
        ).outerjoin(
            NonProduct, SaleItem.non_product_id == NonProduct.id
        ).filter(
            or_(
                RegularProduct.description.ilike(f'%{search}%'),
                NonProduct.description.ilike(f'%{search}%'),
            )
        )
    discount_totals = {
        (product_id, non_product_id): float(amount or 0)
        for product_id, non_product_id, amount in discount_query.group_by(
            SaleItem.product_id, SaleItem.non_product_id
        ).all()
    }

    # Format for frontend
    sales_data = []
    for idx, row in enumerate(results, 1):
        product_id = row.product_id if row.product_id else row.non_product_id
        non_co_qty = float(row.non_co_qty) if row.non_co_qty else 0
        product_key = (row.product_id, row.non_product_id)
        discount_total = discount_totals.pop(product_key, 0)
        gross_total = float(row.total) if row.total else 0
        total_amt = gross_total - discount_total
        avg_price = (total_amt / non_co_qty) if non_co_qty > 0 else 0
        sales_data.append({
            'id': product_id,
            'slNo': idx,
            'sageCode': row.sage_code,
            'productDescription': row.product_description,
            'quantity': float(row.quantity) if row.quantity else 0,
            'avgPrice': avg_price,
            'total': total_amt,
            'grossTotal': gross_total,
            'discountTotal': discount_total,
        })
    for (product_id, non_product_id), discount_total in discount_totals.items():
        product = (
            RegularProduct.query.get(product_id) if product_id
            else NonProduct.query.get(non_product_id) if non_product_id
            else None
        )
        sales_data.append({
            'id': product_id or non_product_id,
            'slNo': len(sales_data) + 1,
            'sageCode': product.sage_code if product else '',
            'productDescription': product.description if product else '',
            'quantity': 0,
            'avgPrice': 0,
            'total': -discount_total,
            'grossTotal': 0,
            'discountTotal': discount_total,
        })
    return jsonify(sales_data)

@app.route('/api/purchase-invoices', methods=['POST'])
def create_purchase_invoice():
    data = request.get_json()
    # Use business date
    business_date = get_business_date()
    supplier_id = data.get('supplierId')  # Only use the supplied value

    invoice_date = business_date
    if data.get('date'):
        try:
            invoice_date = datetime.strptime(data['date'], "%Y-%m-%d")
        except Exception:
            invoice_date = business_date
    invoice = PurchaseInvoice(
        purchase_id=data['purchaseId'],
        supplier_id=supplier_id,
        remarks=data.get('remarks'),
        date=invoice_date
    )
    db.session.add(invoice)
    # Assign invoice.id without committing. The header must roll back if
    # any item or stock update fails later in this request.
    db.session.flush()
    
    # Process invoice items and update stock
    for item in data['items']:
        invoice_item = PurchaseInvoiceItem(
            invoice_id=invoice.id,
            product_id=item['productId'],
            product_name=item.get('productName'),
            quantity=item['quantity'],
            unit_price=item['unitPrice'],
            total_price=item['totalPrice'],
            remarks=item.get('remarks', '')  # Accept remarks from item
        )
        db.session.add(invoice_item)
        
        # Update stock for the product
        # Determine if it's a regular or non-product by checking both tables
        regular_product = RegularProduct.query.get(item['productId'])
        non_product = NonProduct.query.get(item['productId'])
        
        if regular_product:
            product_type = 'regular'
        elif non_product:
            product_type = 'non'
        else:
            db.session.rollback()
            return jsonify({"error": f"Product with ID {item['productId']} not found"}), 400
        
        print(f"[DEBUG] Creating stock movement for product {item['productId']} ({product_type}): quantity={item['quantity']}, movement_type=purchase")
        success, result = update_product_stock(
            product_id=item['productId'],
            product_type=product_type,
            quantity_change=item['quantity'],  # Positive for purchases
            movement_type='purchase',
            reference_id=invoice.id,
            reference_type='purchase',
            remarks=f"Purchase invoice for purchase {data['purchaseId']}",
            user_id=None,  # TODO: Get user_id from JWT if needed
            movement_date=invoice_date  # Use the invoice date for the movement
        )
        if not success:
            db.session.rollback()
            print(f"[ERROR] Stock update failed for product {item['productId']}: {result}")
            return jsonify({"error": f"Stock update failed: {result}"}), 400
        else:
            print(f"[DEBUG] Stock movement created successfully for product {item['productId']}: {result}")
    
    db.session.commit()
    return jsonify(invoice.to_dict()), 201

@app.route('/api/purchase-invoices/<int:invoice_id>', methods=['GET'])
def get_purchase_invoice(invoice_id):
    invoice = PurchaseInvoice.query.get_or_404(invoice_id)
    return jsonify(invoice.to_dict())

@app.route('/api/purchase-invoices/by-purchase/<int:purchase_id>', methods=['GET'])
@jwt_required()
def get_purchase_invoice_by_purchase_id(purchase_id):
    """Get purchase invoice data by purchase_id for editing"""
    try:
        # Find the purchase invoice for this purchase_id
        invoice = PurchaseInvoice.query.filter_by(purchase_id=purchase_id).first()
        if not invoice:
            return jsonify({"error": "No invoice found for this purchase"}), 404
        
        # Get the purchase details
        purchase = Purchase.query.get_or_404(purchase_id)
        
        # Return both purchase and invoice data
        return jsonify({
            "purchase": purchase.to_dict(),
            "invoice": invoice.to_dict()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/purchase-invoices/by-invoice/<int:invoice_id>', methods=['GET'])
@jwt_required()
def get_purchase_invoice_by_invoice_id(invoice_id):
    """Get purchase invoice data by PurchaseInvoice.id for editing"""
    try:
        invoice = PurchaseInvoice.query.get_or_404(invoice_id)
        purchase = Purchase.query.get_or_404(invoice.purchase_id)
        return jsonify({
            "purchase": purchase.to_dict(),
            "invoice": invoice.to_dict()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/purchase-invoices/<int:invoice_id>', methods=['DELETE'])
@jwt_required()
def delete_purchase_invoice(invoice_id):
    """Delete a purchase invoice and reverse all stock updates"""
    try:
        # Get the invoice
        invoice = PurchaseInvoice.query.get_or_404(invoice_id)
        
        # Get all invoice items to reverse stock updates
        invoice_items = PurchaseInvoiceItem.query.filter_by(invoice_id=invoice_id).all()
        
        # Reverse stock updates for each item
        for item in invoice_items:
            # Determine if it's a regular or non-product by checking both tables
            regular_product = RegularProduct.query.get(item.product_id)
            non_product = NonProduct.query.get(item.product_id)
            
            if regular_product:
                product_type = 'regular'
            elif non_product:
                product_type = 'non'
            else:
                db.session.rollback()
                return jsonify({"error": f"Product with ID {item.product_id} not found during deletion"}), 400
            
            print(f"[DEBUG] Reversing stock movement for product {item.product_id} ({product_type}): quantity={-item.quantity}, movement_type=purchase_reversal")
            
            # Reverse the stock update (negative quantity to reduce stock)
            success, result = update_product_stock(
                product_id=item.product_id,
                product_type=product_type,
                quantity_change=-item.quantity,  # Negative to reverse the purchase
                movement_type='purchase_reversal',
                reference_id=invoice.id,
                reference_type='purchase_invoice_delete',
                remarks=f"Reversed purchase invoice {invoice_id} deletion",
                user_id=None,  # TODO: Get user_id from JWT if needed
                movement_date=invoice.date  # Use the original invoice date for the reversal
            )
            if not success:
                db.session.rollback()
                print(f"[ERROR] Stock reversal failed for product {item.product_id}: {result}")
                return jsonify({"error": f"Stock reversal failed for product {item.product_id}: {result}"}), 400
            else:
                print(f"[DEBUG] Stock reversal successful for product {item.product_id}: {result}")
        
        # Delete invoice items first (foreign key constraint)
        PurchaseInvoiceItem.query.filter_by(invoice_id=invoice_id).delete()
        
        # Delete the invoice
        db.session.delete(invoice)
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": f"Purchase invoice {invoice_id} deleted successfully and stock updated"
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete purchase invoice: {str(e)}"}), 500

@app.route('/api/purchase-invoices/<int:invoice_id>', methods=['PUT'])
@jwt_required()
def update_purchase_invoice(invoice_id):
    """Update an existing purchase invoice with proper stock movement handling"""
    try:
        data = request.get_json()
        invoice = PurchaseInvoice.query.get_or_404(invoice_id)
        
        # Get existing items before deletion to reverse their stock movements
        existing_items = PurchaseInvoiceItem.query.filter_by(invoice_id=invoice_id).all()
        
        # Reverse stock movements for existing items
        for item in existing_items:
            # Determine product type
            regular_product = RegularProduct.query.get(item.product_id)
            non_product = NonProduct.query.get(item.product_id)
            
            if regular_product:
                product_type = 'regular'
            elif non_product:
                product_type = 'non'
            else:
                continue  # Skip if product not found
            
            print(f"[DEBUG] Reversing stock for invoice update - product {item.product_id} ({product_type}): quantity={-item.quantity}")
            
            # Reverse the original stock movement
            success, result = update_product_stock(
                product_id=item.product_id,
                product_type=product_type,
                quantity_change=-item.quantity,  # Negative to reverse
                movement_type='purchase_reversal',
                reference_id=invoice.id,
                reference_type='purchase_invoice_update',
                remarks=f"Reversed for invoice {invoice_id} update",
                user_id=None,
                movement_date=invoice.date
            )
            if not success:
                db.session.rollback()
                print(f"[ERROR] Stock reversal failed during update for product {item.product_id}: {result}")
                return jsonify({"error": f"Stock reversal failed for product {item.product_id}: {result}"}), 400
        
        # Update invoice fields
        invoice.remarks = data.get('remarks', '')
        
        # Delete existing items
        PurchaseInvoiceItem.query.filter_by(invoice_id=invoice_id).delete()
        
        # Add new items and create stock movements
        for item_data in data.get('items', []):
            # Create new invoice item
            item = PurchaseInvoiceItem(
                invoice_id=invoice.id,
                product_id=item_data['productId'],
                product_name=item_data['productName'],
                quantity=item_data['quantity'],
                unit_price=item_data['unitPrice'],
                total_price=item_data['totalPrice'],
                remarks=item_data.get('remarks', '')
            )
            db.session.add(item)
            
            # Determine product type for new item
            regular_product = RegularProduct.query.get(item_data['productId'])
            non_product = NonProduct.query.get(item_data['productId'])
            
            if regular_product:
                product_type = 'regular'
            elif non_product:
                product_type = 'non'
            else:
                db.session.rollback()
                return jsonify({"error": f"Product with ID {item_data['productId']} not found"}), 400
            
            print(f"[DEBUG] Creating new stock movement for invoice update - product {item_data['productId']} ({product_type}): quantity={item_data['quantity']}")
            
            # Create new stock movement
            success, result = update_product_stock(
                product_id=item_data['productId'],
                product_type=product_type,
                quantity_change=item_data['quantity'],  # Positive for new purchase
                movement_type='purchase',
                reference_id=invoice.id,
                reference_type='purchase_invoice_update',
                remarks=f"Updated purchase invoice {invoice_id}",
                user_id=None,
                movement_date=invoice.date
            )
            if not success:
                db.session.rollback()
                print(f"[ERROR] Stock update failed during update for product {item_data['productId']}: {result}")
                return jsonify({"error": f"Stock update failed for product {item_data['productId']}: {result}"}), 400
        
        db.session.commit()
        return jsonify(invoice.to_dict())
        
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Purchase invoice update failed: {str(e)}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500



@app.route('/api/purchase-invoices/<int:invoice_id>/print', methods=['GET'])
def print_purchase_invoice(invoice_id):
    invoice = PurchaseInvoice.query.get_or_404(invoice_id)
    purchase = Purchase.query.get(invoice.purchase_id)
    supplier = Supplier.query.get(purchase.supplier_id)
    company = Company.query.first()
    items = [item.to_dict() for item in invoice.items]
    return jsonify({
        "company": company.to_dict() if company else {},
        "supplier": supplier.to_dict() if supplier else {},
        "invoice": invoice.to_dict(),
        "items": items
    })

@app.route('/api/purchase-invoices/<int:invoice_id>/send', methods=['POST'])
def send_purchase_invoice(invoice_id):
    from flask import request
    from models import Supplier, PurchaseInvoice, Purchase
    data = request.get_json() or {}
    supplier_id = data.get('supplierId')
    supplier = Supplier.query.get_or_404(supplier_id)
    invoice = PurchaseInvoice.query.get_or_404(invoice_id)
    purchase = Purchase.query.get(invoice.purchase_id)
    try:
        send_purchase_invoice_email(current_app.extensions['mail'], supplier.email, invoice, supplier)
        return jsonify({"success": True, "message": "Email sent"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/debug/stock-movements/<int:product_id>/<product_type>', methods=['GET'])
def debug_stock_movements(product_id, product_type):
    """Debug endpoint to check stock movements for a specific product"""
    try:
        movements = StockMovement.query.filter(
            StockMovement.product_id == product_id,
            StockMovement.product_type == product_type
        ).order_by(StockMovement.created_at.desc()).limit(20).all()
        
        result = []
        for movement in movements:
            result.append({
                'id': movement.id,
                'quantity': float(movement.quantity),
                'movement_type': movement.movement_type,
                'created_at': movement.created_at.isoformat(),
                'reference_id': movement.reference_id,
                'reference_type': movement.reference_type,
                'remarks': movement.remarks,
                'previous_stock': movement.previous_stock,
                'new_stock': movement.new_stock
            })
        
        return jsonify({
            'product_id': product_id,
            'product_type': product_type,
            'movements': result,
            'total_movements': len(result)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/debug/products', methods=['GET'])
def debug_products():
    """Debug endpoint to check product prices"""
    regular_products = RegularProduct.query.all()
    non_products = NonProduct.query.all()
    
    result = {
        'regularProducts': [
            {
                'id': p.id,
                'description': p.description,
                'sellingPrice': float(p.selling_price) if p.selling_price else 0,
                'rawSellingPrice': str(p.selling_price)
            } for p in regular_products
        ],
        'nonProducts': [
            {
                'id': p.id,
                'description': p.description,
                'sellingPrice': float(p.selling_price) if p.selling_price else 0,
                'rawSellingPrice': str(p.selling_price)
            } for p in non_products
        ]
    }
    
    return jsonify(result)

@app.route('/api/fix/product-prices', methods=['POST'])
def fix_product_prices():
    """Fix product prices that might be incorrectly stored"""
    data = request.get_json()
    product_id = data.get('productId')
    new_price = data.get('newPrice')
    
    if not product_id or new_price is None:
        return jsonify({'error': 'Product ID and new price are required'}), 400
    
    # Try to find in regular products first
    product = RegularProduct.query.get(product_id)
    if product:
        product.selling_price = new_price
        db.session.commit()
        return jsonify({'message': f'Updated regular product {product_id} price to {new_price}'})
    
    # Try non-products
    product = NonProduct.query.get(product_id)
    if product:
        product.selling_price = new_price
        db.session.commit()
        return jsonify({'message': f'Updated non-product {product_id} price to {new_price}'})
    
    return jsonify({'error': 'Product not found'}), 404

# Supplier Payment routes
@app.route('/api/supplier-payments', methods=['POST'])
@jwt_required()
def create_supplier_payment():
    try:
        data = request.get_json()
        payment_data = SupplierPaymentSchema(**data)

        supplier = Supplier.query.get(payment_data.supplier_id)
        if not supplier:
            return jsonify({"error": "Supplier not found"}), 404

        # If purchase_invoice_id is provided, link payment to a specific purchase invoice
        if payment_data.purchase_invoice_id:
            purchase_invoice = PurchaseInvoice.query.get(payment_data.purchase_invoice_id)
            if not purchase_invoice:
                return jsonify({"error": "Purchase invoice not found"}), 404

            # Update purchase_invoice's payment status and paid_amount
            total_amount = sum(item.total_price for item in purchase_invoice.items)
            current_paid = float(purchase_invoice.paid_amount or 0)
            new_paid = current_paid + float(payment_data.amount)

            if new_paid >= total_amount:
                purchase_invoice.payment_status = "paid"
                purchase_invoice.paid_amount = total_amount
            else:
                purchase_invoice.payment_status = "partial"
                purchase_invoice.paid_amount = new_paid
            db.session.add(purchase_invoice)

        new_payment = SupplierPayment(
            supplier_id=payment_data.supplier_id,
            purchase_invoice_id=payment_data.purchase_invoice_id,
            amount=payment_data.amount,
            payment_mode=payment_data.payment_mode,
            payment_date=payment_data.payment_date,
            supplier_invoice_number=payment_data.supplier_invoice_number,
            supplier_invoice_date=payment_data.supplier_invoice_date,
            remarks=payment_data.remarks
        )
        
        db.session.add(new_payment)
        db.session.commit()
        return jsonify(new_payment.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-payments', methods=['GET'])
@jwt_required()
def get_supplier_payments():
    try:
        payments = SupplierPayment.query.all()
        return jsonify([payment.to_dict() for payment in payments]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/suppliers/<int:supplier_id>/outstanding_invoices', methods=['GET'])
@jwt_required()
def get_supplier_outstanding_invoices(supplier_id):
    try:
        supplier = Supplier.query.get(supplier_id)
        if not supplier:
            return jsonify({"error": "Supplier not found"}), 404

        # Get purchase invoices for this supplier that are not fully paid
        purchase_invoices = PurchaseInvoice.query.join(Purchase).filter(
            Purchase.supplier_id == supplier_id,
            PurchaseInvoice.payment_status != 'paid'
        ).all()

        outstanding_invoices = []
        for invoice in purchase_invoices:
            total_amount = sum(item.total_price for item in invoice.items)
            paid_amount = float(invoice.paid_amount or 0)
            outstanding_amount = float(total_amount) - paid_amount
            
            outstanding_invoices.append({
                'id': invoice.id,
                'purchaseId': invoice.purchase_id,
                'date': invoice.date.isoformat() if invoice.date else None,
                'remarks': invoice.remarks,
                'totalAmount': float(total_amount),
                'paidAmount': paid_amount,
                'outstandingAmount': outstanding_amount
            })

        return jsonify(outstanding_invoices), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-payments/history', methods=['GET'])
@jwt_required()
def get_supplier_payment_history():
    try:
        # Get query parameters
        supplier_id = request.args.get('supplierId', type=int)
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        payment_mode = request.args.get('paymentMode')
        
        # Build query with left joins to include all payments
        query = SupplierPayment.query.join(Supplier).outerjoin(PurchaseInvoice) # Eager load supplier and purchase invoice
        
        # Filter by supplier if provided
        if supplier_id:
            query = query.filter(SupplierPayment.supplier_id == supplier_id)
        
        # Filter by date range if provided
        if from_date:
            query = query.filter(SupplierPayment.payment_date >= from_date)
        if to_date:
            query = query.filter(SupplierPayment.payment_date <= to_date)
        
        # Filter by payment mode if provided
        if payment_mode and payment_mode != 'All':
            query = query.filter(SupplierPayment.payment_mode == payment_mode)
        
        # Eager-load supplier to avoid N+1
        query = query.options(
            db.contains_eager(SupplierPayment.supplier)
        ).order_by(SupplierPayment.payment_date.desc())
        
        payments = query.all()
        
        # Bulk-load all linked purchase invoices with their items
        linked_invoice_ids = list({p.purchase_invoice_id for p in payments if p.purchase_invoice_id})
        invoice_map = {}
        if linked_invoice_ids:
            for inv in PurchaseInvoice.query.options(
                db.joinedload(PurchaseInvoice.items)
            ).filter(PurchaseInvoice.id.in_(linked_invoice_ids)).all():
                invoice_map[inv.id] = inv
        
        # For payments without a linked invoice, find nearest invoice per supplier in bulk
        supplier_dates = [(p.supplier_id, p.payment_date) for p in payments if not p.purchase_invoice_id]
        nearby_map = {}  # (supplier_id, payment_date) -> invoice
        if supplier_dates:
            from itertools import groupby
            # Group by supplier to minimize queries
            supplier_dates.sort(key=lambda x: x[0])
            for sid, group in groupby(supplier_dates, key=lambda x: x[0]):
                dates = sorted(set(g[1] for g in group))
                # Get the most recent invoice for each date in one query per supplier
                invoice_cutoff = datetime.combine(max(dates), datetime.max.time())
                all_invoices = PurchaseInvoice.query.options(
                    db.joinedload(PurchaseInvoice.items)
                ).join(Purchase).filter(
                    Purchase.supplier_id == sid,
                    PurchaseInvoice.date <= invoice_cutoff
                ).order_by(PurchaseInvoice.date.desc()).all()
                if all_invoices:
                    for pd in dates:
                        for inv in all_invoices:
                            # Supplier payments store a calendar date, while
                            # purchase invoices store a datetime. Compare like
                            # types so same-day payments can resolve nearby
                            # invoices without raising TypeError.
                            invoice_calendar_date = (
                                inv.date.date() if isinstance(inv.date, datetime) else inv.date
                            )
                            if invoice_calendar_date and invoice_calendar_date <= pd:
                                nearby_map[(sid, pd)] = inv
                                break
        
        # Create detailed payment history with invoice information
        payment_history = []
        for idx, payment in enumerate(payments, 1):
            supplier_name = payment.supplier.supplier_name if payment.supplier else 'Unknown'
            
            invoice_number = None
            invoice_date = None
            invoice_amount = None
            
            if payment.purchase_invoice_id:
                purchase_invoice = invoice_map.get(payment.purchase_invoice_id)
                if purchase_invoice:
                    invoice_number = purchase_invoice.id
                    invoice_date = purchase_invoice.date.isoformat() if purchase_invoice.date else None
                    invoice_amount = sum(float(item.total_price) for item in purchase_invoice.items) if purchase_invoice.items else 0
                else:
                    invoice_number = payment.purchase_invoice_id
                    invoice_amount = 0
            else:
                nearby_invoice = nearby_map.get((payment.supplier_id, payment.payment_date))
                if nearby_invoice:
                    invoice_number = nearby_invoice.id
                    invoice_date = nearby_invoice.date.isoformat() if nearby_invoice.date else None
                    invoice_amount = sum(float(item.total_price) for item in nearby_invoice.items) if nearby_invoice.items else 0

            payment_history.append({
                'id': payment.id,
                'supplierId': payment.supplier_id,
                'purchaseInvoiceId': payment.purchase_invoice_id,
                'amount': float(payment.amount),
                'paymentMode': payment.payment_mode,
                'paymentDate': payment.payment_date.isoformat(),
                'supplierInvoiceNumber': payment.supplier_invoice_number or '',
                'supplierInvoiceDate': payment.supplier_invoice_date.isoformat() if payment.supplier_invoice_date else None,
                'remarks': payment.remarks or '',
                'slNo': idx,
                'paymentId': str(payment.id),
                'paidAmt': float(payment.amount),
                'invNo': str(invoice_number) if invoice_number is not None else '',
                'invDate': invoice_date,
                'supplier': supplier_name,
                'invoiceAmt': float(invoice_amount) if invoice_amount is not None else 0,
                'allocated': float(payment.amount) if invoice_number is not None else 0
            })
        
        return jsonify(payment_history), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-payments/<int:payment_id>', methods=['GET'])
def get_supplier_payment(payment_id):
    """Get a single supplier payment by ID (public, for print receipt)"""
    try:
        payment = SupplierPayment.query.get_or_404(payment_id)
        supplier = Supplier.query.get(payment.supplier_id)
        company = Company.query.first()
        return jsonify({
            'payment': payment.to_dict(),
            'supplier': supplier.to_dict() if supplier else {},
            'company': company.to_dict() if company else {}
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-payments/<int:payment_id>', methods=['PUT'])
@jwt_required()
def update_supplier_payment(payment_id):
    """Update an existing supplier payment"""
    try:
        data = request.get_json()
        
        # Find the payment
        payment = SupplierPayment.query.get(payment_id)
        if not payment:
            return jsonify({"error": "Payment not found"}), 404
        
        # Store old values for reversal
        old_amount = float(payment.amount)
        old_purchase_invoice_id = payment.purchase_invoice_id
        
        # Update payment fields
        if 'supplier_id' in data:
            payment.supplier_id = data['supplier_id']
        if 'purchase_invoice_id' in data:
            payment.purchase_invoice_id = data['purchase_invoice_id']
        if 'amount' in data:
            payment.amount = data['amount']
        if 'payment_mode' in data:
            payment.payment_mode = data['payment_mode']
        if 'payment_date' in data:
            payment.payment_date = datetime.strptime(data['payment_date'], '%Y-%m-%d').date()
        if 'supplier_invoice_number' in data:
            payment.supplier_invoice_number = data['supplier_invoice_number']
        if 'supplier_invoice_date' in data and data['supplier_invoice_date']:
            payment.supplier_invoice_date = datetime.strptime(data['supplier_invoice_date'], '%Y-%m-%d').date()
        if 'remarks' in data:
            payment.remarks = data['remarks']
        
        # Handle purchase invoice payment status updates
        # First, reverse the old payment effect
        if old_purchase_invoice_id:
            old_invoice = PurchaseInvoice.query.get(old_purchase_invoice_id)
            if old_invoice:
                # Subtract the old payment amount
                current_paid = float(old_invoice.paid_amount or 0)
                new_paid = max(0, current_paid - old_amount)
                old_invoice.paid_amount = new_paid
                
                # Recalculate payment status
                total_amount = sum(item.total_price for item in old_invoice.items)
                if new_paid >= total_amount:
                    old_invoice.payment_status = "paid"
                elif new_paid > 0:
                    old_invoice.payment_status = "partial"
                else:
                    old_invoice.payment_status = "pending"
        
        # Apply the new payment effect
        if payment.purchase_invoice_id:
            new_invoice = PurchaseInvoice.query.get(payment.purchase_invoice_id)
            if new_invoice:
                # Add the new payment amount
                current_paid = float(new_invoice.paid_amount or 0)
                new_paid = current_paid + float(payment.amount)
                new_invoice.paid_amount = new_paid
                
                # Update payment status
                total_amount = sum(item.total_price for item in new_invoice.items)
                if new_paid >= total_amount:
                    new_invoice.payment_status = "paid"
                elif new_paid > 0:
                    new_invoice.payment_status = "partial"
                else:
                    new_invoice.payment_status = "pending"
        
        db.session.commit()
        return jsonify(payment.to_dict()), 200
        
    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-payments/<int:payment_id>', methods=['DELETE'])
@jwt_required()
def delete_supplier_payment(payment_id):
    """Delete a supplier payment and revert all related transactions"""
    try:
        # Find the payment
        payment = SupplierPayment.query.get(payment_id)
        if not payment:
            return jsonify({"error": "Payment not found"}), 404
        
        # Store payment details for reversal
        payment_amount = float(payment.amount)
        purchase_invoice_id = payment.purchase_invoice_id
        
        # Revert purchase invoice payment status if linked
        if purchase_invoice_id:
            purchase_invoice = PurchaseInvoice.query.get(purchase_invoice_id)
            if purchase_invoice:
                # Subtract the payment amount from paid_amount
                current_paid = float(purchase_invoice.paid_amount or 0)
                new_paid = max(0, current_paid - payment_amount)
                purchase_invoice.paid_amount = new_paid
                
                # Recalculate payment status
                total_amount = sum(item.total_price for item in purchase_invoice.items)
                if new_paid >= total_amount:
                    purchase_invoice.payment_status = "paid"
                elif new_paid > 0:
                    purchase_invoice.payment_status = "partial"
                else:
                    purchase_invoice.payment_status = "pending"
        
        # Delete the payment
        db.session.delete(payment)
        db.session.commit()
        
        return jsonify({
            "message": "Payment deleted successfully",
            "deleted_payment_id": payment_id,
            "reverted_amount": payment_amount
        }), 200
        
    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-payments/bulk', methods=['POST'])
@jwt_required()
def create_bulk_supplier_payments():
    """Create multiple supplier payments at once"""
    try:
        data = request.get_json()
        
        if not isinstance(data, list):
            return jsonify({"error": "Expected an array of payment objects"}), 400
        
        created_payments = []
        
        for payment_data in data:
            # Validate required fields
            if not all(key in payment_data for key in ['supplier_id', 'amount', 'payment_mode', 'payment_date']):
                return jsonify({"error": "Missing required fields in payment data"}), 400
            
            # Validate supplier exists
            supplier = Supplier.query.get(payment_data['supplier_id'])
            if not supplier:
                return jsonify({"error": f"Supplier not found: {payment_data['supplier_id']}"}), 404
            
            # Handle purchase invoice if provided
            if payment_data.get('purchase_invoice_id'):
                purchase_invoice = PurchaseInvoice.query.get(payment_data['purchase_invoice_id'])
                if not purchase_invoice:
                    return jsonify({"error": f"Purchase invoice not found: {payment_data['purchase_invoice_id']}"}), 404
                
                # Update purchase invoice payment status
                total_amount = sum(item.total_price for item in purchase_invoice.items)
                current_paid = float(purchase_invoice.paid_amount or 0)
                new_paid = current_paid + float(payment_data['amount'])
                
                if new_paid >= total_amount:
                    purchase_invoice.payment_status = "paid"
                    purchase_invoice.paid_amount = total_amount
                else:
                    purchase_invoice.payment_status = "partial"
                    purchase_invoice.paid_amount = new_paid
            
            # Create the payment
            new_payment = SupplierPayment(
                supplier_id=payment_data['supplier_id'],
                purchase_invoice_id=payment_data.get('purchase_invoice_id'),
                amount=payment_data['amount'],
                payment_mode=payment_data['payment_mode'],
                payment_date=datetime.strptime(payment_data['payment_date'], '%Y-%m-%d').date(),
                supplier_invoice_number=payment_data.get('supplier_invoice_number'),
                supplier_invoice_date=datetime.strptime(payment_data['supplier_invoice_date'], '%Y-%m-%d').date() if payment_data.get('supplier_invoice_date') else None,
                remarks=payment_data.get('remarks')
            )
            
            db.session.add(new_payment)
            created_payments.append(new_payment)
        
        db.session.commit()
        
        return jsonify({
            "message": f"Successfully created {len(created_payments)} payments",
            "payments": [payment.to_dict() for payment in created_payments]
        }), 201
        
    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/reports/daily-book-purchase', methods=['GET'])
@jwt_required()
def daily_book_purchase():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    search = request.args.get('search', '')
    
    # Build query for PurchaseInvoices joined with Purchase and Supplier
    query = (
        db.session.query(
            PurchaseInvoice.id,
            PurchaseInvoice.date,
            PurchaseInvoice.supplier_id,
            PurchaseInvoice.purchase_id,
            Purchase.supplier_name,
            Supplier.is_company,
            func.sum(PurchaseInvoiceItem.total_price).label('invoice_amount')
        )
        .join(Purchase, PurchaseInvoice.purchase_id == Purchase.id)
        .join(PurchaseInvoiceItem, PurchaseInvoice.id == PurchaseInvoiceItem.invoice_id)
        .outerjoin(Supplier, PurchaseInvoice.supplier_id == Supplier.id)
    )
    
    # Filter by date range
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, "%Y-%m-%d")
            query = query.filter(func.date(PurchaseInvoice.date) >= from_dt.date())
        except Exception:
            pass
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, "%Y-%m-%d")
            query = query.filter(func.date(PurchaseInvoice.date) <= to_dt.date())
        except Exception:
            pass
    
    # Search by supplier name
    if search:
        query = query.filter(Purchase.supplier_name.ilike(f'%{search}%'))
    
    # Group by purchase invoice
    query = query.group_by(
        PurchaseInvoice.id,
        PurchaseInvoice.date,
        PurchaseInvoice.purchase_id,
        Purchase.supplier_name,
        Supplier.is_company
    )
    
    # Order by date descending
    query = query.order_by(PurchaseInvoice.date.desc())
    
    results = query.all()
    
    # Format for frontend
    purchase_data = []
    for idx, row in enumerate(results, 1):
        purchase_data.append({
            'id': row.id,
            'slNo': idx,
            'date': row.date.strftime('%Y-%m-%d') if row.date else None,
            'supplier': row.supplier_name,
            'supplierId': row.supplier_id,
            'invNo': row.id,
            'invoiceAmt': float(row.invoice_amount) if row.invoice_amount else 0,
            'isCompany': bool(row.is_company) if row.is_company is not None else False,
        })
    
    return jsonify(purchase_data)

@app.route('/api/reports/product-purchase', methods=['GET'])
@jwt_required()
def product_purchase_report():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    show_all = request.args.get('showAll', 'All')
    search = request.args.get('search', '')
    
    # Build query for PurchaseInvoiceItems joined with PurchaseInvoice, RegularProduct, and NonProduct
    query = (
        db.session.query(
            PurchaseInvoiceItem.id,
            PurchaseInvoiceItem.product_id,
            PurchaseInvoiceItem.product_name,
            func.coalesce(RegularProduct.description, NonProduct.description, PurchaseInvoiceItem.product_name, '').label('product_description'),
            func.sum(PurchaseInvoiceItem.quantity).label('quantity'),
            func.sum(PurchaseInvoiceItem.total_price).label('total'),
            (func.sum(PurchaseInvoiceItem.total_price) / func.nullif(func.sum(PurchaseInvoiceItem.quantity), 0)).label('avg_price')
        )
        .join(PurchaseInvoice, PurchaseInvoiceItem.invoice_id == PurchaseInvoice.id)
        .outerjoin(RegularProduct, PurchaseInvoiceItem.product_id == RegularProduct.id)
        .outerjoin(NonProduct, PurchaseInvoiceItem.product_id == NonProduct.id)
    )
    
    # Filter by date range
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, "%Y-%m-%d")
            query = query.filter(func.date(PurchaseInvoice.date) >= from_dt.date())
        except Exception:
            pass
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, "%Y-%m-%d")
            query = query.filter(func.date(PurchaseInvoice.date) <= to_dt.date())
        except Exception:
            pass
    
    # Search by product description
    if search:
        query = query.filter(
            or_(
                RegularProduct.description.ilike(f'%{search}%'),
                NonProduct.description.ilike(f'%{search}%'),
                PurchaseInvoiceItem.product_name.ilike(f'%{search}%')
            )
        )
    
    # Group by product
    query = query.group_by(
        PurchaseInvoiceItem.product_id,
        PurchaseInvoiceItem.product_name,
        RegularProduct.description,
        NonProduct.description
    )
    
    # Order by total desc
    query = query.order_by(func.sum(PurchaseInvoiceItem.total_price).desc())
    
    results = query.all()
    
    # Calculate total excluding company suppliers
    non_company_total = (
        db.session.query(func.sum(PurchaseInvoiceItem.total_price))
        .join(PurchaseInvoice, PurchaseInvoiceItem.invoice_id == PurchaseInvoice.id)
        .outerjoin(Supplier, PurchaseInvoice.supplier_id == Supplier.id)
        .filter(or_(Supplier.is_company == False, Supplier.is_company.is_(None)))
    )
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, "%Y-%m-%d")
            non_company_total = non_company_total.filter(func.date(PurchaseInvoice.date) >= from_dt.date())
        except Exception:
            pass
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, "%Y-%m-%d")
            non_company_total = non_company_total.filter(func.date(PurchaseInvoice.date) <= to_dt.date())
        except Exception:
            pass
    non_company_total_value = float(non_company_total.scalar() or 0)
    
    # Format for frontend
    purchase_data = []
    for idx, row in enumerate(results, 1):
        purchase_data.append({
            'id': row.product_id,  # Use actual product_id instead of serial number
            'slNo': idx,
            'productDescription': row.product_description,
            'quantity': float(row.quantity) if row.quantity else 0,
            'avgPrice': float(row.avg_price) if row.avg_price else 0,
            'total': float(row.total) if row.total else 0
        })
    
    return jsonify({
        'data': purchase_data,
        'nonCompanyTotal': non_company_total_value
    })

@app.route('/api/reports/product-purchase-history', methods=['GET'])
@jwt_required()
def product_purchase_history():
    product_id = request.args.get('productId')
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    
    if not product_id or not from_date or not to_date:
        return jsonify({'error': 'productId, fromDate and toDate are required'}), 400

    try:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        return jsonify({'error': 'Invalid date format'}), 400

    # Query purchase invoice items for the specific product
    query = (
        db.session.query(
            PurchaseInvoiceItem.invoice_id,
            PurchaseInvoiceItem.product_name,
            PurchaseInvoiceItem.quantity,
            PurchaseInvoiceItem.unit_price,
            PurchaseInvoiceItem.total_price,
            PurchaseInvoice.date,
            PurchaseInvoice.id.label('invoice_number'),
            Supplier.supplier_name
        )
        .join(PurchaseInvoice, PurchaseInvoiceItem.invoice_id == PurchaseInvoice.id)
        .join(Purchase, PurchaseInvoice.purchase_id == Purchase.id)
        .join(Supplier, Purchase.supplier_id == Supplier.id)
        .filter(
            PurchaseInvoiceItem.product_id == product_id,
            PurchaseInvoice.date >= from_dt,
            PurchaseInvoice.date < to_dt
        )
        .order_by(PurchaseInvoice.date.desc())
    )

    results = query.all()
    
    # Format for frontend
    purchase_history = []
    for row in results:
        purchase_history.append({
            'invoiceNo': row.invoice_number,
            'date': row.date.strftime('%d-%m-%Y') if row.date else '',
            'supplierName': row.supplier_name,
            'productDescription': row.product_name,
            'quantity': int(row.quantity) if row.quantity else 0,
            'unitPrice': float(row.unit_price) if row.unit_price else 0,
            'total': float(row.total_price) if row.total_price else 0
        })
    
    return jsonify(purchase_history)

@app.route('/api/reports/compare-with-purchase', methods=['GET'])
@jwt_required()
def compare_with_purchase():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    
    if not from_date or not to_date:
        return jsonify({'error': 'fromDate and toDate are required'}), 400

    try:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        return jsonify({'error': 'Invalid date format'}), 400

    # Get all products with sales or purchase in the date range
    product_ids = set()
    # Sales
    sales_products = db.session.query(SaleItem.product_id).join(Sale, SaleItem.sale_id == Sale.id).filter(
        Sale.date >= from_dt,
        Sale.date < to_dt,
        Sale.status == 'finalized'
    ).distinct().all()
    product_ids.update([pid[0] for pid in sales_products])
    # Purchases
    purchase_products = db.session.query(PurchaseInvoiceItem.product_id).join(PurchaseInvoice, PurchaseInvoiceItem.invoice_id == PurchaseInvoice.id).filter(
        PurchaseInvoice.date >= from_dt,
        PurchaseInvoice.date < to_dt
    ).distinct().all()
    product_ids.update([pid[0] for pid in purchase_products])

    compare_data = []
    for product_id in product_ids:
        product = RegularProduct.query.get(product_id)
        if not product:
            continue
        # Sales data
        sales_query = (
            db.session.query(
                func.sum(SaleItem.quantity).label('total_quantity'),
                func.avg(SaleItem.unit_price).label('avg_sale_price')
            )
            .join(Sale, SaleItem.sale_id == Sale.id)
            .filter(
                SaleItem.product_id == product_id,
                Sale.date >= from_dt,
                Sale.date < to_dt,
                Sale.status == 'finalized'
            )
        )
        sales_result = sales_query.first()
        # Purchase data
        purchase_query = (
            db.session.query(
                func.sum(PurchaseInvoiceItem.quantity).label('total_purchase_quantity'),
                func.avg(PurchaseInvoiceItem.unit_price).label('avg_purchase_price')
            )
            .join(PurchaseInvoice, PurchaseInvoiceItem.invoice_id == PurchaseInvoice.id)
            .filter(
                PurchaseInvoiceItem.product_id == product_id,
                PurchaseInvoice.date >= from_dt,
                PurchaseInvoice.date < to_dt
            )
        )
        purchase_result = purchase_query.first()
        total_quantity = float(sales_result.total_quantity) if sales_result.total_quantity else 0
        avg_sale_today = float(sales_result.avg_sale_price) if sales_result.avg_sale_price else 0
        avg_purchase_today = float(purchase_result.avg_purchase_price) if purchase_result.avg_purchase_price else 0
        avg_outstanding_stock = float(purchase_result.avg_purchase_price) if purchase_result.avg_purchase_price else 0
        avg_purchase_price = float(purchase_result.avg_purchase_price) if purchase_result.avg_purchase_price else 0
        status = '✓'
        if avg_sale_today > 0 and avg_purchase_today > 0:
            if avg_sale_today < avg_purchase_today * 0.9:
                status = '✕'
        compare_data.append({
            'productId': product.id,
            'productDescription': product.description,
            'totalQuantity': total_quantity,
            'avgSaleToday': avg_sale_today,
            'avgPurchaseToday': avg_purchase_today,
            'avgOutstandingStock': avg_outstanding_stock,
            'avgPurchasePrice': avg_purchase_price,
            'status': status
        })
    return jsonify(compare_data)

@app.route('/api/reports/sales-analysis', methods=['GET'])
@jwt_required()
def sales_analysis_report():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    search = request.args.get('search', '')
    
    if not from_date or not to_date:
        return jsonify({'error': 'fromDate and toDate are required'}), 400

    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
    
    # Create list of dates between from_date and to_date
    date_list = []
    current_date = from_dt.date()
    end_date = to_dt.date()
    while current_date < end_date:
        date_list.append(current_date)
        current_date += timedelta(days=1)
    
    # Fetch all sales in range
    sales = Sale.query.filter(
        Sale.date >= from_dt,
        Sale.date < to_dt,
        Sale.status == 'finalized'
    ).all()
    discounts = CustomerDiscount.query.join(
        Sale, CustomerDiscount.sale_id == Sale.id
    ).join(Customer, Sale.customer_id == Customer.id).filter(
        CustomerDiscount.date >= from_dt.date(),
        CustomerDiscount.date < to_dt.date(),
        CustomerDiscount.is_deleted.is_(False),
        Sale.status == 'finalized',
        Customer.is_company == False,
    ).all()
    print(f"[DEBUG] Found {len(sales)} finalized sales between {from_date} and {to_date}")
    for sale in sales:
        print(f"[DEBUG] Sale: id={sale.id}, date={sale.date}, status={sale.status}, customer_type={sale.customer_type}, total_amount={sale.total_amount}, paid_amount={sale.paid_amount}")

    # Fetch all purchase invoices and items in range
    from models import PurchaseInvoice, PurchaseInvoiceItem
    invoices = PurchaseInvoice.query.filter(
        func.date(PurchaseInvoice.date) >= from_dt.date(),
        func.date(PurchaseInvoice.date) < to_dt.date()
    ).all()
    invoice_items = PurchaseInvoiceItem.query.join(PurchaseInvoice).filter(
        func.date(PurchaseInvoice.date) >= from_dt.date(),
        func.date(PurchaseInvoice.date) < to_dt.date()
    ).all()

    # Group sales by date
    sales_by_date = {d: [] for d in date_list}
    for sale in sales:
        d = sale.date.date()
        if d in sales_by_date:
            sales_by_date[d].append(sale)
    discounts_by_date = {d: [] for d in date_list}
    for discount in discounts:
        if discount.date in discounts_by_date:
            discounts_by_date[discount.date].append(discount)

    # Group purchase invoice items by invoice date
    purchases_by_date = {d: [] for d in date_list}
    for item in invoice_items:
        invoice = item.invoice
        if invoice and invoice.date:
            d = invoice.date.date()
            if d in purchases_by_date:
                purchases_by_date[d].append(item)

    rows = []
    total_purchase = total_account = total_cash = total_sales = 0
    for idx, d in enumerate(date_list, 1):
        day_purchases = sum(float(item.total_price) for item in purchases_by_date[d])
        day_account_sales = sum(float(sale.total_amount) for sale in sales_by_date[d] if sale.customer_type.lower() == 'account' and not (sale.customer and sale.customer.is_company))
        day_cash_sales = sum(float(sale.total_amount) for sale in sales_by_date[d] if sale.customer_type.lower() == 'cash' and not (sale.customer and sale.customer.is_company))
        for discount in discounts_by_date[d]:
            if discount.sale and discount.sale.customer_type.lower() == 'account':
                day_account_sales -= float(discount.amount or 0)
            elif discount.sale and discount.sale.customer_type.lower() == 'cash':
                day_cash_sales -= float(discount.amount or 0)
        day_total_sales = day_account_sales + day_cash_sales
        print(f"[DEBUG] {d}: purchase={day_purchases}, accountSales={day_account_sales}, cashSales={day_cash_sales}, totalSales={day_total_sales}")
        rows.append({
            'slNo': idx,
            'date': d.strftime('%d-%m-%Y'),
            'purchase': day_purchases,
            'accountSales': day_account_sales,
            'cashSales': day_cash_sales,
            'totalSales': day_total_sales
        })
        total_purchase += day_purchases
        total_account += day_account_sales
        total_cash += day_cash_sales
        total_sales += day_total_sales

    summary = {
        'totalPurchase': total_purchase,
        'totalAccount': total_account,
        'totalCash': total_cash,
        'totalSales': total_sales
    }
    print(f"[DEBUG] Summary: {summary}")
    return jsonify({'sales': rows, 'summary': summary})

# Stock Management Routes
@app.route('/api/stock/current', methods=['GET'])
@jwt_required()
def get_current_stock():
    """Get current stock for all products"""
    started_at = time.monotonic()
    stock_audit_log(
        "current_stock_snapshot_started",
        user_id=get_jwt_identity(),
    )
    try:
        regular_products = RegularProduct.query.all()
        non_products = NonProduct.query.all()
        stock_data = []
        
        # Add regular products
        for product in regular_products:
            current_stock = float(product.current_stock) if product.current_stock is not None else 0
            stock_data.append({
                'id': product.id,
                'productCode': product.product_code,
                'description': product.description,
                'productType': 'regular',
                'currentStock': current_stock,
                'reorderLevel': product.reorder_level,
                'unitOfSale': product.unit_of_sale,
                'location': product.location
            })
            stock_audit_log(
                "current_stock_snapshot_row",
                product_id=product.id,
                product_type="regular",
                current_stock=current_stock,
            )
        # Add non-products
        for product in non_products:
            current_stock = float(product.current_stock) if product.current_stock is not None else 0
            stock_data.append({
                'id': product.id,
                'productCode': product.product_code,
                'description': product.description,
                'productType': 'non',
                'currentStock': current_stock,
                'reorderLevel': product.reorder_level,
                'unitOfSale': product.unit_of_sale,
                'location': product.location
            })
            stock_audit_log(
                "current_stock_snapshot_row",
                product_id=product.id,
                product_type="non",
                current_stock=current_stock,
            )
        stock_audit_log(
            "current_stock_snapshot_completed",
            product_count=len(stock_data),
            elapsed_ms=round((time.monotonic() - started_at) * 1000, 2),
        )
        return jsonify(stock_data), 200
    except Exception as e:
        stock_audit_log(
            "current_stock_snapshot_failed",
            level=logging.ERROR,
            error=str(e),
            elapsed_ms=round((time.monotonic() - started_at) * 1000, 2),
        )
        return jsonify({"error": str(e)}), 500

@app.route('/api/stock/product/<int:product_id>', methods=['GET'])
@jwt_required()
def get_product_stock_details(product_id):
    """Get stock details for a specific product"""
    try:
        product_type = request.args.get('type', 'regular')  # 'regular' or 'non'
        
        if product_type == 'regular':
            product = RegularProduct.query.get(product_id)
        else:
            product = NonProduct.query.get(product_id)
        
        if not product:
            return jsonify({"error": "Product not found"}), 404
        
        # Get recent stock movements
        movements = StockMovement.query.filter_by(
            product_id=product_id,
            product_type=product_type
        ).order_by(StockMovement.created_at.desc()).limit(10).all()
        
        return jsonify({
            'product': {
                'id': product.id,
                'productCode': product.product_code,
                'description': product.description,
                'productType': product_type,
                'currentStock': float(product.current_stock) if product.current_stock is not None else 0,
                'reorderLevel': product.reorder_level,
                'unitOfSale': product.unit_of_sale,
                'location': product.location
            },
            'recentMovements': [movement.to_dict() for movement in movements]
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stock/adjust', methods=['POST'])
@jwt_required()
def adjust_stock():
    """Manually adjust stock for a product"""
    try:
        data = request.get_json()
        adjustment_data = StockAdjustmentSchema(**data)
        user_id = get_jwt_identity()
        
        # Get current stock and normalize Decimal database values before arithmetic.
        current_stock_value = get_product_stock(adjustment_data.product_id, adjustment_data.product_type)
        if current_stock_value is None:
            return jsonify({"error": "Product not found"}), 404
        current_stock = safe_float(current_stock_value)
        adjustment_quantity = safe_float(adjustment_data.quantity)
        
        # Calculate new stock based on adjustment type
        if adjustment_data.adjustment_type == 'increase':
            quantity_change = adjustment_quantity
            new_stock = current_stock + adjustment_quantity
        elif adjustment_data.adjustment_type == 'decrease':
            quantity_change = -adjustment_quantity
            new_stock = current_stock - adjustment_quantity
        elif adjustment_data.adjustment_type == 'set':
            quantity_change = adjustment_quantity - current_stock
            new_stock = adjustment_quantity
        else:
            return jsonify({"error": "Invalid adjustment type"}), 400
        
        # Ensure stock doesn't go negative
        if new_stock < 0:
            return jsonify({"error": "Stock cannot be negative"}), 400
        
        # Update stock
        success, result = update_product_stock(
            product_id=adjustment_data.product_id,
            product_type=adjustment_data.product_type,
            quantity_change=quantity_change,
            movement_type='adjustment',
            reference_id=None,
            reference_type='adjustment',
            remarks=f"Manual adjustment: {adjustment_data.reason}",
            user_id=user_id,
            movement_date=adjustment_data.adjustment_date
        )
        
        if not success:
            return jsonify({"error": f"Stock update failed: {result}"}), 400
        
        # Create adjustment record
        adjustment = StockAdjustment(
            product_id=adjustment_data.product_id,
            product_type=adjustment_data.product_type,
            adjustment_type=adjustment_data.adjustment_type,
            quantity=adjustment_data.quantity,
            previous_stock=current_stock,
            new_stock=new_stock,
            reason=adjustment_data.reason,
            remarks=adjustment_data.remarks,
            adjustment_date=adjustment_data.adjustment_date,
            created_by=user_id
        )
        
        db.session.add(adjustment)
        db.session.commit()
        
        return jsonify({
            "message": "Stock adjusted successfully",
            "previousStock": current_stock,
            "newStock": new_stock,
            "adjustment": adjustment.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/stock/movements', methods=['GET'])
@jwt_required()
def get_stock_movements():
    """Get stock movements with optional filtering"""
    try:
        product_id = request.args.get('productId', type=int)
        product_type = request.args.get('productType')
        movement_type = request.args.get('movementType')
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        
        query = StockMovement.query
        
        if product_id:
            query = query.filter(StockMovement.product_id == product_id)
        if product_type:
            query = query.filter(StockMovement.product_type == product_type)
        if movement_type:
            query = query.filter(StockMovement.movement_type == movement_type)
        if from_date or to_date:
            parsed_from = datetime.strptime(from_date, '%Y-%m-%d') if from_date else None
            parsed_to = datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59, microsecond=999999) if to_date else None
            date_filter = _movement_business_date_filter(parsed_from, parsed_to)
            if date_filter is not None:
                query = query.filter(date_filter)

        movements = query.order_by(
            StockMovement.movement_date.desc(),
            StockMovement.created_at.desc(),
            StockMovement.id.desc()
        ).all()
        
        return jsonify([movement.to_dict() for movement in movements]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stock/adjustments', methods=['GET'])
@jwt_required()
def get_stock_adjustments():
    """Get stock adjustments with optional filtering"""
    try:
        product_id = request.args.get('productId', type=int)
        product_type = request.args.get('productType')
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        
        query = StockAdjustment.query
        
        if product_id:
            query = query.filter(StockAdjustment.product_id == product_id)
        if product_type:
            query = query.filter(StockAdjustment.product_type == product_type)
        if from_date:
            query = query.filter(StockAdjustment.adjustment_date >= from_date)
        if to_date:
            query = query.filter(StockAdjustment.adjustment_date <= to_date)
        
        adjustments = query.order_by(StockAdjustment.created_at.desc()).all()
        
        return jsonify([adjustment.to_dict() for adjustment in adjustments]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stock/low-stock', methods=['GET'])
@jwt_required()
def get_low_stock_products():
    """Get products with stock below reorder level"""
    try:
        regular_products = RegularProduct.query.filter(
            RegularProduct.current_stock <= RegularProduct.reorder_level,
            RegularProduct.status == 'active'
        ).all()
        
        non_products = NonProduct.query.filter(
            NonProduct.current_stock <= NonProduct.reorder_level,
            NonProduct.status == 'active'
        ).all()
        
        low_stock_products = []
        
        for product in regular_products:
            low_stock_products.append({
                'id': product.id,
                'productCode': product.product_code,
                'description': product.description,
                'productType': 'regular',
                'currentStock': product.current_stock,
                'reorderLevel': product.reorder_level,
                'reorderQuantity': product.reorder_quantity,
                'unitOfSale': product.unit_of_sale
            })
        
        for product in non_products:
            low_stock_products.append({
                'id': product.id,
                'productCode': product.product_code,
                'description': product.description,
                'productType': 'non',
                'currentStock': product.current_stock,
                'reorderLevel': product.reorder_level,
                'reorderQuantity': product.reorder_quantity,
                'unitOfSale': product.unit_of_sale
            })
        
        return jsonify(low_stock_products), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/closing-stock', methods=['GET'])
@jwt_required()
def get_closing_stock_entries():
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({"error": "Missing date parameter"}), 400
    date = datetime.strptime(date_str, "%Y-%m-%d").date()
    entries = ClosingStock.query.filter_by(date=date).all()
    return jsonify([entry.to_dict() for entry in entries]), 200

@app.route('/api/closing-stock', methods=['POST'])
@jwt_required()
def save_closing_stock_entries():
    try:
        data = request.get_json()
        date_str = data.get('date')
        items = data.get('items', [])

        if not date_str:
            return jsonify({"error": "Missing date"}), 400

        date = datetime.strptime(date_str, "%Y-%m-%d").date()
        has_existing = ClosingStock.query.filter_by(date=date).count() > 0

        if not has_existing:
            # FIRST SAVE: delete all + re-add all submitted + auto-zero missing products
            ClosingStock.query.filter_by(date=date).delete(synchronize_session=False)

            for item in items:
                entry = ClosingStock(
                    product_id=item['productId'],
                    product_type=item['productType'],
                    date=date,
                    quantity=item['quantity'],
                    manual_entry=True
                )
                db.session.add(entry)
                db.session.flush()  # Link the movement to this ClosingStock row.

                qty = float(item['quantity'])
                if item['productType'] == 'regular':
                    product = RegularProduct.query.get(item['productId'])
                else:
                    product = NonProduct.query.get(item['productId'])
                if product:
                    old_stock = float(product.current_stock or 0)
                    operation_id = uuid.uuid4().hex
                    stock_audit_log(
                        "current_stock_override_started",
                        operation_id=operation_id,
                        product_id=item['productId'],
                        product_type=item['productType'],
                        previous_stock=old_stock,
                        requested_stock=qty,
                        movement_type="closing_stock_adjustment",
                        reference_type="closing_stock",
                        reference_id=entry.id,
                        business_date=str(date),
                        user_id=get_jwt_identity(),
                    )
                    product.current_stock = qty
                    stock_audit_log(
                        "current_stock_override_applied",
                        operation_id=operation_id,
                        product_id=item['productId'],
                        product_type=item['productType'],
                        previous_stock=old_stock,
                        new_stock=qty,
                        quantity_change=qty - old_stock,
                        movement_type="closing_stock_adjustment",
                        reference_type="closing_stock",
                        reference_id=entry.id,
                        business_date=str(date),
                        transaction_state="pending_commit",
                    )

                    movement = StockMovement(
                        product_id=item['productId'],
                        product_type=item['productType'],
                        movement_type='closing_stock_adjustment',
                        quantity=qty - old_stock,
                        reference_id=entry.id,
                        reference_type='closing_stock',
                        previous_stock=old_stock,
                        new_stock=qty,
                        movement_date=date,
                        remarks=f"Closing stock override for {date}",
                        created_by=None
                    )
                    db.session.add(movement)
        else:
            # SUBSEQUENT SAVE: upsert only the submitted items, no auto-zero
            for item in items:
                existing = ClosingStock.query.filter_by(
                    product_id=item['productId'],
                    product_type=item['productType'],
                    date=date
                ).first()

                if existing:
                    existing.quantity = item['quantity']
                    entry = existing
                else:
                    entry = ClosingStock(
                        product_id=item['productId'],
                        product_type=item['productType'],
                        date=date,
                        quantity=item['quantity'],
                        manual_entry=True
                    )
                    db.session.add(entry)
                    db.session.flush()  # Link the movement to this ClosingStock row.

                qty = float(item['quantity'])
                if item['productType'] == 'regular':
                    product = RegularProduct.query.get(item['productId'])
                else:
                    product = NonProduct.query.get(item['productId'])
                if product:
                    old_stock = float(product.current_stock or 0)
                    operation_id = uuid.uuid4().hex
                    stock_audit_log(
                        "current_stock_override_started",
                        operation_id=operation_id,
                        product_id=item['productId'],
                        product_type=item['productType'],
                        previous_stock=old_stock,
                        requested_stock=qty,
                        movement_type="closing_stock_adjustment",
                        reference_type="closing_stock",
                        reference_id=entry.id,
                        business_date=str(date),
                        user_id=get_jwt_identity(),
                    )
                    product.current_stock = qty
                    stock_audit_log(
                        "current_stock_override_applied",
                        operation_id=operation_id,
                        product_id=item['productId'],
                        product_type=item['productType'],
                        previous_stock=old_stock,
                        new_stock=qty,
                        quantity_change=qty - old_stock,
                        movement_type="closing_stock_adjustment",
                        reference_type="closing_stock",
                        reference_id=entry.id,
                        business_date=str(date),
                        transaction_state="pending_commit",
                    )

                    movement = StockMovement(
                        product_id=item['productId'],
                        product_type=item['productType'],
                        movement_type='closing_stock_adjustment',
                        quantity=qty - old_stock,
                        reference_id=entry.id,
                        reference_type='closing_stock',
                        previous_stock=old_stock,
                        new_stock=qty,
                        movement_date=date,
                        remarks=f"Closing stock override for {date}",
                        created_by=None
                    )
                    db.session.add(movement)

        db.session.commit()
        return jsonify({"success": True}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route('/api/closing-stock/delete', methods=['POST'])
@jwt_required()
def delete_closing_stock_entry():
    try:
        data = request.get_json()
        date_str = data.get('date')
        product_id = data.get('productId')
        product_type = data.get('productType')
        user_id = get_jwt_identity()

        if not all([date_str, product_id, product_type]):
            return jsonify({"error": "Missing required fields"}), 400

        date = datetime.strptime(date_str, "%Y-%m-%d").date()

        # Find the closing stock record
        closing_stock = ClosingStock.query.filter_by(
            product_id=product_id,
            product_type=product_type,
            date=date
        ).first()

        if not closing_stock:
            return jsonify({"error": "Closing stock entry not found"}), 404

        # Find the adjustment movement(s) belonging to this ClosingStock row.
        # New saves carry the row ID. The date/product fallback supports rows
        # created before E6 was fixed, which used a NULL reference_id.
        movement_query = StockMovement.query.filter(
            StockMovement.product_id == product_id,
            StockMovement.product_type == product_type,
            StockMovement.reference_type == 'closing_stock',
            StockMovement.movement_type == 'closing_stock_adjustment'
        )
        linked_movements = movement_query.filter(
            StockMovement.reference_id == closing_stock.id
        ).all()
        if not linked_movements:
            linked_movements = movement_query.filter(
                StockMovement.reference_id.is_(None),
                StockMovement.movement_date == date
            ).order_by(StockMovement.id.asc()).all()

        if linked_movements:
            # Reverse the total recorded delta using the normal stock helper.
            # This preserves the existing direct-overwrite save behavior while
            # making deletion restore the pre-save stock snapshot.
            reversed_delta = -sum(safe_float(m.quantity) for m in linked_movements)
            if abs(reversed_delta) > 0.001:
                success, result = update_product_stock(
                    product_id=product_id,
                    product_type=product_type,
                    quantity_change=reversed_delta,
                    movement_type='closing_stock_reversal',
                    reference_id=closing_stock.id,
                    reference_type='closing_stock_reversal',
                    remarks=f"Reversed closing stock adjustment for {date_str}",
                    user_id=user_id,
                    movement_date=date
                )
                if not success:
                    return jsonify({"error": f"Failed to reverse closing stock: {result}"}), 400

            for movement in linked_movements:
                db.session.delete(movement)

        # Delete the closing stock entry
        db.session.delete(closing_stock)
        db.session.commit()
        return jsonify({"success": True}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route('/api/stock/closing', methods=['GET'])
def get_closing_stock():
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({"error": "Missing date parameter"}), 400
    try:
        # Parse the date (assume format YYYY-MM-DD)
        date = datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        return jsonify({"error": "Invalid date format"}), 400

    closing_stock = []

    # Regular products
    regular_products = RegularProduct.query.all()
    for product in regular_products:
        # Find the last movement on or before the requested business date.
        movement = StockMovement.query.filter(
            StockMovement.product_id == product.id,
            StockMovement.product_type == 'regular',
            _movement_business_date_filter(to_date=date.replace(hour=23, minute=59, second=59, microsecond=999999))
        ).order_by(
            StockMovement.movement_date.desc(),
            StockMovement.created_at.desc(),
            StockMovement.id.desc()
        ).first()
        if movement:
            stock = movement.new_stock
        else:
            stock = product.initial_stock or 0
        closing_stock.append({
            'id': product.id,
            'productCode': product.product_code,
            'description': product.description,
            'productType': 'regular',
            'closingStock': stock,
            'reorderLevel': product.reorder_level,
            'unitOfSale': product.unit_of_sale,
            'location': product.location
        })

    # Non products
    non_products = NonProduct.query.all()
    for product in non_products:
        movement = StockMovement.query.filter(
            StockMovement.product_id == product.id,
            StockMovement.product_type == 'non',
            _movement_business_date_filter(to_date=date.replace(hour=23, minute=59, second=59, microsecond=999999))
        ).order_by(
            StockMovement.movement_date.desc(),
            StockMovement.created_at.desc(),
            StockMovement.id.desc()
        ).first()
        if movement:
            stock = movement.new_stock
        else:
            stock = product.initial_stock or 0
        closing_stock.append({
            'id': product.id,
            'productCode': product.product_code,
            'description': product.description,
            'productType': 'non',
            'closingStock': stock,
            'reorderLevel': product.reorder_level,
            'unitOfSale': product.unit_of_sale,
            'location': product.location
        })

    return jsonify(closing_stock), 200

@app.route('/api/admin/cleanup-duplicate-movements', methods=['POST'])
@jwt_required()
def cleanup_duplicate_movements():
    """Admin endpoint to clean up duplicate stock movements"""
    try:
        # Get all sales with stock movements
        sales_with_movements = db.session.query(Sale.id).join(
            StockMovement, StockMovement.reference_id == Sale.id
        ).filter(
            StockMovement.reference_type == 'sale'
        ).distinct().all()
        
        cleaned_count = 0
        for (sale_id,) in sales_with_movements:
            if cleanup_sale_stock_movements(sale_id):
                cleaned_count += 1
        
        db.session.commit()
        
        return jsonify({
            "message": f"Cleaned up duplicate movements for {cleaned_count} sales",
            "total_sales_processed": len(sales_with_movements)
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/stock-movements/<int:sale_id>', methods=['GET'])
@jwt_required()
def get_sale_stock_movements(sale_id):
    """Debug endpoint to view stock movements for a specific sale"""
    try:
        movements = StockMovement.query.filter(
            StockMovement.reference_id == sale_id,
            StockMovement.reference_type == 'sale'
        ).order_by(StockMovement.created_at.desc()).all()
        
        # Also get the sale details for context
        sale = Sale.query.get(sale_id)
        sale_info = None
        if sale:
            sale_info = {
                'id': sale.id,
                'invoice_number': sale.invoice_number,
                'status': sale.status,
                'date': sale.date.isoformat() if sale.date else None,
                'items': [{
                    'product_id': item.product_id,
                    'non_product_id': item.non_product_id,
                    'quantity': safe_float(item.quantity),
                    'unit_price': safe_float(item.unit_price),
                    'total_price': safe_float(item.total_price)
                } for item in sale.items]
            }
        
        return jsonify({
            'sale': sale_info,
            'movements': [{
                'id': m.id,
                'product_id': m.product_id,
                'product_type': m.product_type,
                'movement_type': m.movement_type,
                'quantity': safe_float(m.quantity),
                'previous_stock': safe_float(m.previous_stock),
                'new_stock': safe_float(m.new_stock),
                'remarks': m.remarks,
                'created_at': m.created_at.isoformat() if m.created_at else None
            } for m in movements]
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/test-stock-update/<int:sale_id>', methods=['POST'])
@jwt_required()
def test_stock_update(sale_id):
    """Test endpoint to manually trigger stock update for a sale"""
    try:
        data = request.get_json()
        product_id = data.get('product_id')
        product_type = data.get('product_type', 'regular')
        quantity_change = data.get('quantity_change', 0)
        
        if not product_id or quantity_change == 0:
            return jsonify({"error": "product_id and quantity_change are required"}), 400
        
        user_id = get_jwt_identity()
        
        success, result = update_product_stock(
            product_id=product_id,
            product_type=product_type,
            quantity_change=safe_float(quantity_change),
            movement_type='sale_adjustment',
            reference_id=sale_id,
            reference_type='sale',
            remarks=f"Manual test stock update for sale {sale_id}",
            user_id=user_id
        )
        
        if success:
            db.session.commit()
            return jsonify({
                "message": "Stock update successful",
                "new_stock": result
            }), 200
        else:
            db.session.rollback()
            return jsonify({"error": f"Stock update failed: {result}"}), 400
            
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/debug-sale-update/<int:sale_id>', methods=['POST'])
@jwt_required()
def debug_sale_update(sale_id):
    """Debug endpoint to test the sale update logic without actually updating"""
    try:
        data = request.get_json()
        
        # Get the current sale
        sale = Sale.query.get(sale_id)
        if not sale:
            return jsonify({"error": "Sale not found"}), 404
        
        # Simulate the quantity change detection logic
        old_items_detailed = {}
        for item in sale.items:
            key = (item.product_id, item.non_product_id)
            old_items_detailed[key] = safe_float(item.quantity)
        
        new_items_detailed = {}
        for item_data in data.get('items', []):
            key = (item_data.get('product_id'), item_data.get('non_product_id'))
            new_items_detailed[key] = safe_float(item_data.get('quantity', 0))
        
        # Calculate quantity changes
        quantity_changes = {}
        all_product_keys = set(old_items_detailed.keys()) | set(new_items_detailed.keys())
        
        for key in all_product_keys:
            old_qty = old_items_detailed.get(key, 0)
            new_qty = new_items_detailed.get(key, 0)
            if abs(old_qty - new_qty) > 0.001:
                change = new_qty - old_qty
                quantity_changes[key] = change
        
        return jsonify({
            "sale_id": sale_id,
            "sale_status": sale.status,
            "old_items": old_items_detailed,
            "new_items": new_items_detailed,
            "quantity_changes": quantity_changes,
            "would_update_stock": len(quantity_changes) > 0 and sale.status == 'finalized'
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _get_stock_check_values(regular_ids, non_ids, from_dt, to_dt):
    """Load stock-check quantities with grouped queries instead of per-product lookups."""
    values = {
        'opening': {},
        'purchases': {},
        'sales': {},
        'customer_returns': {},
        'dumps': {},
        'supplier_returns': {},
        'closing': {},
    }

    def product_scope(product_id_column, product_type_column):
        conditions = []
        if regular_ids:
            conditions.append(and_(
                product_type_column == 'regular',
                product_id_column.in_(regular_ids),
            ))
        if non_ids:
            conditions.append(and_(
                product_type_column == 'non',
                product_id_column.in_(non_ids),
            ))
        return or_(*conditions) if conditions else None

    scope = product_scope(ClosingStock.product_id, ClosingStock.product_type)
    if scope is None:
        return values

    from_day = from_dt.date()
    to_day = to_dt.date()

    # Opening stock uses the latest day with any closing-stock entries in the
    # previous seven days; products omitted on that active day start at zero.
    opening_date = db.session.query(func.max(ClosingStock.date)).filter(
        ClosingStock.date >= from_day - timedelta(days=7),
        ClosingStock.date < from_day,
    ).scalar()
    if opening_date:
        opening_rows = db.session.query(
            ClosingStock.product_id,
            ClosingStock.product_type,
            ClosingStock.quantity,
        ).filter(
            ClosingStock.date == opening_date,
            scope,
        ).all()
        for product_id, product_type, quantity in opening_rows:
            values['opening'].setdefault(
                (product_id, product_type), safe_float(quantity)
            )

    closing_rows = db.session.query(
        ClosingStock.product_id,
        ClosingStock.product_type,
        ClosingStock.quantity,
    ).filter(
        ClosingStock.date == to_day,
        scope,
    ).all()
    for product_id, product_type, quantity in closing_rows:
        values['closing'].setdefault(
            (product_id, product_type), safe_float(quantity)
        )

    movement_scope = product_scope(
        StockMovement.product_id, StockMovement.product_type
    )
    movement_date_filter = _movement_business_date_filter(from_dt, to_dt)
    purchase_rows = db.session.query(
        StockMovement.product_id,
        StockMovement.product_type,
        func.sum(case(
            (
                and_(
                    StockMovement.movement_type == 'purchase',
                    StockMovement.quantity > 0,
                ),
                StockMovement.quantity,
            ),
            (
                and_(
                    StockMovement.movement_type == 'purchase_reversal',
                    StockMovement.quantity < 0,
                ),
                StockMovement.quantity,
            ),
            else_=0,
        )),
    ).filter(
        movement_scope,
        StockMovement.movement_type.in_(['purchase', 'purchase_reversal']),
        movement_date_filter,
    ).group_by(
        StockMovement.product_id,
        StockMovement.product_type,
    ).all()
    values['purchases'] = {
        (product_id, product_type): max(0, safe_float(quantity))
        for product_id, product_type, quantity in purchase_rows
    }

    sale_conditions = []
    if regular_ids:
        sale_conditions.append(SaleItem.product_id.in_(regular_ids))
    if non_ids:
        sale_conditions.append(SaleItem.non_product_id.in_(non_ids))
    if sale_conditions:
        sale_rows = db.session.query(
            SaleItem.product_id,
            SaleItem.non_product_id,
            func.sum(SaleItem.quantity),
        ).join(
            Sale, SaleItem.sale_id == Sale.id
        ).filter(
            or_(*sale_conditions),
            SaleItem.quantity > 0,
            Sale.date >= from_dt,
            Sale.date <= to_dt,
            Sale.status == 'finalized',
        ).group_by(
            SaleItem.product_id,
            SaleItem.non_product_id,
        ).all()
        for product_id, non_product_id, quantity in sale_rows:
            if product_id is not None:
                values['sales'][(product_id, 'regular')] = safe_float(quantity)
            if non_product_id is not None:
                values['sales'][(non_product_id, 'non')] = safe_float(quantity)

    customer_return_scope = product_scope(
        CustomerReturn.product_id, CustomerReturn.product_type
    )
    customer_return_rows = db.session.query(
        CustomerReturn.product_id,
        CustomerReturn.product_type,
        func.sum(CustomerReturn.quantity),
    ).filter(
        customer_return_scope,
        CustomerReturn.date >= from_day,
        CustomerReturn.date <= to_day,
        CustomerReturn.status == 'completed',
        CustomerReturn.quantity > 0,
    ).group_by(
        CustomerReturn.product_id,
        CustomerReturn.product_type,
    ).all()
    values['customer_returns'] = {
        (product_id, product_type): safe_float(quantity)
        for product_id, product_type, quantity in customer_return_rows
    }

    dump_scope = product_scope(DumpEntry.product_id, DumpEntry.product_type)
    dump_rows = db.session.query(
        DumpEntry.product_id,
        DumpEntry.product_type,
        func.sum(func.abs(DumpEntry.quantity)),
    ).filter(
        dump_scope,
        DumpEntry.date >= from_day,
        DumpEntry.date <= to_day,
    ).group_by(
        DumpEntry.product_id,
        DumpEntry.product_type,
    ).all()
    values['dumps'] = {
        (product_id, product_type): max(0, safe_float(quantity))
        for product_id, product_type, quantity in dump_rows
    }

    supplier_return_scope = product_scope(
        SupplierReturn.product_id, SupplierReturn.product_type
    )
    supplier_return_rows = db.session.query(
        SupplierReturn.product_id,
        SupplierReturn.product_type,
        func.sum(SupplierReturn.quantity),
    ).filter(
        supplier_return_scope,
        SupplierReturn.date >= from_day,
        SupplierReturn.date <= to_day,
    ).group_by(
        SupplierReturn.product_id,
        SupplierReturn.product_type,
    ).all()
    values['supplier_returns'] = {
        (product_id, product_type): safe_float(quantity)
        for product_id, product_type, quantity in supplier_return_rows
    }

    return values


@app.route('/api/reports/stock-check', methods=['GET'])
@jwt_required()
def stock_check_report():
    """Generate stock check report between two dates"""
    report_id = uuid.uuid4().hex
    started_at = time.monotonic()
    try:
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        search = request.args.get('search', '')
        
        if not from_date or not to_date:
            stock_audit_log(
                "stock_check_rejected",
                level=logging.WARNING,
                report_id=report_id,
                reason="missing_date_range",
                from_date=from_date,
                to_date=to_date,
            )
            return jsonify({'error': 'fromDate and toDate are required'}), 400
        
        # Parse dates and make them inclusive for the full day
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        # Set to_dt to end of day (23:59:59) to include the entire day
        to_dt = datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, microsecond=999999)
        
        print(f"[DEBUG] Stock check report: from_dt={from_dt}, to_dt={to_dt}")

        # Rebuild log-once dedup state so a restart doesn't re-log open
        # discrepancies. One line per product per business date until resolved.
        _hydrate_logged_discrepancy_keys(to_date)

        # Get all active products (regular and non)
        regular_products = RegularProduct.query.filter(RegularProduct.status == 'active').all()
        non_products = NonProduct.query.filter(NonProduct.status == 'active').all()
        if search:
            search_lower = search.lower()
            regular_products = [
                product for product in regular_products
                if search_lower in (product.description or '').lower()
            ]
            non_products = [
                product for product in non_products
                if search_lower in (product.description or '').lower()
            ]

        stock_values = _get_stock_check_values(
            [product.id for product in regular_products],
            [product.id for product in non_products],
            from_dt,
            to_dt,
        )

        stock_check_data = []

        # Process regular products
        for product in regular_products:
            try:
                key = (product.id, 'regular')
                opening_stock = stock_values['opening'].get(key, 0)
                new_stock = stock_values['purchases'].get(key, 0)
                sales = stock_values['sales'].get(key, 0)
                customer_returns = stock_values['customer_returns'].get(key, 0)
                dumps = stock_values['dumps'].get(key, 0)
                supplier_returns = stock_values['supplier_returns'].get(key, 0)
                
                # Calculate expected stock
                expected_stock = opening_stock + new_stock - sales + customer_returns - dumps - supplier_returns
                
                # Get actual closing stock
                actual_closing_stock = stock_values['closing'].get(key, 0)
                
                difference = actual_closing_stock - expected_stock
                difference = round(difference, 2)
                current_stock = safe_float(product.current_stock)
                current_stock_difference = round(current_stock - expected_stock, 2)

                # Discrepancy-only logging: one line when a discrepancy first
                # appears (with the last operation that may have caused it),
                # then silence until closing stock resolves it.
                if difference != 0 or current_stock_difference != 0:
                    log_stock_discrepancy_once(
                        report_id,
                        product.id,
                        "regular",
                        product.description,
                        to_date,
                        {
                            "opening_stock": round(opening_stock, 2),
                            "new_stock": round(new_stock, 2),
                            "sales": round(sales, 2),
                            "customer_returns": round(customer_returns, 2),
                            "dumps": round(dumps, 2),
                            "supplier_returns": round(supplier_returns, 2),
                            "expected_stock": round(expected_stock, 2),
                            "closing_stock": round(actual_closing_stock, 2),
                            "difference": difference,
                            "current_stock": current_stock,
                            "current_stock_difference": current_stock_difference,
                        },
                        to_dt,
                    )
                else:
                    log_stock_discrepancy_resolved_if_needed(
                        report_id,
                        product.id,
                        "regular",
                        to_date,
                        closing_stock=round(actual_closing_stock, 2),
                        current_stock=current_stock,
                    )

                if difference == 0:
                    result = "✓"
                    status = "correct"
                elif difference < 0:
                    result = f"short {abs(difference)}"
                    status = "short"
                else:
                    result = f"extra {difference}"
                    status = "excess"

                stock_check_data.append({
                    'id': product.id,
                    'productDescription': product.description,
                    'os': round(opening_stock, 2),
                    'ns': round(new_stock, 2),
                    'sales': round(sales, 2),
                    'crtn': round(customer_returns, 2),
                    'dmps': round(dumps, 2),
                    'srtn': round(supplier_returns, 2),
                    'stock': round(expected_stock, 2),
                    'clStock': round(actual_closing_stock, 2),
                    'result': result,
                    'status': status,
                    'productType': 'regular'
                })
            except Exception as e:
                stock_audit_log(
                    "stock_check_row_failed",
                    level=logging.ERROR,
                    report_id=report_id,
                    product_id=product.id,
                    product_type="regular",
                    error=str(e),
                )
                print(f"[ERROR] Error processing regular product {product.id}: {str(e)}")
                print(f"[ERROR] Traceback: {traceback.format_exc()}")
                continue
        
        # Process non-products
        for product in non_products:
            try:
                key = (product.id, 'non')
                opening_stock = stock_values['opening'].get(key, 0)
                new_stock = stock_values['purchases'].get(key, 0)
                sales = stock_values['sales'].get(key, 0)
                customer_returns = stock_values['customer_returns'].get(key, 0)
                dumps = stock_values['dumps'].get(key, 0)
                supplier_returns = stock_values['supplier_returns'].get(key, 0)
                
                # Calculate expected stock
                expected_stock = opening_stock + new_stock - sales + customer_returns - dumps - supplier_returns
                
                # Get actual closing stock
                actual_closing_stock = stock_values['closing'].get(key, 0)
                
                difference = actual_closing_stock - expected_stock
                difference = round(difference, 2)
                current_stock = safe_float(product.current_stock)
                current_stock_difference = round(current_stock - expected_stock, 2)

                # Discrepancy-only logging (see regular-products loop above).
                if difference != 0 or current_stock_difference != 0:
                    log_stock_discrepancy_once(
                        report_id,
                        product.id,
                        "non",
                        product.description,
                        to_date,
                        {
                            "opening_stock": round(opening_stock, 2),
                            "new_stock": round(new_stock, 2),
                            "sales": round(sales, 2),
                            "customer_returns": round(customer_returns, 2),
                            "dumps": round(dumps, 2),
                            "supplier_returns": round(supplier_returns, 2),
                            "expected_stock": round(expected_stock, 2),
                            "closing_stock": round(actual_closing_stock, 2),
                            "difference": difference,
                            "current_stock": current_stock,
                            "current_stock_difference": current_stock_difference,
                        },
                        to_dt,
                    )
                else:
                    log_stock_discrepancy_resolved_if_needed(
                        report_id,
                        product.id,
                        "non",
                        to_date,
                        closing_stock=round(actual_closing_stock, 2),
                        current_stock=current_stock,
                    )

                if difference == 0:
                    result = "✓"
                    status = "correct"
                elif difference < 0:
                    result = f"short {abs(difference)}"
                    status = "short"
                else:
                    result = f"extra {difference}"
                    status = "excess"

                stock_check_data.append({
                    'id': product.id,
                    'productDescription': product.description,
                    'os': round(opening_stock, 2),
                    'ns': round(new_stock, 2),
                    'sales': round(sales, 2),
                    'crtn': round(customer_returns, 2),
                    'dmps': round(dumps, 2),
                    'srtn': round(supplier_returns, 2),
                    'stock': round(expected_stock, 2),
                    'clStock': round(actual_closing_stock, 2),
                    'result': result,
                    'status': status,
                    'productType': 'non'
                })
            except Exception as e:
                stock_audit_log(
                    "stock_check_row_failed",
                    level=logging.ERROR,
                    report_id=report_id,
                    product_id=product.id,
                    product_type="non",
                    error=str(e),
                )
                print(f"[ERROR] Error processing non-product {product.id}: {str(e)}")
                print(f"[ERROR] Traceback: {traceback.format_exc()}")
                continue
        
        # Sort by product description
        stock_check_data.sort(key=lambda x: x['productDescription'])
        
        # Add serial numbers
        for i, item in enumerate(stock_check_data, 1):
            item['slNo'] = i

        return jsonify(stock_check_data), 200
        
    except Exception as e:
        stock_audit_log(
            "stock_check_failed",
            level=logging.ERROR,
            report_id=report_id,
            error=str(e),
            elapsed_ms=round((time.monotonic() - started_at) * 1000, 2),
        )
        print(f"[ERROR] Exception in stock_check_report: {str(e)}")
        print(f"[ERROR] Full traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

def get_opening_stock(product_id, product_type, from_date):
    """Get stock level at the beginning of from_date.

    Walk backwards day by day, up to 7 days. For each day:
      - If that day had ANY closing stock entries → active closing day.
        Return the product's exact entry, or 0 if it was skipped.
      - If that day had ZERO closing stock entries → holiday/skipped.
        Continue falling back to the next day.
    If nothing found within 7 days, return 0.
    """
    try:
        if isinstance(from_date, datetime):
            from_date_only = from_date.date()
        else:
            from_date_only = from_date

        for days_back in range(1, 8):
            check_date = (from_date_only - timedelta(days=days_back))

            if ClosingStock.query.filter_by(date=check_date).count() > 0:
                # Active closing day — exact match or skipped
                entry = ClosingStock.query.filter_by(
                    product_id=product_id, product_type=product_type, date=check_date
                ).first()
                return safe_float(entry.quantity) if entry else 0.0

            # No entries → holiday, continue looking back

        return 0.0
    except Exception as e:
        print(f"[ERROR] get_opening_stock failed: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return 0.0


# Movement-type families used by update_sale / delete_sale reconciliation.
# Kept here even though the stock-check helpers read entity tables directly.
_SALE_FAMILY = ['sale', 'sale_cancellation', 'sale_adjustment']
_RETURN_FAMILY = ['customer_return', 'customer_return_cancellation',
                  'customer_return_adjustment', 'customer_return_rejection']


def _get_sale_stock_movements(sale_id):
    """Return all stock-effect movements belonging to a sale.

    Negative sale lines create a CustomerReturn row and the original movement
    is relinked to that row. Include those linked rows as well as movements
    still directly referenced by the sale so cancel, delete, and edit paths
    reverse the complete sale effect.
    """
    auto_return_ids = [row[0] for row in db.session.query(CustomerReturn.id).filter(
        CustomerReturn.sale_id == sale_id,
        CustomerReturn.return_reason == 'Return via negative quantity sale'
    ).all()]
    sale_reference = and_(
        StockMovement.reference_id == sale_id,
        StockMovement.reference_type == 'sale'
    )
    linked_return_reference = and_(
        StockMovement.reference_type == 'customer_return',
        StockMovement.reference_id.in_(auto_return_ids)
    ) if auto_return_ids else None
    reference_filter = or_(sale_reference, linked_return_reference) if linked_return_reference is not None else sale_reference
    return StockMovement.query.filter(
        reference_filter,
        StockMovement.movement_type.in_(_SALE_FAMILY + _RETURN_FAMILY)
    ).all()


def _relink_negative_sale_return_movement(sale_id, customer_return):
    """Relink the newest still-sale-referenced negative-line movement."""
    movement = StockMovement.query.filter_by(
        reference_id=sale_id,
        reference_type='sale',
        product_id=customer_return.product_id,
        product_type=customer_return.product_type,
        movement_type='customer_return'
    ).order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).first()
    if movement:
        movement.reference_id = customer_return.id
        movement.reference_type = 'customer_return'
    return movement


def _movement_business_date_filter(from_date=None, to_date=None):
    """Filter stock movements by business date, with legacy NULL-date fallback.

    All new stock movements should carry movement_date. Existing rows created
    before that field was populated may have NULL movement_date, so their system
    timestamp is used only as a compatibility fallback rather than as the
    primary business-date field.
    """
    def as_day(value):
        return value.date() if isinstance(value, datetime) else value

    from_day = as_day(from_date) if from_date is not None else None
    to_day = as_day(to_date) if to_date is not None else None
    business_conditions = []
    legacy_conditions = [StockMovement.movement_date.is_(None)]

    if from_day is not None:
        business_conditions.append(StockMovement.movement_date >= from_day)
        legacy_start = from_date if isinstance(from_date, datetime) else datetime.combine(from_day, time.min)
        legacy_conditions.append(StockMovement.created_at >= legacy_start)
    if to_day is not None:
        business_conditions.append(StockMovement.movement_date <= to_day)
        legacy_end = to_date if isinstance(to_date, datetime) else datetime.combine(to_day, time.max)
        legacy_conditions.append(StockMovement.created_at <= legacy_end)

    conditions = []
    if business_conditions:
        conditions.append(and_(*business_conditions))
    if len(legacy_conditions) > 1:
        conditions.append(and_(*legacy_conditions))
    return or_(*conditions) if conditions else None


def get_new_stock(product_id, product_type, from_date, to_date):
    """Get new stock (purchases) between business dates."""
    try:
        date_filter = _movement_business_date_filter(from_date, to_date)
        movements = db.session.query(StockMovement).filter(
            StockMovement.product_id == product_id,
            StockMovement.product_type == product_type,
            StockMovement.movement_type.in_(['purchase', 'purchase_reversal']),
            date_filter
        ).all()

        total = 0
        for movement in movements:
            quantity = safe_float(movement.quantity)
            if movement.movement_type == 'purchase' and quantity > 0:
                total += quantity
            elif movement.movement_type == 'purchase_reversal' and quantity < 0:
                total += quantity  # negative, reduces total

        return max(0, total)
    except Exception as e:
        print(f"[ERROR] Error getting new stock: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return 0

def get_sales_quantity(product_id, product_type, from_date, to_date):
    """Get sales quantity between dates - calculate from actual sale items instead of stock movements"""
    try:
        # Calculate sales directly from sale items to avoid duplicate movement issues
        if product_type == 'regular':
            # Query regular product sales
            sales_items = db.session.query(SaleItem).join(
                Sale, SaleItem.sale_id == Sale.id
            ).filter(
                SaleItem.product_id == product_id,
                Sale.date >= from_date,
                Sale.date <= to_date,
                Sale.status == 'finalized'  # Only count finalized sales
            ).all()
        else:
            # Query non-product sales
            sales_items = db.session.query(SaleItem).join(
                Sale, SaleItem.sale_id == Sale.id
            ).filter(
                SaleItem.non_product_id == product_id,
                Sale.date >= from_date,
                Sale.date <= to_date,
                Sale.status == 'finalized'  # Only count finalized sales
            ).all()
        
        # Sum up quantities — count only positive sale items (gross sales)
        # Negative quantity items (inline credit returns) are captured separately
        # by get_customer_returns_quantity via Fix 4 (StockMovement reference updated)
        total = sum(abs(safe_float(item.quantity)) for item in sales_items if item.quantity > 0)
        
        # Net sales = gross positive sales only (do NOT subtract negative items here)
        # Negative items are counted as customer returns, not deducted from sales
        net_sales = total
        
        return max(0, net_sales)  # Ensure non-negative result
    except Exception as e:
        print(f"[ERROR] Error getting sales quantity: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return 0

def get_customer_returns_quantity(product_id, product_type, from_date, to_date):
    """Get customer returns between dates — query CustomerReturn directly (like get_sales_quantity)"""
    try:
        returns = CustomerReturn.query.filter(
            CustomerReturn.product_id == product_id,
            CustomerReturn.product_type == product_type,
            CustomerReturn.date >= from_date.date(),
            CustomerReturn.date <= to_date.date(),
            CustomerReturn.status == 'completed'
        ).all()
        total = sum(safe_float(ret.quantity) for ret in returns if ret.quantity > 0)
        return total
    except Exception as e:
        print(f"[ERROR] Error getting customer returns: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return 0

def get_dumps_quantity(product_id, product_type, from_date, to_date):
    """Get dumps/wastage between dates — query DumpEntry directly"""
    try:
        dumps = DumpEntry.query.filter(
            DumpEntry.product_id == product_id,
            DumpEntry.product_type == product_type,
            DumpEntry.date >= from_date.date(),
            DumpEntry.date <= to_date.date()
        ).all()
        total = sum(abs(safe_float(d.quantity)) for d in dumps)
        return max(0, total)
    except Exception as e:
        print(f"[ERROR] Error getting dumps quantity: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return 0

def get_supplier_returns_quantity(product_id, product_type, from_date, to_date):
    """Get supplier returns between dates — query SupplierReturn directly"""
    try:
        returns = SupplierReturn.query.filter(
            SupplierReturn.product_id == product_id,
            SupplierReturn.product_type == product_type,
            SupplierReturn.date >= from_date.date(),
            SupplierReturn.date <= to_date.date()
        ).all()
        total = sum(safe_float(r.quantity) for r in returns)
        return total
    except Exception as e:
        print(f"[ERROR] Error getting supplier returns: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return 0

# Expense Entry routes
@app.route('/api/expense-entries', methods=['GET'])
@jwt_required()
def get_expense_entries():
    """Get expense entries with optional filtering"""
    try:
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        search = request.args.get('search', '')
        
        query = ExpenseEntry.query
        
        # Filter by date range
        if from_date:
            query = query.filter(ExpenseEntry.date >= from_date)
        if to_date:
            query = query.filter(ExpenseEntry.date <= to_date)
        
        # Search by description, supplier name, or expense category
        if search:
            query = query.join(Supplier).join(Expense).filter(
                or_(
                    ExpenseEntry.invoice_number.ilike(f'%{search}%'),
                    ExpenseEntry.remarks.ilike(f'%{search}%'),
                    Supplier.supplier_name.ilike(f'%{search}%'),
                    Expense.expense_name.ilike(f'%{search}%')
                )
            )
        
        expense_entries = query.order_by(ExpenseEntry.date.desc()).all()
        return jsonify([entry.to_dict() for entry in expense_entries]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/reports/stock-template', methods=['GET'])
@jwt_required()
def stock_template_report():
    """Get all products with stock for stock template print"""
    try:
        show_positive_only = request.args.get('showPositiveOnly', 'true') == 'true'

        # Get all active regular products
        regular_products = db.session.query(RegularProduct).filter(
            RegularProduct.status == 'active'
        ).all()
        
        # Get all active non-products
        non_products = db.session.query(NonProduct).filter(
            NonProduct.status == 'active'
        ).all()
        
        stock_items = []
        
        # Process regular products
        for product in regular_products:
            latest_movement = StockMovement.query.filter_by(
                product_id=product.id,
                product_type='regular'
            ).order_by(StockMovement.created_at.desc()).first()
            
            current_stock = latest_movement.new_stock if latest_movement else (product.initial_stock or 0)
            
            if current_stock == 0:
                continue
            
            if show_positive_only and current_stock < 0:
                continue
            
            stock_items.append({
                'id': product.id,
                'productCode': product.product_code,
                'description': product.description,
                'currentStock': float(current_stock),
                'type': 'regular'
            })
        
        # Process non-products
        for product in non_products:
            latest_movement = StockMovement.query.filter_by(
                product_id=product.id,
                product_type='non'
            ).order_by(StockMovement.created_at.desc()).first()
            
            current_stock = latest_movement.new_stock if latest_movement else (product.initial_stock or 0)
            
            if current_stock == 0:
                continue
            
            if show_positive_only and current_stock < 0:
                continue
            
            stock_items.append({
                'id': product.id,
                'productCode': product.product_code,
                'description': product.description,
                'currentStock': float(current_stock),
                'type': 'non'
            })
        
        # Sort by product description
        stock_items.sort(key=lambda x: x['description'])
        
        return jsonify(stock_items), 200
        
    except Exception as e:
        print(f"[ERROR] Exception in stock_template_report: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/expense-entries', methods=['POST'])
@jwt_required()
def create_expense_entry():
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        # Use business date
        business_date = get_business_date()
        # Generate reference number
        last_entry = ExpenseEntry.query.order_by(ExpenseEntry.id.desc()).first()
        ref_number = f"E{1 if not last_entry else last_entry.id + 1:04d}"
        # Calculate total amount
        amount = float(data.get('amount', 0))
        vat_amount = float(data.get('vatAmount', 0))
        total_amount = amount + vat_amount
        expense_entry_data = ExpenseEntrySchema(**{
            **data,
            'refNumber': ref_number,
            'totalAmount': total_amount,
            'date': business_date
        })
        expense_entry = ExpenseEntry(
            ref_number=ref_number,
            date=business_date,
            supplier_id=expense_entry_data.supplierId,
            expense_id=expense_entry_data.expenseId,
            description="",  # Temporary empty string until DB migration
            invoice_number=expense_entry_data.invoiceNumber,
            remarks=expense_entry_data.remarks,
            payment_mode=expense_entry_data.paymentMode,
            amount=amount,
            vat_amount=vat_amount,
            total_amount=total_amount,
            created_by=user_id
        )
        db.session.add(expense_entry)
        db.session.commit()
        return jsonify(expense_entry.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/expense-entries/<int:id>', methods=['PUT'])
@jwt_required()
def update_expense_entry(id):
    """Update an expense entry"""
    try:
        data = request.get_json()
        expense_entry = ExpenseEntry.query.get_or_404(id)
        
        # Calculate total amount
        amount = float(data.get('amount', 0))
        vat_amount = float(data.get('vatAmount', 0))
        total_amount = amount + vat_amount
        
        # Update fields
        expense_entry.date = datetime.strptime(data['date'], "%Y-%m-%d").date()
        expense_entry.supplier_id = data.get('supplierId')
        expense_entry.expense_id = data['expenseId']
        expense_entry.invoice_number = data.get('invoiceNumber')
        expense_entry.remarks = data.get('remarks')
        expense_entry.payment_mode = data['paymentMode']
        expense_entry.amount = amount
        expense_entry.vat_amount = vat_amount
        expense_entry.total_amount = total_amount
        
        db.session.commit()
        return jsonify(expense_entry.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/expense-entries/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_expense_entry(id):
    """Delete an expense entry"""
    try:
        expense_entry = ExpenseEntry.query.get_or_404(id)
        db.session.delete(expense_entry)
        db.session.commit()
        return jsonify({"message": "Expense entry deleted successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

# Dump Entry routes
@app.route('/api/dump-entries', methods=['GET'])
@jwt_required()
def get_dump_entries():
    """Get dump entries with optional filtering"""
    try:
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        supplier_id = request.args.get('supplierId', type=int)
        search = request.args.get('search', '')
        
        query = DumpEntry.query
        
        # Filter by date range
        if from_date:
            query = query.filter(DumpEntry.date >= from_date)
        if to_date:
            query = query.filter(DumpEntry.date <= to_date)
        
        # Filter by supplier
        if supplier_id:
            query = query.filter(DumpEntry.supplier_id == supplier_id)
        
        # Search by description or remarks
        if search:
            query = query.filter(
                or_(
                    DumpEntry.description.ilike(f'%{search}%'),
                    DumpEntry.remarks.ilike(f'%{search}%')
                )
            )
        
        dump_entries = query.order_by(DumpEntry.date.desc()).all()
        return jsonify([entry.to_dict() for entry in dump_entries]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/dump-entries', methods=['POST'])
@jwt_required()
def create_dump_entry():
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        # Use provided date or fall back to business date
        business_date = get_business_date()
        entry_date = business_date
        if data.get('date'):
            try:
                entry_date = datetime.strptime(data['date'], "%Y-%m-%d").date()
            except Exception:
                entry_date = business_date
        # Generate reference number
        last_entry = DumpEntry.query.order_by(DumpEntry.id.desc()).first()
        ref_number = f"D{1 if not last_entry else last_entry.id + 1:04d}"
        # Calculate total value
        quantity = float(data.get('quantity', 0))
        unit_price = float(data.get('unitPrice', 0))
        total_value = quantity * unit_price
        dump_entry_data = DumpEntrySchema(**{
            **data,
            'refNumber': ref_number,
            'totalValue': total_value,
            'date': entry_date
        })
        dump_entry = DumpEntry(
            ref_number=ref_number,
            date=entry_date,
            supplier_id=dump_entry_data.supplierId,
            product_id=dump_entry_data.productId,
            product_type=dump_entry_data.productType,
            description=dump_entry_data.description,
            remarks=dump_entry_data.remarks,
            quantity=quantity,
            unit_price=unit_price,
            total_value=total_value,
            created_by=user_id
        )
        db.session.add(dump_entry)
        db.session.flush()  # Get dump_entry.id before creating stock movement

        # Update stock movement
        success, result = update_product_stock(
            product_id=dump_entry_data.productId,
            product_type=dump_entry_data.productType,
            quantity_change=-quantity,  # Negative for dumps
            movement_type='dump',
            reference_id=dump_entry.id,  # Fixed: was None, now correctly set
            reference_type='dump',
            remarks=f"Dump entry: {dump_entry_data.description}",
            user_id=user_id,
            movement_date=entry_date  # Use the actual entry date, not business_date
        )

        if not success:
            db.session.rollback()
            return jsonify({"error": f"Stock update failed: {result}"}), 400

        db.session.commit()
        return jsonify(dump_entry.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/dump-entries/<int:id>', methods=['PUT'])
@jwt_required()
def update_dump_entry(id):
    """Update a dump entry"""
    try:
        data = request.get_json()
        dump_entry = DumpEntry.query.get_or_404(id)
        user_id = get_jwt_identity()

        # Store old quantity before updating
        old_quantity = float(dump_entry.quantity)

        # Calculate total value
        quantity = float(data.get('quantity', 0))
        unit_price = float(data.get('unitPrice', 0))
        total_value = quantity * unit_price

        # Update fields
        dump_entry.date = datetime.strptime(data['date'], "%Y-%m-%d").date()
        dump_entry.supplier_id = data.get('supplierId')
        dump_entry.product_id = data['productId']
        dump_entry.product_type = data['productType']
        dump_entry.description = data['description']
        dump_entry.remarks = data.get('remarks')
        dump_entry.quantity = quantity
        dump_entry.unit_price = unit_price
        dump_entry.total_value = total_value

        # Fix 3: apply stock movement for quantity difference
        quantity_diff = quantity - old_quantity
        if quantity_diff != 0:
            success, result = update_product_stock(
                product_id=dump_entry.product_id,
                product_type=dump_entry.product_type,
                quantity_change=-quantity_diff,  # negative = more dumped, positive = less dumped
                movement_type='dump_adjustment',
                reference_id=dump_entry.id,
                reference_type='dump',
                remarks=f"Dump quantity adjusted: {old_quantity} -> {quantity}",
                user_id=user_id,
                movement_date=dump_entry.date
            )
            if not success:
                db.session.rollback()
                return jsonify({"error": f"Stock update failed: {result}"}), 400

        db.session.commit()
        return jsonify(dump_entry.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/dump-entries/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_dump_entry(id):
    """Delete a dump entry"""
    try:
        dump_entry = DumpEntry.query.get_or_404(id)
        
        # Restore stock before deleting
        success, result = update_product_stock(
            product_id=dump_entry.product_id,
            product_type=dump_entry.product_type,
            quantity_change=dump_entry.quantity,  # Positive to restore
            movement_type='dump_cancellation',
            reference_id=dump_entry.id,
            reference_type='dump',
            remarks=f"Dump entry cancelled: {dump_entry.description}",
            user_id=get_jwt_identity(),
            movement_date=dump_entry.date
        )
        
        if not success:
            return jsonify({"error": f"Stock restoration failed: {result}"}), 400
        
        db.session.delete(dump_entry)
        db.session.commit()
        return jsonify({"message": "Dump entry deleted successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

# Customer Return routes
@app.route('/api/customer-returns', methods=['GET'])
@jwt_required()
def get_customer_returns():
    """Get customer returns with optional filtering"""
    try:
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        customer_id = request.args.get('customerId', type=int)
        search = request.args.get('search', '')
        status = request.args.get('status')
        
        query = CustomerReturn.query
        
        # Filter by date range
        if from_date:
            query = query.filter(CustomerReturn.date >= from_date)
        if to_date:
            query = query.filter(CustomerReturn.date <= to_date)
        
        # Filter by customer
        if customer_id:
            query = query.filter(CustomerReturn.customer_id == customer_id)
        
        # Filter by status
        if status and status != 'all':
            query = query.filter(CustomerReturn.status == status)
        
        # Search by description, invoice number, or customer name
        if search:
            query = query.join(Customer).filter(
                or_(
                    CustomerReturn.description.ilike(f'%{search}%'),
                    CustomerReturn.invoice_number.ilike(f'%{search}%'),
                    Customer.customer_name.ilike(f'%{search}%')
                )
            )
        
        customer_returns = query.order_by(CustomerReturn.date.desc()).all()
        return jsonify([return_item.to_dict() for return_item in customer_returns]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/customer-returns/print', methods=['GET'])
def print_customer_returns():
    """Return selected customer-return documents for the public print view."""
    raw_ids = request.args.get('ids', '')
    try:
        return_ids = [int(value) for value in raw_ids.split(',') if value]
        if not return_ids or any(return_id <= 0 for return_id in return_ids):
            return jsonify({"error": "At least one valid customer return ID is required"}), 400

        return_items = CustomerReturn.query.filter(
            CustomerReturn.id.in_(set(return_ids))
        ).order_by(CustomerReturn.id).all()
        if len(return_items) != len(set(return_ids)):
            return jsonify({"error": "One or more customer returns were not found"}), 404

        company = Company.query.first()
        documents = []
        for return_item in return_items:
            product_model = RegularProduct if return_item.product_type == 'regular' else NonProduct
            product = product_model.query.get(return_item.product_id)
            documents.append({
                'customer': return_item.customer.to_dict() if return_item.customer else {},
                'product': product.to_dict() if product else {},
                'originalInvoiceDate': (
                    return_item.sale.date.date().isoformat()
                    if return_item.sale and return_item.sale.date
                    else None
                ),
                'returnItem': return_item.to_dict(),
            })

        return jsonify({
            'company': company.to_dict() if company else {},
            'returns': documents,
        }), 200
    except ValueError:
        return jsonify({"error": "Customer return IDs must be integers"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/customer-discounts/print', methods=['GET'])
def print_customer_discounts():
    """Return selected customer-discount documents for public print views."""
    raw_ids = request.args.get('ids', '')
    try:
        discount_ids = [int(value) for value in raw_ids.split(',') if value]
        if not discount_ids or any(discount_id <= 0 for discount_id in discount_ids):
            return jsonify({"error": "At least one valid customer discount ID is required"}), 400

        discounts = CustomerDiscount.query.filter(
            CustomerDiscount.id.in_(set(discount_ids)),
            CustomerDiscount.is_deleted.is_(False),
        ).order_by(CustomerDiscount.id).all()
        if len(discounts) != len(set(discount_ids)):
            return jsonify({"error": "One or more customer discounts were not found"}), 404

        documents = []
        for discount in discounts:
            sale_item = discount.sale_item
            product = (
                sale_item.product.description if sale_item and sale_item.product
                else sale_item.non_product.description if sale_item and sale_item.non_product
                else "Customer discount"
            )
            documents.append({
                'customer': discount.customer.to_dict() if discount.customer else {},
                'discount': {
                    'id': discount.id,
                    'documentInvoiceNumber': discount.document_invoice_number,
                    'originalInvoiceNumber': discount.sale.invoice_number if discount.sale else None,
                    'originalInvoiceDate': (
                        discount.sale.date.date().isoformat()
                        if discount.sale and discount.sale.date
                        else None
                    ),
                    'date': discount.date.isoformat(),
                    'productName': product,
                    'quantity': 1,
                    'unitPrice': float(discount.amount or 0),
                    'amount': float(discount.amount or 0),
                    'reason': discount.reason,
                },
            })

        company = Company.query.first()
        return jsonify({
            'company': company.to_dict() if company else {},
            'discounts': documents,
        }), 200
    except ValueError:
        return jsonify({"error": "Customer discount IDs must be integers"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/customer-returns', methods=['POST'])
@jwt_required()
def create_customer_return():
    try:
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify({"error": "A customer return payload is required"}), 400

        user_id = get_jwt_identity()
        # Use business date
        business_date = get_business_date()
        # Generate reference number
        last_return = CustomerReturn.query.order_by(CustomerReturn.id.desc()).first()
        ref_number = f"CR{1 if not last_return else last_return.id + 1:04d}"
        # Calculate total value
        from math import isfinite
        try:
            quantity = float(data.get('quantity', 0))
            unit_price = float(data.get('unitPrice', 0))
        except (TypeError, ValueError):
            return jsonify({"error": "Return quantity and unit price must be valid numbers"}), 400
        if not isfinite(quantity) or quantity <= 0:
            return jsonify({"error": "Return quantity must be a finite number greater than zero"}), 400
        if not isfinite(unit_price) or unit_price < 0:
            return jsonify({"error": "Unit price must be a finite non-negative number"}), 400
        total_value = quantity * unit_price
        if not isfinite(total_value):
            return jsonify({"error": "Return total is outside the supported range"}), 400
        invoice_number = str(data.get('invoiceNumber') or '').strip()
        # Parse date string to date object
        parsed_date = business_date
        date_str = data.get('date')
        if date_str:
            try:
                parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                parsed_date = business_date
        # Validate customer exists
        customer = Customer.query.get(data.get('customerId'))
        if not customer:
            return jsonify({"error": "Customer not found"}), 404
        # Validate product exists
        product_type = data.get('productType')
        if product_type == 'regular':
            product = RegularProduct.query.get(data.get('productId'))
        else:
            product = NonProduct.query.get(data.get('productId'))
        
        if not product:
            return jsonify({"error": "Product not found"}), 404
        # Validate sale exists if provided
        sale = None
        if data.get('saleId'):
            sale = Sale.query.get(data.get('saleId'))
            if not sale:
                return jsonify({"error": "Sale not found"}), 404
            if sale.customer_id != customer.id:
                return jsonify({"error": "Selected invoice does not belong to this customer"}), 400
            invoice_number = sale.invoice_number
        elif not invoice_number:
            return jsonify({"error": "Select an invoice or enter a manual invoice number"}), 400
        if len(invoice_number) > 50:
            return jsonify({"error": "Invoice number must be 50 characters or fewer"}), 400
        # Prepare data for schema validation
        schema_data = {
            'refNumber': ref_number,
            'date': parsed_date,
            'customerId': data.get('customerId'),
            'saleId': data.get('saleId'),
            'productId': data.get('productId'),
            'productType': data.get('productType'),
            'description': data.get('description'),
            'invoiceNumber': invoice_number,
            'remarks': data.get('remarks'),
            'quantity': quantity,
            'unitPrice': unit_price,
            'totalValue': total_value,
            'returnReason': data.get('returnReason'),
            'creditNoteIssued': data.get('creditNoteIssued', False),
            'creditNoteAmount': float(data.get('creditNoteAmount', 0)),
            'status': data.get('status', 'pending')
        }
        customer_return_data = CustomerReturnSchema(**schema_data)
        customer_return = CustomerReturn(
            ref_number=ref_number,
            document_invoice_number=_allocate_invoice_document_number(),
            date=parsed_date,
            customer_id=customer_return_data.customerId,
            sale_id=customer_return_data.saleId,
            product_id=customer_return_data.productId,
            product_type=customer_return_data.productType,
            description=customer_return_data.description,
            invoice_number=invoice_number,
            remarks=customer_return_data.remarks,
            quantity=quantity,
            unit_price=unit_price,
            total_value=total_value,
            return_reason=customer_return_data.returnReason,
            credit_note_issued=customer_return_data.creditNoteIssued,
            credit_note_amount=customer_return_data.creditNoteAmount,
            status=customer_return_data.status,
            created_by=user_id
        )
        db.session.add(customer_return)
        db.session.flush()  # Ensure customer_return.id is assigned before creating stock movement

        # Create stock movement if status is completed
        if customer_return_data.status == 'completed':
            success, result = update_product_stock(
                product_id=customer_return_data.productId,
                product_type=customer_return_data.productType,
                quantity_change=quantity,
                movement_type='customer_return',
                reference_id=customer_return.id,
                reference_type='customer_return',
                remarks=f"Customer return: {ref_number}",
                user_id=user_id,
                movement_date=parsed_date
            )
            if not success:
                db.session.rollback()
                return jsonify({"error": f"Stock update failed: {result}"}), 400

        db.session.commit()
        
        # If credit note is issued, update customer balance
        if customer_return_data.creditNoteIssued and customer_return_data.creditNoteAmount > 0:
            # Create a payment record to reduce customer balance
            credit_payment = Payment(
                customer_id=customer_return_data.customerId,
                sale_id=customer_return_data.saleId,
                amount=-customer_return_data.creditNoteAmount,  # Negative amount for credit
                payment_mode='credit_note',
                payment_date=parsed_date,
                remarks=f"Credit note for return: {ref_number}"
            )
            db.session.add(credit_payment)
            # Update customer's outstanding balance
            if sale:
                current_paid = float(sale.paid_amount or 0)
                new_paid = current_paid - customer_return_data.creditNoteAmount
                sale.paid_amount = max(0, new_paid)  # Ensure it doesn't go negative
                if new_paid <= 0:
                    sale.payment_status = 'pending'
                else:
                    sale.payment_status = 'partial'
                db.session.add(sale)
        
        db.session.commit()
        return jsonify(customer_return.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Exception occurred: {str(e)}")  # Debug log
        import traceback
        print(f"[ERROR] Full traceback: {traceback.format_exc()}")  # Debug log
        return jsonify({"error": str(e)}), 500

@app.route('/api/customer-returns/<int:id>', methods=['PUT'])
@jwt_required()
def update_customer_return(id):
    """Update a customer return"""
    try:
        data = request.get_json()
        customer_return = CustomerReturn.query.get_or_404(id)
        user_id = get_jwt_identity()
        
        # Capture the complete old inventory state before applying edits. Quantities
        # are normalized through safe_float so Decimal database values and JSON
        # floats cannot be subtracted directly.
        old_quantity = safe_float(customer_return.quantity)
        old_status = customer_return.status
        old_product_id = customer_return.product_id
        old_product_type = customer_return.product_type
        old_credit_amount = safe_float(customer_return.credit_note_amount)
        
        # Calculate total value
        quantity = safe_float(data.get('quantity', 0))
        unit_price = safe_float(data.get('unitPrice', 0))
        total_value = quantity * unit_price
        new_status = data.get('status', 'pending')
        new_product_id = data['productId']
        new_product_type = data['productType']
        new_date = datetime.strptime(data['date'], "%Y-%m-%d").date()
        
        # Update fields
        customer_return.date = new_date
        customer_return.customer_id = data['customerId']
        customer_return.sale_id = data.get('saleId')
        customer_return.product_id = new_product_id
        customer_return.product_type = new_product_type
        customer_return.description = data['description']
        customer_return.invoice_number = data.get('invoiceNumber')
        customer_return.remarks = data.get('remarks')
        customer_return.quantity = quantity
        customer_return.unit_price = unit_price
        customer_return.total_value = total_value
        customer_return.return_reason = data.get('returnReason')
        customer_return.credit_note_issued = data.get('creditNoteIssued', False)
        customer_return.credit_note_amount = safe_float(data.get('creditNoteAmount', 0))
        customer_return.status = new_status

        # Apply only the difference between the old and new effective stock
        # effects. Customer returns affect stock only while completed, matching
        # the Stock Check report.
        success, result = _apply_return_stock_transition(
            return_kind='customer',
            reference_id=customer_return.id,
            old_product_id=old_product_id,
            old_product_type=old_product_type,
            old_status=old_status,
            old_quantity=old_quantity,
            new_product_id=new_product_id,
            new_product_type=new_product_type,
            new_status=new_status,
            new_quantity=quantity,
            user_id=user_id,
            movement_date=new_date,
            movement_type='customer_return_adjustment',
            remarks=f"Customer return adjusted: {old_quantity}/{old_status} -> {quantity}/{new_status}"
        )
        if not success:
            db.session.rollback()
            return jsonify({"error": f"Stock update failed: {result}"}), 400
        
        # Handle credit note changes
        new_credit_amount = float(data.get('creditNoteAmount', 0))
        if new_credit_amount != old_credit_amount:
            # Remove old credit note payment if exists
            old_credit_payment = Payment.query.filter_by(
                customer_id=customer_return.customer_id,
                payment_mode='credit_note',
                remarks__like=f"%{customer_return.ref_number}%"
            ).first()
            
            if old_credit_payment:
                db.session.delete(old_credit_payment)
            
            # Create new credit note payment if needed
            if data.get('creditNoteIssued') and new_credit_amount > 0:
                credit_payment = Payment(
                    customer_id=customer_return.customer_id,
                    sale_id=customer_return.sale_id,
                    amount=-new_credit_amount,  # Negative amount for credit
                    payment_mode='credit_note',
                    payment_date=customer_return.date,
                    remarks=f"Credit note for return: {customer_return.ref_number}"
                )
                db.session.add(credit_payment)
                
                # Update sale payment status
                if customer_return.sale:
                    current_paid = float(customer_return.sale.paid_amount or 0)
                    new_paid = current_paid - new_credit_amount
                    customer_return.sale.paid_amount = max(0, new_paid)
                    if new_paid <= 0:
                        customer_return.sale.payment_status = 'pending'
                    else:
                        customer_return.sale.payment_status = 'partial'
                    db.session.add(customer_return.sale)
        
        db.session.commit()
        return jsonify(customer_return.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/customer-returns/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_customer_return(id):
    """Delete a customer return with permission checks"""
    try:
        user_id = get_jwt_identity()
        customer_return = CustomerReturn.query.get_or_404(id)
        
        # Get user's backdate options
        backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
        
        # Get today's date
        from datetime import datetime
        today = get_business_date()
        return_date = customer_return.date
        
        # Check permissions based on return date
        if return_date == today:
            # For current date entries, check current_editing permission
            if backdate_opt and not getattr(backdate_opt, 'current_editing', True):
                return jsonify({'error': 'You do not have permission to delete returns for today.'}), 403
        else:
            # For back date entries, check deleting permission
            if not backdate_opt or not backdate_opt.deleting:
                return jsonify({'error': 'You do not have permission to delete back-dated returns.'}), 403
        
        # Remove only the effective inventory impact. Pending/rejected customer
        # returns have no Stock Check effect and therefore must not change stock
        # when deleted.
        success, result = _apply_return_stock_transition(
            return_kind='customer',
            reference_id=customer_return.id,
            old_product_id=customer_return.product_id,
            old_product_type=customer_return.product_type,
            old_status=customer_return.status,
            old_quantity=customer_return.quantity,
            new_product_id=customer_return.product_id,
            new_product_type=customer_return.product_type,
            new_status='deleted',
            new_quantity=0,
            user_id=get_jwt_identity(),
            movement_date=customer_return.date,
            movement_type='customer_return_cancellation',
            remarks=f"Customer return cancelled: {customer_return.description}"
        )
        if not success:
            return jsonify({"error": f"Stock restoration failed: {result}"}), 400
        
        # Remove credit note payment if exists
        credit_payment = Payment.query.filter(
            Payment.customer_id == customer_return.customer_id,
            Payment.payment_mode == 'credit_note',
            Payment.remarks.like(f"%{customer_return.ref_number}%")
        ).first()
        
        if credit_payment:
            db.session.delete(credit_payment)
            
            # Restore sale payment status if linked
            if customer_return.sale:
                current_paid = float(customer_return.sale.paid_amount or 0)
                restored_paid = current_paid + customer_return.credit_note_amount
                customer_return.sale.paid_amount = restored_paid
                if restored_paid >= float(customer_return.sale.total_amount):
                    customer_return.sale.payment_status = 'paid'
                else:
                    customer_return.sale.payment_status = 'partial'
                db.session.add(customer_return.sale)
        
        _record_voided_invoice_document(
            customer_return.document_invoice_number,
            "return",
            customer_return.date,
            customer_return.customer.customer_name if customer_return.customer else None,
            customer_return.invoice_number,
            customer_return.user.username if customer_return.user else None,
        )
        db.session.delete(customer_return)
        db.session.commit()
        return jsonify({"message": "Customer return deleted successfully"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Exception in delete_customer_return: {str(e)}")
        import traceback
        print(f"[ERROR] Full traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/customer-returns/<int:id>/approve', methods=['POST'])
@jwt_required()
def approve_customer_return(id):
    """Approve a customer return"""
    try:
        customer_return = CustomerReturn.query.get_or_404(id)
        user_id = get_jwt_identity()
        
        if customer_return.status != 'pending':
            return jsonify({"error": "Only pending returns can be approved"}), 400
        
        # Approval is a workflow state only. Stock Check includes customer
        # returns when they become completed, so no stock is changed here.
        customer_return.status = 'approved'
        db.session.commit()
        
        return jsonify(customer_return.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Exception in approve_customer_return: {str(e)}")
        import traceback
        print(f"[ERROR] Full traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/customer-returns/<int:id>/reject', methods=['POST'])
@jwt_required()
def reject_customer_return(id):
    """Reject a customer return"""
    try:
        data = request.get_json()
        customer_return = CustomerReturn.query.get_or_404(id)
        
        if customer_return.status != 'pending':
            return jsonify({"error": "Only pending returns can be rejected"}), 400
        
        customer_return.status = 'rejected'
        customer_return.remarks = data.get('rejectionReason', 'Return rejected')

        # Pending customer returns have no stock effect, so rejection is a
        # status-only transition.
        # Remove credit note if issued
        if customer_return.credit_note_issued:
            credit_payment = Payment.query.filter_by(
                customer_id=customer_return.customer_id,
                payment_mode='credit_note',
                remarks__like=f"%{customer_return.ref_number}%"
            ).first()
            
            if credit_payment:
                db.session.delete(credit_payment)
        
        db.session.commit()
        return jsonify(customer_return.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/customer-returns/<int:id>/complete', methods=['POST'])
@jwt_required()
def complete_customer_return(id):
    """Mark a customer return as completed"""
    try:
        customer_return = CustomerReturn.query.get_or_404(id)
        
        if customer_return.status != 'approved':
            return jsonify({"error": "Only approved returns can be completed"}), 400

        success, result = _apply_return_stock_transition(
            return_kind='customer',
            reference_id=customer_return.id,
            old_product_id=customer_return.product_id,
            old_product_type=customer_return.product_type,
            old_status=customer_return.status,
            old_quantity=customer_return.quantity,
            new_product_id=customer_return.product_id,
            new_product_type=customer_return.product_type,
            new_status='completed',
            new_quantity=customer_return.quantity,
            user_id=get_jwt_identity(),
            movement_date=customer_return.date,
            movement_type='customer_return',
            remarks=f"Customer return completed: {customer_return.description}"
        )
        if not success:
            db.session.rollback()
            return jsonify({"error": f"Stock update failed: {result}"}), 400

        customer_return.status = 'completed'
        db.session.commit()
        
        return jsonify(customer_return.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/customer-returns/reports/summary', methods=['GET'])
@jwt_required()
def get_customer_returns_summary():
    """Get summary statistics for customer returns"""
    try:
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        customer_id = request.args.get('customerId', type=int)
        
        query = CustomerReturn.query
        
        if from_date:
            query = query.filter(CustomerReturn.date >= from_date)
        if to_date:
            query = query.filter(CustomerReturn.date <= to_date)
        if customer_id:
            query = query.filter(CustomerReturn.customer_id == customer_id)
        
        returns = query.all()
        
        total_returns = len(returns)
        total_quantity = sum(r.quantity for r in returns)
        total_value = sum(float(r.total_value) for r in returns)
        total_credit_notes = sum(float(r.credit_note_amount) for r in returns if r.credit_note_issued)
        
        status_counts = {}
        for return_item in returns:
            status = return_item.status
            status_counts[status] = status_counts.get(status, 0) + 1
        
        return jsonify({
            'totalReturns': total_returns,
            'totalQuantity': total_quantity,
            'totalValue': total_value,
            'totalCreditNotes': total_credit_notes,
            'statusCounts': status_counts
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Supplier Return routes
@app.route('/api/supplier-returns', methods=['GET'])
@jwt_required()
def get_supplier_returns():
    """Get supplier returns with optional filtering"""
    try:
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        supplier_id = request.args.get('supplierId', type=int)
        search = request.args.get('search', '')
        status = request.args.get('status')
        
        query = SupplierReturn.query
        
        # Filter by date range
        if from_date:
            query = query.filter(SupplierReturn.date >= from_date)
        if to_date:
            query = query.filter(SupplierReturn.date <= to_date)
        
        # Filter by supplier
        if supplier_id:
            query = query.filter(SupplierReturn.supplier_id == supplier_id)
        
        # Filter by status
        if status and status != 'all':
            query = query.filter(SupplierReturn.status == status)
        
        # Search by description, invoice number, or supplier name
        if search:
            query = query.join(Supplier).filter(
                or_(
                    SupplierReturn.description.ilike(f'%{search}%'),
                    SupplierReturn.invoice_number.ilike(f'%{search}%'),
                    Supplier.supplier_name.ilike(f'%{search}%')
                )
            )
        
        supplier_returns = query.order_by(SupplierReturn.date.desc()).all()
        regular_ids = {
            return_item.product_id for return_item in supplier_returns
            if return_item.product_type == 'regular'
        }
        non_ids = {
            return_item.product_id for return_item in supplier_returns
            if return_item.product_type != 'regular'
        }
        regular_products = {
            product.id: product for product in RegularProduct.query.filter(
                RegularProduct.id.in_(regular_ids)
            ).all()
        } if regular_ids else {}
        non_products = {
            product.id: product for product in NonProduct.query.filter(
                NonProduct.id.in_(non_ids)
            ).all()
        } if non_ids else {}
        response = []
        for return_item in supplier_returns:
            data = return_item.to_dict()
            product = (
                regular_products.get(return_item.product_id)
                if return_item.product_type == 'regular'
                else non_products.get(return_item.product_id)
            )
            data['productName'] = (
                f"{product.product_code} - {product.description}"
                if product and product.product_code
                else product.description if product
                else return_item.description
            )
            response.append(data)
        return jsonify(response), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/supplier-returns/<int:return_id>/print', methods=['GET'])
def print_supplier_return(return_id):
    """Return a complete supplier return for the public A4 print view."""
    try:
        return_item = SupplierReturn.query.get_or_404(return_id)
        supplier = Supplier.query.get(return_item.supplier_id)
        product_model = RegularProduct if return_item.product_type == 'regular' else NonProduct
        product = product_model.query.get(return_item.product_id)
        company = Company.query.first()
        return_data = return_item.to_dict()
        return_data['productName'] = product.description if product else return_item.description
        return jsonify({
            'company': company.to_dict() if company else {},
            'supplier': supplier.to_dict() if supplier else {},
            'product': product.to_dict() if product else {},
            'returnItem': return_data,
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/supplier-returns', methods=['POST'])
@jwt_required()
def create_supplier_return():
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        from datetime import datetime
        
        # Parse date string to date object first to check permissions
        business_date = get_business_date()
        parsed_date = business_date
        date_str = data.get('date')
        if date_str:
            try:
                parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                parsed_date = business_date
        
        # Get user's backdate options
        backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
        
        # Get today's date
        today = get_business_date()
        
        # Check permissions based on return date
        if parsed_date == today:
            # For current date entries, check current_editing permission
            if backdate_opt and not getattr(backdate_opt, 'current_editing', True):
                return jsonify({'error': 'You do not have permission to create returns for today.'}), 403
        else:
            # For back date entries, check editing permission
            if not backdate_opt or not backdate_opt.editing:
                return jsonify({'error': 'You do not have permission to create back-dated returns.'}), 403
        # Generate reference number
        last_return = SupplierReturn.query.order_by(SupplierReturn.id.desc()).first()
        ref_number = f"SR{1 if not last_return else last_return.id + 1:04d}"
        # Calculate total value
        quantity = float(data.get('quantity', 0))
        unit_price = float(data.get('unitPrice', 0))
        total_value = quantity * unit_price
        # Validate supplier exists
        supplier = Supplier.query.get(data.get('supplierId'))
        print(f"[DEBUG] Supplier: {supplier}")  # Debug log
        if not supplier:
            print("[ERROR] Supplier not found")
            return jsonify({"error": "Supplier not found"}), 404
        
        # Validate product exists
        product_type = data.get('productType')
        if product_type == 'regular':
            product = RegularProduct.query.get(data.get('productId'))
        else:
            product = NonProduct.query.get(data.get('productId'))
        print(f"[DEBUG] Product: {product}")  # Debug log
        if not product:
            print("[ERROR] Product not found")
            return jsonify({"error": "Product not found"}), 404
        
        # Validate purchase invoice exists if provided
        purchase_invoice = None
        if data.get('purchaseInvoiceId'):
            purchase_invoice = PurchaseInvoice.query.get(data.get('purchaseInvoiceId'))
            print(f"[DEBUG] Purchase Invoice: {purchase_invoice}")  # Debug log
            if not purchase_invoice:
                print("[ERROR] Purchase invoice not found")
                return jsonify({"error": "Purchase invoice not found"}), 404
        
        supplier_return_data = SupplierReturnSchema(**{
            **data,
            'refNumber': ref_number,
            'totalValue': total_value,
            'date': parsed_date
        })
        
        supplier_return = SupplierReturn(
            ref_number=ref_number,
            date=parsed_date,
            supplier_id=supplier_return_data.supplierId,
            purchase_invoice_id=supplier_return_data.purchaseInvoiceId,
            product_id=supplier_return_data.productId,
            product_type=supplier_return_data.productType,
            description=supplier_return_data.description,
            invoice_number=supplier_return_data.invoiceNumber,
            remarks=supplier_return_data.remarks,
            quantity=quantity,
            unit_price=unit_price,
            total_value=total_value,
            return_reason=supplier_return_data.returnReason,
            credit_note_issued=supplier_return_data.creditNoteIssued,
            credit_note_amount=supplier_return_data.creditNoteAmount,
            status=supplier_return_data.status,
            created_by=user_id
        )
        
        db.session.add(supplier_return)
        db.session.flush()  # Get supplier_return.id before commit

        # Update stock immediately — supplier return reduces stock
        success, result = update_product_stock(
            product_id=supplier_return_data.productId,
            product_type=supplier_return_data.productType,
            quantity_change=-quantity,  # Negative: stock leaves when returned to supplier
            movement_type='supplier_return',
            reference_id=supplier_return.id,
            reference_type='supplier_return',
            remarks=f"Supplier return: {ref_number}",
            user_id=user_id,
            movement_date=parsed_date
        )
        if not success:
            db.session.rollback()
            return jsonify({"error": f"Stock update failed: {result}"}), 400

        db.session.commit()
        
        # If credit note is issued, update supplier balance
        if supplier_return_data.creditNoteIssued and supplier_return_data.creditNoteAmount > 0:
            # Create a supplier payment record to reduce supplier balance
            credit_payment = SupplierPayment(
                supplier_id=supplier_return_data.supplierId,
                purchase_invoice_id=supplier_return_data.purchaseInvoiceId,
                amount=-supplier_return_data.creditNoteAmount,  # Negative amount for credit
                payment_mode='credit_note',
                payment_date=supplier_return_data.date,
                remarks=f"Credit note for return: {ref_number}"
            )
            db.session.add(credit_payment)
            
            # Update purchase invoice's paid amount if linked
            if purchase_invoice:
                current_paid = float(purchase_invoice.paid_amount or 0)
                new_paid = current_paid - supplier_return_data.creditNoteAmount
                purchase_invoice.paid_amount = max(0, new_paid)  # Ensure it doesn't go negative
                if new_paid <= 0:
                    purchase_invoice.payment_status = 'pending'
                else:
                    purchase_invoice.payment_status = 'partial'
                db.session.add(purchase_invoice)
        
        db.session.commit()
        return jsonify(supplier_return.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Exception occurred: {str(e)}")  # Debug log
        import traceback
        print(f"[ERROR] Full traceback: {traceback.format_exc()}")  # Debug log
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-returns/<int:id>', methods=['PUT'])
@jwt_required()
def update_supplier_return(id):
    """Update a supplier return with permission checks"""
    try:
        data = request.get_json()
        supplier_return = SupplierReturn.query.get_or_404(id)
        user_id = get_jwt_identity()
        
        # Parse the new date to check permissions
        parsed_date = supplier_return.date  # Default to existing date
        date_str = data.get('date')
        if date_str:
            try:
                parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                parsed_date = supplier_return.date
        
        # Get user's backdate options
        backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
        
        # Get today's date. datetime is imported at module scope.
        today = get_business_date()
        
        # Check permissions based on return date (both old and new dates)
        dates_to_check = [supplier_return.date, parsed_date]
        for check_date in dates_to_check:
            if check_date == today:
                # For current date entries, check current_editing permission
                if backdate_opt and not getattr(backdate_opt, 'current_editing', True):
                    return jsonify({'error': 'You do not have permission to edit returns for today.'}), 403
            else:
                # For back date entries, check editing permission
                if not backdate_opt or not backdate_opt.editing:
                    return jsonify({'error': 'You do not have permission to edit back-dated returns.'}), 403
        
        # Capture the old effective inventory state and normalize quantities so
        # Decimal database values and JSON floats are safe to compare.
        old_quantity = safe_float(supplier_return.quantity)
        old_status = supplier_return.status
        old_product_id = supplier_return.product_id
        old_product_type = supplier_return.product_type
        old_credit_amount = safe_float(supplier_return.credit_note_amount)
        
        # Calculate total value
        quantity = safe_float(data.get('quantity', 0))
        unit_price = safe_float(data.get('unitPrice', 0))
        total_value = quantity * unit_price
        new_status = data.get('status', 'pending')
        new_product_id = data['productId']
        new_product_type = data['productType']
        new_date = datetime.strptime(data['date'], "%Y-%m-%d").date()
        
        # Update fields
        supplier_return.date = new_date
        supplier_return.supplier_id = data['supplierId']
        supplier_return.purchase_invoice_id = data.get('purchaseInvoiceId')
        supplier_return.product_id = new_product_id
        supplier_return.product_type = new_product_type
        supplier_return.description = data['description']
        supplier_return.invoice_number = data.get('invoiceNumber')
        supplier_return.remarks = data.get('remarks')
        supplier_return.quantity = quantity
        supplier_return.unit_price = unit_price
        supplier_return.total_value = total_value
        supplier_return.return_reason = data.get('returnReason')
        supplier_return.credit_note_issued = data.get('creditNoteIssued', False)
        supplier_return.credit_note_amount = safe_float(data.get('creditNoteAmount', 0))
        supplier_return.status = new_status

        # Supplier returns are included by the current Stock Check formula for
        # every status, so this applies only the old-versus-new net delta.
        success, result = _apply_return_stock_transition(
            return_kind='supplier',
            reference_id=supplier_return.id,
            old_product_id=old_product_id,
            old_product_type=old_product_type,
            old_status=old_status,
            old_quantity=old_quantity,
            new_product_id=new_product_id,
            new_product_type=new_product_type,
            new_status=new_status,
            new_quantity=quantity,
            user_id=user_id,
            movement_date=new_date,
            movement_type='supplier_return_adjustment',
            remarks=f"Supplier return adjusted: {old_quantity}/{old_status} -> {quantity}/{new_status}"
        )
        if not success:
            db.session.rollback()
            return jsonify({"error": f"Stock update failed: {result}"}), 400
        
        # Handle credit note changes
        new_credit_amount = float(data.get('creditNoteAmount', 0))
        if new_credit_amount != old_credit_amount:
            # Remove old credit note payment if exists
            old_credit_payment = SupplierPayment.query.filter_by(
                supplier_id=supplier_return.supplier_id,
                payment_mode='credit_note',
                remarks__like=f"%{supplier_return.ref_number}%"
            ).first()
            
            if old_credit_payment:
                db.session.delete(old_credit_payment)
            
            # Create new credit note payment if needed
            if data.get('creditNoteIssued') and new_credit_amount > 0:
                credit_payment = SupplierPayment(
                    supplier_id=supplier_return.supplier_id,
                    purchase_invoice_id=supplier_return.purchase_invoice_id,
                    amount=-new_credit_amount,  # Negative amount for credit
                    payment_mode='credit_note',
                    payment_date=supplier_return.date,
                    remarks=f"Credit note for return: {supplier_return.ref_number}"
                )
                db.session.add(credit_payment)
                
                # Update purchase invoice payment status
                if supplier_return.purchase_invoice:
                    current_paid = float(supplier_return.purchase_invoice.paid_amount or 0)
                    new_paid = current_paid - new_credit_amount
                    supplier_return.purchase_invoice.paid_amount = max(0, new_paid)
                    if new_paid <= 0:
                        supplier_return.purchase_invoice.payment_status = 'pending'
                    else:
                        supplier_return.purchase_invoice.payment_status = 'partial'
                    db.session.add(supplier_return.purchase_invoice)
        
        db.session.commit()
        return jsonify(supplier_return.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-returns/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_supplier_return(id):
    """Delete a supplier return with permission checks"""
    try:
        user_id = get_jwt_identity()
        supplier_return = SupplierReturn.query.get_or_404(id)
        
        # Get user's backdate options
        backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
        
        # Get today's date
        from datetime import datetime
        today = get_business_date()
        return_date = supplier_return.date
        
        # Check permissions based on return date
        if return_date == today:
            # For current date entries, check current_editing permission
            if backdate_opt and not getattr(backdate_opt, 'current_editing', True):
                return jsonify({'error': 'You do not have permission to delete returns for today.'}), 403
        else:
            # For back date entries, check deleting permission
            if not backdate_opt or not backdate_opt.deleting:
                return jsonify({'error': 'You do not have permission to delete back-dated returns.'}), 403
        
        # Remove the return’s effective stock impact. Supplier returns are
        # included by the existing Stock Check formula while the row exists,
        # regardless of status, so deletion restores exactly one quantity.
        success, result = _apply_return_stock_transition(
            return_kind='supplier',
            reference_id=supplier_return.id,
            old_product_id=supplier_return.product_id,
            old_product_type=supplier_return.product_type,
            old_status=supplier_return.status,
            old_quantity=supplier_return.quantity,
            new_product_id=supplier_return.product_id,
            new_product_type=supplier_return.product_type,
            new_status='deleted',
            new_quantity=0,
            user_id=get_jwt_identity(),
            movement_date=supplier_return.date,
            movement_type='supplier_return_cancellation',
            remarks=f"Supplier return cancelled: {supplier_return.description}"
        )
        if not success:
            return jsonify({"error": f"Stock restoration failed: {result}"}), 400
        
        # Remove credit note payment if exists
        credit_payment = SupplierPayment.query.filter(
            SupplierPayment.supplier_id == supplier_return.supplier_id,
            SupplierPayment.payment_mode == 'credit_note',
            SupplierPayment.remarks.like(f"%{supplier_return.ref_number}%")
        ).first()
        
        if credit_payment:
            db.session.delete(credit_payment)
            
            # Restore purchase invoice payment status if linked
            if supplier_return.purchase_invoice:
                current_paid = float(supplier_return.purchase_invoice.paid_amount or 0)
                restored_paid = current_paid + supplier_return.credit_note_amount
                supplier_return.purchase_invoice.paid_amount = restored_paid
                
                # Calculate total invoice amount
                total_invoice_amount = sum(item.total_price for item in supplier_return.purchase_invoice.items)
                if restored_paid >= total_invoice_amount:
                    supplier_return.purchase_invoice.payment_status = 'paid'
                else:
                    supplier_return.purchase_invoice.payment_status = 'partial'
                db.session.add(supplier_return.purchase_invoice)
        
        db.session.delete(supplier_return)
        db.session.commit()
        return jsonify({"message": "Supplier return deleted successfully"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Exception in delete_supplier_return: {str(e)}")
        import traceback
        print(f"[ERROR] Full traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-returns/<int:id>/approve', methods=['POST'])
@jwt_required()
def approve_supplier_return(id):
    """Approve a supplier return"""
    try:
        supplier_return = SupplierReturn.query.get_or_404(id)
        user_id = get_jwt_identity()
        
        if supplier_return.status != 'pending':
            return jsonify({"error": "Only pending returns can be approved"}), 400
        
        # The stock effect was already applied when the return row was
        # created. Approval is a workflow state transition only.
        supplier_return.status = 'approved'
        db.session.commit()
        
        return jsonify(supplier_return.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Exception in approve_supplier_return: {str(e)}")
        import traceback
        print(f"[ERROR] Full traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-returns/<int:id>/reject', methods=['POST'])
@jwt_required()
def reject_supplier_return(id):
    """Reject a supplier return"""
    try:
        data = request.get_json()
        supplier_return = SupplierReturn.query.get_or_404(id)
        
        if supplier_return.status != 'pending':
            return jsonify({"error": "Only pending returns can be rejected"}), 400
        
        supplier_return.status = 'rejected'
        supplier_return.remarks = data.get('rejectionReason', 'Return rejected')

        # The current Stock Check includes supplier-return rows in every
        # status, so rejection does not change the inventory effect.
        # Remove credit note if issued
        if supplier_return.credit_note_issued:
            credit_payment = SupplierPayment.query.filter_by(
                supplier_id=supplier_return.supplier_id,
                payment_mode='credit_note',
                remarks__like=f"%{supplier_return.ref_number}%"
            ).first()
            
            if credit_payment:
                db.session.delete(credit_payment)
        
        db.session.commit()
        return jsonify(supplier_return.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-returns/<int:id>/complete', methods=['POST'])
@jwt_required()
def complete_supplier_return(id):
    """Mark a supplier return as completed"""
    try:
        supplier_return = SupplierReturn.query.get_or_404(id)
        
        if supplier_return.status != 'approved':
            return jsonify({"error": "Only approved returns can be completed"}), 400

        # Supplier return stock was applied at creation and remains applied
        # across workflow statuses, matching the current Stock Check formula.
        supplier_return.status = 'completed'
        db.session.commit()
        
        return jsonify(supplier_return.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-returns/reports/summary', methods=['GET'])
@jwt_required()
def get_supplier_returns_summary():
    """Get summary statistics for supplier returns"""
    try:
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        supplier_id = request.args.get('supplierId', type=int)
        
        query = SupplierReturn.query
        
        if from_date:
            query = query.filter(SupplierReturn.date >= from_date)
        if to_date:
            query = query.filter(SupplierReturn.date <= to_date)
        if supplier_id:
            query = query.filter(SupplierReturn.supplier_id == supplier_id)
        
        returns = query.all()
        
        total_returns = len(returns)
        total_quantity = sum(r.quantity for r in returns)
        total_value = sum(float(r.total_value) for r in returns)
        total_credit_notes = sum(float(r.credit_note_amount) for r in returns if r.credit_note_issued)
        
        status_counts = {}
        for return_item in returns:
            status = return_item.status
            status_counts[status] = status_counts.get(status, 0) + 1
        
        return jsonify({
            'totalReturns': total_returns,
            'totalQuantity': total_quantity,
            'totalValue': total_value,
            'totalCreditNotes': total_credit_notes,
            'statusCounts': status_counts
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/test/customer-returns', methods=['GET'])
def test_customer_returns():
    """Test endpoint to check if CustomerReturn model is working"""
    try:
        # Test if we can query CustomerReturn
        count = CustomerReturn.query.count()
        
        # Test if we can create a CustomerReturn object (without saving)
        test_return = CustomerReturn(
            ref_number="TEST001",
            date=datetime.now().date(),
            customer_id=1,
            product_id=1,
            product_type="regular",
            description="Test return",
            quantity=1,
            unit_price=10.0,
            total_value=10.0,
            status="pending"
        )
        
        return jsonify({
            "status": "success",
            "message": "CustomerReturn model is working",
            "count": count,
            "test_object_created": True
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
            "error_type": type(e).__name__
        }), 500

def _discount_audit_values(discount):
    return {
        "amount": str(_money_decimal(discount.amount)),
        "date": discount.date.isoformat(),
        "reason": discount.reason,
        "saleId": discount.sale_id,
        "saleItemId": discount.sale_item_id,
    }


def _validate_discount_target(data, user_id, existing=None):
    if not isinstance(data, dict):
        raise ValueError("A customer discount payload is required.")

    customer_id = existing.customer_id if existing else data.get("customerId")
    sale_id = existing.sale_id if existing else data.get("saleId")
    sale_item_id = existing.sale_item_id if existing else data.get("saleItemId")
    try:
        customer_id = int(customer_id)
        sale_id = int(sale_id)
        sale_item_id = int(sale_item_id)
    except (TypeError, ValueError):
        raise ValueError("Customer, invoice, and invoice product line are required.")

    sale = Sale.query.filter_by(id=sale_id).with_for_update().first()
    if not sale:
        raise ValueError("Invoice not found.")
    if sale.customer_id != customer_id:
        raise ValueError("Selected invoice does not belong to this customer.")
    if sale.status != "finalized":
        raise ValueError("Discounts can only be applied to finalized invoices.")
    if _money_decimal(sale.total_amount) <= 0:
        raise ValueError("Discounts cannot be applied to a credit or zero-value invoice.")

    sale_item = SaleItem.query.filter_by(id=sale_item_id, sale_id=sale.id).with_for_update().first()
    if not sale_item:
        raise ValueError("Selected product line does not belong to this invoice.")
    if Decimal(str(sale_item.quantity or 0)) <= 0 or _money_decimal(sale_item.total_price) <= 0:
        raise ValueError("Discounts can only be applied to positive-quantity sale lines.")

    amount = _parse_discount_amount(data.get("amount"))
    reason = str(data.get("reason") or "").strip()
    if not reason:
        raise ValueError("A reason is required for every discount.")
    if len(reason) > 500:
        raise ValueError("Reason must be 500 characters or fewer.")
    transaction_date = _parse_discount_date(
        data.get("date"),
        existing.date if existing else get_business_date(),
    )
    if transaction_date < sale.date.date():
        raise ValueError("Discount date cannot be before the invoice date.")

    old_amount = _money_decimal(existing.amount) if existing else Decimal("0.00")
    excluded_id = existing.id if existing else None
    available_line_value = _money_decimal(sale_item.total_price) - _active_discount_total_for_item(
        sale_item.id, excluded_id
    )
    available_invoice_value = _sale_available_discount_value(sale, exclude_discount_id=excluded_id)
    if existing:
        available_line_value = max(available_line_value, old_amount)
        available_invoice_value = max(available_invoice_value, old_amount)
    elif available_invoice_value <= 0:
        raise ValueError("This invoice has no remaining value eligible for a discount.")

    if amount > available_line_value:
        raise ValueError("Discount cannot exceed the remaining value of the selected product line.")
    if amount > available_invoice_value:
        raise ValueError("Discount cannot exceed the invoice's remaining undiscounted value.")

    return customer_id, sale, sale_item, amount, transaction_date, reason


@app.route('/api/customer-discounts', methods=['GET'])
@jwt_required()
def list_customer_discounts():
    user_id = get_jwt_identity()
    access_error = _check_customer_discount_access(user_id)
    if access_error:
        return jsonify({"error": access_error}), 403

    query = CustomerDiscount.query.options(
        db.joinedload(CustomerDiscount.customer),
        db.joinedload(CustomerDiscount.sale),
        db.joinedload(CustomerDiscount.sale_item).joinedload(SaleItem.product),
        db.joinedload(CustomerDiscount.sale_item).joinedload(SaleItem.non_product),
        db.joinedload(CustomerDiscount.creator),
    )
    customer_id = request.args.get("customerId", type=int)
    sale_id = request.args.get("saleId", type=int)
    from_date = request.args.get("fromDate")
    to_date = request.args.get("toDate")
    if customer_id:
        query = query.filter(CustomerDiscount.customer_id == customer_id)
    if sale_id:
        query = query.filter(CustomerDiscount.sale_id == sale_id)
    if from_date:
        try:
            query = query.filter(CustomerDiscount.date >= date.fromisoformat(from_date))
        except ValueError:
            return jsonify({"error": "Invalid fromDate. Use YYYY-MM-DD."}), 400
    if to_date:
        try:
            query = query.filter(CustomerDiscount.date <= date.fromisoformat(to_date))
        except ValueError:
            return jsonify({"error": "Invalid toDate. Use YYYY-MM-DD."}), 400
    return jsonify([
        discount.to_dict()
        for discount in query.order_by(CustomerDiscount.date.desc(), CustomerDiscount.id.desc()).all()
    ])


@app.route('/api/customer-discounts/invoices/<int:sale_id>', methods=['GET'])
@jwt_required()
def get_customer_discount_invoice_lines(sale_id):
    user_id = get_jwt_identity()
    access_error = _check_customer_discount_access(user_id)
    if access_error:
        return jsonify({"error": access_error}), 403
    sale = Sale.query.filter_by(id=sale_id, status="finalized").first()
    if not sale:
        return jsonify({"error": "Finalized invoice not found."}), 404

    paid = _sale_paid_amount(sale)
    discount_total = _active_discount_total_for_sale(sale.id)
    outstanding = _sale_outstanding(sale)
    available_discount_value = _sale_available_discount_value(sale)
    lines = []
    for item in sale.items:
        line_total = _money_decimal(item.total_price)
        line_discount = _active_discount_total_for_item(item.id)
        remaining = max(Decimal("0.00"), line_total - line_discount)
        product_name = (
            item.product.description if item.product
            else item.non_product.description if item.non_product
            else ""
        )
        lines.append({
            "id": item.id,
            "productId": item.product_id or item.non_product_id,
            "productType": "regular" if item.product_id else "non",
            "productName": product_name,
            "description": product_name,
            "quantity": float(item.quantity or 0),
            "unitPrice": float(item.unit_price or 0),
            "originalTotal": float(line_total),
            "discountTotal": float(line_discount),
            "remainingValue": float(remaining),
            "effectiveUnitPrice": float((remaining / Decimal(str(item.quantity))) if item.quantity else 0),
        })

    return jsonify({
        "saleId": sale.id,
        "invoiceNumber": sale.invoice_number,
        "customerId": sale.customer_id,
        "date": sale.date.date().isoformat(),
        "totalAmount": float(sale.total_amount or 0),
        "paidAmount": float(paid),
        "discountTotal": float(discount_total),
        "outstandingAmount": float(outstanding),
        "availableDiscountAmount": float(available_discount_value),
        "discountEligible": available_discount_value > 0,
        "items": lines,
    })


@app.route('/api/customer-discounts', methods=['POST'])
@jwt_required()
def create_customer_discount():
    user_id = int(get_jwt_identity())
    access_error = _check_customer_discount_access(user_id)
    if access_error:
        return jsonify({"error": access_error}), 403
    try:
        data = request.get_json()
        customer_id, sale, sale_item, amount, transaction_date, reason = _validate_discount_target(data, user_id)
        permission_error = _check_discount_date_permission(user_id, transaction_date, "create")
        if permission_error:
            return jsonify({"error": permission_error}), 403

        customer = Customer.query.filter_by(id=customer_id).with_for_update().first()
        if not customer:
            return jsonify({"error": "Customer not found."}), 404
        discount = CustomerDiscount(
            customer_id=customer_id,
            sale_id=sale.id,
            sale_item_id=sale_item.id,
            document_invoice_number=_allocate_invoice_document_number(),
            amount=amount,
            date=transaction_date,
            reason=reason,
            created_by=user_id,
        )
        db.session.add(discount)
        db.session.flush()
        db.session.add(CustomerDiscountAudit(
            discount_id=discount.id,
            action="created",
            after_values=_discount_audit_values(discount),
            reason=reason,
            changed_by=user_id,
        ))
        customer.running_balance = _money_decimal(customer.running_balance) - amount
        _refresh_sale_payment_status(sale)
        db.session.commit()
        return jsonify(discount.to_dict()), 201
    except ValueError as error:
        db.session.rollback()
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        db.session.rollback()
        app.logger.exception("Failed to create customer discount")
        return jsonify({"error": "Failed to create customer discount."}), 500


@app.route('/api/customer-discounts/<int:discount_id>', methods=['PUT'])
@jwt_required()
def update_customer_discount(discount_id):
    user_id = int(get_jwt_identity())
    access_error = _check_customer_discount_access(user_id)
    if access_error:
        return jsonify({"error": access_error}), 403
    try:
        discount = CustomerDiscount.query.filter_by(id=discount_id, is_deleted=False).with_for_update().first()
        if not discount:
            return jsonify({"error": "Active customer discount not found."}), 404
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify({"error": "A customer discount payload is required."}), 400
        customer_id, sale, sale_item, amount, transaction_date, reason = _validate_discount_target(
            {**data, "customerId": discount.customer_id, "saleId": discount.sale_id, "saleItemId": discount.sale_item_id},
            user_id,
            existing=discount,
        )
        permission_error = _check_discount_date_permission(
            user_id, transaction_date, "edit", existing_date=discount.date
        )
        if permission_error:
            return jsonify({"error": permission_error}), 403

        before_values = _discount_audit_values(discount)
        old_amount = _money_decimal(discount.amount)
        customer = Customer.query.filter_by(id=customer_id).with_for_update().first()
        discount.amount = amount
        discount.date = transaction_date
        discount.reason = reason
        discount.updated_by = user_id
        discount.updated_at = datetime.utcnow()
        customer.running_balance = _money_decimal(customer.running_balance) + old_amount - amount
        _refresh_sale_payment_status(sale)
        db.session.add(CustomerDiscountAudit(
            discount_id=discount.id,
            action="updated",
            before_values=before_values,
            after_values=_discount_audit_values(discount),
            reason=reason,
            changed_by=user_id,
        ))
        db.session.commit()
        return jsonify(discount.to_dict())
    except ValueError as error:
        db.session.rollback()
        return jsonify({"error": str(error)}), 400
    except Exception:
        db.session.rollback()
        app.logger.exception("Failed to update customer discount %s", discount_id)
        return jsonify({"error": "Failed to update customer discount."}), 500


@app.route('/api/customer-discounts/<int:discount_id>', methods=['DELETE'])
@jwt_required()
def delete_customer_discount(discount_id):
    user_id = int(get_jwt_identity())
    access_error = _check_customer_discount_access(user_id)
    if access_error:
        return jsonify({"error": access_error}), 403
    try:
        discount = CustomerDiscount.query.filter_by(id=discount_id, is_deleted=False).with_for_update().first()
        if not discount:
            return jsonify({"error": "Active customer discount not found."}), 404
        data = request.get_json(silent=True) or {}
        reason = str(data.get("reason") or "").strip()
        if len(reason) > 500:
            return jsonify({"error": "Reason must be 500 characters or fewer."}), 400
        permission_error = _check_discount_date_permission(
            user_id, discount.date, "delete", existing_date=discount.date
        )
        if permission_error:
            return jsonify({"error": permission_error}), 403

        before_values = _discount_audit_values(discount)
        amount = _money_decimal(discount.amount)
        customer = Customer.query.filter_by(id=discount.customer_id).with_for_update().first()
        sale = Sale.query.filter_by(id=discount.sale_id).with_for_update().first()
        if not customer or not sale:
            return jsonify({"error": "Discount customer or invoice is no longer available."}), 409
        _record_voided_invoice_document(
            discount.document_invoice_number,
            "discount",
            discount.date,
            customer.customer_name,
            sale.invoice_number,
            discount.creator.username if discount.creator else None,
        )
        discount.is_deleted = True
        discount.deleted_by = user_id
        discount.deleted_at = datetime.utcnow()
        discount.deletion_reason = reason or None
        discount.updated_by = user_id
        customer.running_balance = _money_decimal(customer.running_balance) + amount
        _refresh_sale_payment_status(sale)
        db.session.add(CustomerDiscountAudit(
            discount_id=discount.id,
            action="deleted",
            before_values=before_values,
            after_values={"isDeleted": True},
            reason=reason,
            changed_by=user_id,
        ))
        db.session.commit()
        return jsonify({"message": "Customer discount deleted successfully."})
    except Exception:
        db.session.rollback()
        app.logger.exception("Failed to delete customer discount %s", discount_id)
        return jsonify({"error": "Failed to delete customer discount."}), 500


@app.route('/api/customers/<int:customer_id>/invoices', methods=['GET'])
@jwt_required()
def get_customer_invoices(customer_id):
    """Get customer invoices for a specific date range"""
    try:
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        
        if not from_date or not to_date:
            return jsonify({"error": "fromDate and toDate are required"}), 400
        
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        
        # Get sales for this customer in the date range
        sales = Sale.query.filter(
            Sale.customer_id == customer_id,
            Sale.date >= from_dt,
            Sale.date < to_dt,
            Sale.status == 'finalized'
        ).order_by(Sale.date.desc()).all()
        
        invoices = []
        for sale in sales:
            paid_amount = _sale_paid_amount(sale)
            discount_amount = _active_discount_total_for_sale(sale.id)
            outstanding_amount = _sale_outstanding(sale)
            available_discount_amount = _sale_available_discount_value(sale)
            invoices.append({
                'id': sale.id,
                'invoiceNumber': sale.invoice_number,
                'date': sale.date.isoformat() if sale.date else None,
                'totalAmount': float(sale.total_amount) if sale.total_amount else 0,
                'paidAmount': float(paid_amount),
                'discountAmount': float(discount_amount),
                'outstandingAmount': float(outstanding_amount),
                'availableDiscountAmount': float(available_discount_amount),
                'discountEligible': available_discount_amount > 0,
                'customerType': sale.customer_type,
                'status': sale.status
            })
        
        return jsonify(invoices), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/reports/supplier-statement', methods=['GET'])
@jwt_required()
def supplier_statement():
    supplier_id = request.args.get('supplierId', type=int)
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    statement_type = request.args.get('type', 'Full Statement')

    if not supplier_id or not from_date or not to_date:
        return jsonify({'error': 'Missing required parameters'}), 400

    from datetime import datetime
    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)

    def to_datetime(dt):
        if isinstance(dt, datetime):
            return dt
        return datetime.combine(dt, datetime.min.time())

    # Fetch purchases for this supplier in the date range
    purchase_invoices = PurchaseInvoice.query.join(Purchase).filter(
    Purchase.supplier_id == supplier_id,
    func.date(PurchaseInvoice.date) >= from_dt.date(),
    func.date(PurchaseInvoice.date) < to_dt.date()
    ).order_by(PurchaseInvoice.date).all()

    # Fetch payments for this supplier in the date range
    payments = SupplierPayment.query.filter(
        SupplierPayment.supplier_id == supplier_id,
        SupplierPayment.payment_date >= from_dt.date(),
        SupplierPayment.payment_date < to_dt.date()
    ).all()

    # Fetch supplier returns for this supplier in the date range
    returns = SupplierReturn.query.filter(
        SupplierReturn.supplier_id == supplier_id,
        SupplierReturn.date >= from_dt.date(),
        SupplierReturn.date < to_dt.date()
    ).all()

    # Build statement entries
    statement = []
    running_balance = 0
    sl_no = 1
    entries = []

    # Purchases (debit)
    for invoice in purchase_invoices:
        invoice_total = sum(float(item.total_price) for item in invoice.items)
        print(f"[DEBUG] Invoice {invoice.id} total: {invoice_total}")
        entries.append({
            'date': to_datetime(invoice.date),
            'type': 'purchase',
            'invoiceNo': invoice.id,
            'description': f'Purchase Invoice #{invoice.id}',
            'purchaseInv': invoice_total,  # This will now be correct!
            'paid': 0,
            'creditAdj': 0,
            'discountAdj': 0,
            'balance': invoice_total,
            'invoice_id': invoice.id
        })
    # Payments (credit)
    for payment in payments:
        entries.append({
            'date': to_datetime(payment.payment_date),
            'type': 'payment',
            'invoiceNo': payment.purchase_invoice_id,
            'description': 'Payment Made',
            'purchaseInv': 0,
            'paid': float(payment.amount),
            'creditAdj': 0,
            'discountAdj': 0,
            'balance': -float(payment.amount),
            'payment_id': payment.id
        })
    # Returns (credit/adjustment)
    for ret in returns:
        # Only include approved/completed returns for balance
        if ret.status in ['approved', 'completed']:
            credit_note = float(ret.credit_note_amount) if ret.credit_note_issued else 0
            entries.append({
                'date': to_datetime(ret.date),
                'type': 'return',
                'invoiceNo': ret.invoice_number,
                'description': 'Supplier Return',
                'purchaseInv': 0,
                'paid': 0,
                'creditAdj': credit_note,
                'discountAdj': 0,
                'balance': -credit_note,
                'return_id': ret.id
            })
    # Sort by date
    entries.sort(key=lambda x: x['date'])

    # Calculate running balance
    for entry in entries:
        running_balance += entry['balance']
        statement.append({
            'id': sl_no,
            'slNo': sl_no,
            'date': entry['date'].strftime("%Y-%m-%d"),
            'invoiceNo': entry['invoiceNo'],
            'description': entry['description'],
            'purchaseInv': entry['purchaseInv'],
            'paid': entry['paid'],
            'creditAdj': entry['creditAdj'],
            'discountAdj': entry['discountAdj'],
            'balance': entry['balance'],
            'runningBalance': running_balance
        })
        sl_no += 1

    # Filter by statement type if needed
    if statement_type == "Outstanding Only":
        statement = [s for s in statement if s['runningBalance'] > 0]
    elif statement_type == "Paid Only":
        statement = [s for s in statement if s['paid'] > 0]

    return jsonify(statement)

@app.route('/api/reports/all-supplier-history', methods=['GET'])
@jwt_required()
def all_supplier_history():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    from datetime import datetime
    from_dt = datetime.strptime(from_date, "%Y-%m-%d") if from_date else None
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") if to_date else None

    suppliers = Supplier.query.all()
    result = []
    sl_no = 1
    for supplier in suppliers:
        purchases_query = Purchase.query.filter(Purchase.supplier_id == supplier.id)
        purchase_invoices_query = PurchaseInvoice.query.join(Purchase).filter(Purchase.supplier_id == supplier.id)
        if from_dt:
            purchase_invoices_query = purchase_invoices_query.filter(PurchaseInvoice.date >= from_dt)
        if to_dt:
            purchase_invoices_query = purchase_invoices_query.filter(PurchaseInvoice.date <= to_dt)
        total_purchase = sum(float(inv.paid_amount if inv.paid_amount else 0) + sum(float(item.total_price) for item in inv.items) for inv in purchase_invoices_query)

        payments_query = SupplierPayment.query.filter(SupplierPayment.supplier_id == supplier.id)
        if from_dt:
            payments_query = payments_query.filter(SupplierPayment.payment_date >= from_dt.date())
        if to_dt:
            payments_query = payments_query.filter(SupplierPayment.payment_date <= to_dt.date())
        total_paid = sum(float(p.amount) for p in payments_query)

        credit_adj = 0  # Placeholder for credit adjustments
        discount_adj = 0  # Placeholder for discount adjustments
        balance_outstanding = total_purchase - total_paid + credit_adj + discount_adj
        credit_limit = float(supplier.credit_limit) if supplier.credit_limit is not None else 0
        currency = supplier.supplier_currency

        result.append({
            'id': supplier.id,
            'slNo': sl_no,
            'supplierName': supplier.supplier_name,
            'purchaseInvoice': total_purchase,
            'amountPaid': total_paid,
            'creditAdj': credit_adj,
            'discountAdj': discount_adj,
            'balanceOutstanding': balance_outstanding,
            'creditLimit': credit_limit,
            'currency': currency,
            'isCompany': bool(supplier.is_company),
        })
        sl_no += 1
    return jsonify(result)


@app.route('/api/reports/purchase-history', methods=['GET'])
@jwt_required()
def purchase_history_report():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    supplier_id = request.args.get('supplierId', type=int)
    payment_status = request.args.get('paymentStatus')
    search = request.args.get('search', '')

    from datetime import datetime
    from_dt = datetime.strptime(from_date, "%Y-%m-%d") if from_date else None
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") if to_date else None

    # Build base query for PurchaseInvoiceItems joined with PurchaseInvoice, Purchase, Supplier
    from models import PurchaseInvoice, PurchaseInvoiceItem, Supplier, Purchase
    query = (
        db.session.query(
            PurchaseInvoiceItem.id,
            PurchaseInvoice.date,
            PurchaseInvoice.purchase_id,
            Purchase.supplier_name,
            PurchaseInvoiceItem.product_name,
            PurchaseInvoiceItem.quantity,
            PurchaseInvoiceItem.unit_price,
            PurchaseInvoiceItem.total_price,
            PurchaseInvoiceItem.invoice_id,
            PurchaseInvoiceItem.id.label('item_id'),
            PurchaseInvoiceItem.product_id,
            PurchaseInvoiceItem.total_price.label('item_total'),
            PurchaseInvoice.id.label('invoice_id'),
            PurchaseInvoice.remarks.label('delivery_no'),
            Purchase.status.label('purchase_status'),
            PurchaseInvoice.id.label('invoice_no'),
            PurchaseInvoice.payment_status.label('invoice_payment_status')
        )
        .join(PurchaseInvoice, PurchaseInvoiceItem.invoice_id == PurchaseInvoice.id)
        .join(Purchase, PurchaseInvoice.purchase_id == Purchase.id)
    )

    # Filter by date range
    if from_dt:
        query = query.filter(PurchaseInvoice.date >= from_dt)
    if to_dt:
        query = query.filter(PurchaseInvoice.date <= to_dt)
    # Join Supplier to get is_company flag
    from models import Supplier as SupplierModel
    query = query.join(SupplierModel, Purchase.supplier_id == SupplierModel.id).add_columns(SupplierModel.is_company)
    # Filter by supplier
    if supplier_id:
        query = query.filter(Purchase.supplier_id == supplier_id)
    # Filter by payment status
    if payment_status and payment_status != 'All Payments':
        query = query.filter(PurchaseInvoice.payment_status.ilike(payment_status.lower()))
    # Search by supplier name, product name, invoice no
    if search:
        query = query.filter(
            or_(
                Purchase.supplier_name.ilike(f'%{search}%'),
                PurchaseInvoiceItem.product_name.ilike(f'%{search}%'),
                PurchaseInvoice.id.ilike(f'%{search}%')
            )
        )
    # Order by date desc
    query = query.order_by(PurchaseInvoice.date.desc())
    results = query.all()

    # Format for frontend
    purchase_data = []
    for idx, row in enumerate(results, 1):
        purchase_data.append({
            'id': row.item_id,
            'slNo': idx,
            'date': row.date.strftime('%Y-%m-%d') if row.date else '',
            'supplierName': row.supplier_name,
            'invoiceNo': str(row.invoice_no),
            'deliveryNo': row.delivery_no or '',
            'productName': row.product_name,
            'quantity': float(row.quantity) if row.quantity else 0,
            'unitPrice': float(row.unit_price) if row.unit_price else 0,
            'totalAmount': float(row.item_total) if row.item_total else 0,
            'paymentStatus': row.invoice_payment_status.capitalize() if row.invoice_payment_status else '',
            'isCompany': bool(row.is_company) if row.is_company is not None else False,
        })
    # Totals exclude company suppliers
    non_company = [item for item in purchase_data if not item['isCompany']]
    total_quantity = sum(item['quantity'] for item in non_company)
    total_amount = sum(item['totalAmount'] for item in non_company)
    paid_amount = sum(item['totalAmount'] for item in non_company if item['paymentStatus'] == 'Paid')
    pending_amount = sum(item['totalAmount'] for item in non_company if item['paymentStatus'] == 'Pending')

    return jsonify({
        "data": purchase_data,
        "totals": {
            "totalQuantity": total_quantity,
            "totalAmount": total_amount,
            "paidAmount": paid_amount,
            "pendingAmount": pending_amount
        }
    })

@app.route('/api/reports/product-history', methods=['GET'])
@jwt_required()
def product_history_report():
    from datetime import datetime
    from sqlalchemy import or_
    from models import (
        PurchaseInvoice, PurchaseInvoiceItem, Purchase, Supplier,
        Sale, SaleItem, Customer,
        SupplierReturn, CustomerReturn, DumpEntry, RegularProduct, NonProduct
    )
    product_id = request.args.get('productId', type=int)
    product_like = request.args.get('productLike', '')
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    customer_id = request.args.get('customerId', type=int)
    supplier_id = request.args.get('supplierId', type=int)
    show_supplier_records = bool(product_id or product_like.strip()) and (
        not customer_id or bool(supplier_id)
    )

    from_dt = datetime.strptime(from_date, "%Y-%m-%d") if from_date else None
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") if to_date else None

    # Purchases
    purchases_query = (
        db.session.query(
            PurchaseInvoice.date,
            PurchaseInvoice.purchase_id,
            Purchase.supplier_name,
            Supplier.is_company,
            PurchaseInvoiceItem.product_name,
            PurchaseInvoiceItem.quantity,
            PurchaseInvoiceItem.unit_price,
            PurchaseInvoiceItem.total_price,
            PurchaseInvoice.remarks.label('invoice_remarks'),
            PurchaseInvoiceItem.remarks.label('item_remarks')
        )
        .join(Purchase, PurchaseInvoice.purchase_id == Purchase.id)
        .join(Supplier, Purchase.supplier_id == Supplier.id)
        .join(PurchaseInvoiceItem, PurchaseInvoice.id == PurchaseInvoiceItem.invoice_id)
    )
    if from_dt:
        purchases_query = purchases_query.filter(PurchaseInvoice.date >= from_dt)
    if to_dt:
        purchases_query = purchases_query.filter(PurchaseInvoice.date <= to_dt)
    if supplier_id:
        purchases_query = purchases_query.filter(Purchase.supplier_id == supplier_id)
    if product_id:
        purchases_query = purchases_query.filter(PurchaseInvoiceItem.product_id == product_id)
    if product_like:
        purchases_query = purchases_query.filter(PurchaseInvoiceItem.product_name.ilike(f'%{product_like}%'))
    purchases = purchases_query.all() if show_supplier_records else []
    purchases_data = [
        {
            'date': row.date.strftime('%Y-%m-%d') if row.date else '',
            'supplierName': row.supplier_name,
            'product': row.product_name,
            'quantity': float(row.quantity) if row.quantity else 0,
            'unitPrice': float(row.unit_price) if row.unit_price else 0,
            'total': float(row.total_price) if row.total_price else 0,
            'notes': row.invoice_remarks or row.item_remarks or '',
            'purchaseId': row.purchase_id,
            'isCompany': bool(row.is_company) if row.is_company is not None else False,
        }
        for row in purchases
    ]

    # Supplier Returns
    supplier_returns_query = SupplierReturn.query
    if from_dt:
        supplier_returns_query = supplier_returns_query.filter(SupplierReturn.date >= from_dt.date())
    if to_dt:
        supplier_returns_query = supplier_returns_query.filter(SupplierReturn.date <= to_dt.date())
    if supplier_id:
        supplier_returns_query = supplier_returns_query.filter(SupplierReturn.supplier_id == supplier_id)
    if product_id:
        supplier_returns_query = supplier_returns_query.filter(SupplierReturn.product_id == product_id)
    if product_like:
        supplier_returns_query = supplier_returns_query.filter(SupplierReturn.description.ilike(f'%{product_like}%'))
    supplier_returns = supplier_returns_query.all() if show_supplier_records else []
    supplier_returns_data = [
        {
            'date': r.date.strftime('%Y-%m-%d') if r.date else '',
            'invoice': r.invoice_number,
            'supplierName': r.supplier.supplier_name if r.supplier else '',
            'product': r.description,
            'quantity': r.quantity,
            'unitPrice': float(r.unit_price),
            'total': float(r.total_value),
            'notes': r.remarks or '',
            'isCompany': bool(r.supplier.is_company) if r.supplier and r.supplier.is_company is not None else False,
        }
        for r in supplier_returns
    ]

    # Sales (join product tables for description)
    sales_query = (
        db.session.query(
            Sale.date,
            Sale.invoice_number,
            Customer.customer_name,
            Customer.is_company,
            SaleItem.product_id,
            SaleItem.non_product_id,
            SaleItem.quantity,
            SaleItem.unit_price,
            SaleItem.total_price,
            RegularProduct.description.label('regular_product_desc'),
            NonProduct.description.label('non_product_desc'),
            SaleItem.notes.label('item_notes'),
            Sale.notes.label('invoice_notes')
        )
        .join(SaleItem, Sale.id == SaleItem.sale_id)
        .join(Customer, Sale.customer_id == Customer.id)
        .outerjoin(RegularProduct, SaleItem.product_id == RegularProduct.id)
        .outerjoin(NonProduct, SaleItem.non_product_id == NonProduct.id)
    )
    if from_dt:
        sales_query = sales_query.filter(Sale.date >= from_dt)
    if to_dt:
        sales_query = sales_query.filter(Sale.date < to_dt)
    if customer_id:
        sales_query = sales_query.filter(Sale.customer_id == customer_id)
    if product_id:
        sales_query = sales_query.filter(
            or_(SaleItem.product_id == product_id, SaleItem.non_product_id == product_id)
        )
    if product_like:
        sales_query = sales_query.filter(
            or_(
                RegularProduct.description.ilike(f'%{product_like}%'),
                NonProduct.description.ilike(f'%{product_like}%')
            )
        )
    sales_query = sales_query.filter(Sale.status == 'finalized')
    sales = sales_query.all()
    sales_data = [
        {
            'date': row.date.strftime('%Y-%m-%d') if row.date else '',
            'invoiceNo': row.invoice_number,
            'customerName': row.customer_name,
            'product': row.regular_product_desc or row.non_product_desc or '',
            'quantity': float(row.quantity) if row.quantity else 0,
            'unitPrice': float(row.unit_price) if row.unit_price else 0,
            'total': float(row.total_price) if row.total_price else 0,
            'notes': row.item_notes or row.invoice_notes or '',
            'isCompany': bool(row.is_company) if row.is_company is not None else False,
        }
        for row in sales
    ]

    discounts_query = CustomerDiscount.query.join(
        SaleItem, CustomerDiscount.sale_item_id == SaleItem.id
    ).join(
        Sale, CustomerDiscount.sale_id == Sale.id
    ).options(
        db.joinedload(CustomerDiscount.customer),
        db.joinedload(CustomerDiscount.sale),
        db.joinedload(CustomerDiscount.sale_item).joinedload(SaleItem.product),
        db.joinedload(CustomerDiscount.sale_item).joinedload(SaleItem.non_product),
    ).filter(
        CustomerDiscount.is_deleted.is_(False),
        Sale.status == 'finalized',
    )
    if from_dt:
        discounts_query = discounts_query.filter(CustomerDiscount.date >= from_dt.date())
    if to_dt:
        discounts_query = discounts_query.filter(CustomerDiscount.date < to_dt.date())
    if customer_id:
        discounts_query = discounts_query.filter(Sale.customer_id == customer_id)
    if product_id:
        discounts_query = discounts_query.filter(
            or_(SaleItem.product_id == product_id, SaleItem.non_product_id == product_id)
        )
    if product_like:
        discounts_query = discounts_query.filter(
            or_(
                RegularProduct.description.ilike(f'%{product_like}%'),
                NonProduct.description.ilike(f'%{product_like}%'),
            )
        )
    for discount in discounts_query.order_by(
        CustomerDiscount.date.asc(), CustomerDiscount.id.asc()
    ).all():
        sale_item = discount.sale_item
        sales_data.append({
            'date': discount.date.isoformat(),
            'invoiceNo': f"{discount.sale.invoice_number} / {discount.reference}" if discount.sale else discount.reference,
            'customerName': discount.customer.customer_name if discount.customer else '',
            'product': (
                sale_item.product.description if sale_item and sale_item.product
                else sale_item.non_product.description if sale_item and sale_item.non_product
                else ''
            ),
            'quantity': 0,
            'unitPrice': 0,
            'total': -float(discount.amount or 0),
            'notes': discount.reason or '',
            'isCompany': bool(discount.customer.is_company) if discount.customer else False,
            'isCustomerDiscount': True,
        })

    # Customer Returns
    customer_returns_query = CustomerReturn.query
    if from_dt:
        customer_returns_query = customer_returns_query.filter(CustomerReturn.date >= from_dt.date())
    if to_dt:
        customer_returns_query = customer_returns_query.filter(CustomerReturn.date <= to_dt.date())
    if customer_id:
        customer_returns_query = customer_returns_query.filter(CustomerReturn.customer_id == customer_id)
    if product_id:
        customer_returns_query = customer_returns_query.filter(CustomerReturn.product_id == product_id)
    if product_like:
        customer_returns_query = customer_returns_query.filter(CustomerReturn.description.ilike(f'%{product_like}%'))
    customer_returns = customer_returns_query.all()
    customer_returns_data = [
        {
            'date': r.date.strftime('%Y-%m-%d') if r.date else '',
            'invoice': r.invoice_number,
            'customerName': r.customer.customer_name if r.customer else '',
            'product': r.description,
            'quantity': r.quantity,
            'unitPrice': float(r.unit_price),
            'total': float(r.total_value),
            'notes': r.remarks or '',
        }
        for r in customer_returns
    ]

    # Dumps (lookup product name)
    dumps_query = DumpEntry.query
    if from_dt:
        dumps_query = dumps_query.filter(DumpEntry.date >= from_dt.date())
    if to_dt:
        dumps_query = dumps_query.filter(DumpEntry.date <= to_dt.date())
    if product_id:
        dumps_query = dumps_query.filter(DumpEntry.product_id == product_id)
    if product_like:
        dumps_query = dumps_query.filter(DumpEntry.description.ilike(f'%{product_like}%'))
    dumps = dumps_query.all()
    dumps_data = []
    for d in dumps:
        product_name = ''
        if d.product_type == 'regular':
            product = RegularProduct.query.get(d.product_id)
            product_name = product.description if product else ''
        else:
            product = NonProduct.query.get(d.product_id)
            product_name = product.description if product else ''
        dumps_data.append({
            'date': d.date.strftime('%Y-%m-%d') if d.date else '',
            'product': product_name,
            'totalQty': d.quantity,
            'notes': d.remarks or ''
        })

    return jsonify({
        'purchases': purchases_data,
        'supplierReturns': supplier_returns_data,
        'sales': sales_data,
        'customerReturns': customer_returns_data,
        'dumps': dumps_data
    })

@app.route('/api/reports/product-history/pdf', methods=['GET'])
@jwt_required()
def product_history_pdf():
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from io import BytesIO
    import tempfile
    
    # Get the same data as the regular endpoint
    from datetime import datetime
    from sqlalchemy import or_
    from models import (
        PurchaseInvoice, PurchaseInvoiceItem, Purchase, Supplier,
        Sale, SaleItem, Customer,
        SupplierReturn, CustomerReturn, DumpEntry, RegularProduct, NonProduct
    )
    
    product_id = request.args.get('productId', type=int)
    product_like = request.args.get('productLike', '')
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    customer_id = request.args.get('customerId', type=int)
    supplier_id = request.args.get('supplierId', type=int)
    show_supplier_records = bool(product_id or product_like.strip()) and (
        not customer_id or bool(supplier_id)
    )

    from_dt = datetime.strptime(from_date, "%Y-%m-%d") if from_date else None
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") if to_date else None

    # Get all the data (same logic as the main endpoint)
    # Purchases
    purchases_query = (
        db.session.query(
            PurchaseInvoice.date,
            PurchaseInvoice.purchase_id,
            Purchase.supplier_name,
            PurchaseInvoiceItem.product_name,
            PurchaseInvoiceItem.quantity,
            PurchaseInvoiceItem.unit_price,
            PurchaseInvoiceItem.total_price,
            PurchaseInvoice.remarks.label('invoice_notes'),
            PurchaseInvoiceItem.remarks.label('item_notes')
        )
        .join(Purchase, PurchaseInvoice.purchase_id == Purchase.id)
        .join(PurchaseInvoiceItem, PurchaseInvoice.id == PurchaseInvoiceItem.invoice_id)
    )
    if from_dt:
        purchases_query = purchases_query.filter(PurchaseInvoice.date >= from_dt)
    if to_dt:
        purchases_query = purchases_query.filter(PurchaseInvoice.date <= to_dt)
    if supplier_id:
        purchases_query = purchases_query.filter(Purchase.supplier_id == supplier_id)
    if product_id:
        purchases_query = purchases_query.filter(PurchaseInvoiceItem.product_id == product_id)
    if product_like:
        purchases_query = purchases_query.filter(PurchaseInvoiceItem.product_name.ilike(f'%{product_like}%'))
    purchases = purchases_query.all() if show_supplier_records else []

    # Sales
    sales_query = (
        db.session.query(
            Sale.date,
            Sale.invoice_number,
            Customer.customer_name,
            SaleItem.product_id,
            SaleItem.non_product_id,
            SaleItem.quantity,
            SaleItem.unit_price,
            SaleItem.total_price,
            RegularProduct.description.label('regular_product_desc'),
            NonProduct.description.label('non_product_desc'),
            SaleItem.notes.label('item_notes'),
            Sale.notes.label('invoice_notes')
        )
        .join(SaleItem, Sale.id == SaleItem.sale_id)
        .join(Customer, Sale.customer_id == Customer.id)
        .outerjoin(RegularProduct, SaleItem.product_id == RegularProduct.id)
        .outerjoin(NonProduct, SaleItem.non_product_id == NonProduct.id)
    )
    if from_dt:
        sales_query = sales_query.filter(Sale.date >= from_dt)
    if to_dt:
        sales_query = sales_query.filter(Sale.date < to_dt)
    if customer_id:
        sales_query = sales_query.filter(Sale.customer_id == customer_id)
    if product_id:
        sales_query = sales_query.filter(
            or_(SaleItem.product_id == product_id, SaleItem.non_product_id == product_id)
        )
    if product_like:
        sales_query = sales_query.filter(
            or_(
                RegularProduct.description.ilike(f'%{product_like}%'),
                NonProduct.description.ilike(f'%{product_like}%')
            )
        )
    sales_query = sales_query.filter(Sale.status == 'finalized')
    sales = sales_query.all()

    from types import SimpleNamespace
    discounts_query = CustomerDiscount.query.join(
        SaleItem, CustomerDiscount.sale_item_id == SaleItem.id
    ).join(
        Sale, CustomerDiscount.sale_id == Sale.id
    ).join(
        Customer, Sale.customer_id == Customer.id
    ).filter(
        CustomerDiscount.is_deleted.is_(False),
        Sale.status == 'finalized',
    )
    if from_dt:
        discounts_query = discounts_query.filter(CustomerDiscount.date >= from_dt.date())
    if to_dt:
        discounts_query = discounts_query.filter(CustomerDiscount.date <= to_dt.date())
    if customer_id:
        discounts_query = discounts_query.filter(Sale.customer_id == customer_id)
    if product_id:
        discounts_query = discounts_query.filter(
            or_(SaleItem.product_id == product_id, SaleItem.non_product_id == product_id)
        )
    if product_like:
        discounts_query = discounts_query.outerjoin(
            RegularProduct, SaleItem.product_id == RegularProduct.id
        ).outerjoin(
            NonProduct, SaleItem.non_product_id == NonProduct.id
        ).filter(
            or_(
                RegularProduct.description.ilike(f'%{product_like}%'),
                NonProduct.description.ilike(f'%{product_like}%'),
            )
        )
    for discount in discounts_query.order_by(
        CustomerDiscount.date.asc(), CustomerDiscount.id.asc()
    ).all():
        line = discount.sale_item
        sales.append(SimpleNamespace(
            date=discount.date,
            invoice_number=f"{discount.sale.invoice_number} / {discount.reference}" if discount.sale else discount.reference,
            customer_name=discount.customer.customer_name if discount.customer else '',
            product=(
                line.product.description if line and line.product
                else line.non_product.description if line and line.non_product
                else ''
            ),
            quantity=0,
            unit_price=0,
            total_price=-float(discount.amount or 0),
        ))

    # Create PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=18)
    
    # Container for the 'Flowable' objects
    elements = []
    
    # Define styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        spaceAfter=30,
        alignment=1  # Center alignment
    )
    
    # Add title
    date_range = ""
    if from_date and to_date:
        date_range = f" ({from_date} to {to_date})"
    elif from_date:
        date_range = f" (from {from_date})"
    elif to_date:
        date_range = f" (to {to_date})"
    
    title = Paragraph(f"Product History Report{date_range}", title_style)
    elements.append(title)
    elements.append(Spacer(1, 12))
    
    # Add purchases table if there's data
    if purchases:
        elements.append(Paragraph("From Supplier", styles['Heading2']))
        purchase_data = [['Sl.No', 'Date', 'Supplier', 'Product', 'Notes', 'Qty', 'Unit Price', 'Total']]
        for idx, row in enumerate(purchases, 1):
            purchase_data.append([
                str(idx),
                row.date.strftime('%Y-%m-%d') if row.date else '',
                row.supplier_name or '',
                row.product_name or '',
                row.invoice_remarks or row.item_remarks or '',
                str(int(row.quantity)) if row.quantity else '0',
                f"{float(row.unit_price):.2f}" if row.unit_price else '0.00',
                f"{float(row.total_price):.2f}" if row.total_price else '0.00'
            ])
        
        purchase_table = Table(purchase_data)
        purchase_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(purchase_table)
        elements.append(Spacer(1, 20))
    
    # Add sales table if there's data
    if sales:
        elements.append(Paragraph("Sales", styles['Heading2']))
        sales_data = [['Sl.No', 'Date', 'Invoice', 'Customer', 'Product', 'Notes', 'Qty', 'Unit Price', 'Total']]
        for idx, row in enumerate(sales, 1):
            product_desc = (
                getattr(row, 'product', None)
                or getattr(row, 'regular_product_desc', None)
                or getattr(row, 'non_product_desc', None)
                or ''
            )
            sales_data.append([
                str(idx),
                row.date.strftime('%Y-%m-%d') if row.date else '',
                row.invoice_number or '',
                row.customer_name or '',
                product_desc,
                getattr(row, 'item_notes', '') or getattr(row, 'invoice_notes', '') or '',
                str(int(row.quantity)) if row.quantity else '0',
                f"{float(row.unit_price):.2f}" if row.unit_price else '0.00',
                f"{float(row.total_price):.2f}" if row.total_price else '0.00'
            ])
        
        sales_table = Table(sales_data)
        sales_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(sales_table)
    
    # Build PDF
    doc.build(elements)
    
    # FileResponse
    buffer.seek(0)
    return send_file(
        BytesIO(buffer.read()),
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'product_history_{from_date or "all"}_{to_date or "all"}.pdf'
    )

@app.route('/api/reports/product-history/email', methods=['POST'])
@jwt_required()
def product_history_email():
    try:
        email = request.args.get('email')
        if not email:
            return jsonify({'error': 'Email address is required'}), 400
        
        # Get the same data as the regular endpoint - reuse the existing logic
        from datetime import datetime, timedelta
        from sqlalchemy import or_, func
        from models import (
            PurchaseInvoice, PurchaseInvoiceItem, Purchase, Supplier,
            Sale, SaleItem, Customer,
            SupplierReturn, CustomerReturn, DumpEntry, RegularProduct, NonProduct
        )
        
        product_id = request.args.get('productId', type=int)
        product_like = request.args.get('productLike', '')
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        customer_id = request.args.get('customerId', type=int)
        supplier_id = request.args.get('supplierId', type=int)
        show_supplier_records = bool(product_id or product_like.strip()) and (
            not customer_id or bool(supplier_id)
        )

        from_dt = datetime.strptime(from_date, "%Y-%m-%d") if from_date else None
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1) if to_date else None

        # Get all data using the same logic as the main endpoint
        # 1. Purchases from purchase invoices (only regular products)
        purchases_query = (
            db.session.query(
                PurchaseInvoice.date,
                Purchase.supplier_name,
                PurchaseInvoiceItem.product_name.label('product'),
                PurchaseInvoiceItem.quantity,
                PurchaseInvoiceItem.unit_price,
                PurchaseInvoiceItem.total_price,
                PurchaseInvoice.remarks.label('invoice_remarks'),
                PurchaseInvoiceItem.remarks.label('item_remarks')
            )
            .join(Purchase, PurchaseInvoice.purchase_id == Purchase.id)
            .join(PurchaseInvoiceItem, PurchaseInvoice.id == PurchaseInvoiceItem.invoice_id)
        )
        
        # 2. Supplier Returns
        supplier_returns_query = (
            db.session.query(
                SupplierReturn.date,
                SupplierReturn.invoice_number,
                Supplier.supplier_name,
                SupplierReturn.description.label('product'),
                SupplierReturn.quantity,
                SupplierReturn.unit_price,
                SupplierReturn.total_value.label('total_amount'),
                SupplierReturn.remarks.label('notes')
            )
            .join(Supplier, SupplierReturn.supplier_id == Supplier.id)
        )
        
        # 3. Sales
        sales_query = (
            db.session.query(
                Sale.date,
                Sale.invoice_number,
                Customer.customer_name,
                func.coalesce(RegularProduct.description, NonProduct.description, 'Unknown').label('product'),
                SaleItem.quantity,
                SaleItem.unit_price,
                SaleItem.total_price,
                SaleItem.notes.label('item_notes'),
                Sale.notes.label('invoice_notes')
            )
            .join(SaleItem, Sale.id == SaleItem.sale_id)
            .join(Customer, Sale.customer_id == Customer.id)
            .outerjoin(RegularProduct, SaleItem.product_id == RegularProduct.id)
            .outerjoin(NonProduct, SaleItem.non_product_id == NonProduct.id)
            .filter(Sale.status == 'finalized')
        )
        
        # 4. Customer Returns
        customer_returns_query = (
            db.session.query(
                CustomerReturn.date,
                CustomerReturn.invoice_number,
                Customer.customer_name,
                CustomerReturn.description.label('product'),
                CustomerReturn.quantity,
                CustomerReturn.unit_price,
                CustomerReturn.total_value.label('total_amount'),
                CustomerReturn.remarks.label('notes')
            )
            .join(Customer, CustomerReturn.customer_id == Customer.id)
        )
        
        # 5. Dumps
        dumps_query = (
            db.session.query(
                DumpEntry.date,
                DumpEntry.description.label('product'),
                func.sum(DumpEntry.quantity).label('total_qty'),
                DumpEntry.remarks.label('notes')
            )
            .group_by(DumpEntry.date, DumpEntry.description, DumpEntry.remarks)
        )
        
        # Apply filters to each query individually
        # Purchases filters
        if from_dt:
            purchases_query = purchases_query.filter(PurchaseInvoice.date >= from_dt)
        if to_dt:
            purchases_query = purchases_query.filter(PurchaseInvoice.date < to_dt)
        if product_id:
            purchases_query = purchases_query.filter(PurchaseInvoiceItem.product_id == product_id)
        if product_like:
            purchases_query = purchases_query.filter(PurchaseInvoiceItem.product_name.ilike(f'%{product_like}%'))
        if supplier_id:
            purchases_query = purchases_query.filter(Purchase.supplier_id == supplier_id)
        
        # Supplier returns filters
        if from_dt:
            supplier_returns_query = supplier_returns_query.filter(SupplierReturn.date >= from_dt.date())
        if to_dt:
            supplier_returns_query = supplier_returns_query.filter(SupplierReturn.date < to_dt.date())
        if product_id:
            supplier_returns_query = supplier_returns_query.filter(SupplierReturn.product_id == product_id)
        if product_like:
            supplier_returns_query = supplier_returns_query.filter(SupplierReturn.description.ilike(f'%{product_like}%'))
        if supplier_id:
            supplier_returns_query = supplier_returns_query.filter(SupplierReturn.supplier_id == supplier_id)
        
        # Sales filters
        if from_dt:
            sales_query = sales_query.filter(Sale.date >= from_dt)
        if to_dt:
            sales_query = sales_query.filter(Sale.date < to_dt)
        if product_id:
            sales_query = sales_query.filter(
                or_(SaleItem.product_id == product_id, SaleItem.non_product_id == product_id)
            )
        if product_like:
            sales_query = sales_query.filter(
                or_(
                    RegularProduct.description.ilike(f'%{product_like}%'),
                    NonProduct.description.ilike(f'%{product_like}%')
                )
            )
        if customer_id:
            sales_query = sales_query.filter(Sale.customer_id == customer_id)
        
        # Customer returns filters
        if from_dt:
            customer_returns_query = customer_returns_query.filter(CustomerReturn.date >= from_dt.date())
        if to_dt:
            customer_returns_query = customer_returns_query.filter(CustomerReturn.date < to_dt.date())
        if product_id:
            customer_returns_query = customer_returns_query.filter(CustomerReturn.product_id == product_id)
        if product_like:
            customer_returns_query = customer_returns_query.filter(CustomerReturn.description.ilike(f'%{product_like}%'))
        if customer_id:
            customer_returns_query = customer_returns_query.filter(CustomerReturn.customer_id == customer_id)
        
        # Dumps filters
        if from_dt:
            dumps_query = dumps_query.filter(DumpEntry.date >= from_dt.date())
        if to_dt:
            dumps_query = dumps_query.filter(DumpEntry.date < to_dt.date())
        if product_id:
            dumps_query = dumps_query.filter(DumpEntry.product_id == product_id)
        if product_like:
            dumps_query = dumps_query.filter(DumpEntry.description.ilike(f'%{product_like}%'))
        
        # Execute queries
        purchases = purchases_query.all() if show_supplier_records else []
        supplier_returns = supplier_returns_query.all() if show_supplier_records else []
        sales = sales_query.all()
        from types import SimpleNamespace
        discounts_query = CustomerDiscount.query.join(
            SaleItem, CustomerDiscount.sale_item_id == SaleItem.id
        ).join(
            Sale, CustomerDiscount.sale_id == Sale.id
        ).join(
            Customer, Sale.customer_id == Customer.id
        ).filter(
            CustomerDiscount.is_deleted.is_(False),
            Sale.status == 'finalized',
        )
        if from_dt:
            discounts_query = discounts_query.filter(CustomerDiscount.date >= from_dt.date())
        if to_dt:
            discounts_query = discounts_query.filter(CustomerDiscount.date < to_dt.date())
        if customer_id:
            discounts_query = discounts_query.filter(Sale.customer_id == customer_id)
        if product_id:
            discounts_query = discounts_query.filter(
                or_(SaleItem.product_id == product_id, SaleItem.non_product_id == product_id)
            )
        if product_like:
            discounts_query = discounts_query.outerjoin(
                RegularProduct, SaleItem.product_id == RegularProduct.id
            ).outerjoin(
                NonProduct, SaleItem.non_product_id == NonProduct.id
            ).filter(
                or_(
                    RegularProduct.description.ilike(f'%{product_like}%'),
                    NonProduct.description.ilike(f'%{product_like}%'),
                )
            )
        for discount in discounts_query.order_by(
            CustomerDiscount.date.asc(), CustomerDiscount.id.asc()
        ).all():
            line = discount.sale_item
            sales.append(SimpleNamespace(
                date=discount.date,
                invoice_number=f"{discount.sale.invoice_number} / {discount.reference}" if discount.sale else discount.reference,
                customer_name=discount.customer.customer_name if discount.customer else '',
                product=(
                    line.product.description if line and line.product
                    else line.non_product.description if line and line.non_product
                    else ''
                ),
                quantity=0,
                unit_price=0,
                total_price=-float(discount.amount or 0),
                notes=discount.reason or '',
            ))
        customer_returns = customer_returns_query.all()
        dumps = dumps_query.all()

        # Generate PDF with jsPDF-like styling
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet
        from io import BytesIO
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
        
        elements = []
        styles = getSampleStyleSheet()
        
        # Add header
        elements.append(Paragraph('PRODUCT HISTORY REPORT', styles['Title']))
        elements.append(Paragraph('TROPIFRUIT UK LTD', styles['Normal']))
        elements.append(Paragraph('3 Dolphin Way, Purfleet, RM19 1NZ', styles['Normal']))
        elements.append(Spacer(1, 12))
        
        date_range_text = f"Report Period: {from_date or 'All'} to {to_date or 'All'}"
        elements.append(Paragraph(date_range_text, styles['Normal']))
        elements.append(Paragraph(f"Generated: {datetime.now().strftime('%d/%m/%Y %H:%M')}", styles['Normal']))
        elements.append(Spacer(1, 20))
        
        # Define table style matching frontend PDF
        table_style = TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.Color(66/255, 139/255, 202/255)),  # Blue header
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 2),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ])
        
        # Add all tables
        tables_data = [
            ('FROM SUPPLIER', purchases, ['Sl.No', 'Date', 'Supplier', 'Product', 'Notes', 'Qty', 'Unit Price', 'Total']),
            ('SUPPLIER RETURNS', supplier_returns, ['Sl.No', 'Date', 'Invoice#', 'Supplier', 'Product', 'Notes', 'Qty', 'Unit Price', 'Total']),
            ('SALES', sales, ['Sl.No', 'Date', 'Invoice', 'Customer', 'Product', 'Notes', 'Qty', 'Unit Price', 'Total']),
            ('CUSTOMER RETURNS', customer_returns, ['Sl.No', 'Date', 'Invoice#', 'Customer', 'Product', 'Notes', 'Qty', 'Unit Price', 'Total']),
            ('DUMPS', dumps, ['Sl.No', 'Date', 'Product', 'Notes', 'Total Qty'])
        ]
        
        for title, data, headers in tables_data:
            if data:
                elements.append(Paragraph(title, styles['Heading2']))
                elements.append(Spacer(1, 6))
                
                # Prepare table data
                table_data = [headers]
                for idx, row in enumerate(data, 1):
                    if title == 'DUMPS':
                        table_data.append([
                            str(idx),
                            row.date.strftime('%Y-%m-%d') if row.date else '',
                            str(row.product or ''),
                            str(row.notes or ''),
                            str(int(row.total_qty)) if row.total_qty else '0'
                        ])
                    else:
                        table_data.append([
                            str(idx),
                            row.date.strftime('%Y-%m-%d') if row.date else '',
                            str(getattr(row, 'invoice_number', '') or getattr(row, 'supplier_name', '') or getattr(row, 'customer_name', '')),
                            str(getattr(row, 'supplier_name', '') or getattr(row, 'customer_name', '')),
                            str(row.product or ''),
                            str(getattr(row, 'item_notes', '') or getattr(row, 'invoice_notes', '') or getattr(row, 'notes', '') or ''),
                            str(int(row.quantity)) if row.quantity else '0',
                            f"{float(row.unit_price):.2f}" if row.unit_price else '0.00',
                            f"{float(getattr(row, 'total_price', 0) or getattr(row, 'total_amount', 0)):.2f}"
                        ])
                
                # Create table
                table = Table(table_data)
                table.setStyle(table_style)
                elements.append(table)
                elements.append(Spacer(1, 15))
        
        # Add footer
        elements.append(Spacer(1, 20))
        footer_style = styles['Normal']
        footer_style.fontSize = 8
        footer_style.alignment = 2  # Right align
        elements.append(Paragraph('stand100', footer_style))
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        date_range = ""
        if from_date and to_date:
            date_range = f" ({from_date} to {to_date})"
        elif from_date:
            date_range = f" (from {from_date})"
        elif to_date:
            date_range = f" (to {to_date})"
        
        from mail_utils import send_via_brevo
        body = f'Please find attached the Product History Report{date_range}.\n\nBest regards,\nTROPIFRUIT UK LTD'
        ok = send_via_brevo(
            to_list=[email],
            subject=f'Product History Report{date_range}',
            html_content=f'<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">{body}</pre>',
            text_content=body,
            attachments=[{
                'filename': f'product_history_{from_date or "all"}_{to_date or "all"}.pdf',
                'content': buffer.getvalue(),
                'content_type': 'application/pdf',
            }],
        )
        if not ok:
            return jsonify({'error': 'Failed to send email via Brevo. Check server logs.'}), 500
        
        return jsonify({'message': 'Email sent successfully'}), 200
        
    except Exception as e:
        print(f"Error sending email: {str(e)}")
        return jsonify({'error': f'Failed to send email: {str(e)}'}), 500

@app.route('/api/reports/prod-customer-history', methods=['GET'])
@jwt_required()
def prod_customer_history():
    from datetime import datetime, timedelta
    from sqlalchemy import func, or_
    from models import Sale, SaleItem, Customer, RegularProduct, NonProduct

    customer_id = request.args.get('customerId', type=int)
    product_id = request.args.get('productId', type=int)
    product_type = request.args.get('productType', '')
    product_like = request.args.get('productLike', '')
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')

    query = (
        db.session.query(
            func.coalesce(RegularProduct.description, NonProduct.description, 'Unknown').label('product'),
            func.sum(SaleItem.quantity).label('quantity'),
            (func.sum(SaleItem.total_price) / func.nullif(func.sum(SaleItem.quantity), 0)).label('avg_price'),
            func.sum(SaleItem.total_price).label('total')
        )
        .join(Sale, SaleItem.sale_id == Sale.id)
        .outerjoin(RegularProduct, SaleItem.product_id == RegularProduct.id)
        .outerjoin(NonProduct, SaleItem.non_product_id == NonProduct.id)
    )
    
    # Apply customer filter
    if customer_id:
        query = query.filter(Sale.customer_id == customer_id)
    else:
        # When "All Customers" selected, exclude company customers from totals
        query = query.join(Customer, Sale.customer_id == Customer.id).filter(Customer.is_company == False)
    
    # Apply product filter
    if product_id and product_type:
        if product_type == 'regular':
            query = query.filter(SaleItem.product_id == product_id)
        elif product_type == 'non':
            query = query.filter(SaleItem.non_product_id == product_id)
    
    # Apply product like filter
    if product_like:
        query = query.filter(
            or_(
                RegularProduct.description.ilike(f'%{product_like}%'),
                NonProduct.description.ilike(f'%{product_like}%')
            )
        )
    
    # Apply date filters
    if from_date and to_date:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Sale.date >= from_dt, Sale.date < to_dt)
    elif from_date:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        query = query.filter(Sale.date >= from_dt)
    elif to_date:
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Sale.date < to_dt)
    
    query = query.filter(Sale.status == 'finalized')
    query = query.group_by(RegularProduct.description, NonProduct.description)
    query = query.order_by(func.sum(SaleItem.total_price).desc())

    results = query.all()
    discount_query = db.session.query(
        func.coalesce(RegularProduct.description, NonProduct.description, 'Unknown').label('product'),
        func.sum(CustomerDiscount.amount).label('discount_total'),
    ).join(
        Sale, CustomerDiscount.sale_id == Sale.id
    ).join(
        SaleItem, CustomerDiscount.sale_item_id == SaleItem.id
    ).outerjoin(
        RegularProduct, SaleItem.product_id == RegularProduct.id
    ).outerjoin(
        NonProduct, SaleItem.non_product_id == NonProduct.id
    ).filter(
        CustomerDiscount.is_deleted.is_(False),
        Sale.status == 'finalized',
    )
    if customer_id:
        discount_query = discount_query.filter(Sale.customer_id == customer_id)
    else:
        discount_query = discount_query.join(Customer, Sale.customer_id == Customer.id).filter(
            Customer.is_company == False
        )
    if product_id and product_type == 'regular':
        discount_query = discount_query.filter(SaleItem.product_id == product_id)
    elif product_id and product_type == 'non':
        discount_query = discount_query.filter(SaleItem.non_product_id == product_id)
    if product_like:
        discount_query = discount_query.filter(
            or_(
                RegularProduct.description.ilike(f'%{product_like}%'),
                NonProduct.description.ilike(f'%{product_like}%'),
            )
        )
    if from_date:
        discount_query = discount_query.filter(
            CustomerDiscount.date >= datetime.strptime(from_date, "%Y-%m-%d").date()
        )
    if to_date:
        discount_query = discount_query.filter(
            CustomerDiscount.date < (datetime.strptime(to_date, "%Y-%m-%d").date() + timedelta(days=1))
        )
    discount_by_product = {
        row.product: float(row.discount_total or 0)
        for row in discount_query.group_by(
            RegularProduct.description, NonProduct.description
        ).all()
    }

    data = []
    for idx, row in enumerate(results, 1):
        discount_total = discount_by_product.pop(row.product, 0)
        net_total = float(row.total or 0) - discount_total
        quantity = float(row.quantity) if row.quantity else 0
        data.append({
            "slNo": idx,
            "product": row.product,
            "quantity": quantity,
            "avgPrice": net_total / quantity if quantity else 0,
            "total": net_total,
            "grossTotal": float(row.total or 0),
            "discountTotal": discount_total,
        })
    for product_name, discount_total in discount_by_product.items():
        data.append({
            "slNo": len(data) + 1,
            "product": product_name,
            "quantity": 0,
            "avgPrice": 0,
            "total": -discount_total,
            "grossTotal": 0,
            "discountTotal": discount_total,
        })
    return jsonify(data)

@app.route('/api/reports/date-wise-sales', methods=['GET'])
@jwt_required()
def date_wise_sales():
    from datetime import datetime, timedelta
    from sqlalchemy import func, extract
    from models import Sale, SaleItem, Customer, RegularProduct, NonProduct

    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    sales_type = request.args.get('salesType', 'All')
    group_by = request.args.get('groupBy', 'Daily')
    search = request.args.get('search', '')

    if not from_date or not to_date:
        return jsonify({'error': 'fromDate and toDate are required'}), 400

    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)

    # Base query
    query = Sale.query.filter(
        Sale.date >= from_dt,
        Sale.date < to_dt,
        Sale.status == 'finalized'
    )
    if sales_type == 'Account Sales':
        query = query.filter(Sale.customer_type.ilike('account'))
    elif sales_type == 'Cash Sales':
        query = query.filter(Sale.customer_type.ilike('cash'))
    if search:
        query = query.join(Customer).filter(
            (Sale.invoice_number.ilike(f'%{search}%')) |
            (Customer.customer_name.ilike(f'%{search}%'))
        )

    sales = query.all()
    discount_query = CustomerDiscount.query.join(
        Sale, CustomerDiscount.sale_id == Sale.id
    ).join(Customer, Sale.customer_id == Customer.id).filter(
        CustomerDiscount.date >= from_dt.date(),
        CustomerDiscount.date < to_dt.date(),
        CustomerDiscount.is_deleted.is_(False),
        Sale.status == 'finalized',
        Customer.is_company == False,
    )
    if sales_type == 'Account Sales':
        discount_query = discount_query.filter(Sale.customer_type.ilike('account'))
    elif sales_type == 'Cash Sales':
        discount_query = discount_query.filter(Sale.customer_type.ilike('cash'))
    if search:
        discount_query = discount_query.filter(
            Sale.invoice_number.ilike(f'%{search}%') |
            Customer.customer_name.ilike(f'%{search}%')
        )
    discounts = discount_query.all()

    # Grouping logic
    def group_key(sale):
        if group_by == 'Monthly':
            return sale.date.strftime('%Y-%m')
        elif group_by == 'Weekly':
            return f"{sale.date.isocalendar()[0]}-W{sale.date.isocalendar()[1]:02d}"
        else:
            return sale.date.strftime('%Y-%m-%d')

    discounts_by_group = {}
    for discount in discounts:
        key = group_key(datetime.combine(discount.date, datetime.min.time()))
        discounts_by_group.setdefault(key, []).append(discount)

    grouped = {}
    for sale in sales:
        key = group_key(sale)
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(sale)
    for discount in discounts:
        grouped.setdefault(group_key(datetime.combine(discount.date, datetime.min.time())), [])

    result = []
    sl_no = 1
    for group, group_sales in sorted(grouped.items()):
        account_sales = sum(float(s.total_amount) for s in group_sales if s.customer_type.lower() == 'account' and not (s.customer and s.customer.is_company))
        cash_sales = sum(float(s.total_amount) for s in group_sales if s.customer_type.lower() == 'cash' and not (s.customer and s.customer.is_company))
        for discount in discounts_by_group.get(group, []):
            if discount.sale and discount.sale.customer_type.lower() == 'account':
                account_sales -= float(discount.amount or 0)
            elif discount.sale and discount.sale.customer_type.lower() == 'cash':
                cash_sales -= float(discount.amount or 0)
        total_sales = account_sales + cash_sales
        total_invoices = len([s for s in group_sales if not (s.customer and s.customer.is_company)])
        average_sale = total_sales / total_invoices if total_invoices else 0
        # Top product
        product_counter = {}
        for sale in group_sales:
            for item in sale.items:
                desc = ''
                if item.product_id:
                    prod = RegularProduct.query.get(item.product_id)
                    desc = prod.description if prod else ''
                elif item.non_product_id:
                    prod = NonProduct.query.get(item.non_product_id)
                    desc = prod.description if prod else ''
                if desc:
                    product_counter[desc] = product_counter.get(desc, 0) + item.quantity
        top_product = max(product_counter.items(), key=lambda x: x[1])[0] if product_counter else ''
        # Top customer
        customer_counter = {}
        for sale in group_sales:
            cname = sale.customer.customer_name if sale.customer else ''
            customer_counter[cname] = customer_counter.get(cname, 0) + float(sale.total_amount)
        for discount in discounts_by_group.get(group, []):
            cname = discount.customer.customer_name if discount.customer else ''
            customer_counter[cname] = customer_counter.get(cname, 0) - float(discount.amount or 0)
        top_customer = max(customer_counter.items(), key=lambda x: x[1])[0] if customer_counter else ''
        result.append({
            'id': sl_no,
            'date': group,
            'totalSales': total_sales,
            'accountSales': account_sales,
            'cashSales': cash_sales,
            'totalInvoices': total_invoices,
            'averageSale': average_sale,
            'topProduct': top_product,
            'topCustomer': top_customer
        })
        sl_no += 1
    return jsonify(result)

@app.route('/api/reports/customer-returns', methods=['GET'])
@jwt_required()
def customer_returns_report():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    customer_id = request.args.get('customerId', type=int)
    status = request.args.get('status')
    search = request.args.get('search', '')

    if not from_date or not to_date:
        return jsonify({'error': 'fromDate and toDate are required'}), 400

    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)

    query = CustomerReturn.query.join(Customer, CustomerReturn.customer_id == Customer.id)
    query = query.filter(CustomerReturn.date >= from_dt, CustomerReturn.date < to_dt)
    if customer_id:
        query = query.filter(CustomerReturn.customer_id == customer_id)
    if status and status != 'All Returns':
        query = query.filter(CustomerReturn.status.ilike(status.lower()))
    if search:
        query = query.filter(
            or_(
                Customer.customer_name.ilike(f'%{search}%'),
                CustomerReturn.invoice_number.ilike(f'%{search}%'),
                CustomerReturn.description.ilike(f'%{search}%')
            )
        )
    query = query.order_by(CustomerReturn.date.desc())
    returns = query.all()
    result = []
    for idx, r in enumerate(returns, 1):
        # Get product name
        product_name = ''
        if r.product_type == 'regular':
            prod = RegularProduct.query.get(r.product_id)
            product_name = prod.description if prod else ''
        else:
            prod = NonProduct.query.get(r.product_id)
            product_name = prod.description if prod else ''
        # Get customer name
        customer_name = r.customer.customer_name if r.customer else ''
        result.append({
            'id': r.id,
            'slNo': idx,
            'returnDate': r.date.strftime('%Y-%m-%d') if r.date else '',
            'customerName': customer_name,
            'invoiceNo': r.invoice_number or '',
            'productName': product_name,
            'quantity': r.quantity,
            'returnReason': r.return_reason or '',
            'returnAmount': float(r.total_value) if r.total_value else 0,
            'refundStatus': r.status.capitalize() if r.status else ''
        })
    return jsonify(result)

@app.route('/api/reports/supplier-returns', methods=['GET'])
@jwt_required()
def supplier_returns_report():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    supplier_id = request.args.get('supplierId', type=int)
    search = request.args.get('search', '')

    if not from_date or not to_date:
        return jsonify({'error': 'fromDate and toDate are required'}), 400

    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)

    query = SupplierReturn.query.join(Supplier, SupplierReturn.supplier_id == Supplier.id)
    query = query.filter(SupplierReturn.date >= from_dt, SupplierReturn.date < to_dt)
    if supplier_id:
        query = query.filter(SupplierReturn.supplier_id == supplier_id)
    if search:
        query = query.filter(
            or_(
                Supplier.supplier_name.ilike(f'%{search}%'),
                SupplierReturn.invoice_number.ilike(f'%{search}%'),
                SupplierReturn.description.ilike(f'%{search}%')
            )
        )
    query = query.order_by(SupplierReturn.date.desc())
    returns = query.all()
    result = []
    for r in returns:
        # Get product name
        product_name = ''
        if r.product_type == 'regular':
            prod = RegularProduct.query.get(r.product_id)
            product_name = prod.description if prod else ''
        else:
            prod = NonProduct.query.get(r.product_id)
            product_name = prod.description if prod else ''
        # Get supplier name
        supplier_name = r.supplier.supplier_name if r.supplier else ''
        # Get invoice info
        invoice = r.invoice_number or ''
        remarks = r.remarks or ''
        result.append({
            'date': r.date.strftime('%Y-%m-%d') if r.date else '',
            'supplier': supplier_name,
            'invoice': invoice,
            'productName': product_name,
            'remarks': remarks,
            'quantity': r.quantity,
            'unitPrice': float(r.unit_price) if r.unit_price else 0,
            'total': float(r.total_value) if r.total_value else 0,
            'action': ''
        })
    return jsonify(result)

@app.route('/api/reports/daily-book-history', methods=['GET'])
@jwt_required()
def daily_book_history():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    user = request.args.get('user')  # changed from salesman
    sale_type = request.args.get('type', 'All')
    search = request.args.get('search', '')

    if not from_date or not to_date:
        return jsonify({'error': 'fromDate and toDate are required'}), 400

    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)

    query = Sale.query.join(User, Sale.created_by == User.id).join(Customer, Sale.customer_id == Customer.id).options(
        db.contains_eager(Sale.user),
        db.contains_eager(Sale.customer),
        db.subqueryload(Sale.payments),
    )
    query = query.filter(Sale.date >= from_dt, Sale.date < to_dt, Sale.status == 'finalized')
    if user and user != 'All':
        query = query.filter(User.username == user)
    if sale_type == 'Cash':
        query = query.filter(Sale.customer_type.ilike('cash'))
    elif sale_type == 'Account':
        query = query.filter(Sale.customer_type.ilike('account'))
    if search:
        query = query.filter(
            or_(
                Sale.invoice_number.ilike(f'%{search}%'),
                Customer.customer_name.ilike(f'%{search}%'),
                User.username.ilike(f'%{search}%')
            )
        )
    query = query.order_by(Sale.date.desc())
    sales = query.all()
    result = []
    for idx, sale in enumerate(sales, 1):
        # Get current date for comparison
        current_date = datetime.now().date()
        sale_date = sale.date.date()
        
        # Sum payments by mode and date for this sale
        cash_paid_today = sum(float(p.amount) for p in sale.payments 
                             if p.payment_mode and p.payment_mode.lower() == 'cash' 
                             and p.payment_date == current_date)
        
        # Account payments (backdate payments should go to cash if cash paid)
        account_payments = [p for p in sale.payments 
                           if p.payment_mode and p.payment_mode.lower() == 'account']
        
        account_paid = 0
        cash_from_backdate = 0
        
        for payment in account_payments:
            if payment.payment_date == current_date:
                # Current day account payment goes to account paid
                account_paid += float(payment.amount)
            else:
                # Backdate account payment goes to cash
                cash_from_backdate += float(payment.amount)
        
        # Total cash includes cash payments today and backdate account payments
        total_cash = cash_paid_today + cash_from_backdate
        
        # If sale is cash type, amount goes to cash column
        if sale.customer_type.lower() == 'cash':
            total_cash = float(sale.total_amount)
        
        result.append({
            'slNo': idx,
            'date': sale.date.strftime('%Y-%m-%d'),
            'user': sale.user.username if sale.user else '',
            'invoiceNo': sale.invoice_number,
            'customerName': sale.customer.customer_name if sale.customer else '',
            'account': float(sale.total_amount) if sale.customer_type.lower() == 'account' else 0,
            'accountPaid': account_paid,
            'cash': total_cash,
            'isCompany': bool(sale.customer.is_company) if sale.customer else False,
        })
    voids_query = VoidedInvoiceDocument.query.filter(
        or_(
            VoidedInvoiceDocument.date_unknown.is_(True),
            (VoidedInvoiceDocument.date >= from_dt.date())
            & (VoidedInvoiceDocument.date < to_dt.date()),
        )
    )
    if user and user != 'All':
        voids_query = voids_query.filter(
            or_(
                VoidedInvoiceDocument.date_unknown.is_(True),
                VoidedInvoiceDocument.salesman == user,
            )
        )
    if search:
        voids_query = voids_query.filter(
            or_(
                VoidedInvoiceDocument.invoice_number.ilike(f'%{search}%'),
                VoidedInvoiceDocument.customer_name.ilike(f'%{search}%'),
                VoidedInvoiceDocument.salesman.ilike(f'%{search}%'),
            )
        )
    for voided in voids_query.order_by(VoidedInvoiceDocument.date.desc(), VoidedInvoiceDocument.invoice_number.desc()).all():
        result.append({
            'slNo': len(result) + 1,
            'date': voided.date.isoformat() if not voided.date_unknown else None,
            'user': voided.salesman,
            'invoiceNo': voided.invoice_number,
            'customerName': voided.customer_name,
            'account': 0,
            'accountPaid': 0,
            'cash': 0,
            'isCompany': False,
            'isVoid': True,
            'isUnknownDate': bool(voided.date_unknown),
            'voidedDocumentType': voided.document_type,
        })
    def report_row_sort_key(row):
        invoice_number = str(row.get('invoiceNo') or '')
        try:
            invoice_key = (1, int(invoice_number))
        except ValueError:
            invoice_key = (0, invoice_number.casefold())
        return (row.get('date') or '', invoice_key)

    result.sort(key=report_row_sort_key, reverse=True)
    for index, row in enumerate(result, 1):
        row['slNo'] = index
    return jsonify(result)

@app.route('/api/reports/full-analysis', methods=['GET'])
@jwt_required()
def full_analysis():
    from datetime import datetime
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    search = request.args.get('search', '')

    if not from_date or not to_date:
        return jsonify({'error': 'fromDate and toDate are required'}), 400

    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)

    # Helper to get month name
    def month_name(dt):
        return calendar.month_name[dt.month]

    # Get all months in range
    months = []
    cur = from_dt.replace(day=1)
    while cur < to_dt:
        months.append((cur.year, cur.month))
        if cur.month == 12:
            cur = cur.replace(year=cur.year+1, month=1)
        else:
            cur = cur.replace(month=cur.month+1)

    # Prepare results
    results = []
    for year, month in months:
        m_start = datetime(year, month, 1)
        if month == 12:
            m_end = datetime(year+1, 1, 1)
        else:
            m_end = datetime(year, month+1, 1)
        # Sales — exclude company customers
        sales = db.session.query(func.sum(Sale.total_amount)).join(
            Customer, Sale.customer_id == Customer.id
        ).filter(
            Sale.date >= m_start, Sale.date < m_end, Sale.status == 'finalized',
            Customer.is_company == False
        )
        if search:
            sales = sales.filter(Customer.customer_name.ilike(f'%{search}%'))
        sales = sales.scalar() or 0
        discounts = db.session.query(func.sum(CustomerDiscount.amount)).join(
            Sale, CustomerDiscount.sale_id == Sale.id
        ).join(Customer, Sale.customer_id == Customer.id).filter(
            CustomerDiscount.date >= m_start.date(),
            CustomerDiscount.date < m_end.date(),
            CustomerDiscount.is_deleted.is_(False),
            Sale.status == 'finalized',
            Customer.is_company == False
        )
        if search:
            discounts = discounts.filter(Customer.customer_name.ilike(f'%{search}%'))
        discounts = discounts.scalar() or 0
        # Customer Returns — exclude company customers
        returns = db.session.query(func.sum(CustomerReturn.total_value)).join(
            Customer, CustomerReturn.customer_id == Customer.id
        ).filter(
            CustomerReturn.date >= m_start, CustomerReturn.date < m_end,
            Customer.is_company == False
        )
        if search:
            returns = returns.filter(Customer.customer_name.ilike(f'%{search}%'))
        returns = returns.scalar() or 0
        net_sales = sales - returns - discounts
        # Purchases - calculate from PurchaseInvoiceItem total_price joined with PurchaseInvoice
        purchase = db.session.query(func.sum(PurchaseInvoiceItem.total_price)).join(
            PurchaseInvoice, PurchaseInvoiceItem.invoice_id == PurchaseInvoice.id
        ).filter(
            PurchaseInvoice.date >= m_start, PurchaseInvoice.date < m_end
        )
        if search:
            purchase = purchase.join(Purchase, PurchaseInvoice.purchase_id == Purchase.id).filter(
                Purchase.supplier_name.ilike(f'%{search}%')
            )
        purchase = purchase.scalar() or 0
        # Supplier Returns
        returns_sup = db.session.query(func.sum(SupplierReturn.total_value)).filter(
            SupplierReturn.date >= m_start, SupplierReturn.date < m_end
        )
        if search:
            returns_sup = returns_sup.join(Supplier).filter(Supplier.supplier_name.ilike(f'%{search}%'))
        returns_sup = returns_sup.scalar() or 0
        # Dumps
        dumps = db.session.query(func.sum(DumpEntry.total_value)).filter(
            DumpEntry.date >= m_start, DumpEntry.date < m_end
        )
        if search:
            dumps = dumps.join(Supplier).filter(Supplier.supplier_name.ilike(f'%{search}%'))
        dumps = dumps.scalar() or 0
        net_purchase = purchase - returns_sup - dumps
        # Expenses
        expenses = db.session.query(func.sum(ExpenseEntry.total_amount)).filter(
            ExpenseEntry.date >= m_start, ExpenseEntry.date < m_end
        )
        if search:
            expenses = expenses.join(Supplier).filter(Supplier.supplier_name.ilike(f'%{search}%'))
        expenses = expenses.scalar() or 0
        diff = net_sales - net_purchase - expenses
        
        # Handle NaN values by converting None to 0 and ensuring all values are numeric
        def safe_round(value, decimals=2):
            if value is None or str(value).lower() == 'nan':
                return 0.0
            try:
                return round(float(value), decimals)
            except (ValueError, TypeError):
                return 0.0
        
        results.append({
            'month': month_name(m_start),
            'year': year,
            'sales': safe_round(sales),
            'returns': safe_round(returns),
            'netSales': safe_round(net_sales),
            'purchase': safe_round(purchase),
            'returnsSup': safe_round(returns_sup),
            'dumps': safe_round(dumps),
            'netPurchase': safe_round(net_purchase),
            'expenses': safe_round(expenses),
            'diff': safe_round(diff)
        })
    return jsonify(results)

@app.route('/api/sales/<string:invoice_number>/invoice', methods=['GET'])
def get_invoice_data(invoice_number):
    """Return all data needed for invoice printing for a given sale invoice number."""
    try:
        # Get sale
        sale = Sale.query.filter_by(invoice_number=invoice_number).first()
        if not sale:
            return jsonify({'error': 'Sale not found'}), 404
        # Get company info
        company = Company.query.first()
        company_info = company.to_dict() if company else {}
        # Get customer info
        customer = sale.customer.to_dict() if sale.customer else {}
        # Get sale items
        items = [item.to_dict() for item in sale.items]
        # Build packingItems for packing list
        packing_items = []
        for item in sale.items:
            if item.product:
                weight = float(item.product.unit_weight or 0) * float(item.quantity)
                hs_code = item.product.hs_code or ""
                product_name = item.product.description
            elif item.non_product:
                weight = float(item.non_product.unit_weight or 0) * float(item.quantity)
                hs_code = ""
                product_name = item.non_product.description
            else:
                weight = 0
                hs_code = ""
                product_name = ""
            packing_items.append({
                "qty": float(item.quantity),
                "weight": weight,
                "product": product_name,
                "hsCode": hs_code,
                "notes": item.notes or ""
            })
        # Payment info (credit, balance, etc.)
        paid_amount = float(sale.paid_amount or 0)
        balance = float(_sale_outstanding(sale))
        # Editable notes/payment instructions (placeholder, can be made editable later)
        notes = (
            "NO COMPLAINTS OR RETURNS CONSIDERED AFTER 24 HOURS\n"
            "Make payments to:TROPIFRUIT UK LTD SORT CODE 20-26-53 ACC# 33378292"
        )
        # Compose response
        return jsonify({
            'company': company_info,
            'customer': customer,
            'sale': sale.to_dict(),
            'items': items,  # for invoice
            'packingItems': packing_items,  # for packing list
            'paidAmount': paid_amount,
            'balance': balance,
            'notes': notes
        })
    except Exception as e:
        import traceback
        print('[ERROR] Exception in get_invoice_data:', str(e))
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# Create a wrapper function that returns dict instead of Flask response
def get_invoice_data_for_pdf(invoice_number):
    """Return invoice data as dictionary for PDF generation"""
    try:
        # Get sale
        sale = Sale.query.filter_by(invoice_number=invoice_number).first()
        if not sale:
            return None
        
        # Get company info
        company = Company.query.first()
        company_info = company.to_dict() if company else {}
        
        # Get customer info
        customer = sale.customer.to_dict() if sale.customer else {}
        
        # Get sale items
        items = [item.to_dict() for item in sale.items]
        
        # Payment info
        paid_amount = float(sale.paid_amount or 0)
        balance = float(_sale_outstanding(sale))
        
        # Notes
        notes = (
            "NO COMPLAINTS OR RETURNS CONSIDERED AFTER 24 HOURS\n"
            "Make payments to:TROPIFRUIT UK LTD SORT CODE 20-26-53 ACC# 33378292"
        )
        
        # Return dictionary (not Flask response)
        return {
            'company': company_info,
            'customer': customer,
            'sale': sale.to_dict(),
            'items': items,
            'paidAmount': paid_amount,
            'balance': balance,
            'notes': notes
        }
    except Exception as e:
        print(f'[ERROR] Exception in get_invoice_data_for_pdf: {str(e)}')
        return None

add_pdf_routes(app, get_invoice_data_for_pdf)
add_export_routes(app, get_invoice_data_for_pdf)
@app.route('/api/reports/profit-loss', methods=['GET'])
@jwt_required()
def profit_loss_report():
    from datetime import datetime, timedelta
    from models import (
        PurchaseInvoice, PurchaseInvoiceItem, Purchase, Supplier, Sale, SaleItem,
        RegularProduct, NonProduct
    )

    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    search = request.args.get('search', '')

    from_dt = datetime.strptime(from_date, "%Y-%m-%d") if from_date else None
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1) if to_date else None

    # Get all products (regular + non)
    products = (
        db.session.query(RegularProduct.id, RegularProduct.description, literal('regular').label('type'))
        .union_all(
            db.session.query(NonProduct.id, NonProduct.description, literal('non').label('type'))
        )
        .all()
    )

    result = []
    sl_no = 1
    for prod in products:
        # Optional search filter
        if search and search.lower() not in (prod.description or '').lower():
            continue
        # Purchases — full amount for display, non-company amount for totals
        purchase_query = db.session.query(
            func.sum(PurchaseInvoiceItem.quantity),
            func.sum(PurchaseInvoiceItem.total_price)
        ).join(PurchaseInvoice, PurchaseInvoiceItem.invoice_id == PurchaseInvoice.id)
        if prod.type == 'regular':
            purchase_query = purchase_query.filter(PurchaseInvoiceItem.product_id == prod.id)
        else:
            purchase_query = purchase_query.filter(PurchaseInvoiceItem.product_id == prod.id)
        if from_dt:
            purchase_query = purchase_query.filter(PurchaseInvoice.date >= from_dt)
        if to_dt:
            purchase_query = purchase_query.filter(PurchaseInvoice.date < to_dt)
        purchase_qty, purchase_total = purchase_query.first()
        purchase_qty = float(purchase_qty or 0)
        purchase_total = float(purchase_total or 0)
        avg_purchase = (purchase_total / purchase_qty) if purchase_qty else 0

        # Non-company purchase amount (for totals exclusion)
        purchase_amt_nc_query = db.session.query(
            func.sum(PurchaseInvoiceItem.total_price)
        ).join(PurchaseInvoice, PurchaseInvoiceItem.invoice_id == PurchaseInvoice.id)\
         .join(Purchase, PurchaseInvoice.purchase_id == Purchase.id)\
         .join(Supplier, Purchase.supplier_id == Supplier.id)
        if prod.type == 'regular':
            purchase_amt_nc_query = purchase_amt_nc_query.filter(PurchaseInvoiceItem.product_id == prod.id)
        else:
            purchase_amt_nc_query = purchase_amt_nc_query.filter(PurchaseInvoiceItem.product_id == prod.id)
        if from_dt:
            purchase_amt_nc_query = purchase_amt_nc_query.filter(PurchaseInvoice.date >= from_dt)
        if to_dt:
            purchase_amt_nc_query = purchase_amt_nc_query.filter(PurchaseInvoice.date < to_dt)
        purchase_amt_nc_query = purchase_amt_nc_query.filter(Supplier.is_company == False)
        purchase_total_nc = float(purchase_amt_nc_query.scalar() or 0)

        # Sales — quantity from ALL customers, amount from NON-COMPANY customers only
        sales_qty_query = db.session.query(
            func.sum(SaleItem.quantity)
        ).join(Sale, SaleItem.sale_id == Sale.id)
        if prod.type == 'regular':
            sales_qty_query = sales_qty_query.filter(SaleItem.product_id == prod.id)
        else:
            sales_qty_query = sales_qty_query.filter(SaleItem.non_product_id == prod.id)
        if from_dt:
            sales_qty_query = sales_qty_query.filter(Sale.date >= from_dt)
        if to_dt:
            sales_qty_query = sales_qty_query.filter(Sale.date < to_dt)
        sales_qty_query = sales_qty_query.filter(Sale.status == 'finalized')
        sales_qty = sales_qty_query.scalar() or 0

        sales_amt_query = db.session.query(
            func.sum(SaleItem.total_price)
        ).join(Sale, SaleItem.sale_id == Sale.id).join(Customer, Sale.customer_id == Customer.id)
        if prod.type == 'regular':
            sales_amt_query = sales_amt_query.filter(SaleItem.product_id == prod.id)
        else:
            sales_amt_query = sales_amt_query.filter(SaleItem.non_product_id == prod.id)
        if from_dt:
            sales_amt_query = sales_amt_query.filter(Sale.date >= from_dt)
        if to_dt:
            sales_amt_query = sales_amt_query.filter(Sale.date < to_dt)
        sales_amt_query = sales_amt_query.filter(Sale.status == 'finalized', Customer.is_company == False)
        sales_total = float(sales_amt_query.scalar() or 0)
        discount_amt_query = db.session.query(
            func.sum(CustomerDiscount.amount)
        ).join(
            Sale, CustomerDiscount.sale_id == Sale.id
        ).join(
            SaleItem, CustomerDiscount.sale_item_id == SaleItem.id
        ).join(
            Customer, Sale.customer_id == Customer.id
        ).filter(
            CustomerDiscount.is_deleted.is_(False),
            Sale.status == 'finalized',
            Customer.is_company == False,
        )
        if prod.type == 'regular':
            discount_amt_query = discount_amt_query.filter(SaleItem.product_id == prod.id)
        else:
            discount_amt_query = discount_amt_query.filter(SaleItem.non_product_id == prod.id)
        if from_dt:
            discount_amt_query = discount_amt_query.filter(CustomerDiscount.date >= from_dt.date())
        if to_dt:
            discount_amt_query = discount_amt_query.filter(CustomerDiscount.date < to_dt.date())
        sales_total -= float(discount_amt_query.scalar() or 0)
        avg_sales = (sales_total / float(sales_qty)) if sales_qty else 0

        # Profit/Loss — use non-company purchase for profit calc
        avg_profit = avg_sales - avg_purchase
        tot_profit = sales_total - purchase_total
        tot_profit_nc = sales_total - purchase_total_nc
        percent_profit = (tot_profit / purchase_total * 100) if purchase_total else 0

        result.append({
            'id': prod.id,
            'slNo': sl_no,
            'productDescription': prod.description,
            'totalQuantity': sales_qty,
            'avgPurchase': avg_purchase,
            'avgSales': avg_sales,
            'avgProfit': avg_profit,
            'totPurchase': purchase_total,
            'totPurchaseExCompany': purchase_total_nc,
            'totSales': sales_total,
            'totProfit': tot_profit,
            'totProfitExCompany': tot_profit_nc,
            'percentProfit': percent_profit,
            'isLoss': tot_profit < 0
        })
        sl_no += 1

    return jsonify(result)

@app.route('/api/reports/daily-accounts', methods=['GET'])
@jwt_required()
def daily_accounts_report():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    
    if not from_date or not to_date:
        return jsonify({'error': 'fromDate and toDate are required'}), 400

    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)

    def sum_payment(mode, on_account=False):
        query = db.session.query(func.sum(Payment.amount))\
            .join(Customer, Payment.customer_id == Customer.id)\
            .filter(
                Customer.is_company == False,
                Payment.payment_mode.ilike(mode),
                Payment.payment_date >= from_dt.date(),
                Payment.payment_date < to_dt.date(),
                or_(Payment.payment_source.is_(None), Payment.payment_source != 'daily_book_sales')
            )
        if on_account:
            query = query.filter(Payment.payment_type == 'on-account')
        else:
            query = query.filter(or_(Payment.payment_type != 'on-account', Payment.payment_type.is_(None)))
        return float(query.scalar() or 0)

    # --- Receivables Cash ---
    sales_cash = sum_payment('cash', on_account=False)
    on_account_cash = sum_payment('cash', on_account=True)
    
    # Get Cash Carry Forward (C/F) for the selected date
    cf = db.session.query(CashCarryForward).filter(
        CashCarryForward.date == from_dt.date()
    ).first()
    cf_amount = float(cf.pounds + cf.coins) if cf else 0  # Convert Decimal to float
    
    total_cash = sales_cash + on_account_cash
    receivables_cash = [
        {"item": "Sales Cash", "amount": sales_cash},
        {"item": "On Account Cash", "amount": on_account_cash},
        {"item": "TOTAL CASH", "amount": total_cash}
    ]

    # --- Receivables Others ---
    cheque = sum_payment('cheque', on_account=False)
    card = sum_payment('bank', on_account=False)
    bank_transfer = sum_payment('bank_transfer', on_account=False)
    others = sum_payment('others', on_account=False)
    on_account_cheque = sum_payment('cheque', on_account=True)
    on_account_card = sum_payment('bank', on_account=True)
    on_account_bank = sum_payment('bank_transfer', on_account=True)
    on_account_others = sum_payment('others', on_account=True)
    total_others = cheque + card + bank_transfer + others + on_account_cheque + on_account_card + on_account_bank + on_account_others
    receivables_others = [
        {"item": "Cheque", "amount": cheque},
        {"item": "Card", "amount": card},
        {"item": "Bank Transfer", "amount": bank_transfer},
        {"item": "Others", "amount": others},
        {"item": "On Account Cheque", "amount": on_account_cheque},
        {"item": "On Account Card", "amount": on_account_card},
        {"item": "On Account Bank", "amount": on_account_bank},
        {"item": "On Account Others", "amount": on_account_others},
        {"item": "TOTAL", "amount": total_others}
    ]

    # --- Banking ---
    banking_entries = db.session.query(BankingEntry).filter(
        BankingEntry.date >= from_dt.date(),
        BankingEntry.date < to_dt.date()
    ).all()
    def sum_banking(mode):
        return sum(float(b.amount or 0) for b in banking_entries if b.payment_type and b.payment_type.lower() == mode)  # Convert Decimal to float
    banking_cash = sum_banking('cash')
    banking_cheque = sum_banking('cheque')
    banking_card = sum_banking('card')
    banking_others = sum_banking('others')
    sub_total = banking_cash + banking_cheque
    total_banking = banking_cash + banking_cheque + banking_card + banking_others
    banking = [
        {"item": "Cash", "amount": banking_cash},
        {"item": "Cheque", "amount": banking_cheque},
        {"item": "SUB TOTAL", "amount": sub_total},
        {"item": "Card", "amount": banking_card},
        {"item": "Others", "amount": banking_others},
        {"item": "TOTAL", "amount": total_banking}
    ]

    # --- Payables Cash ---
    misc_expenses_cash = float(db.session.query(func.sum(ExpenseEntry.amount)).filter(
        ExpenseEntry.payment_mode.ilike('cash'),
        ExpenseEntry.date >= from_dt.date(),
        ExpenseEntry.date < to_dt.date()
    ).scalar() or 0)
    supplier_payments_cash = float(db.session.query(func.sum(SupplierPayment.amount)).filter(
        SupplierPayment.payment_mode.in_(['cash', 'CASH']),
        SupplierPayment.payment_date >= from_dt.date(),
        SupplierPayment.payment_date < to_dt.date()
    ).scalar() or 0)
    supplier_payments_card = float(db.session.query(func.sum(SupplierPayment.amount)).filter(
        SupplierPayment.payment_mode.in_(['bank', 'BANK', 'card', 'CARD']),
        SupplierPayment.payment_date >= from_dt.date(),
        SupplierPayment.payment_date < to_dt.date()
    ).scalar() or 0)
    supplier_payments_bank_transfer = float(db.session.query(func.sum(SupplierPayment.amount)).filter(
        SupplierPayment.payment_mode.in_(['bank_transfer', 'BANK_TRANSFER']),
        SupplierPayment.payment_date >= from_dt.date(),
        SupplierPayment.payment_date < to_dt.date()
    ).scalar() or 0)
    supplier_payments_cheque = float(db.session.query(func.sum(SupplierPayment.amount)).filter(
        SupplierPayment.payment_mode.in_(['cheque', 'CHEQUE']),
        SupplierPayment.payment_date >= from_dt.date(),
        SupplierPayment.payment_date < to_dt.date()
    ).scalar() or 0)
    supplier_payments_onac = float(db.session.query(func.sum(SupplierPayment.amount)).filter(
        SupplierPayment.payment_mode.in_(['cash', 'CASH']),
        SupplierPayment.purchase_invoice_id == None,
        SupplierPayment.payment_date >= from_dt.date(),
        SupplierPayment.payment_date < to_dt.date()
    ).scalar() or 0)
    total_payables_cash = misc_expenses_cash + supplier_payments_cash + supplier_payments_card + supplier_payments_bank_transfer + supplier_payments_cheque + supplier_payments_onac
    payables_cash = [
        {"item": "Misc Expenses", "amount": misc_expenses_cash},
        {"item": "Supplier Payments Cash", "amount": supplier_payments_cash},
        {"item": "Supplier Payments Card", "amount": supplier_payments_card},
        {"item": "Supplier Payments Bank Transfer", "amount": supplier_payments_bank_transfer},
        {"item": "Supplier Payments Cheque", "amount": supplier_payments_cheque},
        {"item": "Supplier Payments On/Ac", "amount": supplier_payments_onac},
        {"item": "TOTAL", "amount": total_payables_cash}
    ]

    # --- Payables Others ---
    misc_expenses_others = float(db.session.query(func.sum(ExpenseEntry.amount)).filter(
        ExpenseEntry.payment_mode.ilike('others'),
        ExpenseEntry.date >= from_dt.date(),
        ExpenseEntry.date < to_dt.date()
    ).scalar() or 0)
    supplier_payments_others = float(db.session.query(func.sum(SupplierPayment.amount)).filter(
        ~SupplierPayment.payment_mode.in_(['cash', 'CASH', 'bank', 'BANK', 'card', 'CARD', 'bank_transfer', 'BANK_TRANSFER', 'cheque', 'CHEQUE']),
        SupplierPayment.payment_date >= from_dt.date(),
        SupplierPayment.payment_date < to_dt.date()
    ).scalar() or 0)
    onac_payments_others = float(db.session.query(func.sum(SupplierPayment.amount)).filter(
        ~SupplierPayment.payment_mode.in_(['cash', 'CASH', 'bank', 'BANK', 'card', 'CARD', 'bank_transfer', 'BANK_TRANSFER', 'cheque', 'CHEQUE']),
        SupplierPayment.purchase_invoice_id == None,
        SupplierPayment.payment_date >= from_dt.date(),
        SupplierPayment.payment_date < to_dt.date()
    ).scalar() or 0)
    total_payables_others = misc_expenses_others + supplier_payments_others + onac_payments_others
    payables_others = [
        {"item": "Misc Expenses", "amount": misc_expenses_others},
        {"item": "Supplier Payments", "amount": supplier_payments_others},
        {"item": "On/Ac Payments", "amount": onac_payments_others},
        {"item": "TOTAL", "amount": total_payables_others}
    ]

    # --- C/F ---
    cf_total = cf_amount

    # --- Actual Balance and Shortfall ---
    actual_balance = cf_total + total_cash + total_others - total_payables_cash - total_payables_others
    shortfall = actual_balance  # Adjust as per your business logic

    return jsonify({
        "receivablesCash": receivables_cash,
        "receivablesOthers": receivables_others,
        "payablesCash": payables_cash,
        "payablesOthers": payables_others,
        "banking": banking,
        "cfTotal": cf_total,
        "actualBalance": actual_balance,
        "shortfall": shortfall
    }), 200

@app.route('/api/reports/daily-summary', methods=['GET'])
@jwt_required()
def daily_summary_report():
    from datetime import datetime, timedelta
    from sqlalchemy import func, and_, or_, cast, Integer
    
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'error': 'date is required'}), 400
    
    try:
        report_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    
    # 1. Daily Sales Summary (like the image provided)
    # Get all sales for the date
    sales_query = db.session.query(
        Sale.id,
        Sale.invoice_number,
        Customer.customer_name,
        Customer.is_company,
        Sale.total_amount,
        Sale.payment_status,
        Sale.customer_type,
        Sale.gate_number
    ).join(
        Customer, Sale.customer_id == Customer.id
    ).filter(
        func.date(Sale.date) == report_date
    ).order_by(Sale.invoice_number).all()
    
    # Get customer returns for the date (to show as negative credits)
    customer_returns = db.session.query(
        CustomerReturn.id,
        CustomerReturn.document_invoice_number,
        CustomerReturn.customer_id,
        CustomerReturn.sale_id,
        CustomerReturn.total_value,
        Customer.customer_name,
        Customer.is_company,
        CustomerReturn.invoice_number
    ).join(
        Customer, CustomerReturn.customer_id == Customer.id
    ).filter(
        CustomerReturn.date == report_date,
        CustomerReturn.status == 'completed'
    ).all()
    
    # Get negative payments (payments with negative amounts)
    negative_payments = db.session.query(
        Payment.customer_id,
        Payment.amount,
        Customer.customer_name,
        Sale.invoice_number
    ).join(
        Customer, Payment.customer_id == Customer.id
    ).outerjoin(
        Sale, Payment.sale_id == Sale.id
    ).filter(
        Payment.payment_date == report_date,
        Payment.amount < 0,
        or_(Payment.payment_mode.is_(None), Payment.payment_mode != 'credit_note')
    ).all()
    
    # Process sales data to match the image format
    sales_summary = []
    cash_total = 0
    card_total = 0
    bank_transfer_total = 0
    cheque_total = 0
    account_total = 0
    
    # Debug logging
    print(f"[DEBUG] Daily Summary for {report_date}")
    print(f"[DEBUG] Found {len(sales_query)} sales")
    print(f"[DEBUG] Found {len(customer_returns)} customer returns")
    print(f"[DEBUG] Found {len(negative_payments)} negative payments")
    
    # Track negative invoices so their linked stock-return records are not
    # counted a second time as separate customer returns.
    negative_sale_ids = set()
    processed_neg_payments = set()
    
    for sale in sales_query:
        cash_amount = 0
        card_amount = 0
        bank_transfer_amount = 0
        cheque_amount = 0
        account_amount = 0
        account_credits = 0
        
        # Get payments for this sale
        sale_payments = db.session.query(Payment).filter(
            Payment.sale_id == sale.id
        ).all()
        
        # Debug logging for this sale
        print(f"[DEBUG] Sale {sale.invoice_number}: {len(sale_payments)} payments, customer_type: {sale.customer_type}")
        
        # Check if any payments were made via customer payment page (have batch_id)
        customer_payment_payments = [p for p in sale_payments if p.batch_id]
        is_paid_via_customer_payment = len(customer_payment_payments) > 0
        
        # For current date invoices paid via customer payment, always show in account column
        is_current_date = True  # We're already filtering by report_date
        
        if is_current_date and is_paid_via_customer_payment:
            # Current date invoices paid via customer payment always go to accounts
            account_amount = float(sale.total_amount or 0)
            print(f"[DEBUG] Sale {sale.invoice_number} paid via customer payment page - showing in account column")
        else:
            # Regular payment processing based on customer_type
            if sale.customer_type == 'account':
                account_amount = float(sale.total_amount or 0)
            else:
                # For non-account sales, calculate from actual payment records (handles split payments)
                daily_book_payments = [p for p in sale_payments if not p.batch_id]
                
                cash_amount = sum(float(p.amount) for p in daily_book_payments if p.payment_mode == 'cash')
                card_amount = sum(float(p.amount) for p in daily_book_payments if p.payment_mode == 'bank')
                bank_transfer_amount = sum(float(p.amount) for p in daily_book_payments if p.payment_mode == 'bank_transfer')
                cheque_amount = sum(float(p.amount) for p in daily_book_payments if p.payment_mode == 'cheque')
        
        # Check for negative quantities in sale items or negative total amount
        negative_items = db.session.query(SaleItem).filter(
            SaleItem.sale_id == sale.id,
            or_(SaleItem.quantity < 0, SaleItem.total_price < 0)
        ).all()
        
        if negative_items or float(sale.total_amount) < 0:
            # This is a negative invoice, show in account credits
            account_credits = abs(float(sale.total_amount or 0))
            negative_sale_ids.add(sale.id)
            account_amount = 0
            cash_amount = 0
            card_amount = 0
            bank_transfer_amount = 0
            cheque_amount = 0

        # Only add to financial totals if customer is NOT a company
        is_company_customer = bool(sale.is_company) if sale.is_company is not None else False
        if not is_company_customer:
            cash_total += cash_amount
            card_total += card_amount
            bank_transfer_total += bank_transfer_amount
            cheque_total += cheque_amount
            account_total += account_amount
        
        sales_summary.append({
            'customer_name': sale.customer_name,
            'invoice_no': sale.invoice_number,
            'cash_sales': cash_amount,
            'card_paid': card_amount,
            'bank_transfer': bank_transfer_amount,
            'cheque': cheque_amount,
            'account_sales': account_amount,
            'account_paid_cash': 0,  # Will be calculated separately
            'account_paid_cheque': 0,  # Will be calculated separately
            'account_credits': account_credits,
            'customer_type': sale.customer_type,
            'gate_number': sale.gate_number,
            'is_company': bool(sale.is_company) if sale.is_company is not None else False,
        })
    
    # Add customer returns as separate entries
    for return_item in customer_returns:
        if return_item.sale_id in negative_sale_ids:
            continue

        sales_summary.append({
            'customer_name': return_item.customer_name,
            'invoice_no': return_item.document_invoice_number or return_item.invoice_number or f"CR-{return_item.id}",
            'customer_return_id': return_item.id,
            'cash_sales': 0,
            'card_paid': 0,
            'bank_transfer': 0,
            'cheque': 0,
            'account_sales': 0,
            'account_paid_cash': 0,
            'account_paid_cheque': 0,
            'account_credits': abs(float(return_item.total_value or 0)),
            'customer_type': None,
            'gate_number': None,
            'is_company': bool(return_item.is_company) if return_item.is_company is not None else False,
            'is_customer_return': True,
        })

    daily_discounts = CustomerDiscount.query.options(
        db.joinedload(CustomerDiscount.customer),
        db.joinedload(CustomerDiscount.sale),
    ).filter(
        CustomerDiscount.date == report_date,
        CustomerDiscount.is_deleted.is_(False),
    ).all()
    for discount in daily_discounts:
        sales_summary.append({
            'customer_name': discount.customer.customer_name if discount.customer else '',
            'invoice_no': discount.document_invoice_number or (discount.sale.invoice_number if discount.sale else ''),
            'customer_discount_id': discount.id,
            'cash_sales': 0,
            'card_paid': 0,
            'bank_transfer': 0,
            'cheque': 0,
            'account_sales': 0,
            'account_paid_cash': 0,
            'account_paid_cheque': 0,
            'account_credits': float(discount.amount or 0),
            'customer_type': None,
            'gate_number': None,
            'is_company': bool(discount.customer.is_company) if discount.customer else False,
            'is_customer_discount': True,
        })

    voided_documents = VoidedInvoiceDocument.query.filter(
        or_(
            VoidedInvoiceDocument.date_unknown.is_(True),
            VoidedInvoiceDocument.date == report_date,
        )
    ).order_by(VoidedInvoiceDocument.invoice_number.asc()).all()
    for voided in voided_documents:
        sales_summary.append({
            'customer_name': voided.customer_name,
            'invoice_no': voided.invoice_number,
            'cash_sales': 0,
            'card_paid': 0,
            'bank_transfer': 0,
            'cheque': 0,
            'account_sales': 0,
            'account_paid_cash': 0,
            'account_paid_cheque': 0,
            'account_credits': 0,
            'customer_type': None,
            'gate_number': None,
            'is_company': False,
            'is_void': True,
            'is_unknown_date': bool(voided.date_unknown),
            'voided_document_type': voided.document_type,
        })
    
    # Add negative payments as separate entries (only if they're not for invoices already shown)
    for neg_payment in negative_payments:
        if neg_payment.customer_id not in processed_neg_payments:
            # Check if this negative payment is for an invoice that's already in the sales summary
            # If the payment has a sale_id, check if that sale is already processed
            payment_details = db.session.query(Payment).filter(
                Payment.customer_id == neg_payment.customer_id,
                Payment.payment_date == report_date,
                Payment.amount < 0,
                or_(Payment.payment_mode.is_(None), Payment.payment_mode != 'credit_note')
            ).all()
            
            # Filter out payments that are for invoices already shown in sales summary
            relevant_payments = []
            for payment in payment_details:
                if payment.sale_id:
                    # Check if this sale is already in our sales summary
                    sale_already_shown = any(
                        sale.id == payment.sale_id for sale in sales_query
                    )
                    if not sale_already_shown:
                        relevant_payments.append(payment)
                else:
                    # On-account negative payment, always include
                    relevant_payments.append(payment)
            
            if relevant_payments:
                # Group all relevant negative payments for this customer
                customer_neg_total = sum(
                    abs(float(p.amount)) 
                    for p in relevant_payments
                )
                
                # Get all invoice numbers for this customer's relevant negative payments
                invoice_numbers = []
                for p in relevant_payments:
                    if p.sale_id:
                        sale = db.session.query(Sale).get(p.sale_id)
                        if sale and sale.invoice_number:
                            invoice_numbers.append(sale.invoice_number)
                
                # Create a better display for invoice numbers
                if invoice_numbers:
                    invoice_display = ', '.join(set(invoice_numbers))  # Remove duplicates
                else:
                    invoice_display = 'Credit Payment'
                
                sales_summary.append({
                    'customer_name': neg_payment.customer_name,
                    'invoice_no': invoice_display,
                    'cash_sales': 0,
                    'card_paid': 0,
                    'bank_transfer': 0,
                    'cheque': 0,
                    'account_sales': 0,
                    'account_paid_cash': 0,
                    'account_paid_cheque': 0,
                    'account_credits': customer_neg_total,
                    'customer_type': None,
                    'gate_number': None
                })
            
            processed_neg_payments.add(neg_payment.customer_id)
    
    # Calculate account_paid_cash and account_paid_cheque for existing sales
    # Get all payments made on the report date for account sales from previous dates
    account_payments = db.session.query(
        Payment.sale_id,
        Payment.payment_mode,
        Payment.amount
    ).join(
        Sale, Payment.sale_id == Sale.id
    ).filter(
        Payment.payment_date == report_date,
        func.date(Sale.date) < report_date,  # Only for previous date invoices
        Sale.customer_type == 'account'
    ).all()
    
    # Group account payments by sale_id
    account_payment_totals = {}
    for payment in account_payments:
        if payment.sale_id not in account_payment_totals:
            account_payment_totals[payment.sale_id] = {'cash': 0, 'cheque': 0}
        
        if payment.payment_mode == 'cash':
            account_payment_totals[payment.sale_id]['cash'] += float(payment.amount)
        elif payment.payment_mode == 'cheque':
            account_payment_totals[payment.sale_id]['cheque'] += float(payment.amount)
    
    # Update sales_summary with account payment information
    for sale_entry in sales_summary:
        if sale_entry.get('is_customer_return'):
            continue
        # Find the corresponding sale to get the sale_id
        matching_sale = next((s for s in sales_query if s.invoice_number == sale_entry['invoice_no']), None)
        if matching_sale and matching_sale.id in account_payment_totals:
            sale_entry['account_paid_cash'] = account_payment_totals[matching_sale.id]['cash']
            sale_entry['account_paid_cheque'] = account_payment_totals[matching_sale.id]['cheque']
    
    # 2. Customer Payments (using payment batch_id as payment_id)
    # Include all payments made on the selected date (both current day and backdate invoices)
    # EXCLUDE split payments from Daily Book Sales
    customer_payments = db.session.query(
        Customer.customer_name,
        Customer.id.label('customer_id'),
        Payment.id,
        Payment.batch_id,
        Payment.payment_mode,
        Payment.amount,
        Payment.payment_date,
        Sale.date.label('sale_date'),
        Sale.invoice_number,
        Payment.sale_id
    ).join(
        Customer, Payment.customer_id == Customer.id
    ).outerjoin(
        Sale, Payment.sale_id == Sale.id
    ).filter(
        Payment.payment_date == report_date,  # All payments made on the selected date
        # Exclude split payments from Daily Book Sales
        or_(
            Payment.payment_source.is_(None),
            Payment.payment_source != 'daily_book_sales'
        )
    ).order_by(Customer.customer_name, Payment.batch_id).all()
    
    # Group payments by customer and batch_id (payment_id)
    # Include ALL payments made today (both current day and backdate invoices)
    payment_groups = {}
    for payment in customer_payments:
        # Use batch_id as payment_id, or payment.id if no batch_id
        payment_id = str(payment.batch_id) if payment.batch_id else str(payment.id)
        key = (payment.customer_name, payment_id)
        
        if key not in payment_groups:
            payment_groups[key] = {
                'customer_name': payment.customer_name,
                'customer_id': payment.customer_id,
                'payment_id': payment_id,  # Use batch_id directly
                'cash_amount': 0,
                'card_amount': 0,
                'bank_transfer_amount': 0,
                'cheque_amount': 0,
                'total_amount': 0,
                'date': payment.payment_date.isoformat(),
                'invoice_numbers': set()
            }
        
        # Track invoice numbers for this payment batch
        if payment.invoice_number:
            payment_groups[key]['invoice_numbers'].add(payment.invoice_number)
        
        amount = float(payment.amount)
        if payment.payment_mode.lower() == 'cash':
            payment_groups[key]['cash_amount'] += amount
        elif payment.payment_mode.lower() == 'bank':  # Card payments are stored as 'bank' in backend
            payment_groups[key]['card_amount'] += amount
        elif payment.payment_mode.lower() == 'bank_transfer':
            payment_groups[key]['bank_transfer_amount'] += amount
        elif payment.payment_mode.lower() == 'cheque':
            payment_groups[key]['cheque_amount'] += amount
        
        payment_groups[key]['total_amount'] += amount
    
    # Finalize payment data with batch ID display
    customer_payments_data = []
    for payment_group in payment_groups.values():
        # Keep the original payment_id (which is the batch_id)
        # Remove the temporary invoice_numbers set
        payment_group.pop('invoice_numbers', None)
        customer_payments_data.append(payment_group)
    
    # 3. Supplier Payments
    supplier_payments = db.session.query(
        Supplier.supplier_name,
        SupplierPayment.supplier_invoice_number,
        SupplierPayment.supplier_invoice_date,
        SupplierPayment.amount,
        SupplierPayment.payment_mode,
        SupplierPayment.payment_date
    ).join(
        Supplier, SupplierPayment.supplier_id == Supplier.id
    ).filter(
        SupplierPayment.payment_date == report_date
    ).order_by(SupplierPayment.id).all()
    
    supplier_payments_data = []
    for payment in supplier_payments:
        supplier_payments_data.append({
            'supplier_name': payment.supplier_name,
            'supplier_invoice_number': payment.supplier_invoice_number or '',  # Use supplier invoice number
            'supplier_invoice_date': payment.supplier_invoice_date.isoformat() if payment.supplier_invoice_date else '',
            'amount': float(payment.amount),
            'payment_mode': payment.payment_mode,
            'date': payment.payment_date.isoformat()
        })
    
    # 4. Expense Entries
    expense_entries = db.session.query(
        ExpenseEntry.ref_number,
        ExpenseEntry.invoice_number,
        ExpenseEntry.amount,
        ExpenseEntry.payment_mode,
        ExpenseEntry.date,
        Supplier.supplier_name,
        Expense.expense_name
    ).join(
        Supplier, ExpenseEntry.supplier_id == Supplier.id
    ).join(
        Expense, ExpenseEntry.expense_id == Expense.id
    ).filter(
        ExpenseEntry.date == report_date
    ).order_by(ExpenseEntry.id).all()
    
    expense_data = []
    for expense in expense_entries:
        expense_data.append({
            'ref_number': expense.ref_number,
            'invoice_number': expense.invoice_number,
            'supplier_name': expense.supplier_name,
            'supplier_invoice_date': expense.date.isoformat() if expense.date else None,
            'expense_name': expense.expense_name,
            'amount': float(expense.amount),
            'payment_mode': expense.payment_mode,
            'date': expense.date.isoformat()
        })

    # 5. Till Float (automatic — from system settings, carries forward from previous business day)
    settings = SystemSettings.query.first()
    till_float_amount = float(settings.till_float) if settings and settings.till_float else 0

    # Determine the previous business date (the last date that has any sales/banking activity)
    from sqlalchemy import func as sqlfunc
    prev_business_date = db.session.query(sqlfunc.max(Sale.date)).filter(
        sqlfunc.date(Sale.date) < report_date
    ).scalar()
    prev_business_date = prev_business_date.date() if prev_business_date else None

    # Till float logic:
    # - Every day: subtract current till float (cash kept in drawer)
    # - Every day except the very first: add back previous day's till float as carry forward
    # Net effect after day 1 = zero. Only day 1 has a real deduction.
    if prev_business_date is not None:
        # Get the till float that was active on the previous business day
        # (use the till_float stored in settings at that time — we store history via CashCarryForward)
        prev_cf = db.session.query(CashCarryForward).filter(
            CashCarryForward.date == prev_business_date
        ).first()
        prev_till_float = float(prev_cf.pounds + prev_cf.coins) if prev_cf else till_float_amount
        carry_forward = prev_till_float  # add back previous day's float
    else:
        carry_forward = 0  # first ever business day — no carry forward

    # Net till float impact = carry_forward - till_float_amount
    # (positive carry_forward cancels out the deduction on day 2+)
    net_till_float = carry_forward - till_float_amount

    # Save today's till float to CashCarryForward so tomorrow can carry it forward
    existing_cf = CashCarryForward.query.filter_by(date=report_date).first()
    if not existing_cf:
        new_cf = CashCarryForward(date=report_date, pounds=till_float_amount, coins=0)
        db.session.add(new_cf)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
    elif float(existing_cf.pounds) != till_float_amount:
        # Update if the till float setting changed
        existing_cf.pounds = till_float_amount
        existing_cf.coins = 0
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()

    cash_cf_data = {
        'pounds': till_float_amount,
        'coins': 0,
        'total': net_till_float,  # net impact shown in banking total
        'till_float': till_float_amount,
        'carry_forward': carry_forward,
        'date': report_date.isoformat()
    }

    # 6. Banking Records
    banking_records = db.session.query(BankingEntry).filter(
        BankingEntry.date == report_date
    ).order_by(BankingEntry.id).all()
    
    banking_data = []
    for record in banking_records:
        # Get bag details
        bag_details = []
        for bag in record.bag_numbers:
            bag_details.append({
                'bag_number': bag.bag_number,
                'paying_number': bag.paying_number,
                'amount': float(bag.amount) if bag.amount else 0
            })
        
        banking_data.append({
            'date': record.date.isoformat(),
            'remarks': record.remarks,
            'payment_type': record.payment_type,
            'amount': float(record.amount),
            'paying_number': record.paying_number,
            'cheque_number': record.cheque_number,
            'bag_details': bag_details
        })
    
    # Calculate totals
    account_credits_total = sum(
        float(sale.get('account_credits') or 0) for sale in sales_summary
    )
    
    # Calculate customer cash payments (backdate)
    customer_cash_payments = sum(
        float(p.amount) for p in customer_payments 
        if p.payment_mode.lower() == 'cash'
    )
    
    # Calculate customer cheque payments (for total banking)
    customer_cheque_payments = sum(
        float(p.amount) for p in customer_payments 
        if p.payment_mode.lower() == 'cheque'
    )
    
    # Calculate supplier payments (paid out) - only cash and bank payments
    supplier_payments_paid_out = sum(
        float(p.amount) for p in supplier_payments 
        if p.payment_mode.lower() in ['cash', 'bank']
    )
    
    # Calculate expense payments (paid out) - only cash and bank payments
    expense_payments_paid_out = sum(
        float(e.amount) for e in expense_entries 
        if e.payment_mode.lower() in ['cash', 'bank']
    )
    
    # Calculate Total Banking using the specified formula:
    # Total Cash Sales + Total Cheque + Account Paid Cash(Backdate) + net_till_float
    # - Total Supplier Payment (Paid Out) - Total Expense (Paid Out)
    # net_till_float = carry_forward - till_float_amount
    # Day 1: 0 - 150 = -150 (deducted)
    # Day 2+: 150 - 150 = 0 (no impact)
    calculated_banking_total = (
        cash_total +  # Total Cash Sales
        cheque_total +  # Total Cheque
        customer_cash_payments +  # Account Paid Cash(Backdate)
        cash_cf_data['total'] +  # net Till/Float impact (already signed: negative on day 1, zero after)
        supplier_payments_paid_out * -1 +  # Total Supplier Payment (Paid Out)
        expense_payments_paid_out * -1  # Total Expense (Paid Out)
    )
    
    totals = {
        'cash_sales': cash_total,
        'card_sales': card_total,
        'bank_transfer_sales': bank_transfer_total,
        'cheque_sales': cheque_total + customer_cheque_payments,
        'account_sales': account_total,
        'account_credits': account_credits_total,
        'total_sales': cash_total + card_total + bank_transfer_total + cheque_total + account_total,
        'customer_payments_total': sum(float(p.amount) for p in customer_payments),
        'customer_cash_payments': customer_cash_payments,
        'supplier_payments_total': sum(float(p.amount) for p in supplier_payments),
        'supplier_payments_paid_out': supplier_payments_paid_out,
        'expense_total': sum(float(e.amount) for e in expense_entries),
        'expense_payments_paid_out': expense_payments_paid_out,
        'cash_cf_total': cash_cf_data['total'],  # net impact (negative day 1, zero after)
        'banking_total': calculated_banking_total,  # Use calculated value instead of database value
        'bank_transfer_payments': sum(
            float(p.amount) for p in customer_payments 
            if p.payment_mode.lower() == 'bank_transfer'
        )
    }
    
    return jsonify({
        'date': date_str,
        'sales_summary': sales_summary,
        'customer_payments': customer_payments_data,
        'supplier_payments': supplier_payments_data,
        'expense_entries': expense_data,
        'cash_cf': cash_cf_data,
        'banking_records': banking_data,
        'totals': totals
    })

@app.route('/api/reports/daily-summary/pdf', methods=['GET'])
def daily_summary_pdf():
    # Handle token from query parameter for popup windows
    token = request.args.get('token')
    if token:
        try:
            from flask_jwt_extended import decode_token
            decode_token(token)
        except:
            return jsonify({'error': 'Invalid token'}), 401
    else:
        # Use regular JWT required decorator logic
        from flask_jwt_extended import verify_jwt_in_request
        try:
            verify_jwt_in_request()
        except:
            return jsonify({'error': 'Authentication required'}), 401
   
    
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'error': 'date is required'}), 400
    
    try:
        from sqlalchemy import Integer, cast
        report_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        
        # Get the same data as the regular daily summary
        # 1. Daily Sales Summary
        sales_query = db.session.query(
            Sale.id,
            Sale.invoice_number,
            Customer.customer_name,
            Sale.total_amount,
            Sale.payment_status,
            Sale.customer_type
        ).join(
            Customer, Sale.customer_id == Customer.id
        ).filter(
            func.date(Sale.date) == report_date
    ).order_by(cast(Sale.invoice_number, Integer)).all()
        
        sales_summary = []
        cash_total = 0
        card_total = 0
        bank_transfer_total = 0
        cheque_total = 0
        account_total = 0
        negative_sale_ids = set()
        
        for sale in sales_query:
            cash_amount = 0
            card_amount = 0
            bank_transfer_amount = 0
            cheque_amount = 0
            account_amount = 0
            account_credits = 0
            
            sale_payments = db.session.query(Payment).filter(
                Payment.sale_id == sale.id
            ).all()
            
            for payment in sale_payments:
                if payment.payment_mode == 'cash':
                    cash_amount += float(payment.amount)
                elif payment.payment_mode == 'bank':  # Card payments are stored as 'bank' in backend
                    card_amount += float(payment.amount)
                elif payment.payment_mode == 'bank_transfer':
                    bank_transfer_amount += float(payment.amount)
                elif payment.payment_mode == 'cheque':
                    cheque_amount += float(payment.amount)
            
            if sale.customer_type == 'account' and not sale_payments:
                account_amount = float(sale.total_amount or 0)

            negative_items = db.session.query(SaleItem.id).filter(
                SaleItem.sale_id == sale.id,
                or_(SaleItem.quantity < 0, SaleItem.total_price < 0)
            ).first()
            if negative_items or float(sale.total_amount or 0) < 0:
                negative_sale_ids.add(sale.id)
                account_credits = abs(float(sale.total_amount or 0))
                cash_amount = 0
                card_amount = 0
                bank_transfer_amount = 0
                cheque_amount = 0
                account_amount = 0
            
            cash_total += cash_amount
            card_total += card_amount
            bank_transfer_total += bank_transfer_amount
            cheque_total += cheque_amount
            account_total += account_amount
            
            sales_summary.append({
            'customer_name': sale.customer_name,
            'ticket_no': sale.invoice_number,
            'cash_sales': cash_amount,
            'card_paid': card_amount,
            'bank_transfer': bank_transfer_amount,
            'cheque': cheque_amount,
            'account_sales': account_amount,
            'account_paid_cash': 0,
            'account_paid_cheque': 0,
            'account_credits': account_credits
        })

        customer_returns = db.session.query(
            CustomerReturn.id,
            CustomerReturn.sale_id,
            CustomerReturn.total_value,
            CustomerReturn.invoice_number,
            Customer.customer_name
        ).join(
            Customer, CustomerReturn.customer_id == Customer.id
        ).filter(
            CustomerReturn.date == report_date,
            CustomerReturn.status == 'completed'
        ).all()
        for customer_return in customer_returns:
            if customer_return.sale_id in negative_sale_ids:
                continue
            sales_summary.append({
                'customer_name': customer_return.customer_name,
                'ticket_no': customer_return.invoice_number or f"CR-{customer_return.id}",
                'cash_sales': 0,
                'card_paid': 0,
                'bank_transfer': 0,
                'cheque': 0,
                'account_sales': 0,
                'account_paid_cash': 0,
                'account_paid_cheque': 0,
                'account_credits': abs(float(customer_return.total_value or 0)),
            })

        daily_discounts = CustomerDiscount.query.options(
            db.joinedload(CustomerDiscount.customer),
            db.joinedload(CustomerDiscount.sale),
        ).filter(
            CustomerDiscount.date == report_date,
            CustomerDiscount.is_deleted.is_(False),
        ).all()
        for discount in daily_discounts:
            sales_summary.append({
                'customer_name': discount.customer.customer_name if discount.customer else '',
                'ticket_no': f"{discount.document_invoice_number or ''} (Credit/Adj)",
                'cash_sales': 0,
                'card_paid': 0,
                'bank_transfer': 0,
                'cheque': 0,
                'account_sales': 0,
                'account_paid_cash': 0,
                'account_paid_cheque': 0,
                'account_credits': float(discount.amount or 0),
            })

        for voided in VoidedInvoiceDocument.query.filter(
            or_(
                VoidedInvoiceDocument.date_unknown.is_(True),
                VoidedInvoiceDocument.date == report_date,
            )
        ).all():
            sales_summary.append({
                'customer_name': voided.customer_name,
                'ticket_no': (
                    f"{voided.invoice_number} (VOID - DATE UNKNOWN)"
                    if voided.date_unknown else f"{voided.invoice_number} (VOID)"
                ),
                'cash_sales': 0,
                'card_paid': 0,
                'bank_transfer': 0,
                'cheque': 0,
                'account_sales': 0,
                'account_paid_cash': 0,
                'account_paid_cheque': 0,
                'account_credits': 0,
            })
        
        # 2. Customer Payments
        customer_payments = db.session.query(
            Customer.customer_name,
            Sale.invoice_number,
            Payment.sale_id,
            Payment.id,
            Payment.payment_mode,
            Payment.amount,
            Payment.payment_date
        ).join(
            Customer, Payment.customer_id == Customer.id
        ).outerjoin(
            Sale, Payment.sale_id == Sale.id
        ).filter(
            Payment.payment_date == report_date,  # Payments made on the selected date
            or_(
                Payment.sale_id.is_(None),  # On-account payments (always backdate)
                func.date(Sale.date) < report_date  # Payments for invoices from previous dates
            ),
            # Exclude split payments from Daily Book Sales
            or_(
                Payment.payment_source.is_(None),
                Payment.payment_source != 'daily_book_sales'
            )
        ).order_by(Customer.customer_name, Sale.invoice_number).all()
        
        payment_groups = {}
        for payment in customer_payments:
            sale_key = payment.sale_id if payment.sale_id else 'on_account'
            key = (payment.customer_name, sale_key)
            
            if key not in payment_groups:
                payment_groups[key] = {
                    'customer_name': payment.customer_name,
                    'invoice_no': payment.invoice_number if payment.sale_id else 'On Account',
                    'payment_id': str(payment.id),
                    'cash_amount': 0,
                    'card_amount': 0,
                    'bank_transfer_amount': 0,
                    'cheque_amount': 0,
                    'total_amount': 0
                }
            
            amount = float(payment.amount)
            if payment.payment_mode.lower() == 'cash':
                payment_groups[key]['cash_amount'] += amount
            elif payment.payment_mode.lower() == 'bank':  # Card payments are stored as 'bank' in backend
                payment_groups[key]['card_amount'] += amount
            elif payment.payment_mode.lower() == 'bank_transfer':
                payment_groups[key]['bank_transfer_amount'] += amount
            elif payment.payment_mode.lower() == 'cheque':
                payment_groups[key]['cheque_amount'] += amount
            
            payment_groups[key]['total_amount'] += amount
        
        customer_payments_data = list(payment_groups.values())
        
        # 3. Supplier Payments
        supplier_payments = db.session.query(
            Supplier.supplier_name,
            SupplierPayment.supplier_invoice_number,
            SupplierPayment.supplier_invoice_date,
            SupplierPayment.amount,
            SupplierPayment.payment_mode,
            SupplierPayment.payment_date
        ).join(
            Supplier, SupplierPayment.supplier_id == Supplier.id
        ).filter(
            SupplierPayment.payment_date == report_date
        ).order_by(SupplierPayment.id).all()
        
        supplier_payments_data = []
        for payment in supplier_payments:
            supplier_payments_data.append({
                'supplier_name': payment.supplier_name,
                'supplier_invoice_number': payment.supplier_invoice_number or '',
                'supplier_invoice_date': payment.supplier_invoice_date.isoformat() if payment.supplier_invoice_date else '',
                'amount': float(payment.amount),
                'payment_mode': payment.payment_mode
            })
        
        # 4. Expense Entries
        expense_entries = db.session.query(
            ExpenseEntry.ref_number,
            ExpenseEntry.invoice_number,
            ExpenseEntry.amount,
            ExpenseEntry.payment_mode,
            ExpenseEntry.date,
            Supplier.supplier_name,
            Expense.expense_name
        ).join(
            Supplier, ExpenseEntry.supplier_id == Supplier.id
        ).join(
            Expense, ExpenseEntry.expense_id == Expense.id
        ).filter(
            ExpenseEntry.date == report_date
        ).order_by(ExpenseEntry.id).all()
        
        expense_data = []
        for expense in expense_entries:
            expense_data.append({
                'ref_number': expense.ref_number,
                'invoice_number': expense.invoice_number,
                'supplier_name': expense.supplier_name,
                'expense_name': expense.expense_name,
                'amount': float(expense.amount),
                'payment_mode': expense.payment_mode,
                'date': expense.date.isoformat()
            })
        
        expense_total = sum(float(e.amount) for e in expense_entries)
        expense_payments_paid_out = sum(
            float(e.amount) for e in expense_entries 
            if e.payment_mode.lower() in ['cash', 'bank']
        )
        
        # 5. Till Float (automatic — same logic as main daily summary)
        settings = SystemSettings.query.first()
        till_float_amount = float(settings.till_float) if settings and settings.till_float else 0

        from sqlalchemy import func as sqlfunc
        prev_business_date = db.session.query(sqlfunc.max(Sale.date)).filter(
            sqlfunc.date(Sale.date) < report_date
        ).scalar()
        prev_business_date = prev_business_date.date() if prev_business_date else None

        if prev_business_date is not None:
            prev_cf = db.session.query(CashCarryForward).filter(
                CashCarryForward.date == prev_business_date
            ).first()
            prev_till_float = float(prev_cf.pounds + prev_cf.coins) if prev_cf else till_float_amount
            carry_forward = prev_till_float
        else:
            carry_forward = 0

        net_till_float = carry_forward - till_float_amount

        cash_cf_data = {
            'pounds': till_float_amount,
            'coins': 0,
            'total': net_till_float,
            'till_float': till_float_amount,
            'carry_forward': carry_forward,
            'date': report_date.isoformat()
        }
        
        # 6. Banking Records
        banking_records = db.session.query(BankingEntry).filter(
            BankingEntry.date == report_date
        ).order_by(BankingEntry.id).all()
        
        banking_data = []
        for record in banking_records:
            bag_details = []
            for bag in record.bag_numbers:
                bag_details.append({
                    'bag_number': bag.bag_number,
                    'paying_number': bag.paying_number,
                    'amount': float(bag.amount) if bag.amount else 0
                })
            
            banking_data.append({
                'date': record.date.isoformat(),
                'remarks': record.remarks,
                'payment_type': record.payment_type,
                'amount': float(record.amount),
                'paying_number': record.paying_number,
                'cheque_number': record.cheque_number,
                'bag_details': bag_details
            })
        
        banking_total = sum(float(r.amount) for r in banking_records)
        
        # Calculate additional totals for banking calculations
        customer_cash_payments = sum(
            float(p.amount) for p in customer_payments 
            if p.payment_mode.lower() == 'cash'
        )
        
        supplier_payments_paid_out = sum(
            float(p.amount) for p in supplier_payments 
            if p.payment_mode.lower() in ['cash', 'bank']
        )
        
        # Calculate Total Banking using the specified formula (net till float already signed)
        calculated_banking_total = (
            cash_total +  # Total Cash Sales
            cheque_total +  # Total Cheque
            customer_cash_payments +  # Account Paid Cash(Backdate)
            cash_cf_data['total'] +  # net Till/Float impact
            supplier_payments_paid_out * -1 +  # Total Supplier Payment (Paid Out)
            expense_payments_paid_out * -1  # Total Expense (Paid Out)
        )
        
        # Check if stock and purchase data should be included
        include_stock = request.args.get('includeStock', 'false').lower() == 'true'
        include_purchase = request.args.get('includePurchase', 'false').lower() == 'true'
        from html import escape as html_escape

        customer_return_records = CustomerReturn.query.filter(
            CustomerReturn.date == report_date
        ).order_by(CustomerReturn.date, CustomerReturn.id).all()
        supplier_return_records = SupplierReturn.query.filter(
            SupplierReturn.date == report_date
        ).order_by(SupplierReturn.date, SupplierReturn.id).all()

        customer_return_rows = ""
        for return_item in customer_return_records:
            customer_name = return_item.customer.customer_name if return_item.customer else ""
            customer_return_rows += f"""
                <tr>
                    <td>{html_escape(return_item.date.strftime("%d/%m/%Y") if return_item.date else "-")}</td>
                    <td>{html_escape(customer_name or "-")}</td>
                    <td>{html_escape(return_item.description or "-")}</td>
                    <td>{html_escape(return_item.invoice_number or "-")}</td>
                    <td class="text-center">{float(return_item.quantity or 0):g}</td>
                    <td class="text-right">£{float(return_item.unit_price or 0):.2f}</td>
                    <td class="text-right">£{float(return_item.total_value or 0):.2f}</td>
                    <td>{html_escape(return_item.remarks or "-")}</td>
                </tr>
            """
        if not customer_return_rows:
            customer_return_rows = '<tr><td colspan="8" class="text-center">No customer returns found</td></tr>'

        supplier_return_rows = ""
        for return_item in supplier_return_records:
            supplier_name = return_item.supplier.supplier_name if return_item.supplier else ""
            product_model = RegularProduct if return_item.product_type == 'regular' else NonProduct
            product = product_model.query.get(return_item.product_id)
            product_name = (
                f"{product.product_code} - {product.description}"
                if product and product.product_code
                else product.description if product
                else return_item.description
            )
            supplier_return_rows += f"""
                <tr>
                    <td>{html_escape(return_item.date.strftime("%d/%m/%Y") if return_item.date else "-")}</td>
                    <td>{html_escape(return_item.ref_number or "-")}</td>
                    <td>{html_escape(supplier_name or "-")}</td>
                    <td>{html_escape(product_name or "-")}</td>
                    <td>{html_escape(return_item.description or "-")}</td>
                    <td>{html_escape(return_item.invoice_number or "-")}</td>
                    <td class="text-center">{float(return_item.quantity or 0):g}</td>
                    <td class="text-right">£{float(return_item.unit_price or 0):.2f}</td>
                    <td class="text-right">£{float(return_item.total_value or 0):.2f}</td>
                </tr>
            """
        if not supplier_return_rows:
            supplier_return_rows = '<tr><td colspan="9" class="text-center">No supplier returns found</td></tr>'
        
        # 5. Stock Check Data (if requested)
        stock_data = []
        if include_stock:
            from sqlalchemy import text
            # Get regular products with their closing stock for the date
            stock_query = text("""
                SELECT 
                    ROW_NUMBER() OVER (ORDER BY p.id) as slNo,
                    p.description as product_description,
                    p.current_stock as os,
                    0 as ns,
                    0 as sales,
                    0 as crtn,
                    0 as dmps,
                    0 as srtn,
                    p.current_stock as stock,
                    COALESCE(cs.quantity, 0) as clStock,
                    CASE 
                        WHEN COALESCE(cs.quantity, 0) = p.current_stock THEN '✓'
                        WHEN COALESCE(cs.quantity, 0) > p.current_stock THEN '+' || (COALESCE(cs.quantity, 0) - p.current_stock)
                        ELSE '-' || (p.current_stock - COALESCE(cs.quantity, 0))
                    END as result
                FROM regular_products p
                LEFT JOIN closing_stock cs ON p.id = cs.product_id AND cs.product_type = 'regular' AND cs.date = :report_date
                WHERE p.status = 'active'
                ORDER BY p.id
            """)
            
            stock_results = db.session.execute(stock_query, {'report_date': report_date}).fetchall()
            for row in stock_results:
                stock_data.append({
                    'slNo': row.slNo,
                    'productDescription': row.product_description,
                    'os': row.os,
                    'ns': row.ns,
                    'sales': row.sales,
                    'crtn': row.crtn,
                    'dmps': row.dmps,
                    'srtn': row.srtn,
                    'stock': row.stock,
                    'clStock': row.clStock,
                    'result': row.result
                })
        
        # 6. Daily Book Purchase Data (if requested)
        purchase_data = []
        if include_purchase:
            purchase_query = db.session.query(
                PurchaseInvoice.id,
                PurchaseInvoice.date,
                Supplier.supplier_name
            ).join(
                Supplier, PurchaseInvoice.supplier_id == Supplier.id
            ).filter(
                func.date(PurchaseInvoice.date) == report_date
            ).order_by(PurchaseInvoice.date, PurchaseInvoice.id).all()
            
            for purchase in purchase_query:
                # Calculate total amount from items
                invoice = PurchaseInvoice.query.get(purchase.id)
                total_amount = sum(float(item.total_price) for item in invoice.items) if invoice.items else 0
                
                purchase_data.append({
                    'date': purchase.date.strftime('%d-%m-%Y'),
                    'supplier': purchase.supplier_name,
                    'invNo': purchase.id,  # Use invoice ID as invoice number
                    'invoiceAmt': total_amount
                })
        
        # Format totals to avoid f-string decimal literal issues
        cash_total_str = f"{cash_total:.2f}"
        card_total_str = f"{card_total:.2f}"
        account_total_str = f"{account_total:.2f}"
        banking_total_str = f"{banking_total:.2f}"
        cheque_total_str = f"{cheque_total:.2f}"
        
        # Generate HTML with actual data
        sales_rows = ""
        for sale in sales_summary:
            cash_sales_str = f"{sale['cash_sales']:.2f}" if sale['cash_sales'] > 0 else '-'
            card_paid_str = f"{sale['card_paid']:.2f}" if sale['card_paid'] > 0 else '-'
            bank_transfer_str = f"{sale.get('bank_transfer', 0):.2f}" if sale.get('bank_transfer', 0) > 0 else '-'
            cheque_str = f"{sale.get('cheque', 0):.2f}" if sale.get('cheque', 0) > 0 else '-'
            account_sales_str = f"{sale['account_sales']:.2f}" if sale['account_sales'] > 0 else '-'
            account_paid_cash_str = f"{sale.get('account_paid_cash', 0):.2f}" if sale.get('account_paid_cash', 0) > 0 else '-'
            account_paid_cheque_str = f"{sale.get('account_paid_cheque', 0):.2f}" if sale.get('account_paid_cheque', 0) > 0 else '-'
            account_credits_str = f"{sale.get('account_credits', 0):.2f}" if sale.get('account_credits', 0) > 0 else '-'
            
            sales_rows += f"""
                <tr>
                    <td>{sale['customer_name']}</td>
                    <td>{sale['ticket_no']}</td>
                    <td class="text-right">{cash_sales_str}</td>
                    <td class="text-right">{card_paid_str}</td>
                    <td class="text-right">{bank_transfer_str}</td>
                    <td class="text-right">{cheque_str}</td>
                    <td class="text-right">{account_sales_str}</td>
                    <td class="text-right">{account_credits_str}</td>
                </tr>
            """
        
        customer_payment_rows = ""
        for payment in customer_payments_data:
            cash_amount_str = f"{payment['cash_amount']:.2f}" if payment['cash_amount'] > 0 else '-'
            card_amount_str = f"{payment['card_amount']:.2f}" if payment['card_amount'] > 0 else '-'
            total_amount_str = f"{payment['total_amount']:.2f}"
            
            customer_payment_rows += f"""
                <tr>
                    <td>{payment['customer_name']}</td>
                    <td>{payment['payment_id']}</td>
                    <td class="text-right">{cash_amount_str}</td>
                    <td class="text-right">{card_amount_str}</td>
                    <td class="text-right">{total_amount_str}</td>
                </tr>
            """
        
        # Generate supplier payment rows
        supplier_payment_rows = ""
        for payment in supplier_payments_data:
            amount_str = f"{payment['amount']:.2f}"
            
            supplier_payment_rows += f"""
                <tr>
                    <td>{payment['supplier_name']}</td>
                    <td>{payment['supplier_invoice_number']}</td>
                    <td>{payment['supplier_invoice_date']}</td>
                    <td class="text-right">{amount_str}</td>
                    <td class="capitalize">{payment['payment_mode']}</td>
                </tr>
            """
        
        # Generate expense entry rows
        expense_rows = ""
        for expense in expense_data:
            amount_str = f"{expense['amount']:.2f}"
            
            expense_rows += f"""
                <tr>
                    <td>{expense['ref_number']}</td>
                    <td>{expense['description']}</td>
                    <td>{expense['supplier_name']}</td>
                    <td>{expense['expense_name']}</td>
                    <td class="text-right">{amount_str}</td>
                    <td class="capitalize">{expense['payment_mode']}</td>
                </tr>
            """
        
        # Generate banking record rows
        banking_rows = ""
        for record in banking_data:
            bag_details_str = ""
            if record['bag_details']:
                for bag in record['bag_details']:
                    bag_amount_str = f"{bag['amount']:.2f}"
                    bag_details_str += f"Bag: {bag['bag_number']} | Pay: {bag['paying_number']} | {bag_amount_str}<br>"
            else:
                if record['paying_number']:
                    bag_details_str += f"Pay: {record['paying_number']}"
                if record['cheque_number']:
                    bag_details_str += f" | Cheque: {record['cheque_number']}"
            
            record_amount_str = f"{record['amount']:.2f}"
            record_date_str = datetime.strptime(record['date'], '%Y-%m-%d').strftime('%d/%m/%Y')
            
            banking_rows += f"""
                <tr>
                    <td>{record_date_str}</td>
                    <td>{record['remarks'] or ''}</td>
                    <td class="capitalize">{record['payment_type']}</td>
                    <td class="text-right">{record_amount_str}</td>
                    <td>{bag_details_str}</td>
                </tr>
            """
        
        # Generate stock check rows
        stock_rows = ""
        stock_totals = {'os': 0, 'ns': 0, 'sales': 0, 'crtn': 0, 'dmps': 0, 'srtn': 0, 'stock': 0, 'clStock': 0}
        if include_stock and stock_data:
            for item in stock_data:
                stock_rows += f"""
                    <tr>
                        <td>{item['slNo']}</td>
                        <td>{item['productDescription']}</td>
                        <td class="text-center">{item['os']}</td>
                        <td class="text-center">{item['ns']}</td>
                        <td class="text-center">{item['sales']}</td>
                        <td class="text-center">{item['crtn']}</td>
                        <td class="text-center">{item['dmps']}</td>
                        <td class="text-center">{item['srtn']}</td>
                        <td class="text-center">{item['stock']}</td>
                        <td class="text-center">{item['clStock']}</td>
                        <td class="text-center">{item['result']}</td>
                    </tr>
                """
                # Calculate totals
                stock_totals['os'] += item['os']
                stock_totals['ns'] += item['ns']
                stock_totals['sales'] += item['sales']
                stock_totals['crtn'] += item['crtn']
                stock_totals['dmps'] += item['dmps']
                stock_totals['srtn'] += item['srtn']
                stock_totals['stock'] += item['stock']
                stock_totals['clStock'] += item['clStock']
        
        # Generate purchase rows
        purchase_rows = ""
        purchase_total = 0
        if include_purchase and purchase_data:
            for item in purchase_data:
                purchase_rows += f"""
                    <tr>
                        <td>{item['date']}</td>
                        <td>{item['supplier']}</td>
                        <td class="text-center">{item['invNo']}</td>
                        <td class="text-center">£{item['invoiceAmt']:.2f}</td>
                    </tr>
                """
                purchase_total += item['invoiceAmt']
        

        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Daily Summary - {date_str}</title>
            <style>
                @page return-portrait {{ size: A4 portrait; margin: 10mm; }}
                body {{ font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }}
                table {{ border-collapse: collapse; width: 100%; margin-bottom: 20px; }}
                th, td {{ border: 1px solid #000; padding: 8px; text-align: left; }}
                th {{ background-color: #f2f2f2; font-weight: bold; }}
                .text-right {{ text-align: right; }}
                .text-center {{ text-align: center; }}
                h1, h2 {{ color: #333; margin-bottom: 10px; }}
                h3 {{ color: #333; margin-top: 20px; margin-bottom: 10px; }}
                .totals-row {{ background-color: #f9f9f9; font-weight: bold; }}
                .capitalize {{ text-transform: capitalize; }}
                @media print {{
                    body {{ margin: 0; }}
                    .no-print {{ display: none; }}
                    .return-report-page {{ page: return-portrait; padding-top: 8mm; }}
                    .return-report-page table {{ width: 100%; table-layout: fixed; }}
                    .return-report-page th, .return-report-page td {{ padding: 3px; font-size: 8px; overflow-wrap: anywhere; word-break: break-word; }}
                }}
            </style>
        </head>
        <body>
            <h1>Daily Summary Report</h1>
            <h2>Date: {datetime.strptime(date_str, "%Y-%m-%d").strftime("%d/%m/%Y")}</h2>
            
            <h3>Daily Sales Summary</h3>
            <table>
                <thead>
                    <tr>
                        <th>Customer</th>
                        <th>Invoice No</th>
                        <th>Cash Sales</th>
                        <th>Card Paid</th>
                        <th>Bank Transfer</th>
                        <th>Cheque</th>
                        <th>Account Sales</th>
                        <th>Account Credits</th>
                    </tr>
                </thead>
                <tbody>
                    {sales_rows}
                    <tr class="totals-row">
                        <td colspan="2">TOTALS</td>
                        <td class="text-right">{cash_total_str}</td>
                        <td class="text-right">{card_total_str}</td>
                        <td class="text-right">{sum(sale.get('bank_transfer', 0) for sale in sales_summary):.2f}</td>
                        <td class="text-right">{cheque_total_str}</td>
                        <td class="text-right">{account_total_str}</td>
                        <td class="text-right">{sum(sale.get('account_credits', 0) for sale in sales_summary):.2f}</td>
                    </tr>
                </tbody>
            </table>
            
            <div style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; background-color: #f9f9f9;">
                <h4 style="margin-bottom: 10px;">Summary Totals:</h4>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span><strong>Total Cash Sales:</strong></span>
                    <span><strong>{cash_total_str}</strong></span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span><strong>Total Card Sales:</strong></span>
                    <span><strong>{card_total_str}</strong></span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span><strong>Total Banking:</strong></span>
                    <span><strong>{banking_total_str}</strong></span>
                </div>
            </div>
            
            <h3>Expense Entries</h3>
            <table>
                <thead>
                    <tr>
                        <th>Ref Number</th>
                        <th>Description</th>
                        <th>Supplier Name</th>
                        <th>Expense Name</th>
                        <th>Amount</th>
                        <th>Payment Mode</th>
                    </tr>
                </thead>
                <tbody>
                    {expense_rows if expense_rows else '<tr><td colspan="6" class="text-center">No expense entries found</td></tr>'}
                    {f'''<tr class="totals-row">
                        <td colspan="4">TOTAL</td>
                        <td class="text-right">{expense_total:.2f}</td>
                        <td></td>
                    </tr>''' if expense_data else ''}
                </tbody>
            </table>
            
            <h3>Cash Carry Forward (Till/Float)</h3>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Pounds</th>
                        <th>Coins</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>{datetime.strptime(date_str, "%Y-%m-%d").strftime("%d/%m/%Y")}</td>
                        <td class="text-right">£{cash_cf_data['pounds']:.2f}</td>
                        <td class="text-right">£{cash_cf_data['coins']:.2f}</td>
                        <td class="text-right">£{cash_cf_data['total']:.2f}</td>
                    </tr>
                </tbody>
            </table>
            
            <h3>Card Sales & Customer Card Payments</h3>
            <table>
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Total Card Sales</td>
                        <td class="text-right">£{card_total_str}</td>
                    </tr>
                    <tr>
                        <td>Account Paid Card(Backdate)</td>
                        <td class="text-right">£{sum(p["card_amount"] for p in customer_payments_data):.2f}</td>
                    </tr>
                </tbody>
            </table>
            
            <h3>Payment Received via Bank Transfer</h3>
            <table>
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Total Bank Transfer Sales</td>
                        <td class="text-right">£{sum(sale.get('bank_transfer', 0) for sale in sales_summary):.2f}</td>
                    </tr>
                    <tr>
                        <td>Customer Bank Transfer Payments</td>
                        <td class="text-right">£{sum(p.get('bank_transfer_amount', 0) for p in customer_payments_data):.2f}</td>
                    </tr>
                    <tr class="totals-row">
                        <td>Total Bank Transfer Received</td>
                        <td class="text-right">£{(sum(sale.get('bank_transfer', 0) for sale in sales_summary) + sum(p.get('bank_transfer_amount', 0) for p in customer_payments_data)):.2f}</td>
                    </tr>
                </tbody>
            </table>
            
            <h3>Customer Payments (Backdate Only)</h3>
            <table>
                <thead>
                    <tr>
                        <th>Customer Name</th>
                        <th>Payment ID</th>
                        <th>Cash Amount</th>
                        <th>Card Amount</th>
                        <th>Total Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {customer_payment_rows if customer_payment_rows else '<tr><td colspan="5" class="text-center">No customer payments found</td></tr>'}
                    {f'''<tr class="totals-row">
                        <td colspan="2">TOTAL</td>
                        <td class="text-right">{sum(p["cash_amount"] for p in customer_payments_data):.2f}</td>
                        <td class="text-right">{sum(p["card_amount"] for p in customer_payments_data):.2f}</td>
                        <td class="text-right">{sum(p["total_amount"] for p in customer_payments_data):.2f}</td>
                    </tr>''' if customer_payments_data else ''}
                </tbody>
            </table>
            
            <h3>Supplier Payments</h3>
            <table>
                <thead>
                    <tr>
                        <th>Supplier Name</th>
                        <th>Supplier Invoice No</th>
                        <th>Supplier Invoice Date</th>
                        <th>Amount</th>
                        <th>Payment Mode</th>
                    </tr>
                </thead>
                <tbody>
                    {supplier_payment_rows if supplier_payment_rows else '<tr><td colspan="5" class="text-center">No supplier payments found</td></tr>'}
                    {f'''<tr class="totals-row">
                        <td colspan="3">TOTAL</td>
                        <td class="text-right">{sum(p["amount"] for p in supplier_payments_data):.2f}</td>
                        <td></td>
                    </tr>''' if supplier_payments_data else ''}
                </tbody>
            </table>
            
            <h3>Banking Records</h3>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Remarks</th>
                        <th>Payment Type</th>
                        <th>Amount</th>
                        <th>Bag Details</th>
                    </tr>
                </thead>
                <tbody>
                    {banking_rows if banking_rows else '<tr><td colspan="5" class="text-center">No banking records found</td></tr>'}
                    {f'''<tr class="totals-row">
                        <td colspan="3">TOTAL</td>
                        <td class="text-right">{banking_total_str}</td>
                        <td></td>
                    </tr>''' if banking_data else ''}
                </tbody>
            </table>
            
            <h3>Total Banking</h3>
            <table>
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Total Cash Sales</td>
                        <td class="text-right">£{cash_total_str}</td>
                    </tr>
                    <tr>
                        <td>Total Cheque</td>
                        <td class="text-right">£{sum(sale.get('cheque', 0) for sale in sales_summary):.2f}</td>
                    </tr>
                    <tr>
                        <td>Account Paid Cash(Backdate)</td>
                        <td class="text-right">£{customer_cash_payments:.2f}</td>
                    </tr>
                    <tr>
                        <td>Till/Float(C/F)</td>
                        <td class="text-right">£{cash_cf_data['total']:.2f}</td>
                    </tr>
                    <tr style="color: red;">
                        <td>Total Supplier Payment (Paid Out)</td>
                        <td class="text-right">-£{supplier_payments_paid_out:.2f}</td>
                    </tr>
                    <tr style="color: red;">
                        <td>Total Expense (Paid Out)</td>
                        <td class="text-right">-£{expense_payments_paid_out:.2f}</td>
                    </tr>
                    <tr style="background-color: #e3f2fd; border: 2px solid #1976d2; font-weight: bold; font-size: 18px;">
                        <td>Total Banking</td>
                        <td class="text-right">£{calculated_banking_total:.2f}</td>
                    </tr>
                </tbody>
            </table>"""
        
        # Add Stock Check section if requested and data exists
        if include_stock and stock_data:
            html_content += f"""
            <div style="page-break-before: always;">
                <h1>Stock Check</h1>
                <h2>Date: {datetime.strptime(date_str, "%Y-%m-%d").strftime("%d/%m/%Y")}</h2>
                
                <table>
                    <thead>
                        <tr>
                            <th>Sl.No</th>
                            <th>Product Description</th>
                            <th>O.S</th>
                            <th>N.S</th>
                            <th>Sales</th>
                            <th>C.RTN</th>
                            <th>Dmps</th>
                            <th>S.RTN</th>
                            <th>Stock</th>
                            <th>Cl.Stock</th>
                            <th>Result</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stock_rows}
                        <tr class="totals-row">
                            <td></td>
                            <td>TOTAL</td>
                            <td class="text-center">{stock_totals['os']}</td>
                            <td class="text-center">{stock_totals['ns']}</td>
                            <td class="text-center">{stock_totals['sales']}</td>
                            <td class="text-center">{stock_totals['crtn']}</td>
                            <td class="text-center">{stock_totals['dmps']}</td>
                            <td class="text-center">{stock_totals['srtn']}</td>
                            <td class="text-center">{stock_totals['stock']}</td>
                            <td class="text-center">{stock_totals['clStock']}</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>"""

        # Return registers follow Stock Check and always start on their own pages.
        html_content += f"""
            <div class="return-report-page" style="page-break-before: always; break-before: page;">
                <h1>Customer Returns</h1>
                <h2>Date: {datetime.strptime(date_str, "%Y-%m-%d").strftime("%d/%m/%Y")}</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th><th>Customer</th><th>Product</th><th>Invoice No</th>
                            <th>Quantity</th><th>Unit Price</th><th>Total</th><th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody>{customer_return_rows}</tbody>
                </table>
            </div>
            <div class="return-report-page" style="page-break-before: always; break-before: page;">
                <h1>Supplier Returns</h1>
                <h2>Date: {datetime.strptime(date_str, "%Y-%m-%d").strftime("%d/%m/%Y")}</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th><th>Reference</th><th>Supplier</th><th>Product</th><th>Description</th>
                            <th>Invoice No</th><th>Quantity</th><th>Unit Price</th><th>Total Value</th>
                        </tr>
                    </thead>
                    <tbody>{supplier_return_rows}</tbody>
                </table>
            </div>"""
        
        # Add Purchase section if requested and data exists
        if include_purchase and purchase_data:
            html_content += f"""
            <div style="page-break-before: always;">
                <h1>Daily Book Purchase</h1>
                <h2>Date: {datetime.strptime(date_str, "%Y-%m-%d").strftime("%d/%m/%Y")}</h2>
                
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Supplier</th>
                            <th>Inv.No</th>
                            <th>Invoice Amt</th>
                        </tr>
                    </thead>
                    <tbody>
                        {purchase_rows}
                        <tr class="totals-row">
                            <td></td>
                            <td>{len(purchase_data)} Items</td>
                            <td class="text-center"></td>
                            <td class="text-center">£{purchase_total:.2f}</td>
                        </tr>
                    </tbody>
                </table>
            </div>"""
        
        # Close HTML
        html_content += """
            <script>
                window.onload = function() {
                    window.print();
                }
            </script>
        </body>
        </html>
    """    
        response = make_response(html_content)
        response.headers['Content-Type'] = 'text/html'
        response.headers['Content-Disposition'] = f'inline; filename=daily-summary-{date_str}.html'
        
        return response
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/cash-cf', methods=['POST'])
@jwt_required()
def add_cash_cf():
    data = request.get_json()
    from datetime import datetime
    date_str = data.get('date')
    pounds = data.get('pounds', 0)
    coins = data.get('coins', 0)
    # Use business date logic
    if date_str:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        business_date = get_business_date(date_obj)
    else:
        business_date = get_business_date()
    cf = CashCarryForward.query.filter_by(date=business_date).first()
    if cf:
        cf.pounds = pounds
        cf.coins = coins
    else:
        cf = CashCarryForward(date=business_date, pounds=pounds, coins=coins)
        db.session.add(cf)
    db.session.commit()
    return jsonify(cf.to_dict()), 201

@app.route('/api/cash-cf', methods=['GET'])
@jwt_required()
def get_cash_cf():
    from datetime import datetime
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'error': 'date is required'}), 400
    date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
    cf = CashCarryForward.query.filter_by(date=date_obj).first()
    if not cf:
        return jsonify({'pounds': 0, 'coins': 0, 'date': date_str}), 200
    return jsonify(cf.to_dict())

@app.route('/api/cash-cf/range', methods=['GET'])
@jwt_required()
def get_cash_cf_range():
    from datetime import datetime
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    if not from_date or not to_date:
        return jsonify({'error': 'fromDate and toDate are required'}), 400
    from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
    to_dt = datetime.strptime(to_date, "%Y-%m-%d").date()
    cfs = CashCarryForward.query.filter(CashCarryForward.date >= from_dt, CashCarryForward.date <= to_dt).all()
    return jsonify([cf.to_dict() for cf in cfs])

@app.route('/api/cash-cf', methods=['DELETE'])
@jwt_required()
def delete_cash_cf():
    from datetime import datetime
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'error': 'date is required'}), 400
    date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
    cf = CashCarryForward.query.filter_by(date=date_obj).first()
    if not cf:
        return jsonify({'error': 'Cash C/F entry not found'}), 404
    db.session.delete(cf)
    db.session.commit()
    return jsonify({'message': 'Cash C/F entry deleted successfully'}), 200

@app.route('/api/banking', methods=['POST'])
@jwt_required()
def add_banking_entry():
    data = request.get_json()
    from datetime import datetime
    date_str = data.get('date')
    remarks = data.get('remarks', '')
    payment_type = data.get('paymentType', 'CASH')
    amount = data.get('amount', 0)
    paying_number = data.get('payingNumber')
    bag_number = data.get('bagNumber')  # For CHEQUE payments or backward compatibility
    bags = data.get('bags', [])  # New field for bag objects with number, payingNumber, and amount
    cheque_number = data.get('chequeNumber')
    cheque_paying_number = data.get('chequePayingNumber')  # Paying number for CHEQUE payments
    # Use business date logic
    if date_str:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        business_date = get_business_date(date_obj)
    else:
        business_date = get_business_date()
    # For CHEQUE payments, use the cheque paying number
    final_paying_number = cheque_paying_number if payment_type == 'CHEQUE' else paying_number
    
    entry = BankingEntry(
        date=business_date,
        remarks=remarks,
        payment_type=payment_type,
        amount=amount,
        paying_number=final_paying_number,
        bag_number=bag_number,  # Keep for backward compatibility and CHEQUE payments
        cheque_number=cheque_number
    )
    db.session.add(entry)
    db.session.flush()  # Get the ID of the entry
    
    # Add bags with individual paying numbers and amounts (for CASH/COINS)
    for bag in bags:
        if bag.get('number') and bag.get('number').strip():  # Only add non-empty bag numbers
            bag_entry = BankingBagNumber(
                banking_entry_id=entry.id,
                bag_number=bag.get('number').strip(),
                paying_number=bag.get('payingNumber', '').strip() if bag.get('payingNumber') else None,
                amount=bag.get('amount', 0)
            )
            db.session.add(bag_entry)
    
    # For CHEQUE payments, create a single bag entry if bag_number is provided
    if payment_type == 'CHEQUE' and bag_number and bag_number.strip():
        bag_entry = BankingBagNumber(
            banking_entry_id=entry.id,
            bag_number=bag_number.strip(),
            paying_number=None,  # CHEQUE doesn't have paying number for bags
            amount=amount  # Use the total amount for CHEQUE
        )
        db.session.add(bag_entry)
    
    db.session.commit()
    return entry.to_dict(), 201

@app.route('/api/banking/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_banking_entry(id):
    """Delete a banking entry with permission checks"""
    try:
        user_id = get_jwt_identity()
        entry = BankingEntry.query.get_or_404(id)
        
        # Get user's backdate options
        backdate_opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
        
        # Get today's date
        from datetime import datetime
        today = get_business_date()
        entry_date = entry.date
        
        # Check permissions based on entry date
        if entry_date == today:
            # For current date entries, check current_editing permission
            if backdate_opt and not getattr(backdate_opt, 'current_editing', True):
                return jsonify({'error': 'You do not have permission to delete entries for today.'}), 403
        else:
            # For back date entries, check deleting permission
            if not backdate_opt or not backdate_opt.deleting:
                return jsonify({'error': 'You do not have permission to delete back-dated entries.'}), 403
        
        # Delete associated bag numbers if they exist
        if hasattr(entry, 'bag_numbers'):
            for bag in entry.bag_numbers:
                db.session.delete(bag)
        
        db.session.delete(entry)
        db.session.commit()
        
        return jsonify({'message': 'Banking entry deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/banking', methods=['GET'])
@jwt_required()
def get_banking_entries():
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    from datetime import datetime
    query = BankingEntry.query
    if from_date:
        query = query.filter(BankingEntry.date >= from_date)
    if to_date:
        query = query.filter(BankingEntry.date <= to_date)
    entries = query.order_by(BankingEntry.date.desc()).all()
    return [e.to_dict() for e in entries], 200

@app.route('/api/reports/all-customer-history', methods=['GET'])
@jwt_required()
def all_customer_history():
    from datetime import datetime
    from sqlalchemy import func, and_, or_
    
    # Get query parameters
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    customer_filter = request.args.get('customerFilter', 'All Customer')  # All Customer, Exclude Bad Debt, Show Bad Debt
    search_term = request.args.get('search', '')
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('perPage', 10))
    currency_filter = request.args.get('currency', '')
    
    # Parse dates
    from_dt = None
    to_dt = None
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        except ValueError:
            return jsonify({'error': 'Invalid fromDate format. Use YYYY-MM-DD'}), 400
    
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, "%Y-%m-%d")
        except ValueError:
            return jsonify({'error': 'Invalid toDate format. Use YYYY-MM-DD'}), 400
    
    # Build base customer query
    customer_query = Customer.query
    
    # Apply search filter
    if search_term:
        customer_query = customer_query.filter(
            or_(
                Customer.customer_name.ilike(f'%{search_term}%'),
                Customer.customer_code.ilike(f'%{search_term}%'),
                Customer.address.ilike(f'%{search_term}%')
            )
        )
    
    # Apply currency filter
    if currency_filter:
        customer_query = customer_query.filter(Customer.customer_currency == currency_filter)
    
    # Apply customer filter (bad debt logic)
    if customer_filter == 'Exclude Bad Debt':
        # Exclude customers with outstanding balance > credit limit
        customer_query = customer_query.filter(Customer.is_active == 'yes')
    elif customer_filter == 'Show Bad Debt':
        # Show only customers with outstanding balance > credit limit
        pass  # We'll filter this after calculating balances
    
    # Get all customers
    customers = customer_query.all()
    
    # Calculate data for each customer
    result = []
    sl_no = 1
    
    for customer in customers:
        # Sales (Account and Cash)
        account_sales_query = Sale.query.filter(
            Sale.customer_id == customer.id,
            Sale.customer_type.ilike('account'),
            Sale.status == 'finalized'  # Only finalized sales
        )
        cash_sales_query = Sale.query.filter(
            Sale.customer_id == customer.id,
            Sale.customer_type.ilike('cash'),
            Sale.status == 'finalized'  # Only finalized sales
        )
        
        # Apply date filters using proper date range (include full day)
        if from_dt:
            # Start of the from_date (00:00:00)
            start_of_day = datetime.combine(from_dt.date(), datetime.min.time())
            account_sales_query = account_sales_query.filter(Sale.date >= start_of_day)
            cash_sales_query = cash_sales_query.filter(Sale.date >= start_of_day)
        if to_dt:
            # End of the to_date (23:59:59.999999)
            end_of_day = datetime.combine(to_dt.date(), datetime.max.time())
            account_sales_query = account_sales_query.filter(Sale.date <= end_of_day)
            cash_sales_query = cash_sales_query.filter(Sale.date <= end_of_day)
        
        account_invoice = sum(float(s.total_amount) for s in account_sales_query.all())
        cash_invoice = sum(float(s.total_amount) for s in cash_sales_query.all())
        
        # Payments
        payments_query = Payment.query.filter(Payment.customer_id == customer.id)
        if from_dt:
            payments_query = payments_query.filter(Payment.payment_date >= from_dt.date())
        if to_dt:
            payments_query = payments_query.filter(Payment.payment_date <= to_dt.date())
        amount_received = sum(float(p.amount) for p in payments_query.all())
        
        # Returns/Discounts (Customer Returns)
        returns_query = CustomerReturn.query.filter(
            CustomerReturn.customer_id == customer.id,
            CustomerReturn.status == 'completed'  # Only completed returns
        )
        if from_dt:
            returns_query = returns_query.filter(CustomerReturn.date >= from_dt.date())
        if to_dt:
            returns_query = returns_query.filter(CustomerReturn.date <= to_dt.date())
        returns_discount = sum(float(r.total_value) for r in returns_query.all())

        customer_discounts_query = CustomerDiscount.query.filter(
            CustomerDiscount.customer_id == customer.id,
            CustomerDiscount.is_deleted.is_(False),
        )
        if from_dt:
            customer_discounts_query = customer_discounts_query.filter(
                CustomerDiscount.date >= from_dt.date()
            )
        if to_dt:
            customer_discounts_query = customer_discounts_query.filter(
                CustomerDiscount.date <= to_dt.date()
            )
        returns_discount += sum(float(d.amount) for d in customer_discounts_query.all())
        
        # On Account (payments not linked to a specific sale)
        on_account_query = Payment.query.filter(
            Payment.customer_id == customer.id,
            Payment.sale_id.is_(None)  # Payments not linked to specific invoices
        )
        if from_dt:
            on_account_query = on_account_query.filter(Payment.payment_date >= from_dt.date())
        if to_dt:
            on_account_query = on_account_query.filter(Payment.payment_date <= to_dt.date())
        on_account = sum(float(p.amount) for p in on_account_query.all())
        
        # Balance Outstanding: account invoices - payments - returns/discounts
        # Cash invoices are typically paid immediately, so they don't contribute to outstanding balance
        balance_outstanding = account_invoice - amount_received - returns_discount
        
        # Check if this is bad debt (balance > credit limit)
        credit_limit = float(customer.credit_limit) if customer.credit_limit else 0
        is_bad_debt = balance_outstanding > credit_limit and credit_limit > 0
        
        # Apply bad debt filter
        if customer_filter == 'Exclude Bad Debt' and is_bad_debt:
            continue
        elif customer_filter == 'Show Bad Debt' and not is_bad_debt:
            continue
        
        result.append({
            'id': customer.id,
            'slNo': sl_no,
            'customerName': customer.customer_name,
            'accountInvoice': round(account_invoice, 2),
            'cashInvoice': round(cash_invoice, 2),
            'amountReceived': round(amount_received, 2),
            'returnsDiscount': round(returns_discount, 2),
            'onAccount': round(on_account, 2),
            'balanceOutstanding': round(balance_outstanding, 2),
            'creditLimit': credit_limit,
            'currency': customer.customer_currency or 'GBP',
            'isBadDebt': is_bad_debt,
            'isCompany': bool(customer.is_company),
            'customerCode': customer.customer_code,
            'address': customer.address,
            'telephone': customer.telephone,
            'email': customer.email
        })
        sl_no += 1
    
    # Sort by customer name
    result.sort(key=lambda x: x['customerName'])
    
    # Calculate totals — exclude company customers
    non_company = [item for item in result if not item.get('isCompany')]
    totals = {
        'accountInvoice': sum(item['accountInvoice'] for item in non_company),
        'cashInvoice': sum(item['cashInvoice'] for item in non_company),
        'amountReceived': sum(item['amountReceived'] for item in non_company),
        'returnsDiscount': sum(item['returnsDiscount'] for item in non_company),
        'onAccount': sum(item['onAccount'] for item in non_company),
        'balanceOutstanding': sum(item['balanceOutstanding'] for item in non_company)
    }
    
    # Group by currency
    currency_groups = {}
    for item in result:
        currency = item['currency']
        if currency not in currency_groups:
            currency_groups[currency] = []
        currency_groups[currency].append(item)
    
    # Calculate currency-wise totals — exclude company customers
    currency_totals = {}
    for currency, items in currency_groups.items():
        nc_items = [i for i in items if not i.get('isCompany')]
        currency_totals[currency] = {
            'accountInvoice': sum(item['accountInvoice'] for item in nc_items),
            'cashInvoice': sum(item['cashInvoice'] for item in nc_items),
            'amountReceived': sum(item['amountReceived'] for item in nc_items),
            'returnsDiscount': sum(item['returnsDiscount'] for item in nc_items),
            'onAccount': sum(item['onAccount'] for item in nc_items),
            'balanceOutstanding': sum(item['balanceOutstanding'] for item in nc_items)
        }
    
    # Pagination
    total_records = len(result)
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paginated_result = result[start_idx:end_idx]
    
    # Update sl_no for paginated results
    for i, item in enumerate(paginated_result):
        item['slNo'] = start_idx + i + 1
    
    return jsonify({
        'data': paginated_result,
        'totals': totals,
        'currencyTotals': currency_totals,
        'pagination': {
            'currentPage': page,
            'perPage': per_page,
            'totalRecords': total_records,
            'totalPages': (total_records + per_page - 1) // per_page,
            'showingFrom': start_idx + 1 if total_records > 0 else 0,
            'showingTo': min(end_idx, total_records)
        },
        'filters': {
            'fromDate': from_date,
            'toDate': to_date,
            'customerFilter': customer_filter,
            'searchTerm': search_term,
            'currency': currency_filter
        }
    })

@app.route('/api/reports/customer-currencies', methods=['GET'])
@jwt_required()
def get_customer_currencies():
    currencies = db.session.query(Customer.customer_currency).distinct().all()
    currency_list = [currency[0] for currency in currencies if currency[0]]
    return jsonify(currency_list)

@app.route('/api/reports/customer-aging', methods=['GET'])
@jwt_required()
def customer_aging_report():
    from datetime import datetime
    from sqlalchemy import or_, and_
    try:
        # --- Query Params ---
        as_of_date = request.args.get('asOfDate')
        customer_filter = request.args.get('customerFilter', 'All Customer')
        search_term = request.args.get('search', '')
        currency_filter = request.args.get('currency', '')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('perPage', 10))

        # --- Validate asOfDate ---
        if not as_of_date:
            return jsonify({'error': 'asOfDate is required'}), 400
        try:
            as_of_dt = datetime.strptime(as_of_date, "%Y-%m-%d")
        except ValueError:
            return jsonify({'error': 'Invalid asOfDate format. Use YYYY-MM-DD'}), 400

        # --- Build Customer Query ---
        customer_query = Customer.query
        if search_term:
            customer_query = customer_query.filter(
                or_(
                    Customer.customer_name.ilike(f'%{search_term}%'),
                    Customer.customer_code.ilike(f'%{search_term}%'),
                    Customer.address.ilike(f'%{search_term}%')
                )
            )
        if currency_filter:
            customer_query = customer_query.filter(Customer.customer_currency == currency_filter)
        if customer_filter == 'Active Customers':
            customer_query = customer_query.filter(Customer.is_active == 'yes')
        # We'll filter Overdue Only after calculating buckets

        customers = customer_query.all()
        result = []
        sl_no = 1

        for customer in customers:
            # --- Get all confirmed sales up to as_of_dt (end of day) ---
            end_of_day = datetime.combine(as_of_dt.date(), datetime.max.time())
            sales = Sale.query.filter(
                Sale.customer_id == customer.id,
                Sale.status == 'finalized',
                Sale.date <= end_of_day
            ).all()

            # --- Prepare buckets ---
            buckets = {
                'current': 0.0,
                'days30': 0.0,
                'days60': 0.0,
                'days90': 0.0,
                'days120': 0.0,
                'days180': 0.0,
                'over180': 0.0
            }
            total_outstanding = 0.0

            for sale in sales:
                # Payments up to as_of_dt for this sale
                payments = Payment.query.filter(
                    Payment.sale_id == sale.id,
                    Payment.payment_date <= as_of_dt.date()
                ).all()
                paid = sum(float(p.amount) for p in payments)

                # Returns/credit notes up to as_of_dt for this sale
                returns = CustomerReturn.query.filter(
                    CustomerReturn.sale_id == sale.id,
                    CustomerReturn.status == 'completed',
                    CustomerReturn.date <= as_of_dt.date()
                ).all()
                returned = sum(float(r.total_value) for r in returns)

                # Outstanding for this sale
                discounts = _active_discount_total_for_sale(sale.id, as_of_dt.date())
                outstanding = float(sale.total_amount) - paid - returned - float(discounts)
                if outstanding <= 0:
                    continue

                # Days overdue
                days_overdue = (as_of_dt.date() - sale.date.date()).days
                if days_overdue < 0:
                    days_overdue = 0

                # Bucket
                if days_overdue == 0:
                    buckets['current'] += outstanding
                elif 1 <= days_overdue <= 30:
                    buckets['days30'] += outstanding
                elif 31 <= days_overdue <= 60:
                    buckets['days60'] += outstanding
                elif 61 <= days_overdue <= 90:
                    buckets['days90'] += outstanding
                elif 91 <= days_overdue <= 120:
                    buckets['days120'] += outstanding
                elif 121 <= days_overdue <= 180:
                    buckets['days180'] += outstanding
                else:
                    buckets['over180'] += outstanding
                total_outstanding += outstanding

            # Overdue Only filter: skip if no overdue
            if customer_filter == 'Overdue Only' and total_outstanding == buckets['current']:
                continue

            result.append({
                'id': customer.id,
                'slNo': sl_no,
                'customerName': customer.customer_name,
                'totalOutstanding': round(total_outstanding, 2),
                'current': round(buckets['current'], 2),
                'days30': round(buckets['days30'], 2),
                'days60': round(buckets['days60'], 2),
                'days90': round(buckets['days90'], 2),
                'days120': round(buckets['days120'], 2),
                'days180': round(buckets['days180'], 2),
                'over180': round(buckets['over180'], 2),
                'currency': customer.customer_currency or 'GBP',
                'customerCode': customer.customer_code,
                'address': customer.address,
                'telephone': customer.telephone,
                'email': customer.email
            })
            sl_no += 1

        # Sort by customer name
        result.sort(key=lambda x: x['customerName'])

        # Totals
        totals = {
            'totalOutstanding': sum(item['totalOutstanding'] for item in result),
            'current': sum(item['current'] for item in result),
            'days30': sum(item['days30'] for item in result),
            'days60': sum(item['days60'] for item in result),
            'days90': sum(item['days90'] for item in result),
            'days120': sum(item['days120'] for item in result),
            'days180': sum(item['days180'] for item in result),
            'over180': sum(item['over180'] for item in result)
        }

        # Pagination
        total_records = len(result)
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_result = result[start_idx:end_idx]
        for i, item in enumerate(paginated_result):
            item['slNo'] = start_idx + i + 1

        return jsonify({
            'data': paginated_result,
            'totals': totals,
            'pagination': {
                'currentPage': page,
                'perPage': per_page,
                'totalRecords': total_records,
                'totalPages': (total_records + per_page - 1) // per_page,
                'showingFrom': start_idx + 1 if total_records > 0 else 0,
                'showingTo': min(end_idx, total_records)
            },
            'filters': {
                'asOfDate': as_of_date,
                'customerFilter': customer_filter,
                'searchTerm': search_term,
                'currency': currency_filter
            }
        })
    except Exception as e:
        print('Error in customer_aging_report:', str(e))
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/reports/supplier-aging', methods=['GET'])
@jwt_required()
def supplier_aging_report():
    from datetime import datetime
    from sqlalchemy import or_
    from models import PurchaseInvoice, Purchase, Supplier, SupplierPayment, SupplierReturn
    try:
        as_of_date = request.args.get('asOfDate')
        supplier_filter = request.args.get('supplierFilter', 'All Suppliers')
        search_term = request.args.get('search', '')
        currency_filter = request.args.get('currency', '')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('perPage', 10))

        if not as_of_date:
            return jsonify({'error': 'asOfDate is required'}), 400
        try:
            as_of_dt = datetime.strptime(as_of_date, "%Y-%m-%d")
        except ValueError:
            return jsonify({'error': 'Invalid asOfDate format. Use YYYY-MM-DD'}), 400

        supplier_query = Supplier.query
        if search_term:
            supplier_query = supplier_query.filter(
                or_(
                    Supplier.supplier_name.ilike(f'%{search_term}%'),
                    Supplier.supplier_code.ilike(f'%{search_term}%'),
                    Supplier.address.ilike(f'%{search_term}%')
                )
            )
        if currency_filter:
            supplier_query = supplier_query.filter(Supplier.supplier_currency == currency_filter)
        if supplier_filter == 'Active Suppliers':
            supplier_query = supplier_query.filter(Supplier.is_active == 'Yes')

        suppliers = supplier_query.all()
        result = []
        sl_no = 1

        for supplier in suppliers:
            invoices = PurchaseInvoice.query.join(Purchase).filter(
                Purchase.supplier_id == supplier.id,
                PurchaseInvoice.payment_status.in_(['pending', 'partial']),
                PurchaseInvoice.date <= as_of_dt
            ).all()

            buckets = {
                'current': 0.0,
                'days30': 0.0,
                'days60': 0.0,
                'days90': 0.0,
                'days120': 0.0,
                'days180': 0.0,
                'over180': 0.0
            }
            total_outstanding = 0.0

            for invoice in invoices:
                # Payments up to as_of_dt for this invoice
                payments = SupplierPayment.query.filter(
                    SupplierPayment.purchase_invoice_id == invoice.id,
                    SupplierPayment.payment_date <= as_of_dt.date()
                ).all()
                paid = sum(float(p.amount) for p in payments)

                # Returns up to as_of_dt for this invoice
                returns = SupplierReturn.query.filter(
                    SupplierReturn.purchase_invoice_id == invoice.id,
                    SupplierReturn.status == 'completed',
                    SupplierReturn.date <= as_of_dt.date()
                ).all()
                returned = sum(float(r.total_value) for r in returns)

                # Outstanding for this invoice
                invoice_total = sum(float(item.total_price) for item in invoice.items)
                outstanding = invoice_total - paid - returned
                if outstanding <= 0:
                    continue

                # Days overdue
                days_overdue = (as_of_dt.date() - invoice.date.date()).days
                if days_overdue < 0:
                    days_overdue = 0

                # Bucket
                if days_overdue == 0:
                    buckets['current'] += outstanding
                elif 1 <= days_overdue <= 30:
                    buckets['days30'] += outstanding
                elif 31 <= days_overdue <= 60:
                    buckets['days60'] += outstanding
                elif 61 <= days_overdue <= 90:
                    buckets['days90'] += outstanding
                elif 91 <= days_overdue <= 120:
                    buckets['days120'] += outstanding
                elif 121 <= days_overdue <= 180:
                    buckets['days180'] += outstanding
                else:
                    buckets['over180'] += outstanding
                total_outstanding += outstanding

            if supplier_filter == 'Overdue Only' and total_outstanding == buckets['current']:
                continue

            result.append({
                'id': supplier.id,
                'slNo': sl_no,
                'supplierName': supplier.supplier_name,
                'totalOutstanding': round(total_outstanding, 2),
                'current': round(buckets['current'], 2),
                'days30': round(buckets['days30'], 2),
                'days60': round(buckets['days60'], 2),
                'days90': round(buckets['days90'], 2),
                'days120': round(buckets['days120'], 2),
                'days180': round(buckets['days180'], 2),
                'over180': round(buckets['over180'], 2),
                'currency': supplier.supplier_currency or 'GBP',
                'supplierCode': supplier.supplier_code,
                'address': supplier.address,
                'telephone': supplier.telephone,
                'email': supplier.email
            })
            sl_no += 1

        result.sort(key=lambda x: x['supplierName'])

        totals = {
            'totalOutstanding': sum(item['totalOutstanding'] for item in result),
            'current': sum(item['current'] for item in result),
            'days30': sum(item['days30'] for item in result),
            'days60': sum(item['days60'] for item in result),
            'days90': sum(item['days90'] for item in result),
            'days120': sum(item['days120'] for item in result),
            'days180': sum(item['days180'] for item in result),
            'over180': sum(item['over180'] for item in result)
        }

        total_records = len(result)
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_result = result[start_idx:end_idx]
        for i, item in enumerate(paginated_result):
            item['slNo'] = start_idx + i + 1

        return jsonify({
            'data': paginated_result,
            'totals': totals,
            'pagination': {
                'currentPage': page,
                'perPage': per_page,
                'totalRecords': total_records,
                'totalPages': (total_records + per_page - 1) // per_page,
                'showingFrom': start_idx + 1 if total_records > 0 else 0,
                'showingTo': min(end_idx, total_records)
            },
            'filters': {
                'asOfDate': as_of_date,
                'supplierFilter': supplier_filter,
                'searchTerm': search_term,
                'currency': currency_filter
            }
        })
    except Exception as e:
        print('Error in supplier_aging_report:', str(e))
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/test/mail', methods=['POST'])
def test_mail():
    try:
        data = request.get_json()
        test_email = data.get('email', 'test@example.com')
        
        # Create test data - these need to be proper database objects
        test_customer = Customer(
            customer_name="Test Customer",
            email=test_email
        )
        
        test_sale = Sale(
            invoice_number="TEST001",
            total_amount=100.00,
            date=datetime.now(),
            customer_type='credit',
            status='finalized'
        )
        
        # Try to send email
        send_invoice_email(mail, test_email, test_sale, test_customer)
        
        return jsonify({
            "success": True,
            "message": f"Test email sent to {test_email}"
        })
    except Exception as e:
        print(f"Test mail error: {str(e)}")
        return jsonify({
            "success": False,
            "message": f"Failed to send test email: {str(e)}"
        }), 500

@app.route('/api/send/customer-statement', methods=['POST'])
@jwt_required()
def send_customer_statement_email_api():
    try:
        data = request.get_json()
        customer_id = data.get('customerId')
        from_date_str = data.get('fromDate')
        to_date_str = data.get('toDate')
        statement_type = data.get('statementType', 'Full Statement')
        
        if not customer_id or not from_date_str or not to_date_str:
            return jsonify({'message': 'Missing required parameters'}), 400
        
        # Parse dates
        from_date = datetime.strptime(from_date_str, '%Y-%m-%d')
        to_date = datetime.strptime(to_date_str, '%Y-%m-%d')
        
        # Get customer
        customer = Customer.query.get(customer_id)
        if not customer:
            return jsonify({'message': 'Customer not found'}), 404
        
        if not customer.email:
            return jsonify({'message': 'Customer email not found'}), 400
        
        # Get statement data
        from_date_start = from_date.replace(hour=0, minute=0, second=0, microsecond=0)
        to_date_end = to_date.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Query sales and payments for the customer in the date range
        sales = Sale.query.filter(
            Sale.customer_id == customer_id,
            Sale.date >= from_date_start,
            Sale.date <= to_date_end
        ).order_by(Sale.date).all()
        
        payments = Payment.query.filter(
            Payment.customer_id == customer_id,
            Payment.payment_date >= from_date.date(),
            Payment.payment_date <= to_date.date()
        ).order_by(Payment.payment_date).all()
        
        # Build statement data
        statement_data = []
        running_balance = 0
        sl_no = 1
        
        # Add sales
        for sale in sales:
            if sale.customer_type == 'credit':
                running_balance += float(sale.total_amount)
                statement_data.append({
                    'slNo': sl_no,
                    'date': sale.date.strftime('%d/%m/%Y'),
                    'invoiceNo': sale.invoice_number,
                    'description': f'Credit Invoice #{sale.invoice_number}',
                    'accountInv': float(sale.total_amount),
                    'cashInv': 0,
                    'paid': 0,
                    'creditAdj': 0,
                    'discountAdj': 0,
                    'balance': float(sale.total_amount),
                    'runningBalance': running_balance
                })
                sl_no += 1
        
        # Add payments
        for payment in payments:
            if payment.payment_type == 'credit':
                # 0-amount credit-application row - credit already shown above
                continue
            running_balance -= float(payment.amount)
            statement_data.append({
                'slNo': sl_no,
                'date': payment.payment_date.strftime('%d/%m/%Y'),
                'invoiceNo': f'PAY-{payment.id}',
                'description': f'Payment - {payment.payment_mode}',
                'accountInv': 0,
                'cashInv': 0,
                'paid': float(payment.amount),
                'creditAdj': 0,
                'discountAdj': 0,
                'balance': -float(payment.amount),
                'runningBalance': running_balance
            })
            sl_no += 1
        
        # Sort by date
        statement_data.sort(key=lambda x: datetime.strptime(x['date'], '%d/%m/%Y'))
        
        # Update sl_no after sorting
        for i, item in enumerate(statement_data, 1):
            item['slNo'] = i
        
        # Send email to all addresses
        emails = [email.strip() for email in customer.email.split(',') if email.strip()]
        success_count = 0
        for email in emails:
            if send_customer_statement_email(mail, email, customer, statement_data, from_date, to_date, statement_type):
                success_count += 1
        
        if success_count > 0:
            return jsonify({
                'success': True,
                'message': f'Customer statement email sent to {success_count}/{len(emails)} addresses: {", ".join(emails)}'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to send email'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error sending customer statement email: {str(e)}'
        }), 500

@app.route('/api/send/customer-history', methods=['POST'])
@jwt_required()
def send_customer_history_email_api():
    try:
        data = request.get_json()
        customer_id = data.get('customerId')
        from_date_str = data.get('fromDate')
        to_date_str = data.get('toDate')
        
        if not customer_id or not from_date_str or not to_date_str:
            return jsonify({'message': 'Missing required parameters'}), 400
        
        # Parse dates
        from_date = datetime.strptime(from_date_str, '%Y-%m-%d')
        to_date = datetime.strptime(to_date_str, '%Y-%m-%d')
        
        # Get customer
        customer = Customer.query.get(customer_id)
        if not customer:
            return jsonify({'message': 'Customer not found'}), 404
        
        if not customer.email:
            return jsonify({'message': 'Customer email not found'}), 400
        
        # Get history data using existing customer history logic
        from_date_start = from_date.replace(hour=0, minute=0, second=0, microsecond=0)
        to_date_end = to_date.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Query sales for the customer in the date range
        sales = Sale.query.filter(
            Sale.customer_id == customer_id,
            Sale.date >= from_date_start,
            Sale.date <= to_date_end
        ).order_by(Sale.date).all()
        
        # Query payments for the customer in the date range
        payments = Payment.query.filter(
            Payment.customer_id == customer_id,
            Payment.payment_date >= from_date.date(),
            Payment.payment_date <= to_date.date()
        ).order_by(Payment.payment_date).all()
        
        # Build history data
        history_data = []
        running_balance = 0
        sl_no = 1
        
        # Add sales
        for sale in sales:
            if sale.customer_type == 'account':
                running_balance += float(sale.total_amount)
                history_data.append({
                    'slNo': sl_no,
                    'date': sale.date.strftime('%d/%m/%Y'),
                    'invoiceNo': sale.invoice_number,
                    'accountInv': float(sale.total_amount),
                    'cashInv': 0,
                    'paid': 0,
                    'creditAdj': 0,
                    'discountAdj': 0,
                    'balance': float(sale.total_amount),
                    'runningBalance': running_balance
                })
                sl_no += 1
            elif sale.customer_type == 'cash':
                running_balance += float(sale.total_amount)
                history_data.append({
                    'slNo': sl_no,
                    'date': sale.date.strftime('%d/%m/%Y'),
                    'invoiceNo': sale.invoice_number,
                    'accountInv': 0,
                    'cashInv': float(sale.total_amount),
                    'paid': 0,
                    'creditAdj': 0,
                    'discountAdj': 0,
                    'balance': float(sale.total_amount),
                    'runningBalance': running_balance
                })
                sl_no += 1
        
        # Add payments
        for payment in payments:
            if payment.payment_type == 'credit':
                # 0-amount credit-application row - credit already shown above
                continue
            running_balance -= float(payment.amount)
            history_data.append({
                'slNo': sl_no,
                'date': payment.payment_date.strftime('%d/%m/%Y'),
                'invoiceNo': f'PAY-{payment.id}',
                'accountInv': 0,
                'cashInv': 0,
                'paid': float(payment.amount),
                'creditAdj': 0,
                'discountAdj': 0,
                'balance': -float(payment.amount),
                'runningBalance': running_balance
            })
            sl_no += 1
        
        # Sort by date
        history_data.sort(key=lambda x: datetime.strptime(x['date'], '%d/%m/%Y'))
        
        # Update sl_no after sorting
        for i, item in enumerate(history_data, 1):
            item['slNo'] = i
        
        # Send email to all addresses
        emails = [email.strip() for email in customer.email.split(',') if email.strip()]
        success_count = 0
        for email in emails:
            if send_customer_history_email(mail, email, customer, history_data, from_date, to_date):
                success_count += 1
        
        if success_count > 0:
            return jsonify({
                'success': True,
                'message': f'Customer history email sent to {success_count}/{len(emails)} addresses: {", ".join(emails)}'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to send email'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error sending customer history email: {str(e)}'
        }), 500

@app.route('/api/send/selected-invoices', methods=['POST'])
@jwt_required()
def send_selected_invoices():
    try:
        data = request.get_json() or {}
        customer_id = data.get('customerId')
        invoice_numbers = data.get('invoiceNumbers', [])
        customer_emails = data.get('customerEmails', '')

        if not customer_id or not isinstance(invoice_numbers, list) or not invoice_numbers:
            return jsonify({'success': False, 'message': 'Missing required parameters'}), 400

        customer = Customer.query.get(customer_id)
        if not customer:
            return jsonify({'success': False, 'message': 'Customer not found'}), 404

        email_addresses = [
            email.strip()
            for email in customer_emails.split(',')
            if email.strip()
        ] if isinstance(customer_emails, str) else []
        if not email_addresses:
            return jsonify({'success': False, 'message': 'No valid email addresses found'}), 400

        sales = Sale.query.filter(
            Sale.customer_id == customer_id,
            Sale.invoice_number.in_(invoice_numbers)
        ).all()
        if not sales:
            return jsonify({'success': False, 'message': 'No invoices found'}), 404

        sales_by_number = {sale.invoice_number: sale for sale in sales}
        ordered_sales = [
            sales_by_number[invoice_number]
            for invoice_number in invoice_numbers
            if invoice_number in sales_by_number
        ]

        from bulk_a4_invoice_pdf_generator import BulkA4InvoicePDF

        pdf_generator = BulkA4InvoicePDF()
        invoice_data_list = []
        settings = SystemSettings.query.first()
        for sale in ordered_sales:
            invoice_data = get_invoice_data_for_pdf(sale.invoice_number)
            if not invoice_data:
                return jsonify({
                    'success': False,
                    'message': f'Failed to load invoice {sale.invoice_number}',
                }), 500
            invoice_data['invoiceFooter'] = settings.invoice_footer if settings else ''
            invoice_data_list.append(invoice_data)

        pdf_buffer = pdf_generator.generate_combined_pdf(invoice_data_list)
        pdf_bytes = pdf_buffer.getvalue()
        if not pdf_bytes:
            return jsonify({'success': False, 'message': 'Failed to generate PDF'}), 500

        invoice_dates = [sale.date.date() for sale in ordered_sales if sale.date]
        if invoice_dates:
            start_date = min(invoice_dates)
            end_date = max(invoice_dates)
        else:
            start_date = end_date = datetime.now().date()
        subject_date_range = (
            start_date.strftime('%d/%m/%Y')
            if start_date == end_date
            else f'{start_date.strftime("%d/%m/%Y")} - {end_date.strftime("%d/%m/%Y")}'
        )
        file_date_range = (
            start_date.strftime('%Y%m%d')
            if start_date == end_date
            else f'{start_date.strftime("%Y%m%d")}_to_{end_date.strftime("%Y%m%d")}'
        )
        filename = f'invoices_{file_date_range}.pdf'

        company = Company.query.first()
        invoice_list = ', '.join(sale.invoice_number for sale in ordered_sales)
        body = f'''Dear {customer.customer_name},

Please find attached the requested invoice(s): {invoice_list}.

If you have any questions regarding these invoices, please don't hesitate to contact us.

Best regards,
{company.companyName if company else 'TROPIFRUIT UK LTD'}'''
        html_body = f'<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">{body}</pre>'

        from mail_utils import send_via_brevo
        success_count = 0
        failed_addresses = []
        for email_address in email_addresses:
            try:
                sent = send_via_brevo(
                    to_list=[email_address],
                    subject=f'Invoice(s): {subject_date_range}',
                    html_content=html_body,
                    text_content=body,
                    attachments=[{
                        'filename': filename,
                        'content': pdf_bytes,
                        'content_type': 'application/pdf',
                    }],
                )
                if sent:
                    success_count += 1
                else:
                    failed_addresses.append(email_address)
            except Exception as error:
                print(f"Failed to send combined invoices to {email_address}: {error}")
                failed_addresses.append(email_address)

        if success_count:
            message = (
                f'Successfully sent combined invoices to '
                f'{success_count}/{len(email_addresses)} email address(es)'
            )
            if failed_addresses:
                message += f'. Failed to send to: {", ".join(failed_addresses)}'
            return jsonify({'success': True, 'message': message})
        return jsonify({
            'success': False,
            'message': 'Failed to send combined invoices to any email address',
        }), 500
    except Exception as error:
        print(f"Error sending selected invoices: {error}")
        return jsonify({
            'success': False,
            'message': f'Failed to send invoices: {str(error)}',
        }), 500


@app.route('/api/send/supplier-statement', methods=['POST'])
@jwt_required()
def send_supplier_statement_email_api():
    try:
        data = request.get_json()
        supplier_id = data.get('supplierId')
        from_date_str = data.get('fromDate')
        to_date_str = data.get('toDate')
        statement_type = data.get('type', 'All')
        
        if not supplier_id or not from_date_str or not to_date_str:
            return jsonify({'message': 'Missing required parameters'}), 400
        
        # Parse dates
        from_date = datetime.strptime(from_date_str, '%Y-%m-%d')
        to_date = datetime.strptime(to_date_str, '%Y-%m-%d')
        
        # Get supplier
        supplier = Supplier.query.get(supplier_id)
        if not supplier:
            return jsonify({'message': 'Supplier not found'}), 404
        if not supplier.email:
            return jsonify({'message': 'Supplier email not found'}), 400
        
        from_date_start = from_date.replace(hour=0, minute=0, second=0, microsecond=0)
        to_date_end = to_date.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Query purchase invoices and payments for the supplier in the date range
        purchase_invoices = PurchaseInvoice.query.join(Purchase).filter(
            Purchase.supplier_id == supplier_id,
            PurchaseInvoice.date >= from_date_start,
            PurchaseInvoice.date <= to_date_end
        ).order_by(PurchaseInvoice.date).all()
        supplier_payments = SupplierPayment.query.filter(
            SupplierPayment.supplier_id == supplier_id,
            SupplierPayment.payment_date >= from_date.date(),
            SupplierPayment.payment_date <= to_date.date()
        ).order_by(SupplierPayment.payment_date).all()
        
        # Build statement data
        statement_data = []
        running_balance = 0
        sl_no = 1
        for invoice in purchase_invoices:
            print(f"[DEBUG] Processing invoice {invoice.id}")
            print(f"[DEBUG] Invoice items count: {len(invoice.items)}")
            invoice_total = sum(float(item.total_price) for item in invoice.items)
            running_balance += invoice_total
            statement_data.append({
                'slNo': sl_no,
                'date': invoice.date.strftime('%d/%m/%Y'),
                'invoiceNo': invoice.id,
                'description': f'Purchase Invoice #{invoice.id}',
                'purchaseInv': invoice_total,
                'paid': 0,
                'creditAdj': 0,
                'discountAdj': 0,
                'balance': invoice_total,
                'runningBalance': running_balance
            })
            sl_no += 1
        for payment in supplier_payments:
            running_balance -= float(payment.amount)
            statement_data.append({
                'slNo': sl_no,
                'date': payment.payment_date.strftime('%d/%m/%Y'),
                'invoiceNo': f'PAY-{payment.id}',
                'description': f'Payment - {payment.payment_mode}',
                'purchaseInv': 0,
                'paid': float(payment.amount),
                'creditAdj': 0,
                'discountAdj': 0,
                'balance': -float(payment.amount),
                'runningBalance': running_balance
            })
            sl_no += 1
        statement_data.sort(key=lambda x: datetime.strptime(x['date'], '%d/%m/%Y'))
        for i, item in enumerate(statement_data, 1):
            item['slNo'] = i

        success = send_supplier_statement_email(mail, supplier.email, supplier, statement_data, from_date, to_date, statement_type)

        if success:
            return jsonify({
                'success': True,
                'message': f'Supplier statement email sent to {supplier.email}'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to send email'
            }), 500
        # Placeholder for sending email
        # success = send_supplier_statement_email(mail, supplier.email, supplier, statement_data, from_date, to_date, statement_type)
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error sending supplier statement email: {str(e)}'
        }), 500


        
# Payment endpoints for customer payment functionality
@app.route('/api/payments/customer-bulk', methods=['POST'])
@jwt_required()
def create_customer_bulk_payment():
    """Create bulk payments for customer payment page"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        
        # Validate required fields
        customer_id = data.get('customerId')
        amount = data.get('amount', 0)
        payment_date = data.get('paymentDate')
        split_payment = data.get('splitPayment', {})
        invoice_ids = data.get('invoiceIds', [])
        on_account_amount = data.get('onAccountAmount', 0)
        remarks = data.get('remarks', '')
        payment_distribution = data.get('paymentDistribution', [])
        
        if not customer_id or not payment_date:
            return jsonify({"error": "Customer ID and payment date are required"}), 400
        
        # Parse payment date
        try:
            payment_date_obj = datetime.strptime(payment_date, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({"error": "Invalid payment date format"}), 400
        
        # Generate batch ID for grouping payments - use sequential ID
        # Get the highest existing batch_id and increment by 1
        max_batch_id = db.session.query(func.max(Payment.batch_id)).scalar() or 0
        batch_id = max_batch_id + 1
        
        payments_created = []
        
        # Use payment distribution from frontend if available, otherwise fall back to proportional distribution
        if payment_distribution:
            print(f"Using payment distribution from frontend: {payment_distribution}")
            
            # Track total payments applied to invoices vs total invoice amounts
            total_invoice_payments = 0
            total_invoice_amounts = 0
            invoice_payment_tracking = {}
            
            # First pass: calculate totals and track invoice payments
            for payment_item in payment_distribution:
                payment_amount = float(payment_item.get('amount', 0))
                invoice_id = payment_item.get('invoiceId')
                
                if invoice_id and not payment_item.get('isOnAccount', False):
                    # This is a direct invoice payment
                    if invoice_id not in invoice_payment_tracking:
                        # Get the invoice to check its total amount
                        sale = Sale.query.get(invoice_id)
                        if sale:
                            current_paid = float(sale.paid_amount or 0)
                            outstanding = float(_sale_outstanding(sale))
                            invoice_payment_tracking[invoice_id] = {
                                'total_amount': float(sale.total_amount),
                                'outstanding': outstanding,
                                'payments_applied': 0
                            }
                            total_invoice_amounts += max(0, outstanding)  # Only count positive outstanding amounts
                    
                    if invoice_id in invoice_payment_tracking:
                        invoice_payment_tracking[invoice_id]['payments_applied'] += payment_amount
                        total_invoice_payments += payment_amount
            
            # Calculate overpayment amount
            overpayment_amount = max(0, total_invoice_payments - total_invoice_amounts)
            print(f"Total invoice payments: {total_invoice_payments}, Total invoice amounts: {total_invoice_amounts}, Overpayment: {overpayment_amount}")
            
            # Total customer credit available from credit invoice lines (negative amounts)
            # These credits reduce the outstanding balance of positive invoices being paid
            credit_remaining = -sum(
                float(p.get('amount', 0)) for p in payment_distribution
                if not p.get('isOnAccount', False) and float(p.get('amount', 0)) < 0
            )
            
            # Create payments based on the frontend's payment distribution
            for payment_item in payment_distribution:
                payment_amount = float(payment_item.get('amount', 0))
                
                if payment_item.get('isOnAccount', False):
                    # On-account payment (including auto-applied and pure on-account)
                    if payment_item.get('invoiceId'):
                        # On-account payment applied to specific invoice - treat as direct payment
                        payment = Payment(
                            customer_id=customer_id,
                            sale_id=payment_item.get('invoiceId'),
                            amount=payment_amount,
                            payment_mode=payment_item.get('paymentMode', 'cash'),
                            payment_date=payment_date_obj,
                            batch_id=batch_id,
                            payment_type='on-account',  # Keep as on-account for tracking
                            payment_source='customer_payment',
                            remarks=remarks,
                            created_by=user_id
                        )
                        db.session.add(payment)
                        payments_created.append(payment)
                        
                        # Update sale payment status (same logic as direct payments)
                        sale = Sale.query.get(payment_item.get('invoiceId'))
                        if sale:
                            current_paid = float(sale.paid_amount or 0)
                            new_paid = current_paid + payment_amount
                            
                            if new_paid >= float(sale.total_amount):
                                sale.payment_status = "paid"
                                sale.paid_amount = new_paid
                                sale.status = "finalized"
                                sale.customer_type = payment_item.get('paymentMode', 'cash')
                            else:
                                sale.payment_status = "partial"
                                sale.paid_amount = new_paid
                            
                            db.session.add(sale)
                    else:
                        # Pure on-account payment (no specific invoice)
                        payment = Payment(
                            customer_id=customer_id,
                            sale_id=None,  # No specific invoice
                            amount=payment_amount,
                            payment_mode=payment_item.get('paymentMode', 'cash'),
                            payment_date=payment_date_obj,
                            batch_id=batch_id,
                            payment_type='on-account',
                            payment_source='customer_payment',
                            remarks=remarks,
                            created_by=user_id
                        )
                        db.session.add(payment)
                        payments_created.append(payment)
                    
                elif payment_amount > 0:
                    # Positive invoice payment
                    invoice_id = payment_item.get('invoiceId')
                    
                    # Check if this payment would cause an overpayment for this specific invoice
                    sale = Sale.query.get(invoice_id)
                    if sale:
                        current_paid = float(sale.paid_amount or 0)
                        outstanding = float(_sale_outstanding(sale))
                        
                        # Apply available customer credit toward this invoice's outstanding balance
                        # (credit invoices are sent as negative amounts in the distribution)
                        credit_applied = 0
                        if credit_remaining > 0 and outstanding > 0:
                            credit_applied = min(credit_remaining, outstanding)
                            credit_remaining -= credit_applied
                            outstanding -= credit_applied
                        
                        if payment_amount <= outstanding:
                            # Normal payment - doesn't exceed invoice amount
                            payment = Payment(
                                customer_id=customer_id,
                                sale_id=invoice_id,
                                amount=payment_amount,
                                payment_mode=payment_item.get('paymentMode', 'cash'),
                                payment_date=payment_date_obj,
                                batch_id=batch_id,
                                payment_type='direct',
                                payment_source='customer_payment',
                                remarks=remarks,
                                created_by=user_id
                            )
                            db.session.add(payment)
                            payments_created.append(payment)
                            
                            # Update sale payment status (cash payment + applied credit)
                            new_paid = current_paid + payment_amount + credit_applied
                            if new_paid >= float(sale.total_amount):
                                sale.payment_status = "paid"
                                sale.paid_amount = new_paid
                                sale.status = "finalized"
                                sale.customer_type = payment_item.get('paymentMode', 'cash')
                            else:
                                sale.payment_status = "partial"
                                sale.paid_amount = new_paid
                            
                            db.session.add(sale)
                            
                        else:
                            # Overpayment scenario - split into invoice payment + on-account credit
                            invoice_payment = outstanding
                            overpay_amount = payment_amount - outstanding
                            
                            # Create payment for the invoice amount
                            if invoice_payment > 0:
                                payment = Payment(
                                    customer_id=customer_id,
                                    sale_id=invoice_id,
                                    amount=invoice_payment,
                                    payment_mode=payment_item.get('paymentMode', 'cash'),
                                    payment_date=payment_date_obj,
                                    batch_id=batch_id,
                                    payment_type='direct',
                                    payment_source='customer_payment',
                                    remarks=remarks,
                                    created_by=user_id
                                )
                                db.session.add(payment)
                                payments_created.append(payment)
                                
                                # Mark invoice as fully paid
                                sale.payment_status = "paid"
                                sale.paid_amount = current_paid + invoice_payment + credit_applied
                                sale.status = "finalized"
                                sale.customer_type = payment_item.get('paymentMode', 'cash')
                                db.session.add(sale)
                            
                            # Create on-account credit for the overpayment
                            if overpay_amount > 0:
                                overpay_payment = Payment(
                                    customer_id=customer_id,
                                    sale_id=None,  # No specific invoice for overpayment
                                    amount=overpay_amount,
                                    payment_mode=payment_item.get('paymentMode', 'cash'),
                                    payment_date=payment_date_obj,
                                    batch_id=batch_id,
                                    payment_type='on-account',
                                    payment_source='customer_payment',
                                    remarks=f"{remarks} (Overpayment credit from invoice {sale.invoice_number})" if remarks else f"Overpayment credit from invoice {sale.invoice_number}",
                                    created_by=user_id
                                )
                                db.session.add(overpay_payment)
                                payments_created.append(overpay_payment)
                                print(f"Created overpayment credit of {overpay_amount} for customer {customer_id}")
                        
                elif payment_amount < 0:
                    # Credit invoice - mark as paid and record the application
                    # with a 0-amount Payment row so the payment history can show
                    # which credit invoice was applied in this batch. The 0 amount
                    # keeps every payment sum / outstanding balance unchanged.
                    sale = Sale.query.get(payment_item.get('invoiceId'))
                    if sale:
                        # Mark credit invoice as fully applied/paid
                        sale.payment_status = "paid"
                        sale.status = "finalized"
                        sale.paid_amount = sale.total_amount  # For credit invoices, this will be negative
                        sale.customer_type = payment_item.get('paymentMode', 'cash')
                        db.session.add(sale)

                        credit_payment = Payment(
                            customer_id=customer_id,
                            sale_id=sale.id,
                            amount=0,
                            payment_mode=payment_item.get('paymentMode', 'cash'),
                            payment_date=payment_date_obj,
                            batch_id=batch_id,
                            payment_type='credit',
                            payment_source='customer_payment',
                            remarks=f"{remarks} (Credit applied)" if remarks else "Credit applied",
                            created_by=user_id
                        )
                        db.session.add(credit_payment)
                        payments_created.append(credit_payment)
                        print(f"Credit invoice {sale.invoice_number} marked as paid (credit Payment row created)")
        
        else:
            # Fallback to proportional distribution (original logic)
            print("No payment distribution provided, using proportional distribution")
            
            # Create payments for each payment mode with amount > 0
            payment_modes = {
                'cash': split_payment.get('cash', 0),
                'bank': split_payment.get('card', 0),  # Card payments stored as 'bank'
                'bank_transfer': split_payment.get('bankTransfer', 0),
                'cheque': split_payment.get('cheque', 0)
            }
            
            # Calculate total invoice amount for distribution
            total_invoice_amount = 0
            if invoice_ids:
                invoices = Sale.query.filter(Sale.id.in_(invoice_ids)).all()
                for invoice in invoices:
                    # Calculate outstanding balance
                    paid_amount = sum(float(p.amount) for p in invoice.payments)
                    outstanding = float(invoice.total_amount) - paid_amount
                    total_invoice_amount += max(0, outstanding)  # Only positive outstanding amounts
            
            # Distribute payments proportionally between invoices and on-account
            total_payment_amount = sum(payment_modes.values())
            
            for mode, mode_amount in payment_modes.items():
                if mode_amount <= 0:
                    continue
                    
                # Simple allocation: split payment between invoices and on-account
                if total_payment_amount > 0:
                    on_account_portion = (on_account_amount / total_payment_amount) * mode_amount
                    invoice_portion = mode_amount - on_account_portion
                else:
                    invoice_portion = 0
                    on_account_portion = mode_amount
                
                # Create payment for invoices if there are any
                if invoice_portion > 0 and invoice_ids:
                    print(f"[DEBUG] invoice_portion: {invoice_portion}, mode_amount: {mode_amount}")
                    # Simple approach: Create one payment per invoice based on what's needed
                    invoices = Sale.query.filter(Sale.id.in_(invoice_ids)).all()
                    # Cap remaining amount to what user actually paid for this mode
                    remaining_amount = min(invoice_portion, mode_amount)
                    
                    for invoice in invoices:
                        if remaining_amount <= 0:
                            break
                            
                        # Calculate what this invoice needs
                        paid_amount = sum(float(p.amount) for p in invoice.payments)
                        outstanding = float(invoice.total_amount) - paid_amount
                        
                        if outstanding > 0:
                            # Positive invoice - pay what we can
                            invoice_payment = min(remaining_amount, outstanding)
                            
                            payment = Payment(
                                customer_id=customer_id,
                                sale_id=invoice.id,
                                amount=invoice_payment,
                                payment_mode=mode,
                                payment_date=payment_date_obj,
                                batch_id=batch_id,
                                payment_type='direct',
                                remarks=remarks,
                                created_by=user_id
                            )
                            db.session.add(payment)
                            payments_created.append(payment)
                            
                            # Update invoice
                            current_paid = paid_amount + invoice_payment
                            if current_paid >= float(invoice.total_amount):
                                invoice.payment_status = "paid"
                                invoice.status = "finalized"
                            else:
                                invoice.payment_status = "partial"
                            
                            invoice.paid_amount = current_paid
                            invoice.customer_type = mode
                            db.session.add(invoice)
                            
                            remaining_amount -= invoice_payment
                            
                        elif outstanding < 0:
                            # Credit invoice - just mark as paid without creating payment record
                            # The credit is already shown in the daily sales summary
                            invoice.payment_status = "paid"
                            invoice.status = "finalized"
                            invoice.paid_amount = invoice.total_amount  # For credit invoices, this will be negative
                            invoice.customer_type = mode
                            db.session.add(invoice)
                            print(f"Credit invoice {invoice.invoice_number} marked as paid without creating payment record")
            
                # Create on-account payment if there's an on-account portion
                if on_account_portion > 0:
                    payment = Payment(
                        customer_id=customer_id,
                        sale_id=None,  # No specific invoice
                        amount=on_account_portion,
                        payment_mode=mode,
                        payment_date=payment_date_obj,
                        batch_id=batch_id,
                        payment_type='on-account',
                        remarks=remarks,
                        created_by=user_id
                    )
                    db.session.add(payment)
                    payments_created.append(payment)
        
        for sale_id in {
            payment.sale_id for payment in payments_created
            if payment.sale_id and payment.payment_type != 'credit'
        }:
            sale = Sale.query.get(sale_id)
            if sale:
                _refresh_sale_payment_status(sale)

        # Commit all payments
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": f"Created {len(payments_created)} payments",
            "paymentId": batch_id,
            "paymentsCreated": len(payments_created)
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to create payments: {str(e)}"}), 500








@app.route('/api/reports/eec-report', methods=['GET'])
@jwt_required()
def eec_report():
    from datetime import datetime
    from models import PurchaseInvoice, PurchaseInvoiceItem, Purchase, Supplier, RegularProduct, NonProduct
    fromDate = request.args.get('fromDate')
    toDate = request.args.get('toDate')
    if not fromDate or not toDate:
        return jsonify([])
    from_dt = datetime.strptime(fromDate, "%Y-%m-%d")
    to_dt = datetime.strptime(toDate, "%Y-%m-%d")
    # Query all purchase invoice items in the date range
    items = (
        db.session.query(
            PurchaseInvoiceItem,
            PurchaseInvoice.date,
            Purchase,
            Supplier,
            RegularProduct,
            NonProduct
        )
        .join(PurchaseInvoice, PurchaseInvoiceItem.invoice_id == PurchaseInvoice.id)
        .join(Purchase, PurchaseInvoice.purchase_id == Purchase.id)
        .join(Supplier, Purchase.supplier_id == Supplier.id)
        .outerjoin(RegularProduct, PurchaseInvoiceItem.product_id == RegularProduct.id)
        .outerjoin(NonProduct, PurchaseInvoiceItem.product_id == NonProduct.id)
        .filter(PurchaseInvoice.date >= from_dt, PurchaseInvoice.date <= to_dt)
        .order_by(PurchaseInvoice.date.asc())
        .all()
    )
    data = []
    for idx, (item, inv_date, purchase, supplier, reg_prod, non_prod) in enumerate(items, 1):
        # Prefer regular product info, fallback to non-product
        product_code = reg_prod.product_code if reg_prod else (non_prod.product_code if non_prod else "")
        unit_weight = reg_prod.unit_weight if reg_prod else (non_prod.unit_weight if non_prod else 0)
        commodity = reg_prod.description if reg_prod else (non_prod.description if non_prod else item.product_name)
        data.append({
            'slNo': idx,
            'date': inv_date.strftime('%Y-%m-%d') if inv_date else '',
            'commodity': commodity,
            'cCode': product_code,
            'weight': float(unit_weight) if unit_weight else 0,
            'quantity': float(item.quantity) if item.quantity else 0,
            'uPrice': float(item.unit_price) if item.unit_price else 0,
            'amount': float(item.total_price) if item.total_price else 0,
            'supplier': supplier.supplier_name if supplier else '',
            'country': supplier.customer_country if supplier else ''
        })
    return jsonify(data)

# Admin Functions Routes

# User Restriction routes

@app.route('/api/user-restrictions', methods=['GET'])
@jwt_required()
def get_all_user_restrictions():
    restrictions = UserRestriction.query.all()
    return jsonify([{
        "id": r.id,
        "user_id": r.user_id,
        "section": r.section,
        "allowed": r.allowed
    } for r in restrictions])

# Get restrictions for a specific user
@app.route('/api/user-restrictions/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user_restrictions(user_id):
    restrictions = UserRestriction.query.filter_by(user_id=user_id).all()
    return jsonify([{
        "id": r.id,
        "user_id": r.user_id,
        "section": r.section,
        "allowed": r.allowed
    } for r in restrictions])

# Update all restrictions for a user (bulk update)
@app.route('/api/user-restrictions/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_user_restrictions(user_id):
    data = request.get_json()  # Expect: [{section: "data_entry", allowed: true}, ...]
    if not isinstance(data, list):
        return jsonify({"error": "Invalid data format"}), 400

    # Remove old restrictions
    UserRestriction.query.filter_by(user_id=user_id).delete()
    # Add new ones
    for item in data:
        section = item.get("section")
        allowed = item.get("allowed", True)
        if section:
            r = UserRestriction(user_id=user_id, section=section, allowed=allowed)
            db.session.add(r)
    db.session.commit()
    return jsonify({"success": True})

# (Optional) Add restrictions to /api/auth/me
@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_current_user():
    from datetime import datetime
    
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    # Check if user account is still active
    if not user or user.status != 'Active':
        return jsonify({
            'error': 'Account is inactive. Please contact administrator.'
        }), 403
    
    # Check timing restrictions for current session
    timing_restriction = UserTimingRestriction.query.filter_by(user_id=user_id).first()
    if timing_restriction and timing_restriction.enabled:
        current_time = datetime.now().strftime('%H:%M')
        start_time = timing_restriction.start_time
        end_time = timing_restriction.end_time
        
        # Handle time comparison (considering overnight periods)
        access_allowed = False
        if start_time <= end_time:
            # Same day period (e.g., 09:00 to 17:00)
            access_allowed = start_time <= current_time <= end_time
        else:
            # Overnight period (e.g., 22:00 to 06:00)
            access_allowed = current_time >= start_time or current_time <= end_time
        
        if not access_allowed:
            return jsonify({
                'error': f'Session expired. Access allowed only between {start_time} and {end_time}'
            }), 403
    
    restrictions = UserRestriction.query.filter_by(user_id=user_id).all()
    restriction_dict = {r.section: r.allowed for r in restrictions}
    # ...existing user serialization...
    user_data = user.to_dict()
    user_data["restrictions"] = restriction_dict
    return jsonify(user_data)

# ...User Backdate Options...

@app.route('/api/user-backdate-options', methods=['GET'])
def get_all_backdate_options():
    options = UserBackDateOption.query.all()
    return jsonify([
        {**opt.to_dict(), 'current_editing': getattr(opt, 'current_editing', True)} for opt in options
    ])

@app.route('/api/user-backdate-options/<int:user_id>', methods=['GET'])
def get_backdate_option(user_id):
    opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
    if not opt:
        return jsonify({'userId': user_id, 'editing': False, 'deleting': False, 'current_editing': True})
    d = opt.to_dict()
    d['current_editing'] = getattr(opt, 'current_editing', True)
    return jsonify(d)

@app.route('/api/user-backdate-options/<int:user_id>', methods=['PUT'])
def update_backdate_option(user_id):
    data = request.get_json()
    opt = UserBackDateOption.query.filter_by(user_id=user_id).first()
    if not opt:
        opt = UserBackDateOption(user_id=user_id)
        db.session.add(opt)
    opt.editing = bool(data.get('editing', False))
    opt.deleting = bool(data.get('deleting', False))
    if 'current_editing' in data:
        opt.current_editing = bool(data['current_editing'])
    db.session.commit()
    d = opt.to_dict()
    d['current_editing'] = getattr(opt, 'current_editing', True)
    return jsonify(d)

# User Timing Restrictions
@app.route('/api/user-timing-restrictions', methods=['GET'])
@jwt_required()
def get_all_timing_restrictions():
    restrictions = UserTimingRestriction.query.all()
    return jsonify([r.to_dict() for r in restrictions])

@app.route('/api/user-timing-restrictions/<int:user_id>', methods=['GET'])
@jwt_required()
def get_timing_restriction(user_id):
    restriction = UserTimingRestriction.query.filter_by(user_id=user_id).first()
    if not restriction:
        # Return default values if no restriction exists
        return jsonify({
            'userId': user_id,
            'startTime': '00:01',
            'endTime': '23:59',
            'enabled': False
        })
    return jsonify(restriction.to_dict())

@app.route('/api/user-timing-restrictions/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_timing_restriction(user_id):
    data = request.get_json()
    restriction = UserTimingRestriction.query.filter_by(user_id=user_id).first()
    if not restriction:
        restriction = UserTimingRestriction(user_id=user_id)
        db.session.add(restriction)
    
    restriction.start_time = data.get('startTime', '00:01')
    restriction.end_time = data.get('endTime', '23:59')
    restriction.enabled = bool(data.get('enabled', False))
    
    db.session.commit()
    return jsonify(restriction.to_dict())

    # Invoce Retrictions

@app.route('/api/user-invoice-restriction', methods=['GET'])
@jwt_required()
def get_all_invoice_restrictions():
    restrictions = UserInvoiceRestriction.query.all()
    return jsonify([{
        "userId": r.user_id,
        "restricted": r.restricted
    } for r in restrictions])

@app.route('/api/user-invoice-restriction/<int:user_id>', methods=['GET'])
@jwt_required()
def get_invoice_restriction(user_id):
    restriction = UserInvoiceRestriction.query.filter_by(user_id=user_id).first()
    if not restriction:
        return jsonify({'userId': user_id, 'restricted': False})
    return jsonify({'userId': user_id, 'restricted': restriction.restricted})

@app.route('/api/user-invoice-restriction/<int:user_id>', methods=['PUT'])  
def update_invoice_restriction(user_id):
    data = request.get_json()
    restriction = UserInvoiceRestriction.query.filter_by(user_id=user_id).first()
    if not restriction:
        restriction = UserInvoiceRestriction(user_id=user_id)
        db.session.add(restriction)
    restriction.restricted = bool(data.get('restricted', False))
    db.session.commit()
    return jsonify({'userId': user_id, 'restricted': restriction.restricted})


# Daily books

@app.route('/api/user-daily-book-type', methods=['GET'])
def get_all_daily_book_types():
    options = UserDailyBookType.query.all()
    return jsonify([
        {'userId': opt.user_id, 'showAll': opt.show_all, 'showOnly': opt.show_only}
        for opt in options
    ])

@app.route('/api/user-daily-book-type/<int:user_id>', methods=['PUT'])
def update_daily_book_type(user_id):
    data = request.get_json()
    opt = UserDailyBookType.query.filter_by(user_id=user_id).first()
    if not opt:
        opt = UserDailyBookType(user_id=user_id)
        db.session.add(opt)
    opt.show_all = bool(data.get('showAll', False))
    opt.show_only = bool(data.get('showOnly', False))
    db.session.commit()
    return jsonify({'userId': user_id, 'showAll': opt.show_all, 'showOnly': opt.show_only})

@app.route('/api/user-daily-book-type/<int:user_id>', methods=['GET'])
def get_daily_book_type(user_id):
    entry = db.session.query(UserDailyBookType).filter_by(user_id=user_id).first()
    if entry:
        if getattr(entry, 'show_all', False):
            return jsonify({"type": "all"})
        elif getattr(entry, 'show_only', False):
            return jsonify({"type": "own"})
        else:
            return jsonify({"type": "all"})
    else:
        return jsonify({"type": "all"})



# Email Settings

@app.route('/api/email-config', methods=['GET'])
def get_email_config():
    config = load_email_config()
    if not config:
        config = {
            'MAIL_EMAIL': current_app.config.get('MAIL_USERNAME'),
            'MAIL_PASSWORD': current_app.config.get('MAIL_PASSWORD'),
            'MAIL_DEFAULT_SENDER': current_app.config.get('MAIL_DEFAULT_SENDER'),
        }
    return jsonify(config)

@app.route('/api/email-config', methods=['PUT'])
def update_email_config():
    data = request.get_json()
    config = load_email_config() or {}
    config['MAIL_EMAIL'] = data.get('MAIL_EMAIL', '')
    config['MAIL_PASSWORD'] = data.get('MAIL_PASSWORD', '')
    config['MAIL_DEFAULT_SENDER'] = data.get('MAIL_DEFAULT_SENDER', '')
    config['BREVO_API_KEY'] = data.get('BREVO_API_KEY', '') or config.get('BREVO_API_KEY', '')
    save_email_config(config)
    
    # Update Flask app config directly
    current_app.config['MAIL_EMAIL'] = config['MAIL_EMAIL']
    current_app.config['MAIL_PASSWORD'] = config['MAIL_PASSWORD']
    current_app.config['MAIL_DEFAULT_SENDER'] = config['MAIL_DEFAULT_SENDER']
    
    # Reload mail config
    global mail
    mail = init_mail(current_app)
    return jsonify({'success': True})

@app.route('/api/email-config', methods=['GET'])
@jwt_required()
def get_email_configuration():
    """Get current email configuration (without sensitive data)"""
    try:
        from mail_utils import load_email_config
        
        config = {
            "server": app.config.get('MAIL_SERVER', 'Not configured'),
            "port": app.config.get('MAIL_PORT', 'Not configured'),
            "use_tls": app.config.get('MAIL_USE_TLS', False),
            "use_ssl": app.config.get('MAIL_USE_SSL', False),
            "username": app.config.get('MAIL_USERNAME', 'Not configured'),
            "default_sender": app.config.get('MAIL_DEFAULT_SENDER', 'Not configured'),
            "config_source": "config_file" if load_email_config() else "environment_variables"
        }
        
        return jsonify(config)
        
    except Exception as e:
        return jsonify({"error": f"Failed to get email configuration: {str(e)}"}), 500

@app.route('/api/test-email', methods=['POST'])
@jwt_required()
def test_email_configuration():
    """Test email configuration by sending a simple test email"""
    try:
        data = request.get_json()
        test_email = data.get('email')
        
        if not test_email:
            return jsonify({"error": "Email address required"}), 400
        
        import re
        
        # Validate email
        email_regex = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
        if not re.match(email_regex, test_email):
            return jsonify({"error": "Invalid email address"}), 400
        
        # Send test email via Brevo
        from mail_utils import send_via_brevo
        body = "This is a test email from Sales Master Dashboard. If you receive this, your email configuration is working correctly."
        ok = send_via_brevo(
            to_list=[test_email],
            subject="Test Email - Sales Master Dashboard",
            html_content=f'<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">{body}</pre>',
            text_content=body,
        )
        if not ok:
            return jsonify({"error": "Failed to send test email via Brevo. Check server logs."}), 500
        
        return jsonify({
            "success": True,
            "message": f"Test email sent successfully to {test_email}"
        })
        
    except Exception as e:
        print(f"[EMAIL TEST ERROR] {str(e)}")
        import traceback
        print(f"[EMAIL TEST ERROR] Full traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to send test email: {str(e)}"}), 500

@app.route('/api/send-email', methods=['POST'])
@jwt_required()
def send_email_with_attachment():
    try:
        data = request.get_json()

        if not data.get('to') or not data.get('subject') or not data.get('body'):
            return jsonify({"error": "Missing required fields: to, subject, body"}), 400

        email_list = data.get('to')
        if isinstance(email_list, str):
            email_list = [email_list]

        import re
        email_regex = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
        invalid_emails = [e for e in email_list if not re.match(email_regex, e)]
        if invalid_emails:
            return jsonify({"error": f"Invalid email addresses: {', '.join(invalid_emails)}"}), 400

        attachment = data.get('attachment')
        if not attachment:
            return jsonify({"error": "No attachment provided"}), 400

        import base64
        from mail_utils import send_via_brevo

        pdf_bytes = base64.b64decode(attachment.get('content'))
        attachments = [{
            'filename':     attachment.get('filename', 'report.pdf'),
            'content':      pdf_bytes,
            'content_type': attachment.get('contentType', 'application/pdf'),
        }]

        # Build a minimal HTML body from the plain-text body
        plain_body = data.get('body', '')
        html_body  = f'<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">{plain_body}</pre>'

        ok = send_via_brevo(
            to_list=email_list,
            subject=data.get('subject'),
            html_content=html_body,
            text_content=plain_body,
            attachments=attachments,
        )

        if ok:
            return jsonify({"message": f"Email sent successfully to {len(email_list)} recipient(s)"}), 200
        else:
            return jsonify({"error": "Failed to send email. Check server logs for details."}), 500

    except Exception as e:
        print(f"Error in send_email_with_attachment: {str(e)}")
        import traceback; print(traceback.format_exc())
        return jsonify({"error": f"Failed to send email: {str(e)}"}), 500


from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

@app.route('/api/send/closing-stock', methods=['POST'])
@jwt_required()
def send_closing_stock_pdf():
    data = request.get_json()
    date_str = data.get('date')
    email = data.get('email')
    if not date_str or not email:
        return jsonify({"error": "Missing date or email"}), 400

    # Fetch closing stock entries for the date
    closing_stock_entries = ClosingStock.query.filter_by(date=date_str).all()

    date = datetime.strptime(date_str, "%Y-%m-%d").date()
    entries = ClosingStock.query.filter_by(date=date).all()
    if not entries:
        return jsonify({"error": "No closing stock entries for this date"}), 404

    # Prepare data for the table and email
    pdf_rows = [["Product Code", "Description", "Type", "Quantity"]]
    email_entries = []
    for entry in closing_stock_entries:
        if entry.product_type == "regular":
            product = RegularProduct.query.get(entry.product_id)
        else:
            product = NonProduct.query.get(entry.product_id)
        code = product.product_code if product else ""
        desc = product.description if product else ""
        pdf_rows.append([code, desc, entry.product_type, str(entry.quantity)])
        email_entries.append({
            "product_code": code,
            "description": desc,
            "product_type": entry.product_type,
            "quantity": entry.quantity
        })



    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    elements = [
        Paragraph("<b>Closing Stock Report</b>", styles['Title']),
        Spacer(1, 12),
        Paragraph(f"Date: {date_str}", styles['Normal']),
        Spacer(1, 18)
    ]
    table = Table(pdf_rows, colWidths=[100, 250, 60, 60])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
    ]))
    elements.append(table)
    doc.build(elements)
    buffer.seek(0)

    # Render HTML email body using template
    html_body = render_template(
        "closing_stock_email.html",
        date=date_str,
        entries=email_entries
    )

    # Send via Brevo (replaces Flask-Mail which is not configured)
    from mail_utils import send_via_brevo

    pdf_bytes = buffer.getvalue()
    ok = send_via_brevo(
        to_list=[email],
        subject=f"Closing Stock Report - {date_str}",
        html_content=html_body,
        text_content=f"Closing Stock Report for {date_str} — see attached PDF.",
        attachments=[{
            'filename': f"closing_stock_{date_str}.pdf",
            'content': pdf_bytes,
            'content_type': 'application/pdf',
        }],
    )
    if not ok:
        return jsonify({"error": "Failed to send email via Brevo. Check server logs."}), 500

    return jsonify({"success": True}), 200

@app.route('/api/whatsapp/status', methods=['GET'])
@jwt_required()
def whatsapp_status():
    status = {
        'meta_token_set': bool(META_TOKEN),
        'phone_number_id_set': bool(PHONE_NUMBER_ID),
        'meta_token_length': len(META_TOKEN) if META_TOKEN else 0,
        'phone_number_id': PHONE_NUMBER_ID
    }
    
    if META_TOKEN and PHONE_NUMBER_ID:
        try:
            # Test the API connection
            url = f'https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}'
            headers = {'Authorization': f'Bearer {META_TOKEN}'}
            resp = requests.get(url, headers=headers)
            status['api_connection'] = resp.status_code == 200
            status['api_response'] = resp.json() if resp.status_code == 200 else resp.text
        except Exception as e:
            status['api_connection'] = False
            status['api_error'] = str(e)
    
    return jsonify(status)

@app.route('/api/send/whatsapp-invoice', methods=['POST'])
@jwt_required()
def send_whatsapp_invoice():
    data = request.json
    print('[WHATSAPP] Incoming request data:', data, flush=True)
    
    # Check if required environment variables are set
    if not META_TOKEN:
        print('[WHATSAPP] ERROR: META_TOKEN environment variable not set', flush=True)
        return jsonify({'error': 'WhatsApp configuration missing: META_TOKEN not set'}), 500
    
    if not PHONE_NUMBER_ID:
        print('[WHATSAPP] ERROR: PHONE_NUMBER_ID environment variable not set', flush=True)
        return jsonify({'error': 'WhatsApp configuration missing: PHONE_NUMBER_ID not set'}), 500
    
    phone = data['phoneNumber']  # E.164 format
    invoice_url = data['invoiceUrl']  # Publicly accessible PDF
    message = data.get('message', 'Your invoice is attached.')

    url = f'https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages'
    headers = {
        'Authorization': f'Bearer {META_TOKEN}',
        'Content-Type': 'application/json'
    }
    # Send a template message for testing (test numbers can only receive templates)
    payload = {
        'messaging_product': 'whatsapp',
        'to': phone.replace('+', ''),  # Remove + for API compatibility
        'type': 'template',
        'template': {
            'name': 'hello_world',
            'language': {
                'code': 'en_US'
            }
        }
    }
    print('[WHATSAPP] Payload to Meta API:', payload, flush=True)

    try:
        resp = requests.post(url, headers=headers, json=payload)
        print('[WHATSAPP] Meta API response status:', resp.status_code, flush=True)
        print('[WHATSAPP] Meta API response content:', resp.text, flush=True)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        print('[WHATSAPP] ERROR making request to Meta API:', str(e), flush=True)
        return jsonify({'error': f'Failed to send WhatsApp message: {str(e)}'}), 500


@app.route('/api/sales/<string:invoice_number>/send', methods=['POST'])
@jwt_required()
def send_sale_invoice_email(invoice_number):
    try:
        sale = Sale.query.filter_by(invoice_number=invoice_number).first()
        if not sale:
            return jsonify({'error': 'Sale not found'}), 404
        customer = sale.customer
        if not customer or not customer.email:
            return jsonify({'error': 'Customer email not found'}), 400
        
        # Send email to all addresses
        emails = [email.strip() for email in customer.email.split(',') if email.strip()]
        success_count = 0
        for email in emails:
            try:
                send_invoice_email(mail, email, sale, customer)
                success_count += 1
            except Exception as e:
                print(f"Failed to send email to {email}: {str(e)}")
        
        if success_count > 0:
            return jsonify({'success': True, 'message': f'Invoice email sent to {success_count}/{len(emails)} addresses: {", ".join(emails)}'})
        else:
            return jsonify({'success': False, 'message': 'Failed to send email to any address'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to send invoice email: {str(e)}'}), 500


@app.route('/api/reports/supplier-purchase-history', methods=['GET'])
@jwt_required()
def supplier_purchase_history():
    supplier_id = request.args.get('supplierId')
    from_date = request.args.get('fromDate')
    to_date = request.args.get('toDate')
    if not supplier_id or not from_date or not to_date:
        return jsonify([])

    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d")

    # Query all purchase invoices for this supplier in the date range
    results = (
        db.session.query(
            PurchaseInvoice.id.label('invoice_no'),
            PurchaseInvoice.date,
            PurchaseInvoiceItem.product_name,
            PurchaseInvoiceItem.quantity,
            PurchaseInvoiceItem.unit_price,
            PurchaseInvoiceItem.total_price
        )
        .join(Purchase, PurchaseInvoice.purchase_id == Purchase.id)
        .join(PurchaseInvoiceItem, PurchaseInvoice.id == PurchaseInvoiceItem.invoice_id)
        .filter(Purchase.supplier_id == supplier_id)
        .filter(PurchaseInvoice.date >= from_dt, PurchaseInvoice.date <= to_dt)
        .order_by(PurchaseInvoice.date.desc())
        .all()
    )

    data = [
        {
            'invoiceNo': row.invoice_no,
            'date': row.date.strftime('%Y-%m-%d'),
            'productDescription': row.product_name,
            'quantity': row.quantity,
            'unitPrice': float(row.unit_price),
            'total': float(row.total_price)
        }
        for row in results
    ]
    return jsonify(data)
# Holiday Request routes
@app.route('/api/holiday-requests', methods=['GET'])
@jwt_required()
def get_holiday_requests():
    try:
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 25, type=int)
        search = request.args.get('search', '', type=str)
        
        # Limit per_page to prevent abuse
        per_page = min(per_page, 100)
        
        # Build query
        query = HolidayRequest.query
        
        # Add search filter if provided
        if search:
            search_filter = f"%{search}%"
            query = query.filter(
                or_(
                    HolidayRequest.employee_name.ilike(search_filter),
                    HolidayRequest.job_title.ilike(search_filter),
                    HolidayRequest.status.ilike(search_filter)
                )
            )
        
        # Order by creation date (newest first)
        query = query.order_by(HolidayRequest.created_at.desc())
        
        # Paginate
        pagination = query.paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )
        
        return jsonify({
            'data': [request.to_dict() for request in pagination.items],
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages,
                'has_next': pagination.has_next,
                'has_prev': pagination.has_prev,
                'next_num': pagination.next_num,
                'prev_num': pagination.prev_num
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/holiday-requests', methods=['POST'])
@jwt_required()
def create_holiday_request():
    try:
        data = request.get_json()
        holiday_data = HolidayRequestSchema(**data)
        user_id = get_jwt_identity()
        
        # Validate employee exists
        employee = Employee.query.get(holiday_data.employeeId)
        if not employee:
            return jsonify({"error": "Employee not found"}), 404
        
        new_request = HolidayRequest(
            employee_id=holiday_data.employeeId,
            employee_name=holiday_data.employeeName,
            job_title=holiday_data.jobTitle,
            total_days_requested=holiday_data.totalDaysRequested,
            last_date_at_work=holiday_data.lastDateAtWork,
            return_date_to_work=holiday_data.returnDateToWork,
            signed_by_employee=holiday_data.signedByEmployee,
            date_by_employee=holiday_data.dateByEmployee,
            status=holiday_data.status or 'pending',
            days_granted=holiday_data.daysGranted,
            days_left_entitlement=holiday_data.daysLeftEntitlement,
            manager_name=holiday_data.managerName,
            signed_by_manager=holiday_data.signedByManager,
            dated_by_manager=holiday_data.datedByManager,
            manager_comments=holiday_data.managerComments,
            created_by=user_id
        )
        
        db.session.add(new_request)
        db.session.commit()
        
        return jsonify(new_request.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/holiday-requests/<int:id>', methods=['GET'])
@jwt_required()
def get_holiday_request(id):
    try:
        holiday_request = HolidayRequest.query.get_or_404(id)
        return jsonify(holiday_request.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/holiday-requests/<int:id>', methods=['PUT'])
@jwt_required()
def update_holiday_request(id):
    try:
        data = request.get_json()
        holiday_data = HolidayRequestSchema(**data)
        holiday_request = HolidayRequest.query.get_or_404(id)
        
        # Update fields
        holiday_request.employee_id = holiday_data.employeeId
        holiday_request.employee_name = holiday_data.employeeName
        holiday_request.job_title = holiday_data.jobTitle
        holiday_request.total_days_requested = holiday_data.totalDaysRequested
        holiday_request.last_date_at_work = holiday_data.lastDateAtWork
        holiday_request.return_date_to_work = holiday_data.returnDateToWork
        holiday_request.signed_by_employee = holiday_data.signedByEmployee
        holiday_request.date_by_employee = holiday_data.dateByEmployee
        holiday_request.status = holiday_data.status
        holiday_request.days_granted = holiday_data.daysGranted
        holiday_request.days_left_entitlement = holiday_data.daysLeftEntitlement
        holiday_request.manager_name = holiday_data.managerName
        holiday_request.signed_by_manager = holiday_data.signedByManager
        holiday_request.dated_by_manager = holiday_data.datedByManager
        holiday_request.manager_comments = holiday_data.managerComments
        
        db.session.commit()
        return jsonify(holiday_request.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/holiday-requests/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_holiday_request(id):
    try:
        holiday_request = HolidayRequest.query.get_or_404(id)
        db.session.delete(holiday_request)
        db.session.commit()
        return jsonify({'message': 'Holiday request deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/holiday-requests/<int:id>/upload-signed-form', methods=['POST'])
@jwt_required()
def upload_signed_form(id):
    try:
        holiday_request = HolidayRequest.query.get_or_404(id)
        
        if 'signedForm' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['signedForm']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Validate file type
        allowed_extensions = {'pdf', 'jpg', 'jpeg', 'png'}
        if not ('.' in file.filename and 
                file.filename.rsplit('.', 1)[1].lower() in allowed_extensions):
            return jsonify({'error': 'Invalid file type. Only PDF and image files are allowed'}), 400
        
        # Create uploads directory if it doesn't exist
        upload_dir = os.path.join(app.root_path, 'uploads', 'holiday_forms')
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate secure filename
        filename = secure_filename(file.filename)
        # Add timestamp to avoid conflicts
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        name, ext = os.path.splitext(filename)
        filename = f"holiday_request_{id}_{timestamp}{ext}"
        
        file_path = os.path.join(upload_dir, filename)
        file.save(file_path)
        
        # Update holiday request with file path
        holiday_request.signed_form_path = os.path.join('uploads', 'holiday_forms', filename)
        db.session.commit()
        
        return jsonify({
            'message': 'Signed form uploaded successfully',
            'filePath': holiday_request.signed_form_path
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/holiday-requests/<int:id>/signed-form', methods=['GET'])
@jwt_required()
def view_signed_form(id):
    try:
        holiday_request = HolidayRequest.query.get_or_404(id)
        
        if not holiday_request.signed_form_path:
            return jsonify({'error': 'No signed form found for this request'}), 404
        
        file_path = os.path.join(app.root_path, holiday_request.signed_form_path)
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'Signed form file not found'}), 404
        
        # Determine content type based on file extension
        _, ext = os.path.splitext(file_path)
        content_type = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png'
        }.get(ext.lower(), 'application/octet-stream')
        
        return send_file(
            file_path,
            mimetype=content_type,
            as_attachment=False,  # Display in browser instead of downloading
            download_name=f"holiday_request_{id}_signed_form{ext}"
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/holiday-requests/<int:id>/signed-form', methods=['DELETE'])
@jwt_required()
def delete_signed_form(id):
    try:
        holiday_request = HolidayRequest.query.get_or_404(id)
        
        if not holiday_request.signed_form_path:
            return jsonify({'error': 'No signed form found for this request'}), 404
        
        file_path = os.path.join(app.root_path, holiday_request.signed_form_path)
        
        # Delete the file if it exists
        if os.path.exists(file_path):
            os.remove(file_path)
        
        # Clear the signed form path from the database
        holiday_request.signed_form_path = None
        db.session.commit()
        
        return jsonify({'message': 'Signed form deleted successfully'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
# Holiday Request reset entitlement endpoint
@app.route('/api/holiday-requests/reset-entitlement', methods=['POST'])
@jwt_required()
def reset_employee_holiday_entitlement():
    """Reset holiday year - start fresh entitlement period for all employees"""
    try:
        data = request.get_json()
        start_date = data.get('startDate')
        end_date = data.get('endDate')
        
        if not start_date or not end_date:
            return jsonify({'error': 'Both start date and end date are required'}), 400
        
        # Parse the dates
        try:
            entitlement_start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            entitlement_end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        # Validate date range
        if entitlement_start_date >= entitlement_end_date:
            return jsonify({'error': 'Start date must be before end date'}), 400
        
        # Get all active employees
        employees = Employee.query.filter_by(is_active='yes').all()
        
        # Mark all existing holiday requests as "previous period" by updating them
        # This effectively resets everyone's used days to 0 for the new period
        previous_requests = HolidayRequest.query.filter(
            HolidayRequest.status == 'granted',
            HolidayRequest.last_date_at_work < entitlement_start_date
        ).all()
        
        # For requests that fall within the old period, we'll mark them as archived
        # This is a simple approach - in a more complex system you'd have proper period tracking
        archived_count = 0
        for holiday_req in previous_requests:
            # Add a note to indicate this was from a previous entitlement period
            if holiday_req.manager_comments:
                holiday_req.manager_comments += f" [Archived from previous period before {start_date}]"
            else:
                holiday_req.manager_comments = f"[Archived from previous period before {start_date}]"
            archived_count += 1
        
        # Reset entitlement for each employee (keep their individual entitlement days)
        updated_employees = []
        for employee in employees:
            # Ensure employee has entitlement days set (default to 25 if not set)
            if not employee.entitlement_days:
                employee.entitlement_days = 25
            
            updated_employees.append({
                'id': employee.id,
                'name': employee.full_name,
                'entitlementDays': employee.entitlement_days,
                'position': employee.position,
                'status': employee.status
            })
        
        db.session.commit()
        
        return jsonify({
            'message': f'Holiday year reset successfully for {len(employees)} employees',
            'entitlementStartDate': start_date,
            'entitlementEndDate': end_date,
            'employeesProcessed': len(employees),
            'previousRequestsArchived': archived_count,
            'employees': updated_employees,
            'note': 'All employees now have their full entitlement available for the new holiday year'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/employees/entitlements', methods=['GET'])
@jwt_required()
def get_employee_entitlements():
    """Get all employee entitlements for testing/verification"""
    try:
        employees = Employee.query.filter_by(is_active='yes').all()
        
        entitlements = []
        for employee in employees:
            entitlements.append({
                'id': employee.id,
                'name': employee.full_name,
                'position': employee.position,
                'status': employee.status,  # P/T or F/T
                'entitlementDays': employee.entitlement_days or 0,
                'startDate': employee.start_date.isoformat() if employee.start_date else None
            })
        
        return jsonify({
            'employees': entitlements,
            'totalEmployees': len(entitlements),
            'averageEntitlement': sum(emp['entitlementDays'] for emp in entitlements) / len(entitlements) if entitlements else 0
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500



if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        create_admin_user()
    app.run(debug=True, host='0.0.0.0', port=5000)