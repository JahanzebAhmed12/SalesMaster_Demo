from flask import Flask, request, jsonify, session
from flask_cors import CORS
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from models import db, User, Sale, Purchase, RegularProduct, NonProduct, Customer, Supplier, SystemSettings, Attendance, SaleItem, Company, Expense, Payroll, Payment, PurchaseInvoice, PurchaseInvoiceItem, SupplierPayment
from schemas import (
    SaleSchema, PurchaseSchema, RegularProductSchema, NonProductSchema, CustomerSchema, SupplierSchema,
    SystemSettingsSchema, AttendanceSchema, CompanySchema, ExpenseSchema, PaymentSchema, SupplierPaymentSchema
)
from users import verify_password, create_admin_user
from werkzeug.security import generate_password_hash, check_password_hash
from flask_migrate import Migrate
from flask_jwt_extended import create_access_token, jwt_required, JWTManager, get_jwt_identity
from calendar import monthrange
from sqlalchemy import func, or_

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
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///salesmaster.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
db.init_app(app)
migrate = Migrate(app, db)

# Create database tables
with app.app_context():
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

@app.route('/api/sales', methods=['POST'])
@jwt_required()
def create_sale():
    try:
        data = request.get_json()
        sale_data = SaleSchema(**data)
        customer = Customer.query.get(sale_data.customer_id)
        if not customer:
            return jsonify({"error": "Customer not found"}), 404
        user_id = get_jwt_identity()
        new_sale = Sale(
            invoice_number=sale_data.invoice_number,
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
            created_by=user_id
        )
        db.session.add(new_sale)
        db.session.commit()
        for item_data in sale_data.items:
            new_item = SaleItem(
                sale_id=new_sale.id,
                product_id=item_data.product_id,
                non_product_id=item_data.non_product_id,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                total_price=item_data.total_price
            )
            db.session.add(new_item)
        db.session.commit()
        return jsonify(new_sale.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

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
        
        # Update sale fields
        for key, value in sale_data.dict(exclude={'items'}).items():
            setattr(sale, key, value)
        
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
        
        purchase = Purchase(
            supplier_id=purchase_data.supplier_id,
            supplier_name=supplier.supplier_name,
            amount=purchase_data.amount,
            date=datetime.strptime(purchase_data.invoice_date, "%Y-%m-%d") if purchase_data.invoice_date else datetime.utcnow(),
            status='pending'
        )
        db.session.add(purchase)
        db.session.commit()
        return jsonify(purchase.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Invalid purchase data: {str(e)}'}), 400

@app.route('/api/purchases/<int:id>', methods=['GET'])
def get_purchase(id):
    try:
        purchase = Purchase.query.get_or_404(id)
        return jsonify(purchase.to_dict())
    except Exception as e:
        return jsonify({'message': str(e)}), 404

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
            'status': data.get('status', 'active')
        }
        
        # Validate the data using the schema
        validated_data = RegularProductSchema(**product_data)
        print("Validated product data:", validated_data.dict())  # Debug log
        
        # Create the product
        product = RegularProduct(**validated_data.dict())
        db.session.add(product)
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
            'status': data.get('status', 'active')
        }
        
        # Validate the data using the schema
        validated_data = NonProductSchema(**non_product_data)
        print("Validated non-product data:", validated_data.dict())  # Debug log
        
        # Create the non-product
        non_product = NonProduct(**validated_data.dict())
        db.session.add(non_product)
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
        sales = Sale.query.all()
        purchases = Purchase.query.all()
        regular_products = RegularProduct.query.all()
        non_products = NonProduct.query.all()
        
        today = datetime.now().date()
        today_sales = sum(sale.amount for sale in sales if sale.date.date() == today)
        total_purchases = sum(purchase.amount for purchase in purchases)
        total_sales = sum(sale.amount for sale in sales)
        profit_margin = ((total_sales - total_purchases) / total_sales * 100) if total_sales > 0 else 0
        
        return jsonify({
            'todaySales': today_sales,
            'totalPurchases': total_purchases,
            'profitMargin': profit_margin,
            'stockItems': len(regular_products) + len(non_products),
            'recentTransactions': [sale.to_dict() for sale in sales[-5:]]
        })
    except Exception as e:
        return jsonify({'message': 'Failed to fetch dashboard stats'}), 500

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
            sum(sale.amount for sale in sales if sale.date.date() == day)
            for day in last_7_days
        ]
        
        purchases_by_day = [
            sum(purchase.amount for purchase in purchases if purchase.date.date() == day)
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
        return jsonify({'message': 'Failed to fetch chart data'}), 500

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
    try:
        settings_data = SystemSettingsSchema(**data)
        settings = SystemSettings.query.first()
        if not settings:
            settings = SystemSettings()
            db.session.add(settings)
        
        for key, value in settings_data.dict().items():
            setattr(settings, key, value)
        
        db.session.commit()
        return jsonify(settings.to_dict())
    except Exception as e:
        return jsonify({'message': 'Invalid settings data'}), 400

# Attendance routes
@app.route('/api/attendance', methods=['GET'])
def get_attendance():
    attendance_records = Attendance.query.all()
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
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    employee_id = request.args.get('employeeId', type=int)
    
    if not year or not month:
        return jsonify({'error': 'Year and month are required'}), 400
    
    # Get date range for the month
    start_date = datetime(year, month, 1)
    if month == 12:
        end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = datetime(year, month + 1, 1) - timedelta(days=1)
    
    # Get users (filter by employee_id if provided)
    query = User.query
    if employee_id:
        query = query.filter(User.id == employee_id)
    users = query.all()
    
    result = []
    for user in users:
        # Get attendance records for the user in the specified month
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
        
        # Calculate working days (all days)
        working_days = (end_date - start_date).days + 1
        
        # Calculate attendance percentage
        attendance_percentage = (present_days / working_days) * 100 if working_days > 0 else 0
        
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

        # Fetch sales where total_amount > paid_amount and status is finalized
        outstanding_sales = Sale.query.filter(
            Sale.customer_id == customer_id,
            Sale.status == 'finalized',
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
    if from_date:
        query = query.filter(func.date(Sale.date) >= from_date)
    if to_date:
        query = query.filter(func.date(Sale.date) <= to_date)
    if payment_type and payment_type != 'All':
        pass  # We'll filter by payment mode after fetching sales
    if salesman and salesman != 'all':
        query = query.filter(User.username == salesman)
    if search:
        query = query.join(Customer).filter(
            (Sale.invoice_number.ilike(f'%{search}%')) |
            (Customer.customer_name.ilike(f'%{search}%'))
        )
    # Only show finalized and paid sales
    query = query.filter(Sale.status == 'finalized')
    query = query.filter(Sale.paid_amount > 0)
    sales = query.order_by(Sale.date.desc()).all()
    result = []
    for idx, sale in enumerate(sales, 1):
        boxes = sum(item.quantity for item in sale.items)
        # Sum payments by mode for this sale
        cash_paid = sum(float(p.amount) for p in sale.payments if p.payment_mode and p.payment_mode.lower() == 'cash')
        credit_paid = sum(float(p.amount) for p in sale.payments if p.payment_mode and p.payment_mode.lower() == 'credit')
        result.append({
            'id': sale.id,
            'slNo': idx,
            'date': sale.date.strftime('%Y-%m-%d'),
            'salesman': sale.user.username if sale.user else '',
            'boxes': boxes,
            'invoiceNo': sale.invoice_number,
            'customerName': sale.customer.customer_name if sale.customer else '',
            'vat': float(sale.vat_amount),
            'credit': credit_paid,
            'cash': cash_paid,
        })
    # Filter result by actual payment mode if needed
    if payment_type and payment_type != 'All':
        payment_type_lower = payment_type.lower()
        filtered_result = []
        for entry, sale in zip(result, sales):
            if any(p.payment_mode and p.payment_mode.lower() == payment_type_lower for p in sale.payments):
                filtered_result.append(entry)
        result = filtered_result
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

    from datetime import datetime
    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d")

    # Fetch sales and payments for this customer in the date range
    sales = Sale.query.filter(
        Sale.customer_id == customer_id,
        Sale.date >= from_dt,
        Sale.date <= to_dt,
        Sale.status == 'finalized'
    ).all()
    payments = Payment.query.filter(
        Payment.customer_id == customer_id,
        Payment.payment_date >= from_dt.date(),
        Payment.payment_date <= to_dt.date()
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

    from datetime import datetime
    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d")

    # Fetch sales for this customer in the date range
    sales_query = Sale.query.filter(
        Sale.customer_id == customer_id,
        Sale.date >= from_dt,
        Sale.date <= to_dt,
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
@jwt_required()
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
        try:
            from_dt = datetime.strptime(from_date, "%Y-%m-%d")
            query = query.filter(Sale.date >= from_dt)
        except Exception:
            pass
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, "%Y-%m-%d")
            query = query.filter(Sale.date <= to_dt)
        except Exception:
            pass
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
    invoice = PurchaseInvoice(
        purchase_id=data['purchaseId'],
        remarks=data.get('remarks')
    )
    db.session.add(invoice)
    db.session.commit()
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

if __name__ == '__main__':
    app.run(port=5000, debug=True) 