from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, time
from decimal import Decimal

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    user_type = db.Column(db.String(20), nullable=False, default='user')
    status = db.Column(db.String(20), nullable=False, default='Active')
    email = db.Column(db.String(120), unique=True)
    phone = db.Column(db.String(20))
    daily_wage = db.Column(db.Numeric(10, 2))  # in pounds
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships with explicit foreign keys
    attendance_records = db.relationship('Attendance', backref='user', lazy=True, foreign_keys='Attendance.user_id')
    leaves = db.relationship('Leave', backref='user', lazy=True, foreign_keys='Leave.user_id')
    approved_leaves = db.relationship('Leave', backref='approver', lazy=True, foreign_keys='Leave.approved_by')

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'userType': self.user_type,
            'status': self.status,
            'email': self.email,
            'phone': self.phone,
            'dailyWage': float(self.daily_wage) if self.daily_wage else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class Sale(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    invoice_number = db.Column(db.String(50), nullable=False, unique=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    date = db.Column(db.DateTime, default=datetime.utcnow)
    customer_type = db.Column(db.String(20), default='credit')  # credit or cash
    payment_status = db.Column(db.String(20), default='pending')  # pending, paid, partial
    subtotal = db.Column(db.Numeric(10, 2), nullable=False)
    porterage = db.Column(db.Numeric(10, 2), default=0)
    vat_rate = db.Column(db.Numeric(5, 2), default=0)
    vat_amount = db.Column(db.Numeric(10, 2), default=0)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    paid_amount = db.Column(db.Numeric(10, 2), default=0)
    vehicle_details = db.Column(db.String(200))
    gate_number = db.Column(db.String(50))
    notes = db.Column(db.Text)
    status = db.Column(db.String(20), nullable=False, default='draft')  # draft, confirmed, cancelled
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))

    # Relationships
    customer = db.relationship('Customer', back_populates='sales')
    items = db.relationship('SaleItem', backref='sale', cascade='all, delete-orphan')
    user = db.relationship('User', backref='sales_created', foreign_keys=[created_by])

    def to_dict(self):
        return {
            'id': self.id,
            'invoiceNumber': self.invoice_number,
            'customerId': self.customer_id,
            'customerName': self.customer.customer_name if self.customer else None,
            'date': self.date.isoformat() if self.date else None,
            'customerType': self.customer_type,
            'paymentStatus': self.payment_status,
            'subtotal': float(self.subtotal),
            'porterage': float(self.porterage),
            'vatRate': float(self.vat_rate),
            'vatAmount': float(self.vat_amount),
            'totalAmount': float(self.total_amount),
            'paidAmount': float(self.paid_amount),
            'vehicleDetails': self.vehicle_details,
            'gateNumber': self.gate_number,
            'notes': self.notes,
            'status': self.status,
            'items': [item.to_dict() for item in self.items],
            'createdAt': self.created_at.isoformat(),
            'updatedAt': self.updated_at.isoformat()
        }

class SaleItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey('sale.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('regular_products.id'))
    non_product_id = db.Column(db.Integer, db.ForeignKey('non_products.id'))
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    total_price = db.Column(db.Numeric(10, 2), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    product = db.relationship('RegularProduct', backref='sale_items')
    non_product = db.relationship('NonProduct', backref='sale_items')

    def to_dict(self):
        return {
            'id': self.id,
            'saleId': self.sale_id,
            'productId': self.product_id,
            'nonProductId': self.non_product_id,
            'productName': self.product.description if self.product else self.non_product.description if self.non_product else None,
            'quantity': self.quantity,
            'unitPrice': float(self.unit_price),
            'totalPrice': float(self.total_price),
            'createdAt': self.created_at.isoformat(),
            'updatedAt': self.updated_at.isoformat()
        }

class Purchase(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=False)
    supplier_name = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    date = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), nullable=False, default='pending')

    # Relationship
    supplier = db.relationship('Supplier', back_populates='purchases')

    def to_dict(self):
        return {
            'id': self.id,
            'supplierId': self.supplier_id,
            'supplierName': self.supplier_name,
            'amount': float(self.amount),
            'date': self.date.isoformat() if self.date else None,
            'status': self.status
        }

