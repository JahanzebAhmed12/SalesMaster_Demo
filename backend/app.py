from flask import Flask, request, jsonify, session, current_app
from flask_cors import CORS
from datetime import datetime, timedelta, time
import os
from dotenv import load_dotenv
from models import db, User, Sale, Purchase, RegularProduct, NonProduct, Customer, Supplier, SystemSettings, Attendance, SaleItem, Company, Expense, Payroll, Payment, PurchaseInvoice, PurchaseInvoiceItem, SupplierPayment, StockMovement, StockAdjustment, ExpenseEntry, DumpEntry, CustomerReturn, SupplierReturn, CashCarryForward, BankingEntry
from schemas import (
    SaleSchema, PurchaseSchema, RegularProductSchema, NonProductSchema, CustomerSchema, SupplierSchema,
    SystemSettingsSchema, AttendanceSchema, CompanySchema, ExpenseSchema, PaymentSchema, SupplierPaymentSchema, StockMovementSchema, StockAdjustmentSchema, ExpenseEntrySchema, DumpEntrySchema, CustomerReturnSchema, SupplierReturnSchema
)
from users import verify_password, create_admin_user
from werkzeug.security import generate_password_hash, check_password_hash
from flask_migrate import Migrate
from flask_jwt_extended import create_access_token, jwt_required, JWTManager, get_jwt_identity
from calendar import monthrange
from sqlalchemy import func, or_, extract, literal
import calendar
import time
from mail_utils import init_mail, send_invoice_email

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Configure session
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-here')  # Change this in production

# Configure CORS
CORS(app, 
     resources={r"/api/*": {
         "origins": ["http://localhost:5173"],
         "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         "allow_headers": ["Content-Type", "Authorization"],
         "supports_credentials": True
     }})

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(os.path.dirname(__file__), "instance", "salesmaster.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_size': 10,
    'max_overflow': 20,
    'connect_args': {
        'timeout': 60,  # Increased timeout to 60 seconds
        'check_same_thread': False,  # Allow multiple threads
        'isolation_level': None,  # Autocommit mode
        'cached_statements': 128,  # Cache prepared statements
    }
}

# Initialize database
db.init_app(app)
migrate = Migrate(app, db)

# Database health check function
def check_database_health():
    """Check if database is healthy and accessible"""
    try:
        # Test database connection
        db.session.execute(db.text("SELECT 1"))
        db.session.commit()
        return True
    except Exception as e:
        db.session.rollback()
        return False

# Initialize database with health check
with app.app_context():
    # Check database health before creating tables
    if not check_database_health():
        print("Warning: Database connection issues detected")
    
    db.create_all()
    create_admin_user()  # Create admin user if it doesn't exist

# Configure Flask-JWT-Extended
app.config["JWT_SECRET_KEY"] = "super-secret-key"
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=24)
jwt = JWTManager(app)

# Configure user identity loader
@jwt.user_identity_loader
def user_identity_lookup(user_id):
    return str(user_id)

# Stock management helper functions
def update_product_stock(product_id, product_type, quantity_change, movement_type, reference_id=None, reference_type=None, remarks=None, user_id=None):
    """Update product stock and create movement record within existing transaction"""
    max_retries = 3
    retry_delay = 0.05  # 50ms
    
    for attempt in range(max_retries):
        try:
            # Get the product with row-level locking
            if product_type == 'regular':
                product = db.session.query(RegularProduct).filter(
                    RegularProduct.id == product_id
                ).with_for_update().first()
            else:
                product = db.session.query(NonProduct).filter(
                    NonProduct.id == product_id
                ).with_for_update().first()
            
            if not product:
                raise ValueError(f"Product not found: {product_id}")
            
            previous_stock = product.current_stock
            new_stock = previous_stock + quantity_change
            
            # Ensure stock doesn't go negative (except for adjustments)
            if new_stock < 0 and movement_type != 'adjustment':
                raise ValueError(f"Insufficient stock for product {product.description}. Available: {previous_stock}, Required: {abs(quantity_change)}")
            
            # Update product stock
            product.current_stock = new_stock
            
            # Create stock movement record
            movement = StockMovement(
                product_id=product_id,
                product_type=product_type,
                movement_type=movement_type,
                quantity=quantity_change,
                reference_id=reference_id,
                reference_type=reference_type,
                previous_stock=previous_stock,
                new_stock=new_stock,
                remarks=remarks,
                created_by=user_id
            )
            db.session.add(movement)
            
            # Don't commit here - let the calling function handle the transaction
            return True, new_stock
                
        except Exception as e:
            # Retry if database is locked
            if 'database is locked' in str(e).lower() and attempt < max_retries - 1:
                time.sleep(retry_delay * (attempt + 1))
                continue
            return False, str(e)

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
    now = now or datetime.now()
    closing_time = get_closing_time()
    closing_datetime = now.replace(hour=closing_time.hour, minute=closing_time.minute, second=0, microsecond=0)
    if now.time() > closing_time:
        return (now + timedelta(days=1)).date()
    return now.date()

# Health check endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint to test database connectivity"""
    try:
        # Test database connection
        db.session.execute(db.text("SELECT 1"))
        db.session.commit()
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "unhealthy", "database": "disconnected", "error": str(e)}), 500

# Auth routes
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username).first()
    if user and check_password_hash(user.password, password):
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

@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({'error': 'User not found'}), 404
        
    return jsonify({
        'id': user.id,
        'username': user.username,
        'userType': user.user_type,
        'status': user.status
    })

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out successfully'})

# Sales routes
@app.route('/api/sales', methods=['GET'])
def get_sales():
    sales = Sale.query.all()
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
            # Remove invoice_number from data before schema validation
            data.pop('invoice_number', None)
            sale_data = SaleSchema(**data)
            
            # Validate customer exists
            customer = Customer.query.get(sale_data.customer_id)
            if not customer:
                db.session.rollback()
                return jsonify({"error": "Customer not found"}), 404
            
            user_id = get_jwt_identity()
            business_date = get_business_date()
            
            # Generate next invoice number with proper locking
            # Use a separate query to avoid conflicts
            max_invoice_result = db.session.execute(
                db.text("SELECT MAX(CAST(invoice_number AS INTEGER)) FROM sale")
            ).scalar()
            max_invoice = max_invoice_result or 0
            next_invoice = str(int(max_invoice) + 1)
            
            # Create sale with all data at once
            new_sale = Sale(
                invoice_number=next_invoice,
                customer_id=sale_data.customer_id,
                customer_type=sale_data.customer_type,
                payment_status=sale_data.payment_status,
                subtotal=sale_data.subtotal,
                porterage=sale_data.porterage,
                vat_rate=sale_data.vat_rate,
                vat_amount=sale_data.vat_amount,
                total_amount=sale_data.total_amount,
                vehicle_details=sale_data.vehicle_details,
                gate_number=sale_data.gate_number,
                notes=sale_data.notes,
                status=sale_data.status,
                created_by=user_id,
                date=business_date
            )
            
            # Add sale to session
            db.session.add(new_sale)
            db.session.flush()  # Get new_sale.id without committing
            
            # Process all sale items at once
            sale_items = []
            stock_updates = []
            
            for item_data in sale_data.items:
                new_item = SaleItem(
                    sale_id=new_sale.id,
                    product_id=item_data.product_id,
                    non_product_id=item_data.non_product_id,
                    quantity=item_data.quantity,
                    unit_price=item_data.unit_price,
                    total_price=item_data.total_price
                )
                sale_items.append(new_item)
                
                # Prepare stock updates if sale is finalized
                if sale_data.status == 'finalized':
                    if item_data.product_id:
                        stock_updates.append({
                            'product_id': item_data.product_id,
                            'product_type': 'regular',
                            'quantity_change': -item_data.quantity,
                            'remarks': f"Sale invoice: {next_invoice}"
                        })
                    elif item_data.non_product_id:
                        stock_updates.append({
                            'product_id': item_data.non_product_id,
                            'product_type': 'non',
                            'quantity_change': -item_data.quantity,
                            'remarks': f"Sale invoice: {next_invoice}"
                        })
            
            # Add all sale items at once
            db.session.add_all(sale_items)
            
            # Process stock updates efficiently
            for stock_update in stock_updates:
                success, result = update_product_stock(
                    product_id=stock_update['product_id'],
                    product_type=stock_update['product_type'],
                    quantity_change=stock_update['quantity_change'],
                    movement_type='sale',
                    reference_id=new_sale.id,
                    reference_type='sale',
                    remarks=stock_update['remarks'],
                    user_id=user_id
                )
                if not success:
                    db.session.rollback()
                    return jsonify({"error": f"Stock update failed: {result}"}), 400
            
            # Commit everything at once
            db.session.commit()
            
            # Return the result
            result = new_sale.to_dict()
            # Mail invoice if requested
            if request.json.get('mailInvoice'):
                customer = Customer.query.get(new_sale.customer_id)
                if customer and customer.email:
                    send_invoice_email(mail, customer.email, new_sale, customer)
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

