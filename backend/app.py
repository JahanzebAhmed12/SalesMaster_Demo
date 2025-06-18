from flask import Flask, request, jsonify, session
from flask_cors import CORS
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from models import db, User, Sale, Purchase, RegularProduct, NonProduct, Customer, Supplier, SystemSettings, Attendance, SaleItem, Company, Expense, Payroll, Payment
from schemas import (
    SaleSchema, PurchaseSchema, RegularProductSchema, NonProductSchema, CustomerSchema, SupplierSchema,
    SystemSettingsSchema, AttendanceSchema, CompanySchema, ExpenseSchema, PaymentSchema
)
from users import verify_password, create_admin_user
from werkzeug.security import generate_password_hash, check_password_hash
from flask_migrate import Migrate
from flask_jwt_extended import create_access_token, jwt_required, JWTManager, get_jwt_identity
from calendar import monthrange

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

        # Fetch customer by ID or name if needed, or assume customer_id is provided correctly
        customer = Customer.query.get(sale_data.customer_id)
        if not customer:
            return jsonify({"error": "Customer not found"}), 404

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
            status=sale_data.status
        )
        db.session.add(new_sale)
        db.session.commit()

        # Add sale items
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
def delete_sale(id):
    sale = Sale.query.get_or_404(id)
    try:
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
        purchase = Purchase(**purchase_data.dict())
        db.session.add(purchase)
        db.session.commit()
        return jsonify(purchase.to_dict())
    except Exception as e:
        return jsonify({'message': 'Invalid purchase data'}), 400

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

if __name__ == '__main__':
    app.run(port=5000, debug=True) 