class RegularProduct(db.Model):
    __tablename__ = 'regular_products'
    
    id = db.Column(db.Integer, primary_key=True)
    product_code = db.Column(db.String(50), unique=True, nullable=False)
    sage_code = db.Column(db.String(50))
    hs_code = db.Column(db.String(50))
    description = db.Column(db.String(200), nullable=False)
    selling_price = db.Column(db.Numeric(10, 2), default=0)
    tax_rate = db.Column(db.Numeric(5, 2), default=0)
    vat_code = db.Column(db.String(50))
    unit_of_purchase = db.Column(db.String(50))
    unit_of_sale = db.Column(db.String(50))
    location = db.Column(db.String(100))
    nominal_code = db.Column(db.String(50))
    stock_category = db.Column(db.String(50))
    department_number = db.Column(db.String(50))
    supplier_ref = db.Column(db.String(50))
    supplier_part_number = db.Column(db.String(50))
    reorder_level = db.Column(db.Integer, default=0)
    stock_level_flag = db.Column(db.Boolean, default=False)
    commodity_code = db.Column(db.String(50))
    unit_weight = db.Column(db.Numeric(10, 2), default=0)
    stock_take_date = db.Column(db.Date)
    reorder_quantity = db.Column(db.Integer, default=0)
    last_stock_take = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'productCode': self.product_code,
            'sageCode': self.sage_code,
            'hsCode': self.hs_code,
            'description': self.description,
            'sellingPrice': float(self.selling_price) if self.selling_price else 0,
            'taxRate': float(self.tax_rate) if self.tax_rate else 0,
            'vatCode': self.vat_code,
            'unitOfPurchase': self.unit_of_purchase,
            'unitOfSale': self.unit_of_sale,
            'location': self.location,
            'nominalCode': self.nominal_code,
            'stockCategory': self.stock_category,
            'departmentNumber': self.department_number,
            'supplierRef': self.supplier_ref,
            'supplierPartNumber': self.supplier_part_number,
            'reorderLevel': self.reorder_level,
            'stockLevelFlag': self.stock_level_flag,
            'commodityCode': self.commodity_code,
            'unitWeight': float(self.unit_weight) if self.unit_weight else 0,
            'stockTakeDate': self.stock_take_date.isoformat() if self.stock_take_date else None,
            'reorderQuantity': self.reorder_quantity,
            'lastStockTake': self.last_stock_take,
            'status': self.status,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class NonProduct(db.Model):
    __tablename__ = 'non_products'
    
    id = db.Column(db.Integer, primary_key=True)
    product_code = db.Column(db.String(50), unique=True, nullable=False)
    sage_code = db.Column(db.String(50))
    description = db.Column(db.String(200), nullable=False)
    selling_price = db.Column(db.Numeric(10, 2), default=0)
    tax_rate = db.Column(db.Numeric(5, 2), default=0)
    vat_code = db.Column(db.String(50))
    unit_of_purchase = db.Column(db.String(50))
    unit_of_sale = db.Column(db.String(50))
    location = db.Column(db.String(100))
    nominal_code = db.Column(db.String(50))
    stock_category = db.Column(db.String(50))
    department_number = db.Column(db.String(50))
    supplier_ref = db.Column(db.String(50))
    supplier_part_number = db.Column(db.String(50))
    reorder_level = db.Column(db.Integer, default=0)
    stock_level_flag = db.Column(db.Boolean, default=False)
    commodity_code = db.Column(db.String(50))
    unit_weight = db.Column(db.Numeric(10, 2), default=0)
    stock_take_date = db.Column(db.Date)
    reorder_quantity = db.Column(db.Integer, default=0)
    last_stock_take = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'productCode': self.product_code,
            'sageCode': self.sage_code,
            'description': self.description,
            'sellingPrice': float(self.selling_price) if self.selling_price else 0,
            'taxRate': float(self.tax_rate) if self.tax_rate else 0,
            'vatCode': self.vat_code,
            'unitOfPurchase': self.unit_of_purchase,
            'unitOfSale': self.unit_of_sale,
            'location': self.location,
            'nominalCode': self.nominal_code,
            'stockCategory': self.stock_category,
            'departmentNumber': self.department_number,
            'supplierRef': self.supplier_ref,
            'supplierPartNumber': self.supplier_part_number,
            'reorderLevel': self.reorder_level,
            'stockLevelFlag': self.stock_level_flag,
            'commodityCode': self.commodity_code,
            'unitWeight': float(self.unit_weight) if self.unit_weight else 0,
            'stockTakeDate': self.stock_take_date.isoformat() if self.stock_take_date else None,
            'reorderQuantity': self.reorder_quantity,
            'lastStockTake': self.last_stock_take,
            'status': self.status,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class Customer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    customer_code = db.Column(db.String(50), unique=True, nullable=False)
    sage_code = db.Column(db.String(50))
    customer_name = db.Column(db.String(100), nullable=False)
    address = db.Column(db.String(200))
    telephone = db.Column(db.String(20))
    fax = db.Column(db.String(20))
    email = db.Column(db.String(120))
    customer_city = db.Column(db.String(50))
    customer_country = db.Column(db.String(50))
    customer_currency = db.Column(db.String(3), default='GBP')
    remarks = db.Column(db.Text)
    own_branch = db.Column(db.String(3), default='no')
    vat_number = db.Column(db.String(20))
    credit_limit = db.Column(db.Numeric(12, 2), default=0)
    terms = db.Column(db.String(100))
    settlement_days = db.Column(db.Integer, default=0)
    settlement_discount = db.Column(db.Numeric(5, 2), default=0)
    web_address = db.Column(db.String(200))
    is_active = db.Column(db.String(3), default='yes')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    sales = db.relationship('Sale', back_populates='customer', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'customer_code': self.customer_code,
            'sage_code': self.sage_code,
            'customer_name': self.customer_name,
            'address': self.address,
            'telephone': self.telephone,
            'fax': self.fax,
            'email': self.email,
            'customer_city': self.customer_city,
            'customer_country': self.customer_country,
            'customer_currency': self.customer_currency,
            'remarks': self.remarks,
            'own_branch': self.own_branch,
            'vat_number': self.vat_number,
            'credit_limit': float(self.credit_limit) if self.credit_limit else None,
            'terms': self.terms,
            'settlement_days': self.settlement_days,
            'settlement_discount': float(self.settlement_discount) if self.settlement_discount else None,
            'web_address': self.web_address,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

class Payment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    sale_id = db.Column(db.Integer, db.ForeignKey('sale.id')) # Optional, for payments linked to specific invoices
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_mode = db.Column(db.String(50), nullable=False) # e.g., 'cash', 'card', 'bank transfer'
    payment_date = db.Column(db.Date, nullable=False)
    remarks = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = db.relationship('Customer', backref='payments')
    sale = db.relationship('Sale', backref='payments')

    def to_dict(self):
        return {
            'id': self.id,
            'customerId': self.customer_id,
            'saleId': self.sale_id,
            'amount': float(self.amount),
            'paymentMode': self.payment_mode,
            'paymentDate': self.payment_date.isoformat(),
            'remarks': self.remarks,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class Supplier(db.Model):
    __tablename__ = 'suppliers'
    
    id = db.Column(db.Integer, primary_key=True)
    supplier_code = db.Column(db.String(50), unique=True, nullable=False)
    sage_code = db.Column(db.String(50))
    supplier_name = db.Column(db.String(100), nullable=False)
    address = db.Column(db.Text)
    telephone = db.Column(db.String(20))
    fax = db.Column(db.String(20))
    email = db.Column(db.String(100))
    customer_country = db.Column(db.String(100))
    supplier_currency = db.Column(db.String(3), nullable=False)
    contact_no1 = db.Column(db.String(20))
    contact_no2 = db.Column(db.String(20))
    remarks = db.Column(db.Text)
    vat_number = db.Column(db.String(50))
    credit_limit = db.Column(db.Numeric(10, 2))
    terms = db.Column(db.String(100))
    web_address = db.Column(db.String(200))
    bank_name = db.Column(db.String(100))
    bank_address = db.Column(db.Text)
    bank_account_name = db.Column(db.String(100))
    sort_code = db.Column(db.String(20))
    account_no = db.Column(db.String(50))
    eec_group = db.Column(db.String(3), default='No')
    is_active = db.Column(db.String(3), default='Yes')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    purchases = db.relationship('Purchase', back_populates='supplier', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'supplier_code': self.supplier_code,
            'sage_code': self.sage_code,
            'supplier_name': self.supplier_name,
            'address': self.address,
            'telephone': self.telephone,
            'fax': self.fax,
            'email': self.email,
            'customer_country': self.customer_country,
            'supplier_currency': self.supplier_currency,
            'contact_no1': self.contact_no1,
            'contact_no2': self.contact_no2,
            'remarks': self.remarks,
            'vat_number': self.vat_number,
            'credit_limit': float(self.credit_limit) if self.credit_limit is not None else None,
            'terms': self.terms,
            'web_address': self.web_address,
            'bank_name': self.bank_name,
            'bank_address': self.bank_address,
            'bank_account_name': self.bank_account_name,
            'sort_code': self.sort_code,
            'account_no': self.account_no,
            'eec_group': self.eec_group,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

class SystemSettings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    closing_time = db.Column(db.Time, nullable=False, default=time(23, 59))
    timezone = db.Column(db.String(50), nullable=False, default='Europe/London')
    auto_date_switch = db.Column(db.Boolean, nullable=False, default=True)
    weekend_handling = db.Column(db.String(20), nullable=False, default='skip')
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'closingTime': self.closing_time.strftime('%H:%M'),
            'timezone': self.timezone,
            'autoDateSwitch': self.auto_date_switch,
            'weekendHandling': self.weekend_handling,
            'updatedAt': self.updated_at.isoformat()
        }

class Attendance(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), nullable=False)  # 'present', 'absent', 'leave', 'holiday'
    check_in = db.Column(db.DateTime)
    check_out = db.Column(db.DateTime)
    regular_hours = db.Column(db.Numeric(5, 2))
    overtime_hours = db.Column(db.Numeric(5, 2))
    notes = db.Column(db.String(200))
    leave_type = db.Column(db.String(20))  # 'annual', 'sick', 'unpaid', 'other'
    holiday_name = db.Column(db.String(100))  # Name of the holiday if status is 'holiday'
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'date': self.date.isoformat(),
            'status': self.status,
            'checkIn': self.check_in.isoformat() if self.check_in else None,
            'checkOut': self.check_out.isoformat() if self.check_out else None,
            'regularHours': float(self.regular_hours) if self.regular_hours else None,
            'overtimeHours': float(self.overtime_hours) if self.overtime_hours else None,
            'notes': self.notes,
            'leaveType': self.leave_type,
            'holidayName': self.holiday_name,
            'createdAt': self.created_at.isoformat(),
            'updatedAt': self.updated_at.isoformat()
        }

