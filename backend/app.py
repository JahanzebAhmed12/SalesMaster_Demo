from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from models import db, User, Sale, Purchase, RegularProduct, NonProduct, Customer, Supplier, SystemSettings, Attendance, SaleItem, Company, Expense
from schemas import (
    SaleSchema, PurchaseSchema, RegularProductSchema, NonProductSchema, CustomerSchema, SupplierSchema,
    SystemSettingsSchema, AttendanceSchema, CompanySchema, ExpenseSchema
)
from users import verify_password

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Configure CORS
CORS(app, 
     resources={r"/api/*": {
         "origins": ["http://localhost:5173"],
         "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         "allow_headers": ["Content-Type"],
         "supports_credentials": True
     }})

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///salesmaster.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
db.init_app(app)

# Create database tables
with app.app_context():
    db.create_all()

# Auth routes
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    print("Login attempt with data:", data)  # Debug log
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        print("Missing username or password")  # Debug log
        return jsonify({'message': 'Username and password are required'}), 400
    
    user = verify_password(username, password)
    print("User found:", user)  # Debug log
    
    if not user:
        print("Invalid credentials")  # Debug log
        return jsonify({'message': 'Invalid username or password'}), 401
    
    response_data = {
        'user': {
            'id': user['id'],
            'username': user['username'],
            'role': user['role']
        }
    }
    print("Login successful, returning:", response_data)  # Debug log
    return jsonify(response_data)

# Sales routes
@app.route('/api/sales', methods=['GET'])
def get_sales():
    sales = Sale.query.all()
    return jsonify([sale.to_dict() for sale in sales])

@app.route('/api/sales', methods=['POST'])
def create_sale():
    data = request.get_json()
    try:
        sale_data = SaleSchema(**data)
        
        # Create the sale
        sale = Sale(
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
        
        # Add sale items
        for item_data in sale_data.items:
            sale_item = SaleItem(
                product_id=item_data.product_id,
                non_product_id=item_data.non_product_id,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                total_price=item_data.total_price
            )
            sale.items.append(sale_item)
        
        db.session.add(sale)
        db.session.commit()
        return jsonify(sale.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 400

@app.route('/api/sales/<int:id>', methods=['GET'])
def get_sale(id):
    sale = Sale.query.get_or_404(id)
    return jsonify(sale.to_dict())

@app.route('/api/sales/<int:id>', methods=['PUT'])
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

@app.route('/api/products/regular', methods=['GET'])
def get_regular_products():
    try:
        products = RegularProduct.query.all()
        return jsonify([product.to_dict() for product in products])
    except Exception as e:
        return jsonify({'message': str(e)}), 500

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
@app.route('/api/products/non', methods=['GET'])
def get_non_products():
    try:
        products = NonProduct.query.all()
        return jsonify([product.to_dict() for product in products])
    except Exception as e:
        return jsonify({'message': str(e)}), 500

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
    customers = Customer.query.all()
    return jsonify([customer.to_dict() for customer in customers])

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

if __name__ == '__main__':
    app.run(port=5000, debug=True) 