@app.route('/api/sales/<string:invoice_number>', methods=['GET'])
@jwt_required()
def get_sale_by_invoice(invoice_number):
    try:
        sale = Sale.query.filter_by(invoice_number=invoice_number).first()
        if not sale:
            return jsonify({"message": "Sale not found"}), 404
        return jsonify(sale.to_dict()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/sales/<int:id>', methods=['PUT'])
@jwt_required()
def update_sale(id):
    data = request.get_json()
    try:
        sale_data = SaleSchema(**data)
        sale = Sale.query.get_or_404(id)
        user_id = get_jwt_identity()
        
        # Store old status and items to check changes
        old_status = sale.status
        new_status = sale_data.status
        old_items = {(item.product_id, item.non_product_id, item.quantity) for item in sale.items}
        new_items = {(item.product_id, item.non_product_id, item.quantity) for item in sale_data.items}
        
        # Find new items that need stock reduction
        added_items = new_items - old_items
        removed_items = old_items - new_items
        
        # Debug logging
        print(f"[DEBUG] Old items: {old_items}")
        print(f"[DEBUG] New items: {new_items}")
        print(f"[DEBUG] Added items: {added_items}")
        print(f"[DEBUG] Removed items: {removed_items}")
        print(f"[DEBUG] Old status: {old_status}, New status: {new_status}")
        
        # Update sale fields
        for key, value in sale_data.dict(exclude={'items'}).items():
            setattr(sale, key, value)
        
        # Always update the date to the correct business date
        sale.date = get_business_date()
        
        # Update sale items
        sale.items = []  # Clear existing items
        for item_data in sale_data.items:
            sale_item = SaleItem(
                product_id=item_data.product_id,
                non_product_id=item_data.non_product_id,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                total_price=item_data.total_price
            )
            sale.items.append(sale_item)
        
        # Handle stock updates for status changes
        if old_status != 'finalized' and new_status == 'finalized':
            # Stock should be reduced when status changes to finalized
            for item_data in sale_data.items:
                if item_data.product_id:
                    # Regular product
                    success, result = update_product_stock(
                        product_id=item_data.product_id,
                        product_type='regular',
                        quantity_change=-item_data.quantity,  # Negative for sales
                        movement_type='sale',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Sale invoice finalized: {sale.invoice_number}",
                        user_id=user_id
                    )
                    if not success:
                        return jsonify({"error": f"Stock update failed: {result}"}), 400
                elif item_data.non_product_id:
                    # Non-product
                    success, result = update_product_stock(
                        product_id=item_data.non_product_id,
                        product_type='non',
                        quantity_change=-item_data.quantity,  # Negative for sales
                        movement_type='sale',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Sale invoice finalized: {sale.invoice_number}",
                        user_id=user_id
                    )
                    if not success:
                        return jsonify({"error": f"Stock update failed: {result}"}), 400
        elif old_status == 'finalized' and new_status != 'finalized':
            # If status is changing from finalized to something else, we should restore stock
            # This handles cases where a finalized sale is cancelled or changed back to draft
            for item_data in sale_data.items:
                if item_data.product_id:
                    # Regular product - restore stock
                    success, result = update_product_stock(
                        product_id=item_data.product_id,
                        product_type='regular',
                        quantity_change=item_data.quantity,  # Positive to restore
                        movement_type='sale_cancellation',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Sale invoice status changed from finalized: {sale.invoice_number}",
                        user_id=user_id
                    )
                    if not success:
                        return jsonify({"error": f"Stock restoration failed: {result}"}), 400
                elif item_data.non_product_id:
                    # Non-product - restore stock
                    success, result = update_product_stock(
                        product_id=item_data.non_product_id,
                        product_type='non',
                        quantity_change=item_data.quantity,  # Positive to restore
                        movement_type='sale_cancellation',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Sale invoice status changed from finalized: {sale.invoice_number}",
                        user_id=user_id
                    )
                    if not success:
                        return jsonify({"error": f"Stock restoration failed: {result}"}), 400
        else:
            # For any other status changes (including when status remains the same), handle stock changes for added/removed items
            for item_tuple in added_items:
                product_id, non_product_id, quantity = item_tuple
                if product_id:
                    # Regular product - reduce stock for new item
                    success, result = update_product_stock(
                        product_id=product_id,
                        product_type='regular',
                        quantity_change=-quantity,  # Negative for sales
                        movement_type='sale',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Item added to sale: {sale.invoice_number}",
                        user_id=user_id
                    )
                    if not success:
                        return jsonify({"error": f"Stock update failed: {result}"}), 400
                elif non_product_id:
                    # Non-product - reduce stock for new item
                    success, result = update_product_stock(
                        product_id=non_product_id,
                        product_type='non',
                        quantity_change=-quantity,  # Negative for sales
                        movement_type='sale',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Item added to sale: {sale.invoice_number}",
                        user_id=user_id
                    )
                    if not success:
                        return jsonify({"error": f"Stock update failed: {result}"}), 400
            
            for item_tuple in removed_items:
                product_id, non_product_id, quantity = item_tuple
                if product_id:
                    # Regular product - restore stock for removed item
                    success, result = update_product_stock(
                        product_id=product_id,
                        product_type='regular',
                        quantity_change=quantity,  # Positive to restore
                        movement_type='sale_cancellation',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Item removed from sale: {sale.invoice_number}",
                        user_id=user_id
                    )
                    if not success:
                        return jsonify({"error": f"Stock restoration failed: {result}"}), 400
                elif non_product_id:
                    # Non-product - restore stock for removed item
                    success, result = update_product_stock(
                        product_id=non_product_id,
                        product_type='non',
                        quantity_change=quantity,  # Positive to restore
                        movement_type='sale_cancellation',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Item removed from sale: {sale.invoice_number}",
                        user_id=user_id
                    )
                    if not success:
                        return jsonify({"error": f"Stock restoration failed: {result}"}), 400
        
        db.session.commit()
        
        # Additional stock update for any added/removed items that weren't processed above
        if added_items or removed_items:
            print(f"[DEBUG] Processing additional stock updates for added: {added_items}, removed: {removed_items}")
            for item_tuple in added_items:
                product_id, non_product_id, quantity = item_tuple
                if product_id:
                    # Regular product - reduce stock for new item
                    success, result = update_product_stock(
                        product_id=product_id,
                        product_type='regular',
                        quantity_change=-quantity,  # Negative for sales
                        movement_type='sale',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Item added to sale (fallback): {sale.invoice_number}",
                        user_id=user_id
                    )
                    if not success:
                        print(f"[DEBUG] Stock update failed: {result}")
                elif non_product_id:
                    # Non-product - reduce stock for new item
                    success, result = update_product_stock(
                        product_id=non_product_id,
                        product_type='non',
                        quantity_change=-quantity,  # Negative for sales
                        movement_type='sale',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Item added to sale (fallback): {sale.invoice_number}",
                        user_id=user_id
                    )
                    if not success:
                        print(f"[DEBUG] Stock update failed: {result}")
            
            for item_tuple in removed_items:
                product_id, non_product_id, quantity = item_tuple
                if product_id:
                    # Regular product - restore stock for removed item
                    success, result = update_product_stock(
                        product_id=product_id,
                        product_type='regular',
                        quantity_change=quantity,  # Positive to restore
                        movement_type='sale_cancellation',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Item removed from sale (fallback): {sale.invoice_number}",
                        user_id=user_id
                    )
                    if not success:
                        print(f"[DEBUG] Stock restoration failed: {result}")
                elif non_product_id:
                    # Non-product - restore stock for removed item
                    success, result = update_product_stock(
                        product_id=non_product_id,
                        product_type='non',
                        quantity_change=quantity,  # Positive to restore
                        movement_type='sale_cancellation',
                        reference_id=sale.id,
                        reference_type='sale',
                        remarks=f"Item removed from sale (fallback): {sale.invoice_number}",
                        user_id=user_id
                    )
                    if not success:
                        print(f"[DEBUG] Stock restoration failed: {result}")
        
        # Mail invoice if requested
        if request.json.get('mailInvoice'):
            customer = Customer.query.get(sale.customer_id)
            if customer and customer.email:
                send_invoice_email(mail, customer.email, sale, customer)
        
        return jsonify(sale.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/sales/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_sale(id):
    sale = Sale.query.get_or_404(id)
    try:
        # Delete all related sale items first
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
def create_purchase():
    data = request.get_json()
    try:
        purchase_data = PurchaseSchema(**data)
        # Get supplier name from supplier_id
        supplier = Supplier.query.get(purchase_data.supplier_id)
        if not supplier:
            return jsonify({'message': 'Supplier not found'}), 404
        # Use business date
        business_date = get_business_date()
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
                remarks=f"Initial stock set to {validated_data.initial_stock}",
                created_by=None  # System created
            )
            db.session.add(movement)
            db.session.commit()
        
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
                remarks=f"Initial stock set to {validated_data.initial_stock}",
                created_by=None  # System created
            )
            db.session.add(movement)
            db.session.commit()
        
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
    try:
        customers = Customer.query.all()
        return jsonify([customer.to_dict() for customer in customers]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/customers', methods=['POST'])
def create_customer():
    data = request.get_json()
    try:
        customer_data = CustomerSchema(**data)
        customer = Customer(**customer_data.dict())
        db.session.add(customer)
        db.session.commit()
        return jsonify(customer.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/customers/<int:id>', methods=['GET'])
def get_customer(id):
    customer = Customer.query.get_or_404(id)
    return jsonify(customer.to_dict())

@app.route('/api/customers/<int:id>', methods=['PUT'])
def update_customer(id):
    data = request.get_json()
    try:
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
        suppliers = Supplier.query.all()
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

        today_purchases = db.session.query(func.sum(Purchase.amount)).filter(
            func.date(Purchase.date) == today
        ).scalar() or 0

        total_purchases = db.session.query(func.sum(Purchase.amount)).scalar() or 0
        total_sales = db.session.query(func.sum(Sale.total_amount)).scalar() or 0
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
                "amount": float(sale.total_amount),
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
    try:
        sales = Sale.query.all()
        purchases = Purchase.query.all()
        
        # Last 7 days data
        last_7_days = [(datetime.now().date() - timedelta(days=i)) for i in range(7)]
        last_7_days.reverse()
        
        sales_by_day = [
            sum(getattr(sale, 'total_amount', 0) for sale in sales if sale.date and sale.date.date() == day)
            for day in last_7_days
        ]
        
        purchases_by_day = [
            sum(getattr(purchase, 'amount', 0) for purchase in purchases if purchase.date and purchase.date.date() == day)
            for day in last_7_days
        ]
        
        return jsonify({
            'salesPurchase': {
                'labels': [day.strftime('%a') for day in last_7_days],
                'salesData': sales_by_day,
                'purchaseData': purchases_by_day
            },
            'profitTrend': {
                'labels': ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                'data': [4000, 5500, 4800, 6200]  # Example data
            }
        })
    except Exception as e:
        return jsonify({'message': 'Failed to fetch chart data', 'error': str(e)}), 500

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
        settings_data = SystemSettingsSchema(**data)
        print('[DEBUG] Parsed settings_data:', settings_data.dict())
        settings = SystemSettings.query.first()
        if not settings:
            settings = SystemSettings()
            db.session.add(settings)
        for key, value in settings_data.dict().items():
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

# Attendance routes
@app.route('/api/attendance', methods=['GET'])
def get_attendance():
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    week = request.args.get('week', type=int)

    print(f"DEBUG: /api/attendance year={year}, month={month}, week={week}")

    query = Attendance.query

    if year and month:
        from datetime import datetime, timedelta
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = datetime(year, month + 1, 1) - timedelta(days=1)
        print(f"DEBUG: Attendance month start_date={start_date.date()}, end_date={end_date.date()}")
        query = query.filter(Attendance.date >= start_date.date(), Attendance.date <= end_date.date())
    elif year and week:
        from datetime import datetime, timedelta
        def iso_to_gregorian(iso_year, iso_week, iso_day):
            fourth_jan = datetime(iso_year, 1, 4)
            delta = timedelta(days=iso_day - fourth_jan.isoweekday())
            return fourth_jan + timedelta(weeks=iso_week - 1) + delta
        start_date = iso_to_gregorian(year, week, 1)  # Monday
        end_date = iso_to_gregorian(year, week, 7)    # Sunday
        print(f"DEBUG: Attendance week start_date={start_date.date()}, end_date={end_date.date()}")
        query = query.filter(Attendance.date >= start_date.date(), Attendance.date <= end_date.date())

    attendance_records = query.all()
    return jsonify([record.to_dict() for record in attendance_records])

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
        
        # Update expense fields
        for key, value in expense_data.dict().items():
            setattr(expense, key, value)
        
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
        db.session.delete(user)
        db.session.commit()
        return jsonify({'message': 'User deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

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

@app.route('/api/users/<int:id>/daily-wage', methods=['PUT'])
def update_daily_wage(id):
    data = request.get_json()
    try:
        user = User.query.get_or_404(id)
        
        if 'dailyWage' not in data:
            return jsonify({'message': 'Daily wage is required'}), 400
            
        # Validate daily wage is a positive number
        try:
            daily_wage = float(data['dailyWage'])
            if daily_wage < 0:
                return jsonify({'message': 'Daily wage must be positive'}), 400
        except ValueError:
            return jsonify({'message': 'Daily wage must be a valid number'}), 400
        
        user.daily_wage = daily_wage
        db.session.commit()
        
        return jsonify({
            'id': user.id,
            'username': user.username,
            'dailyWage': float(user.daily_wage) if user.daily_wage else None
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

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
    total_employees = User.query.count()
    
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
    query = User.query
    if employee_id:
        query = query.filter(User.id == employee_id)
    users = query.all()

    # If from_date and to_date are provided, use them for filtering
    if from_date and to_date:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d")
        for user in users:
            present_days = Attendance.query.filter(
                Attendance.user_id == user.id,
                Attendance.date >= from_dt.date(),
                Attendance.date <= to_dt.date(),
                Attendance.status == 'present'
            ).all()
            present_dates = [a.date.isoformat() for a in present_days]
            present_count = len(present_dates)
            daily_wage = float(user.daily_wage) if user.daily_wage else 0
            pay = present_count * daily_wage
            result.append({
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'userType': user.user_type,
                    'status': user.status,
                    'dailyWage': daily_wage
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
    for user in users:
        present_days = Attendance.query.filter(
            Attendance.user_id == user.id,
            Attendance.date >= start_date.date(),
            Attendance.date <= end_date.date(),
            Attendance.status == 'present'
        ).all()
        present_dates = [a.date.isoformat() for a in present_days]
        present_count = len(present_dates)
        daily_wage = float(user.daily_wage) if user.daily_wage else 0
        pay = present_count * daily_wage
        result.append({
            'user': {
                'id': user.id,
                'username': user.username,
                'userType': user.user_type,
                'status': user.status,
                'dailyWage': daily_wage
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

        customer = Customer.query.get(payment_data.customer_id)
        if not customer:
            return jsonify({"error": "Customer not found"}), 404

        # If sale_id is provided, link payment to a specific sale/invoice
        sale = None
        if payment_data.sale_id:
            sale = Sale.query.get(payment_data.sale_id)
            if not sale:
                return jsonify({"error": "Sale (invoice) not found"}), 404

            # Update sale's payment status and paid_amount
            current_paid = float(sale.paid_amount or 0)
            new_paid = current_paid + float(payment_data.amount)
            
            if new_paid >= float(sale.total_amount):
                sale.payment_status = "paid"
                sale.paid_amount = sale.total_amount
                sale.status = "finalized"  # Mark as finalized when fully paid
                # If payment is cash, update customer_type to cash
                if payment_data.payment_mode.lower() == "cash" and sale.customer_type != "cash":
                    print(f"[DEBUG] Updating sale {sale.id} customer_type from {sale.customer_type} to cash due to full cash payment.")
                    sale.customer_type = "cash"
            else:
                sale.payment_status = "partial"
                sale.paid_amount = new_paid
            db.session.add(sale)

        new_payment = Payment(
            customer_id=payment_data.customer_id,
            sale_id=payment_data.sale_id,
            amount=payment_data.amount,
            payment_mode=payment_data.payment_mode,
            payment_date=payment_data.payment_date,
            remarks=payment_data.remarks
        )
        print("Created payment object:", new_payment.to_dict())  # Debug log
        
        db.session.add(new_payment)
        db.session.commit()
        return jsonify(new_payment.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        print("Error creating payment:", str(e))  # Debug log
        import traceback
        print("Full traceback:", traceback.format_exc())  # Debug log
        return jsonify({"error": str(e)}), 500

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

        # Fetch sales where total_amount > paid_amount and status is pending, paid, or finalized
        outstanding_sales = Sale.query.filter(
            Sale.customer_id == customer_id,
            or_(Sale.status == 'pending', Sale.status == 'paid', Sale.status == 'finalized'),
            Sale.total_amount > (Sale.paid_amount or 0)
        ).all()

        return jsonify([sale.to_dict() for sale in outstanding_sales]), 200
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
        
        # Build query
        query = Payment.query
        
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
            query = query.filter(Payment.payment_mode == payment_mode)
        
        # Order by payment date descending
        query = query.order_by(Payment.payment_date.desc())
        
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
                'paymentDate': payment.payment_date.isoformat(),
                'paymentMode': payment.payment_mode,
                'amount': float(payment.amount),
                'customerName': customer_name,
                'customerId': payment.customer_id,
                'invoiceNumber': invoice_number,
                'invoiceDate': invoice_date,
                'invoiceAmount': invoice_amount,
                'remarks': payment.remarks,
                'createdAt': payment.created_at.isoformat() if payment.created_at else None
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
    query = Sale.query.join(User, Sale.created_by == User.id)
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
    if payment_type and payment_type != 'All':
        if payment_type == 'Cash':
            query = query.filter(Sale.customer_type.ilike('cash'))
        elif payment_type == 'Credit':
            query = query.filter(Sale.customer_type.ilike('credit'))
    if salesman and salesman != 'all':
        query = query.filter(User.username == salesman)
    if search:
        query = query.join(Customer).filter(
            (Sale.invoice_number.ilike(f'%{search}%')) |
            (Customer.customer_name.ilike(f'%{search}%'))
        )
    # Only show finalized sales
    query = query.filter(Sale.status == 'finalized')
    sales = query.order_by(Sale.date.desc()).all()
    result = []
    for idx, sale in enumerate(sales, 1):
        boxes = sum(item.quantity for item in sale.items)
        cash_paid = sum(float(p.amount) for p in sale.payments if p.payment_mode and p.payment_mode.lower() == 'cash')
        # For credit sales, show the invoice amount as credit; for others, 0
        credit_amount = float(sale.total_amount) if sale.customer_type and sale.customer_type.lower() == 'credit' else 0
        result.append({
            'id': sale.id,
            'slNo': idx,
            'date': sale.date.strftime('%Y-%m-%d'),
            'salesman': sale.user.username if sale.user else '',
            'boxes': boxes,
            'invoiceNo': sale.invoice_number,
            'customerName': sale.customer.customer_name if sale.customer else '',
            'vat': float(sale.vat_amount),
            'credit': credit_amount,
            'cash': cash_paid,
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
    ).all()
    payments = Payment.query.filter(
        Payment.customer_id == customer_id,
        Payment.payment_date >= from_dt.date(),
        Payment.payment_date < to_dt.date()
    ).all()

    # Build statement entries
    statement = []
    running_balance = 0
    sl_no = 1

    # Combine and sort by date (sales and payments)
    entries = []
    for sale in sales:
        entries.append({
            'date': sale.date,
            'type': 'sale',
            'invoiceNo': sale.invoice_number,
            'description': 'Sale Invoice',
            'creditInv': float(sale.total_amount) if sale.customer_type == 'credit' else 0,
            'cashInv': float(sale.total_amount) if sale.customer_type == 'cash' else 0,
            'paid': 0,
            'creditAdj': 0,
            'discountAdj': 0,
            'balance': float(sale.total_amount),
            'sale_id': sale.id
        })
    for payment in payments:
        entries.append({
            'date': datetime.combine(payment.payment_date, datetime.min.time()),
            'type': 'payment',
            'invoiceNo': payment.sale.invoice_number if payment.sale else '',
            'description': 'Payment Received',
            'creditInv': 0,
            'cashInv': 0,
            'paid': float(payment.amount),
            'creditAdj': 0,
            'discountAdj': 0,
            'balance': -float(payment.amount),
            'sale_id': payment.sale_id
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
            'creditInv': entry['creditInv'],
            'cashInv': entry['cashInv'],
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

    # Fetch sales for this customer in the date range
    sales_query = Sale.query.filter(
        Sale.customer_id == customer_id,
        Sale.date >= from_dt,
        Sale.date < to_dt,
        Sale.status == 'finalized'
    )
    if filter_type == "Credit":
        sales_query = sales_query.filter(Sale.customer_type.ilike('credit'))
    elif filter_type == "Cast":
        sales_query = sales_query.filter(Sale.customer_type.ilike('cash'))

    sales = sales_query.order_by(Sale.date.asc()).all()

    # Build history entries
    history = []
    running_balance = 0
    sl_no = 1
    for sale in sales:
        credit_inv = float(sale.total_amount) if sale.customer_type == 'credit' else 0
        cash_inv = float(sale.total_amount) if sale.customer_type == 'cash' else 0
        paid = float(sale.paid_amount or 0)
        balance = float(sale.total_amount) - paid
        running_balance += balance
        history.append({
            'id': sl_no,
            'slNo': sl_no,
            'date': sale.date.strftime("%Y-%m-%d"),
            'invoiceNo': sale.invoice_number,
            'creditInv': credit_inv,
            'cashInv': cash_inv,
            'paid': paid,
            'balance': balance,
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
    query = (
        db.session.query(
            SaleItem.id,
            SaleItem.product_id,
            SaleItem.non_product_id,
            func.coalesce(RegularProduct.sage_code, NonProduct.sage_code, '').label('sage_code'),
            func.coalesce(RegularProduct.description, NonProduct.description, '').label('product_description'),
            func.sum(SaleItem.quantity).label('quantity'),
            func.sum(SaleItem.total_price).label('total'),
            (func.sum(SaleItem.total_price) / func.nullif(func.sum(SaleItem.quantity), 0)).label('avg_price')
        )
        .join(Sale, SaleItem.sale_id == Sale.id)
        .outerjoin(RegularProduct, SaleItem.product_id == RegularProduct.id)
        .outerjoin(NonProduct, SaleItem.non_product_id == NonProduct.id)
    )

    # Filter by date range
    if from_date:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        query = query.filter(Sale.date >= from_dt)
    if to_date:
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Sale.date < to_dt)
    # Only finalized sales
    query = query.filter(Sale.status == 'finalized')
    # Search by product description or sage code
    if search:
        query = query.filter(
            or_(
                RegularProduct.description.ilike(f'%{search}%'),
                NonProduct.description.ilike(f'%{search}%'),
                RegularProduct.sage_code.ilike(f'%{search}%'),
                NonProduct.sage_code.ilike(f'%{search}%')
            )
        )
    # Group by product
    query = query.group_by(
        SaleItem.product_id,
        SaleItem.non_product_id,
        RegularProduct.sage_code,
        NonProduct.sage_code,
        RegularProduct.description,
        NonProduct.description
    )
    # Order by total desc
    query = query.order_by(func.sum(SaleItem.total_price).desc())
    results = query.all()
    # Format for frontend
    sales_data = []
    for idx, row in enumerate(results, 1):
        sales_data.append({
            'id': idx,
            'slNo': idx,
            'sageCode': row.sage_code,
            'productDescription': row.product_description,
            'quantity': int(row.quantity) if row.quantity else 0,
            'avgPrice': float(row.avg_price) if row.avg_price else 0,
            'total': float(row.total) if row.total else 0
        })
    return jsonify(sales_data)

@app.route('/api/purchase-invoices', methods=['POST'])
def create_purchase_invoice():
    data = request.get_json()
    # Use business date
    business_date = get_business_date()
    invoice_date = business_date
    if data.get('date'):
        try:
            invoice_date = datetime.strptime(data['date'], "%Y-%m-%d")
        except Exception:
            invoice_date = business_date
    invoice = PurchaseInvoice(
        purchase_id=data['purchaseId'],
        remarks=data.get('remarks'),
        date=invoice_date
    )
    db.session.add(invoice)
    db.session.commit()
    
    # Process invoice items and update stock
    for item in data['items']:
        invoice_item = PurchaseInvoiceItem(
            invoice_id=invoice.id,
            product_id=item['productId'],
            product_name=item.get('productName'),
            quantity=item['quantity'],
            unit_price=item['unitPrice'],
            total_price=item['totalPrice']
        )
        db.session.add(invoice_item)
        
        # Update stock for the product
        # Note: We need to determine if it's a regular or non-product
        # For now, we'll assume regular products and handle both cases
        product_type = 'regular'  # Default assumption
        success, result = update_product_stock(
            product_id=item['productId'],
            product_type=product_type,
            quantity_change=item['quantity'],  # Positive for purchases
            movement_type='purchase',
            reference_id=invoice.id,
            reference_type='purchase',
            remarks=f"Purchase invoice for purchase {data['purchaseId']}",
            user_id=None  # TODO: Get user_id from JWT if needed
        )
        if not success:
            db.session.rollback()
            return jsonify({"error": f"Stock update failed: {result}"}), 400
    
    db.session.commit()
    return jsonify(invoice.to_dict()), 201

@app.route('/api/purchase-invoices/<int:invoice_id>', methods=['GET'])
def get_purchase_invoice(invoice_id):
    invoice = PurchaseInvoice.query.get_or_404(invoice_id)
    return jsonify(invoice.to_dict())


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
        
        # Build query
        query = SupplierPayment.query.join(Supplier) # Eager load supplier
        
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
        
        # Order by payment date descending
        query = query.order_by(SupplierPayment.payment_date.desc())
        
        payments = query.all()
        
        # Create detailed payment history with invoice information
        payment_history = []
        for idx, payment in enumerate(payments, 1):
            # Get supplier name
            supplier_name = payment.supplier.supplier_name if payment.supplier else 'Unknown'
            
            # Get invoice information if linked
            invoice_number = None
            invoice_date = None
            invoice_amount = None
            if payment.purchase_invoice:
                invoice_number = payment.purchase_invoice.id
                invoice_date = payment.purchase_invoice.date.isoformat() if payment.purchase_invoice.date else None
                invoice_amount = sum(item.total_price for item in payment.purchase_invoice.items)

            payment_history.append({
                'slNo': idx,
                'paymentDate': payment.payment_date.isoformat(),
                'paymentMode': payment.payment_mode,
                'paymentId': str(payment.id),
                'paidAmt': float(payment.amount),
                'invNo': str(invoice_number) if invoice_number is not None else '',
                'invDate': invoice_date,
                'supplier': supplier_name,
                'invoiceAmt': float(invoice_amount) if invoice_amount is not None else 0,
                'allocated': float(payment.amount) if invoice_number is not None else 0,
                'remarks': payment.remarks
            })
        
        return jsonify(payment_history), 200
    except Exception as e:
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
            PurchaseInvoice.purchase_id,
            Purchase.supplier_name,
            func.sum(PurchaseInvoiceItem.total_price).label('invoice_amount')
        )
        .join(Purchase, PurchaseInvoice.purchase_id == Purchase.id)
        .join(PurchaseInvoiceItem, PurchaseInvoice.id == PurchaseInvoiceItem.invoice_id)
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
        Purchase.supplier_name
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
            'invNo': row.purchase_id,
            'delNo': 0,  # Delivery number not tracked in current schema
            'invoiceAmt': float(row.invoice_amount) if row.invoice_amount else 0
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
    
    # Format for frontend
    purchase_data = []
    for idx, row in enumerate(results, 1):
        purchase_data.append({
            'id': idx,
            'slNo': idx,
            'productDescription': row.product_description,
            'quantity': int(row.quantity) if row.quantity else 0,
            'avgPrice': float(row.avg_price) if row.avg_price else 0,
            'total': float(row.total) if row.total else 0
        })
    
    return jsonify(purchase_data)

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
# Fetch all sales in range
    sales = Sale.query.filter(
        Sale.date >= from_dt,
        Sale.date < to_dt,
        Sale.status == 'finalized'
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

    # Group purchase invoice items by invoice date
    purchases_by_date = {d: [] for d in date_list}
    for item in invoice_items:
        invoice = item.invoice
        if invoice and invoice.date:
            d = invoice.date.date()
            if d in purchases_by_date:
                purchases_by_date[d].append(item)

    rows = []
    total_purchase = total_credit = total_cash = total_sales = 0
    for idx, d in enumerate(date_list, 1):
        day_purchases = sum(float(item.total_price) for item in purchases_by_date[d])
        day_credit_sales = sum(float(sale.total_amount) for sale in sales_by_date[d] if sale.customer_type.lower() == 'credit')
        day_cash_sales = sum(float(sale.total_amount) for sale in sales_by_date[d] if sale.customer_type.lower() == 'cash')
        day_total_sales = day_credit_sales + day_cash_sales
        print(f"[DEBUG] {d}: purchase={day_purchases}, creditSales={day_credit_sales}, cashSales={day_cash_sales}, totalSales={day_total_sales}")
        rows.append({
            'slNo': idx,
            'date': d.strftime('%d-%m-%Y'),
            'purchase': day_purchases,
            'creditSales': day_credit_sales,
            'cashSales': day_cash_sales,
            'totalSales': day_total_sales
        })
        total_purchase += day_purchases
        total_credit += day_credit_sales
        total_cash += day_cash_sales
        total_sales += day_total_sales

    summary = {
        'totalPurchase': total_purchase,
        'totalCredit': total_credit,
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
    try:
        regular_products = RegularProduct.query.all()
        non_products = NonProduct.query.all()
        
        stock_data = []
        
        # Add regular products
        for product in regular_products:
            stock_data.append({
                'id': product.id,
                'productCode': product.product_code,
                'description': product.description,
                'productType': 'regular',
                'currentStock': product.current_stock,
                'reorderLevel': product.reorder_level,
                'unitOfSale': product.unit_of_sale,
                'location': product.location
            })
        
        # Add non-products
        for product in non_products:
            stock_data.append({
                'id': product.id,
                'productCode': product.product_code,
                'description': product.description,
                'productType': 'non',
                'currentStock': product.current_stock,
                'reorderLevel': product.reorder_level,
                'unitOfSale': product.unit_of_sale,
                'location': product.location
            })
        
        return jsonify(stock_data), 200
    except Exception as e:
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
                'currentStock': product.current_stock,
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
        
        # Get current stock
        current_stock = get_product_stock(adjustment_data.product_id, adjustment_data.product_type)
        if current_stock is None:
            return jsonify({"error": "Product not found"}), 404
        
        # Calculate new stock based on adjustment type
        if adjustment_data.adjustment_type == 'increase':
            quantity_change = adjustment_data.quantity
            new_stock = current_stock + adjustment_data.quantity
        elif adjustment_data.adjustment_type == 'decrease':
            quantity_change = -adjustment_data.quantity
            new_stock = current_stock - adjustment_data.quantity
        elif adjustment_data.adjustment_type == 'set':
            quantity_change = adjustment_data.quantity - current_stock
            new_stock = adjustment_data.quantity
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
            user_id=user_id
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
        if from_date:
            query = query.filter(StockMovement.created_at >= from_date)
        if to_date:
            query = query.filter(StockMovement.created_at <= to_date)
        
        movements = query.order_by(StockMovement.created_at.desc()).all()
        
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
        # Find last movement on or before the date
        movement = StockMovement.query.filter(
            StockMovement.product_id == product.id,
            StockMovement.product_type == 'regular',
            StockMovement.created_at <= date
        ).order_by(StockMovement.created_at.desc()).first()
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
            StockMovement.created_at <= date
        ).order_by(StockMovement.created_at.desc()).first()
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

@app.route('/api/reports/stock-check', methods=['GET'])
@jwt_required()
def stock_check_report():
    """Generate stock check report between two dates"""
    try:
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        search = request.args.get('search', '')
        
        print(f"[DEBUG] Stock check request - fromDate: {from_date}, toDate: {to_date}, search: {search}")
        
        if not from_date or not to_date:
            return jsonify({'error': 'fromDate and toDate are required'}), 400
        
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d")
        
        print(f"[DEBUG] Parsed dates - from_dt: {from_dt}, to_dt: {to_dt}")
        
        # Get all products (regular and non)
        regular_products = RegularProduct.query.filter(RegularProduct.status == 'active').all()
        non_products = NonProduct.query.filter(NonProduct.status == 'active').all()
        
        print(f"[DEBUG] Found {len(regular_products)} regular products and {len(non_products)} non-products")
        
        stock_check_data = []
        
        # Process regular products
        for product in regular_products:
            try:
                if search and search.lower() not in product.description.lower():
                    continue
                    
                print(f"[DEBUG] Processing regular product: {product.description} (ID: {product.id})")
                
                # Get opening stock (stock at the beginning of from_date)
                opening_stock = get_opening_stock(product.id, 'regular', from_dt)
                print(f"[DEBUG] Opening stock: {opening_stock}")
                
                # Get new stock (purchases) between dates
                new_stock = get_new_stock(product.id, 'regular', from_dt, to_dt)
                print(f"[DEBUG] New stock: {new_stock}")
                
                # Get sales between dates
                sales = get_sales_quantity(product.id, 'regular', from_dt, to_dt)
                print(f"[DEBUG] Sales: {sales}")
                
                # Get returns between dates (customer returns)
                customer_returns = get_customer_returns_quantity(product.id, 'regular', from_dt, to_dt)
                print(f"[DEBUG] Customer returns: {customer_returns}")
                
                # Get dumps/wastage between dates
                dumps = get_dumps_quantity(product.id, 'regular', from_dt, to_dt)
                print(f"[DEBUG] Dumps: {dumps}")
                
                # Get supplier returns between dates
                supplier_returns = get_supplier_returns_quantity(product.id, 'regular', from_dt, to_dt)
                print(f"[DEBUG] Supplier returns: {supplier_returns}")
                
                # Calculate expected stock
                expected_stock = opening_stock + new_stock - sales + customer_returns - dumps + supplier_returns
                print(f"[DEBUG] Expected stock: {expected_stock}")
                
                # Get actual closing stock
                actual_closing_stock = product.current_stock
                print(f"[DEBUG] Actual closing stock: {actual_closing_stock}")
                
                # Calculate difference
                difference = actual_closing_stock - expected_stock
                print(f"[DEBUG] Difference: {difference}")
                
                # Determine status
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
                    'os': opening_stock,
                    'ns': new_stock,
                    'sales': sales,
                    'crtn': customer_returns,
                    'dmps': dumps,
                    'srtn': supplier_returns,
                    'stock': expected_stock,
                    'clStock': actual_closing_stock,
                    'result': result,
                    'status': status,
                    'productType': 'regular'
                })
            except Exception as e:
                print(f"[ERROR] Error processing regular product {product.id}: {str(e)}")
                import traceback
                print(f"[ERROR] Traceback: {traceback.format_exc()}")
                continue
        
        # Process non-products
        for product in non_products:
            try:
                if search and search.lower() not in product.description.lower():
                    continue
                    
                print(f"[DEBUG] Processing non-product: {product.description} (ID: {product.id})")
                
                # Get opening stock
                opening_stock = get_opening_stock(product.id, 'non', from_dt)
                
                # Get new stock
                new_stock = get_new_stock(product.id, 'non', from_dt, to_dt)
                
                # Get sales
                sales = get_sales_quantity(product.id, 'non', from_dt, to_dt)
                
                # Get returns
                customer_returns = get_customer_returns_quantity(product.id, 'non', from_dt, to_dt)
                
                # Get dumps
                dumps = get_dumps_quantity(product.id, 'non', from_dt, to_dt)
                
                # Get supplier returns
                supplier_returns = get_supplier_returns_quantity(product.id, 'non', from_dt, to_dt)
                
                # Calculate expected stock
                expected_stock = opening_stock + new_stock - sales + customer_returns - dumps + supplier_returns
                
                # Get actual closing stock
                actual_closing_stock = product.current_stock
                
                # Calculate difference
                difference = actual_closing_stock - expected_stock
                
                # Determine status
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
                    'os': opening_stock,
                    'ns': new_stock,
                    'sales': sales,
                    'crtn': customer_returns,
                    'dmps': dumps,
                    'srtn': supplier_returns,
                    'stock': expected_stock,
                    'clStock': actual_closing_stock,
                    'result': result,
                    'status': status,
                    'productType': 'non'
                })
            except Exception as e:
                print(f"[ERROR] Error processing non-product {product.id}: {str(e)}")
                import traceback
                print(f"[ERROR] Traceback: {traceback.format_exc()}")
                continue
        
        # Sort by product description
        stock_check_data.sort(key=lambda x: x['productDescription'])
        
        # Add serial numbers
        for i, item in enumerate(stock_check_data, 1):
            item['slNo'] = i
        
        print(f"[DEBUG] Returning {len(stock_check_data)} stock check items")
        return jsonify(stock_check_data), 200
        
    except Exception as e:
        print(f"[ERROR] Exception in stock_check_report: {str(e)}")
        import traceback
        print(f"[ERROR] Full traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

def get_opening_stock(product_id, product_type, from_date):
    """Get stock level at the beginning of from_date"""
    try:
        print(f"[DEBUG] Getting opening stock for product {product_id} ({product_type}) before {from_date}")
        
        # Get the last stock movement before from_date
        last_movement = StockMovement.query.filter(
            StockMovement.product_id == product_id,
            StockMovement.product_type == product_type,
            StockMovement.created_at < from_date
        ).order_by(StockMovement.created_at.desc()).first()
        
        if last_movement:
            print(f"[DEBUG] Found last movement: {last_movement.new_stock}")
            return last_movement.new_stock
        else:
            print(f"[DEBUG] No movements found, checking initial stock")
            # If no movements, check if there's initial stock
            if product_type == 'regular':
                product = RegularProduct.query.get(product_id)
            else:
                product = NonProduct.query.get(product_id)
            
            if product and product.initial_stock:
                print(f"[DEBUG] Found initial stock: {product.initial_stock}")
                return product.initial_stock
            print(f"[DEBUG] No initial stock found, returning 0")
            return 0
    except Exception as e:
        print(f"[ERROR] Error getting opening stock: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return 0

def get_new_stock(product_id, product_type, from_date, to_date):
    """Get new stock (purchases) between dates"""
    try:
        print(f"[DEBUG] Getting new stock for product {product_id} ({product_type}) between {from_date} and {to_date}")
        
        movements = StockMovement.query.filter(
            StockMovement.product_id == product_id,
            StockMovement.product_type == product_type,
            StockMovement.movement_type == 'purchase',
            StockMovement.created_at >= from_date,
            StockMovement.created_at <= to_date
        ).all()
        
        total = sum(movement.quantity for movement in movements if movement.quantity > 0)
        print(f"[DEBUG] Found {len(movements)} purchase movements, total: {total}")
        return total
    except Exception as e:
        print(f"[ERROR] Error getting new stock: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return 0

def get_sales_quantity(product_id, product_type, from_date, to_date):
    """Get sales quantity between dates"""
    try:
        print(f"[DEBUG] Getting sales quantity for product {product_id} ({product_type}) between {from_date} and {to_date}")
        
        movements = StockMovement.query.filter(
            StockMovement.product_id == product_id,
            StockMovement.product_type == product_type,
            StockMovement.movement_type == 'sale',
            StockMovement.created_at >= from_date,
            StockMovement.created_at <= to_date
        ).all()
        
        total = sum(abs(movement.quantity) for movement in movements if movement.quantity < 0)
        print(f"[DEBUG] Found {len(movements)} sale movements, total: {total}")
        return total
    except Exception as e:
        print(f"[ERROR] Error getting sales quantity: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return 0

def get_customer_returns_quantity(product_id, product_type, from_date, to_date):
    """Get customer returns between dates"""
    try:
        print(f"[DEBUG] Getting customer returns for product {product_id} ({product_type}) between {from_date} and {to_date}")
        
        movements = StockMovement.query.filter(
            StockMovement.product_id == product_id,
            StockMovement.product_type == product_type,
            StockMovement.movement_type == 'customer_return',
            StockMovement.created_at >= from_date,
            StockMovement.created_at <= to_date
        ).all()
        
        total = sum(movement.quantity for movement in movements if movement.quantity > 0)
        print(f"[DEBUG] Found {len(movements)} customer return movements, total: {total}")
        return total
    except Exception as e:
        print(f"[ERROR] Error getting customer returns: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return 0

def get_dumps_quantity(product_id, product_type, from_date, to_date):
    """Get dumps/wastage between dates"""
    try:
        print(f"[DEBUG] Getting dumps quantity for product {product_id} ({product_type}) between {from_date} and {to_date}")
        
        movements = StockMovement.query.filter(
            StockMovement.product_id == product_id,
            StockMovement.product_type == product_type,
            StockMovement.movement_type == 'dump',
            StockMovement.created_at >= from_date,
            StockMovement.created_at <= to_date
        ).all()
        
        total = sum(abs(movement.quantity) for movement in movements if movement.quantity < 0)
        print(f"[DEBUG] Found {len(movements)} dump movements, total: {total}")
        return total
    except Exception as e:
        print(f"[ERROR] Error getting dumps quantity: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return 0

def get_supplier_returns_quantity(product_id, product_type, from_date, to_date):
    """Get supplier returns between dates"""
    try:
        print(f"[DEBUG] Getting supplier returns for product {product_id} ({product_type}) between {from_date} and {to_date}")
        
        movements = StockMovement.query.filter(
            StockMovement.product_id == product_id,
            StockMovement.product_type == product_type,
            StockMovement.movement_type == 'supplier_return',
            StockMovement.created_at >= from_date,
            StockMovement.created_at <= to_date
        ).all()
        
        total = sum(movement.quantity for movement in movements if movement.quantity > 0)
        print(f"[DEBUG] Found {len(movements)} supplier return movements, total: {total}")
        return total
    except Exception as e:
        print(f"[ERROR] Error getting supplier returns: {e}")
        import traceback
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return 0

@app.route('/api/stock/customer-return', methods=['POST'])
@jwt_required()
def add_customer_return():
    """Add customer return movement"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        
        success, result = update_product_stock(
            product_id=data['productId'],
            product_type=data['productType'],
            quantity_change=data['quantity'],  # Positive for returns
            movement_type='customer_return',
            reference_id=data.get('saleId'),
            reference_type='sale',
            remarks=f"Customer return: {data.get('remarks', '')}",
            user_id=user_id
        )
        
        if not success:
            return jsonify({"error": f"Stock update failed: {result}"}), 400
        
        return jsonify({"message": "Customer return recorded successfully", "newStock": result}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stock/dump', methods=['POST'])
@jwt_required()
def add_dump():
    """Add dump/wastage movement"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        
        success, result = update_product_stock(
            product_id=data['productId'],
            product_type=data['productType'],
            quantity_change=-data['quantity'],  # Negative for dumps
            movement_type='dump',
            reference_id=None,
            reference_type='dump',
            remarks=f"Dump/wastage: {data.get('remarks', '')}",
            user_id=user_id
        )
        
        if not success:
            return jsonify({"error": f"Stock update failed: {result}"}), 400
        
        return jsonify({"message": "Dump recorded successfully", "newStock": result}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stock/supplier-return', methods=['POST'])
@jwt_required()
def add_supplier_return():
    """Add supplier return movement"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        
        success, result = update_product_stock(
            product_id=data['productId'],
            product_type=data['productType'],
            quantity_change=data['quantity'],  # Positive for returns
            movement_type='supplier_return',
            reference_id=data.get('purchaseId'),
            reference_type='purchase',
            remarks=f"Supplier return: {data.get('remarks', '')}",
            user_id=user_id
        )
        
        if not success:
            return jsonify({"error": f"Stock update failed: {result}"}), 400
        
        return jsonify({"message": "Supplier return recorded successfully", "newStock": result}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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
                    ExpenseEntry.description.ilike(f'%{search}%'),
                    Supplier.supplier_name.ilike(f'%{search}%'),
                    Expense.expense_name.ilike(f'%{search}%')
                )
            )
        
        expense_entries = query.order_by(ExpenseEntry.date.desc()).all()
        return jsonify([entry.to_dict() for entry in expense_entries]), 200
    except Exception as e:
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
            description=expense_entry_data.description,
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
        expense_entry.description = data['description']
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
        # Use business date
        business_date = get_business_date()
        # Generate reference number
        last_entry = DumpEntry.query.order_by(DumpEntry.id.desc()).first()
        ref_number = f"D{1 if not last_entry else last_entry.id + 1:04d}"
        # Calculate total value
        quantity = int(data.get('quantity', 0))
        unit_price = float(data.get('unitPrice', 0))
        total_value = quantity * unit_price
        dump_entry_data = DumpEntrySchema(**{
            **data,
            'refNumber': ref_number,
            'totalValue': total_value,
            'date': business_date
        })
        dump_entry = DumpEntry(
            ref_number=ref_number,
            date=business_date,
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

        # Update stock movement
        success, result = update_product_stock(
            product_id=dump_entry_data.productId,
            product_type=dump_entry_data.productType,
            quantity_change=-quantity,  # Negative for dumps
            movement_type='dump',
            reference_id=None,  # or dump_entry.id if needed
            reference_type='dump',
            remarks=f"Dump entry: {dump_entry_data.description}",
            user_id=user_id
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
        
        # Calculate total value
        quantity = int(data.get('quantity', 0))
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
            user_id=get_jwt_identity()
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

@app.route('/api/customer-returns', methods=['POST'])
@jwt_required()
def create_customer_return():
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        # Use business date
        business_date = get_business_date()
        # Generate reference number
        last_return = CustomerReturn.query.order_by(CustomerReturn.id.desc()).first()
        ref_number = f"CR{1 if not last_return else last_return.id + 1:04d}"
        # Calculate total value
        quantity = int(data.get('quantity', 0))
        unit_price = float(data.get('unitPrice', 0))
        total_value = quantity * unit_price
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
        # Prepare data for schema validation
        schema_data = {
            'refNumber': ref_number,
            'date': parsed_date,
            'customerId': data.get('customerId'),
            'saleId': data.get('saleId'),
            'productId': data.get('productId'),
            'productType': data.get('productType'),
            'description': data.get('description'),
            'invoiceNumber': data.get('invoiceNumber'),
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
            date=parsed_date,
            customer_id=customer_return_data.customerId,
            sale_id=customer_return_data.saleId,
            product_id=customer_return_data.productId,
            product_type=customer_return_data.productType,
            description=customer_return_data.description,
            invoice_number=customer_return_data.invoiceNumber,
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
        db.session.commit()
        # Note: Stock is NOT updated here - it will be updated when the return is approved
        
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
        
        # Store old values for stock adjustment
        old_quantity = customer_return.quantity
        old_credit_amount = customer_return.credit_note_amount
        
        # Calculate total value
        quantity = int(data.get('quantity', 0))
        unit_price = float(data.get('unitPrice', 0))
        total_value = quantity * unit_price
        
        # Update fields
        customer_return.date = datetime.strptime(data['date'], "%Y-%m-%d").date()
        customer_return.customer_id = data['customerId']
        customer_return.sale_id = data.get('saleId')
        customer_return.product_id = data['productId']
        customer_return.product_type = data['productType']
        customer_return.description = data['description']
        customer_return.invoice_number = data.get('invoiceNumber')
        customer_return.remarks = data.get('remarks')
        customer_return.quantity = quantity
        customer_return.unit_price = unit_price
        customer_return.total_value = total_value
        customer_return.return_reason = data.get('returnReason')
        customer_return.credit_note_issued = data.get('creditNoteIssued', False)
        customer_return.credit_note_amount = float(data.get('creditNoteAmount', 0))
        customer_return.status = data.get('status', 'pending')
        
        # Adjust stock if quantity changed
        if quantity != old_quantity:
            quantity_change = quantity - old_quantity
            success, result = update_product_stock(
                product_id=customer_return.product_id,
                product_type=customer_return.product_type,
                quantity_change=quantity_change,
                movement_type='customer_return_adjustment',
                reference_id=customer_return.id,
                reference_type='customer_return',
                remarks=f"Return quantity adjusted: {old_quantity} -> {quantity}",
                user_id=user_id
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
    """Delete a customer return"""
    try:
        customer_return = CustomerReturn.query.get_or_404(id)
        
        # Restore stock before deleting
        success, result = update_product_stock(
            product_id=customer_return.product_id,
            product_type=customer_return.product_type,
            quantity_change=-customer_return.quantity,  # Negative to reverse
            movement_type='customer_return_cancellation',
            reference_id=customer_return.id,
            reference_type='customer_return',
            remarks=f"Customer return cancelled: {customer_return.description}",
            user_id=get_jwt_identity()
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
        
        # Update stock movement (increase stock) when approved
        success, result = update_product_stock(
            product_id=customer_return.product_id,
            product_type=customer_return.product_type,
            quantity_change=customer_return.quantity,  # Positive for returns
            movement_type='customer_return',
            reference_id=customer_return.id,
            reference_type='customer_return',
            remarks=f"Customer return approved: {customer_return.description}",
            user_id=user_id
        )
        
        if not success:
            return jsonify({"error": f"Stock update failed: {result}"}), 400
        
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
        
        # Reverse stock movement
        success, result = update_product_stock(
            product_id=customer_return.product_id,
            product_type=customer_return.product_type,
            quantity_change=-customer_return.quantity,  # Negative to reverse
            movement_type='customer_return_rejection',
            reference_id=customer_return.id,
            reference_type='customer_return',
            remarks=f"Return rejected: {data.get('rejectionReason', '')}",
            user_id=get_jwt_identity()
        )
        
        if not success:
            db.session.rollback()
            return jsonify({"error": f"Stock reversal failed: {result}"}), 400
        
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
        return jsonify([return_item.to_dict() for return_item in supplier_returns]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/supplier-returns', methods=['POST'])
@jwt_required()
def create_supplier_return():
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        # Use business date
        business_date = get_business_date()
        # Generate reference number
        last_return = SupplierReturn.query.order_by(SupplierReturn.id.desc()).first()
        ref_number = f"SR{1 if not last_return else last_return.id + 1:04d}"
        # Calculate total value
        quantity = int(data.get('quantity', 0))
        unit_price = float(data.get('unitPrice', 0))
        total_value = quantity * unit_price
        # Parse date string to date object
        parsed_date = business_date
        date_str = data.get('date')
        if date_str:
            try:
                parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                parsed_date = business_date
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
        db.session.commit()
        # Note: Stock is NOT updated here - it will be updated when the return is approved
        
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
    """Update a supplier return"""
    try:
        data = request.get_json()
        supplier_return = SupplierReturn.query.get_or_404(id)
        user_id = get_jwt_identity()
        
        # Store old values for stock adjustment
        old_quantity = supplier_return.quantity
        old_credit_amount = supplier_return.credit_note_amount
        
        # Calculate total value
        quantity = int(data.get('quantity', 0))
        unit_price = float(data.get('unitPrice', 0))
        total_value = quantity * unit_price
        
        # Update fields
        supplier_return.date = datetime.strptime(data['date'], "%Y-%m-%d").date()
        supplier_return.supplier_id = data['supplierId']
        supplier_return.purchase_invoice_id = data.get('purchaseInvoiceId')
        supplier_return.product_id = data['productId']
        supplier_return.product_type = data['productType']
        supplier_return.description = data['description']
        supplier_return.invoice_number = data.get('invoiceNumber')
        supplier_return.remarks = data.get('remarks')
        supplier_return.quantity = quantity
        supplier_return.unit_price = unit_price
        supplier_return.total_value = total_value
        supplier_return.return_reason = data.get('returnReason')
        supplier_return.credit_note_issued = data.get('creditNoteIssued', False)
        supplier_return.credit_note_amount = float(data.get('creditNoteAmount', 0))
        supplier_return.status = data.get('status', 'pending')
        
        # Adjust stock if quantity changed
        if quantity != old_quantity:
            quantity_change = old_quantity - quantity  # Reverse the change
            success, result = update_product_stock(
                product_id=supplier_return.product_id,
                product_type=supplier_return.product_type,
                quantity_change=quantity_change,
                movement_type='supplier_return_adjustment',
                reference_id=supplier_return.id,
                reference_type='supplier_return',
                remarks=f"Return quantity adjusted: {old_quantity} -> {quantity}",
                user_id=user_id
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
    """Delete a supplier return"""
    try:
        supplier_return = SupplierReturn.query.get_or_404(id)
        
        # Restore stock before deleting
        success, result = update_product_stock(
            product_id=supplier_return.product_id,
            product_type=supplier_return.product_type,
            quantity_change=supplier_return.quantity,  # Positive to restore
            movement_type='supplier_return_cancellation',
            reference_id=supplier_return.id,
            reference_type='supplier_return',
            remarks=f"Supplier return cancelled: {supplier_return.description}",
            user_id=get_jwt_identity()
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
        
        # Update stock movement (decrease stock) when approved
        success, result = update_product_stock(
            product_id=supplier_return.product_id,
            product_type=supplier_return.product_type,
            quantity_change=-supplier_return.quantity,  # Negative for returns to supplier
            movement_type='supplier_return',
            reference_id=supplier_return.id,
            reference_type='supplier_return',
            remarks=f"Supplier return approved: {supplier_return.description}",
            user_id=user_id
        )
        
        if not success:
            return jsonify({"error": f"Stock update failed: {result}"}), 400
        
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
        
        # Reverse stock movement
        success, result = update_product_stock(
            product_id=supplier_return.product_id,
            product_type=supplier_return.product_type,
            quantity_change=-supplier_return.quantity,  # Positive to reverse
            movement_type='supplier_return_rejection',
            reference_id=supplier_return.id,
            reference_type='supplier_return',
            remarks=f"Return rejected: {data.get('rejectionReason', '')}",
            user_id=get_jwt_identity()
        )
        
        if not success:
            db.session.rollback()
            return jsonify({"error": f"Stock reversal failed: {result}"}), 400
        
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
            invoices.append({
                'id': sale.id,
                'invoiceNumber': sale.invoice_number,
                'date': sale.date.isoformat() if sale.date else None,
                'totalAmount': float(sale.total_amount) if sale.total_amount else 0,
                'paidAmount': float(sale.paid_amount) if sale.paid_amount else 0,
                'outstandingAmount': float(sale.total_amount) - float(sale.paid_amount or 0),
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
    purchases = Purchase.query.filter(
        Purchase.supplier_id == supplier_id,
        func.date(Purchase.date) >= from_dt.date(),
        func.date(Purchase.date) < to_dt.date(),
        Purchase.status.in_(['pending', 'approved', 'finalized', 'paid'])
    ).all()

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
    for purchase in purchases:
        entries.append({
            'date': to_datetime(purchase.date),
            'type': 'purchase',
            'invoiceNo': getattr(purchase, 'id', None),
            'description': 'Purchase Invoice',
            'purchaseInv': float(purchase.amount),
            'paid': 0,
            'creditAdj': 0,
            'discountAdj': 0,
            'balance': float(purchase.amount),
            'purchase_id': purchase.id
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
    # Optionally, add filters for active/outstanding only, etc.

    from datetime import datetime
    from_dt = datetime.strptime(from_date, "%Y-%m-%d") if from_date else None
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") if to_date else None

    suppliers = Supplier.query.all()
    result = []
    sl_no = 1
    for supplier in suppliers:
        # Purchases
        purchases_query = Purchase.query.filter(Purchase.supplier_id == supplier.id)
        if from_dt:
            purchases_query = purchases_query.filter(Purchase.date >= from_dt)
        if to_dt:
            purchases_query = purchases_query.filter(Purchase.date <= to_dt)
        total_purchase = sum(float(p.amount) for p in purchases_query)

        # Payments
        payments_query = SupplierPayment.query.filter(SupplierPayment.supplier_id == supplier.id)
        if from_dt:
            payments_query = payments_query.filter(SupplierPayment.payment_date >= from_dt.date())
        if to_dt:
            payments_query = payments_query.filter(SupplierPayment.payment_date <= to_dt.date())



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
            'quantity': int(row.quantity) if row.quantity else 0,
            'unitPrice': float(row.unit_price) if row.unit_price else 0,
            'totalAmount': float(row.item_total) if row.item_total else 0,
            'paymentStatus': row.invoice_payment_status.capitalize() if row.invoice_payment_status else '',
        })
    return jsonify(purchase_data)

@app.route('/api/reports/product-history', methods=['GET'])
@jwt_required()
def product_history_report():
    from datetime import datetime
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

    from_dt = datetime.strptime(from_date, "%Y-%m-%d") if from_date else None
    to_dt = datetime.strptime(to_date, "%Y-%m-%d") if to_date else None

    # Purchases
    purchases_query = (
        db.session.query(
            PurchaseInvoice.date,
            PurchaseInvoice.purchase_id,
            Purchase.supplier_name,
            PurchaseInvoiceItem.product_name,
            PurchaseInvoiceItem.quantity,
            PurchaseInvoiceItem.unit_price,
            PurchaseInvoiceItem.total_price
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
    purchases = purchases_query.all()
    purchases_data = [
        {
            'date': row.date.strftime('%Y-%m-%d') if row.date else '',
            'supplierName': row.supplier_name,
            'product': row.product_name,
            'quantity': int(row.quantity) if row.quantity else 0,
            'unitPrice': float(row.unit_price) if row.unit_price else 0,
            'total': float(row.total_price) if row.total_price else 0,
            'purchaseId': row.purchase_id
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
    supplier_returns = supplier_returns_query.all()
    supplier_returns_data = [
        {
            'date': r.date.strftime('%Y-%m-%d') if r.date else '',
            'invoice': r.invoice_number,
            'supplierName': r.supplier.supplier_name if r.supplier else '',
            'product': r.description,
            'quantity': r.quantity,
            'unitPrice': float(r.unit_price),
            'total': float(r.total_value)
        }
        for r in supplier_returns
    ]

    # Sales (join product tables for description)
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
            NonProduct.description.label('non_product_desc')
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
    sales_query = sales_query.filter(Sale.status == 'finalized')
    sales = sales_query.all()
    sales_data = [
        {
            'date': row.date.strftime('%Y-%m-%d') if row.date else '',
            'invoiceNo': row.invoice_number,
            'customerName': row.customer_name,
            'product': row.regular_product_desc or row.non_product_desc or '',
            'quantity': int(row.quantity) if row.quantity else 0,
            'unitPrice': float(row.unit_price) if row.unit_price else 0,
            'total': float(row.total_price) if row.total_price else 0
        }
        for row in sales
    ]

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
            'total': float(r.total_value)
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
            'totalQty': d.quantity
        })

    return jsonify({
        'purchases': purchases_data,
        'supplierReturns': supplier_returns_data,
        'sales': sales_data,
        'customerReturns': customer_returns_data,
        'dumps': dumps_data
    })

@app.route('/api/reports/prod-customer-history', methods=['GET'])
@jwt_required()
def prod_customer_history():
    from datetime import datetime
    from sqlalchemy import func, or_
    from models import Sale, SaleItem, Customer, RegularProduct, NonProduct

    customer_id = request.args.get('customerId', type=int)
    product_id = request.args.get('productId', type=int)
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
    data = []
    for idx, row in enumerate(results, 1):
        data.append({
            "slNo": idx,
            "product": row.product,
            "quantity": int(row.quantity) if row.quantity else 0,
            "avgPrice": float(row.avg_price) if row.avg_price else 0,
            "total": float(row.total) if row.total else 0
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
    if sales_type == 'Credit Sales':
        query = query.filter(Sale.customer_type.ilike('credit'))
    elif sales_type == 'Cash Sales':
        query = query.filter(Sale.customer_type.ilike('cash'))
    if search:
        query = query.join(Customer).filter(
            (Sale.invoice_number.ilike(f'%{search}%')) |
            (Customer.customer_name.ilike(f'%{search}%'))
        )

    sales = query.all()

    # Grouping logic
    def group_key(sale):
        if group_by == 'Monthly':
            return sale.date.strftime('%Y-%m')
        elif group_by == 'Weekly':
            return f"{sale.date.isocalendar()[0]}-W{sale.date.isocalendar()[1]:02d}"
        else:
            return sale.date.strftime('%Y-%m-%d')

    grouped = {}
    for sale in sales:
        key = group_key(sale)
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(sale)

    result = []
    sl_no = 1
    for group, group_sales in sorted(grouped.items()):
        total_sales = sum(float(s.total_amount) for s in group_sales)
        credit_sales = sum(float(s.total_amount) for s in group_sales if s.customer_type.lower() == 'credit')
        cash_sales = sum(float(s.total_amount) for s in group_sales if s.customer_type.lower() == 'cash')
        total_invoices = len(group_sales)
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
        top_customer = max(customer_counter.items(), key=lambda x: x[1])[0] if customer_counter else ''
        result.append({
            'id': sl_no,
            'date': group,
            'totalSales': total_sales,
            'creditSales': credit_sales,
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

    query = Sale.query.join(User, Sale.created_by == User.id).join(Customer, Sale.customer_id == Customer.id)
    query = query.filter(Sale.date >= from_dt, Sale.date < to_dt, Sale.status == 'finalized')
    if user and user != 'All':
        query = query.filter(User.username == user)
    if sale_type == 'Cash':
        query = query.filter(Sale.customer_type.ilike('cash'))
    elif sale_type == 'Credit':
        query = query.filter(Sale.customer_type.ilike('credit'))
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
        # Sum payments by mode for this sale
        cash_paid = sum(float(p.amount) for p in sale.payments if p.payment_mode and p.payment_mode.lower() == 'cash')
        credit_paid = sum(float(p.amount) for p in sale.payments if p.payment_mode and p.payment_mode.lower() == 'credit')
        result.append({
            'slNo': idx,
            'date': sale.date.strftime('%Y-%m-%d'),
            'user': sale.user.username if sale.user else '',  # changed from salesman
            'invoiceNo': sale.invoice_number,
            'customerName': sale.customer.customer_name if sale.customer else '',
            'credit': float(sale.total_amount) if sale.customer_type.lower() == 'credit' else 0,
            'crPaid': credit_paid,
            'cash': float(sale.total_amount) if sale.customer_type.lower() == 'cash' else 0
        })
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
        # Sales
        sales = db.session.query(func.sum(Sale.total_amount)).filter(
            Sale.date >= m_start, Sale.date < m_end, Sale.status == 'finalized'
        )
        if search:
            sales = sales.join(Customer).filter(Customer.customer_name.ilike(f'%{search}%'))
        sales = sales.scalar() or 0
        # Customer Returns
        returns = db.session.query(func.sum(CustomerReturn.total_value)).filter(
            CustomerReturn.date >= m_start, CustomerReturn.date < m_end
        )
        if search:
            returns = returns.join(Customer).filter(Customer.customer_name.ilike(f'%{search}%'))
        returns = returns.scalar() or 0
        net_sales = sales - returns
        # Purchases
        purchase = db.session.query(func.sum(Purchase.amount)).filter(
            Purchase.date >= m_start, Purchase.date < m_end
        )
        if search:
            purchase = purchase.join(Supplier).filter(Supplier.supplier_name.ilike(f'%{search}%'))
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
        results.append({
            'month': month_name(m_start),
            'year': year,
            'sales': round(sales, 2),
            'returns': round(returns, 2),
            'netSales': round(net_sales, 2),
            'purchase': round(purchase, 2),
            'returnsSup': round(returns_sup, 2),
            'dumps': round(dumps, 2),
            'netPurchase': round(net_purchase, 2),
            'expenses': round(expenses, 2),
            'diff': round(diff, 2)
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
        # Payment info (credit, balance, etc.)
        paid_amount = float(sale.paid_amount or 0)
        balance = float(sale.total_amount) - paid_amount
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
            'items': items,
            'paidAmount': paid_amount,
            'balance': balance,
            'notes': notes
        })
    except Exception as e:
        import traceback
        print('[ERROR] Exception in get_invoice_data:', str(e))
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/reports/profit-loss', methods=['GET'])
@jwt_required()
def profit_loss_report():
    from datetime import datetime, timedelta
    from models import (
        PurchaseInvoice, PurchaseInvoiceItem, Sale, SaleItem,
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
        # Purchases
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
        purchase_qty = purchase_qty or 0
        purchase_total = purchase_total or 0
        avg_purchase = (purchase_total / purchase_qty) if purchase_qty else 0

        # Sales
        sales_query = db.session.query(
            func.sum(SaleItem.quantity),
            func.sum(SaleItem.total_price)
        ).join(Sale, SaleItem.sale_id == Sale.id)
        if prod.type == 'regular':
            sales_query = sales_query.filter(SaleItem.product_id == prod.id)
        else:
            sales_query = sales_query.filter(SaleItem.non_product_id == prod.id)
        if from_dt:
            sales_query = sales_query.filter(Sale.date >= from_dt)
        if to_dt:
            sales_query = sales_query.filter(Sale.date < to_dt)
        sales_query = sales_query.filter(Sale.status == 'finalized')
        sales_qty, sales_total = sales_query.first()
        sales_qty = sales_qty or 0
        sales_total = sales_total or 0
        avg_sales = (sales_total / sales_qty) if sales_qty else 0

        # Profit/Loss
        avg_profit = avg_sales - avg_purchase
        tot_profit = sales_total - purchase_total
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
            'totSales': sales_total,
            'totProfit': tot_profit,
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
    from datetime import datetime
    from models import Sale, Payment, ExpenseEntry, SupplierPayment
    from sqlalchemy import func

    # Parse dates
    if not from_date:
        from_date = datetime.now().strftime('%Y-%m-%d')
    if not to_date:
        to_date = from_date
    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d")

    # On Account Customer Payments (sale_id is null)
    on_acc_customer_payments = (
        db.session.query(Payment.payment_mode, func.sum(Payment.amount))
        .filter(Payment.sale_id == None)
        .filter(Payment.payment_date >= from_dt.date(), Payment.payment_date <= to_dt.date())
        .group_by(Payment.payment_mode)
        .all()
    )
    on_acc_customer_by_mode = {mode.upper(): float(amount or 0) for mode, amount in on_acc_customer_payments}

    # On Account Supplier Payments (purchase_invoice_id is null)
    on_acc_supplier_payments = (
        db.session.query(SupplierPayment.payment_mode, func.sum(SupplierPayment.amount))
        .filter(SupplierPayment.purchase_invoice_id == None)
        .filter(SupplierPayment.payment_date >= from_dt.date(), SupplierPayment.payment_date <= to_dt.date())
        .group_by(SupplierPayment.payment_mode)
        .all()
    )
    on_acc_supplier_by_mode = {mode.upper(): float(amount or 0) for mode, amount in on_acc_supplier_payments}

    # ... rest of the daily accounts logic ...
    # Example: add these to receivables/payables
    receivables = [
        {"item": "On Account Cash", "amount": on_acc_customer_by_mode.get("CASH", 0)},
        {"item": "On Account Card", "amount": on_acc_customer_by_mode.get("CARD", 0)},
        {"item": "On Account Bank", "amount": on_acc_customer_by_mode.get("BANK", 0)},
        {"item": "On Account Cheque", "amount": on_acc_customer_by_mode.get("CHEQUE", 0)},
        # ... other receivables ...
    ]
    payables = [
        {"item": "On Account Supplier Cash", "amount": on_acc_supplier_by_mode.get("CASH", 0)},
        {"item": "On Account Supplier Card", "amount": on_acc_supplier_by_mode.get("CARD", 0)},
        {"item": "On Account Supplier Bank", "amount": on_acc_supplier_by_mode.get("BANK", 0)},
        {"item": "On Account Supplier Cheque", "amount": on_acc_supplier_by_mode.get("CHEQUE", 0)},
        # ... other payables ...
    ]
    # ... existing code to build and return the full daily accounts report ...

    # --- Receivables and Payables (On Account Payments) already built above ---

    # --- Banking Entries ---
    from models import BankingEntry, CashCarryForward, DumpEntry, CustomerReturn, SupplierReturn
    banking_entries = BankingEntry.query.filter(
        BankingEntry.date >= from_dt.date(),
        BankingEntry.date <= to_dt.date()
    ).all()
    banking = [b.to_dict() for b in banking_entries]

    # --- Cash Carry Forward ---
    cf = CashCarryForward.query.filter(
        CashCarryForward.date >= from_dt.date(),
        CashCarryForward.date <= to_dt.date()
    ).all()
    cf_total = sum(float(x.pounds or 0) + float(x.coins or 0) for x in cf)

    # --- Expenses ---
    expense_entries = ExpenseEntry.query.filter(
        ExpenseEntry.date >= from_dt.date(),
        ExpenseEntry.date <= to_dt.date()
    ).all()
    expenses = [e.to_dict() for e in expense_entries]
    expenses_total = sum(float(e.total_amount or 0) for e in expense_entries)

    # --- Dumps ---
    dump_entries = DumpEntry.query.filter(
        DumpEntry.date >= from_dt.date(),
        DumpEntry.date <= to_dt.date()
    ).all()
    dumps = [d.to_dict() for d in dump_entries]
    dumps_total = sum(float(d.total_value or 0) for d in dump_entries)

    # --- Customer Returns ---
    customer_returns = CustomerReturn.query.filter(
        CustomerReturn.date >= from_dt.date(),
        CustomerReturn.date <= to_dt.date()
    ).all()
    customer_returns_list = [cr.to_dict() for cr in customer_returns]
    customer_returns_total = sum(float(cr.total_value or 0) for cr in customer_returns)

    # --- Supplier Returns ---
    supplier_returns = SupplierReturn.query.filter(
        SupplierReturn.date >= from_dt.date(),
        SupplierReturn.date <= to_dt.date()
    ).all()
    supplier_returns_list = [sr.to_dict() for sr in supplier_returns]
    supplier_returns_total = sum(float(sr.total_value or 0) for sr in supplier_returns)

    # --- Totals and Balances (example, adjust as needed) ---
    actual_balance = cf_total + sum(r['amount'] for r in receivables) - sum(p['amount'] for p in payables)
    shortfall = actual_balance - expenses_total

    return jsonify({
        "receivablesCash": receivables,
        "receivablesOthers": [],
        "payablesCash": payables,
        "payablesOthers": [],
        "banking": banking,
        "cfTotal": cf_total,
        "actualBalance": actual_balance,
        "shortfall": shortfall,
        "expenses": expenses,
        "expensesTotal": expenses_total,
        "dumps": dumps,
        "dumpsTotal": dumps_total,
        "customerReturns": customer_returns_list,
        "customerReturnsTotal": customer_returns_total,
        "supplierReturns": supplier_returns_list,
        "supplierReturnsTotal": supplier_returns_total
    }), 200

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

@app.route('/api/banking', methods=['POST'])
@jwt_required()
def add_banking_entry():
    data = request.get_json()
    from datetime import datetime
    date_str = data.get('date')
    remarks = data.get('remarks', '')
    payment_type = data.get('paymentType', 'CASH')
    amount = data.get('amount', 0)
    # Use business date logic
    if date_str:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        business_date = get_business_date(date_obj)
    else:
        business_date = get_business_date()
    entry = BankingEntry(date=business_date, remarks=remarks, payment_type=payment_type, amount=amount)
    db.session.add(entry)
    db.session.commit()
    return entry.to_dict(), 201

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
        # Sales (Credit and Cash)
        credit_sales_query = Sale.query.filter(
            Sale.customer_id == customer.id,
            Sale.customer_type.ilike('credit'),
            Sale.status == 'confirmed'  # Only confirmed sales
        )
        cash_sales_query = Sale.query.filter(
            Sale.customer_id == customer.id,
            Sale.customer_type.ilike('cash'),
            Sale.status == 'confirmed'  # Only confirmed sales
        )
        
        if from_dt:
            credit_sales_query = credit_sales_query.filter(Sale.date >= from_dt)
            cash_sales_query = cash_sales_query.filter(Sale.date >= from_dt)
        if to_dt:
            credit_sales_query = credit_sales_query.filter(Sale.date <= to_dt)
            cash_sales_query = cash_sales_query.filter(Sale.date <= to_dt)
        
        credit_invoice = sum(float(s.total_amount) for s in credit_sales_query.all())
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
        
        # Balance Outstanding: (credit + cash) - payments - returns/discounts
        balance_outstanding = (credit_invoice + cash_invoice) - amount_received - returns_discount
        
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
            'creditInvoice': round(credit_invoice, 2),
            'cashInvoice': round(cash_invoice, 2),
            'amountReceived': round(amount_received, 2),
            'returnsDiscount': round(returns_discount, 2),
            'onAccount': round(on_account, 2),
            'balanceOutstanding': round(balance_outstanding, 2),
            'creditLimit': credit_limit,
            'currency': customer.customer_currency or 'GBP',
            'isBadDebt': is_bad_debt,
            'customerCode': customer.customer_code,
            'address': customer.address,
            'telephone': customer.telephone,
            'email': customer.email
        })
        sl_no += 1
    
    # Sort by customer name
    result.sort(key=lambda x: x['customerName'])
    
    # Calculate totals
    totals = {
        'creditInvoice': sum(item['creditInvoice'] for item in result),
        'cashInvoice': sum(item['cashInvoice'] for item in result),
        'amountReceived': sum(item['amountReceived'] for item in result),
        'returnsDiscount': sum(item['returnsDiscount'] for item in result),
        'onAccount': sum(item['onAccount'] for item in result),
        'balanceOutstanding': sum(item['balanceOutstanding'] for item in result)
    }
    
    # Group by currency
    currency_groups = {}
    for item in result:
        currency = item['currency']
        if currency not in currency_groups:
            currency_groups[currency] = []
        currency_groups[currency].append(item)
    
    # Calculate currency-wise totals
    currency_totals = {}
    for currency, items in currency_groups.items():
        currency_totals[currency] = {
            'creditInvoice': sum(item['creditInvoice'] for item in items),
            'cashInvoice': sum(item['cashInvoice'] for item in items),
            'amountReceived': sum(item['amountReceived'] for item in items),
            'returnsDiscount': sum(item['returnsDiscount'] for item in items),
            'onAccount': sum(item['onAccount'] for item in items),
            'balanceOutstanding': sum(item['balanceOutstanding'] for item in items)
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
    """Get all unique currencies used by customers"""
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
            # --- Get all confirmed sales up to as_of_dt ---
            sales = Sale.query.filter(
                Sale.customer_id == customer.id,
                Sale.status == 'confirmed',
                Sale.date <= as_of_dt
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
                outstanding = float(sale.total_amount) - paid - returned
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
            purchases = Purchase.query.filter(
                Purchase.supplier_id == supplier.id,
                Purchase.status == 'confirmed',
                Purchase.date <= as_of_dt
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

            for purchase in purchases:
                payments = SupplierPayment.query.filter(
                    SupplierPayment.supplier_id == supplier.id,
                    SupplierPayment.payment_date <= as_of_dt.date()
                ).all()
                paid = sum(float(p.amount) for p in payments)

                returns = SupplierReturn.query.filter(
                    SupplierReturn.supplier_id == supplier.id,
                    SupplierReturn.status == 'completed',
                    SupplierReturn.date <= as_of_dt.date()
                ).all()
                returned = sum(float(r.total_value) for r in returns)

                outstanding = float(purchase.amount) - paid - returned
                if outstanding <= 0:
                    continue

                days_overdue = (as_of_dt.date() - purchase.date.date()).days
                if days_overdue < 0:
                    days_overdue = 0

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

@app.route('/api/business-date', methods=['GET'])
def get_business_date_api():
    business_date = get_business_date()
    return jsonify({"businessDate": business_date.isoformat()})



if __name__ == '__main__':
    app.run(port=5000, debug=True) 