class Leave(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    type = db.Column(db.String(20), nullable=False)  # 'annual', 'sick', 'unpaid', 'other'
    status = db.Column(db.String(20), nullable=False, default='pending')  # 'pending', 'approved', 'rejected'
    reason = db.Column(db.String(200), nullable=False)
    approved_by = db.Column(db.Integer, db.ForeignKey('user.id'))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'startDate': self.start_date.isoformat(),
            'endDate': self.end_date.isoformat(),
            'type': self.type,
            'status': self.status,
            'reason': self.reason,
            'approvedBy': self.approved_by,
            'createdAt': self.created_at.isoformat(),
            'updatedAt': self.updated_at.isoformat()
        }

class Payroll(db.Model):
    __tablename__ = 'payroll'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    month = db.Column(db.Integer, nullable=False)
    working_days = db.Column(db.Integer, nullable=False)
    daily_wage = db.Column(db.Numeric(10, 2), nullable=False)
    gross_pay = db.Column(db.Numeric(10, 2), nullable=False)
    tax = db.Column(db.Numeric(10, 2), nullable=False)
    national_insurance = db.Column(db.Numeric(10, 2), nullable=False)
    net_pay = db.Column(db.Numeric(10, 2), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='pending')
    payment_date = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Define the relationship to User
    user = db.relationship('User', backref=db.backref('payroll_records', lazy=True))

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'year': self.year,
            'month': self.month,
            'workingDays': self.working_days,
            'dailyWage': float(self.daily_wage),
            'grossPay': float(self.gross_pay),
            'tax': float(self.tax),
            'nationalInsurance': float(self.national_insurance),
            'netPay': float(self.net_pay),
            'status': self.status,
            'paymentDate': self.payment_date.isoformat() if self.payment_date else None,
            'notes': self.notes,
            'createdAt': self.created_at.isoformat(),
            'updatedAt': self.updated_at.isoformat()
        }

class Expense(db.Model):
    __tablename__ = 'expenses'
    
    id = db.Column(db.Integer, primary_key=True)
    expense_code = db.Column(db.String(50), unique=True, nullable=False)
    sage_code = db.Column(db.String(50))
    expense_name = db.Column(db.String(100), nullable=False)
    is_active = db.Column(db.String(3), default='Yes')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'expenseCode': self.expense_code,
            'sageCode': self.sage_code,
            'expenseName': self.expense_name,
            'isActive': self.is_active,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class Company(db.Model):
    __tablename__ = 'companies'

    id = db.Column(db.Integer, primary_key=True)
    companyName = db.Column(db.String(100), nullable=False)
    address1 = db.Column(db.String(200), nullable=False)
    address2 = db.Column(db.String(200))
    telephone = db.Column(db.String(20))
    mobile = db.Column(db.String(20))
    fax = db.Column(db.String(20))
    website = db.Column(db.String(100))
    email = db.Column(db.String(100))
    vatNo = db.Column(db.String(20))
    compRegNo = db.Column(db.String(20))
    bankDetails = db.Column(db.Text)
    einlNumber = db.Column(db.String(20))
    remarks = db.Column(db.Text)
    createdAt = db.Column(db.DateTime, default=datetime.utcnow)
    updatedAt = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'companyName': self.companyName,
            'address1': self.address1,
            'address2': self.address2,
            'telephone': self.telephone,
            'mobile': self.mobile,
            'fax': self.fax,
            'website': self.website,
            'email': self.email,
            'vatNo': self.vatNo,
            'compRegNo': self.compRegNo,
            'bankDetails': self.bankDetails,
            'einlNumber': self.einlNumber,
            'remarks': self.remarks,
            'createdAt': self.createdAt.isoformat() if self.createdAt else None,
            'updatedAt': self.updatedAt.isoformat() if self.updatedAt else None
        } 