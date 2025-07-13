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
    customer_type = db.Column(db.String(20), default='account')  # account or cash
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
            'updatedAt': self.updated_at.isoformat(),
            'createdBy': self.created_by,
            'createdByUsername': self.user.username if self.user else None
        }

class SaleItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey('sale.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('regular_products.id'))
    non_product_id = db.Column(db.Integer, db.ForeignKey('non_products.id'))
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    total_price = db.Column(db.Numeric(10, 2), nullable=False)
    notes = db.Column(db.Text)  # Notes for the product item
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
            'notes': self.notes,
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
    # Stock tracking fields
    initial_stock = db.Column(db.Integer, default=0)
    current_stock = db.Column(db.Integer, default=0)
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
            'initialStock': self.initial_stock,
            'currentStock': self.current_stock,
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
    # Stock tracking fields
    initial_stock = db.Column(db.Integer, default=0)
    current_stock = db.Column(db.Integer, default=0)
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
            'initialStock': self.initial_stock,
            'currentStock': self.current_stock,
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
    show_outstanding_balance = db.Column(db.Boolean, nullable=False, default=True)
    invoice_footer = db.Column(db.String(255), nullable=False, default='NO COMPLAINTS OR RETURN')
    delivery_note_with_price = db.Column(db.Boolean, nullable=False, default=False)
    delivery_note_name_or_code = db.Column(db.String(10), nullable=False, default='name')
    delivery_acknowledgement = db.Column(db.Boolean, nullable=False, default=False)
    show_profit = db.Column(db.Boolean, nullable=False, default=True)
    # Porterage configuration
    with_porterage = db.Column(db.Boolean, nullable=False, default=False)
    porterage_charge = db.Column(db.Numeric(10, 2), nullable=False, default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'closingTime': self.closing_time.strftime('%H:%M'),
            'timezone': self.timezone,
            'autoDateSwitch': self.auto_date_switch,
            'weekendHandling': self.weekend_handling,
            'updatedAt': self.updated_at.isoformat(),
            'showOutstandingBalance': self.show_outstanding_balance,
            'invoiceFooter': self.invoice_footer,
            'deliveryNoteWithPrice': self.delivery_note_with_price,
            'deliveryNoteNameOrCode': self.delivery_note_name_or_code,
            'deliveryAcknowledgement': self.delivery_acknowledgement,
            'showProfit': self.show_profit,
            'withPorterage': self.with_porterage,
            'porterageCharge': float(self.porterage_charge) if self.porterage_charge else 0
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

class PurchaseInvoice(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    purchase_id = db.Column(db.Integer, db.ForeignKey('purchase.id'), nullable=False)
    date = db.Column(db.DateTime, default=datetime.utcnow)
    remarks = db.Column(db.String(255))
    paid_amount = db.Column(db.Numeric(10, 2), default=0)
    payment_status = db.Column(db.String(20), default='pending')  # pending, partial, paid
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    items = db.relationship('PurchaseInvoiceItem', backref='invoice', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'purchaseId': self.purchase_id,
            'date': self.date.isoformat() if self.date else None,
            'remarks': self.remarks,
            'paidAmount': float(self.paid_amount),
            'paymentStatus': self.payment_status,
            'items': [item.to_dict() for item in self.items],
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class PurchaseInvoiceItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.Integer, db.ForeignKey('purchase_invoice.id'), nullable=False)
    product_id = db.Column(db.Integer, nullable=False)
    product_name = db.Column(db.String(255))
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    total_price = db.Column(db.Numeric(10, 2), nullable=False)
    remarks = db.Column(db.Text)

    def to_dict(self):
        return {
            'id': self.id,
            'invoiceId': self.invoice_id,
            'productId': self.product_id,
            'productName': self.product_name,
            'quantity': self.quantity,
            'unitPrice': float(self.unit_price),
            'totalPrice': float(self.total_price),
            'remarks': self.remarks
        }

class SupplierPayment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=False)
    purchase_invoice_id = db.Column(db.Integer, db.ForeignKey('purchase_invoice.id')) # Optional, for payments linked to specific invoices
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_mode = db.Column(db.String(50), nullable=False) # e.g., 'cash', 'card', 'bank transfer'
    payment_date = db.Column(db.Date, nullable=False)
    remarks = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    supplier = db.relationship('Supplier', backref='supplier_payments')
    purchase_invoice = db.relationship('PurchaseInvoice', backref='payments')

    def to_dict(self):
        return {
            'id': self.id,
            'supplierId': self.supplier_id,
            'purchaseInvoiceId': self.purchase_invoice_id,
            'amount': float(self.amount),
            'paymentMode': self.payment_mode,
            'paymentDate': self.payment_date.isoformat(),
            'remarks': self.remarks,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class StockMovement(db.Model):
    """Tracks all stock movements (sales, purchases, adjustments)"""
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, nullable=False)  # ID of the product (regular or non)
    product_type = db.Column(db.String(20), nullable=False)  # 'regular' or 'non'
    movement_type = db.Column(db.String(20), nullable=False)  # 'sale', 'purchase', 'adjustment', 'return'
    quantity = db.Column(db.Integer, nullable=False)  # Positive for additions, negative for reductions
    reference_id = db.Column(db.Integer)  # ID of the related sale, purchase, or adjustment
    reference_type = db.Column(db.String(20))  # 'sale', 'purchase', 'adjustment'
    previous_stock = db.Column(db.Integer, nullable=False)
    new_stock = db.Column(db.Integer, nullable=False)
    remarks = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))

    def to_dict(self):
        return {
            'id': self.id,
            'productId': self.product_id,
            'productType': self.product_type,
            'movementType': self.movement_type,
            'quantity': self.quantity,
            'referenceId': self.reference_id,
            'referenceType': self.reference_type,
            'previousStock': self.previous_stock,
            'newStock': self.new_stock,
            'remarks': self.remarks,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'createdBy': self.created_by
        }

class StockAdjustment(db.Model):
    """Manual stock adjustments"""
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, nullable=False)
    product_type = db.Column(db.String(20), nullable=False)  # 'regular' or 'non'
    adjustment_type = db.Column(db.String(20), nullable=False)  # 'increase', 'decrease', 'set'
    quantity = db.Column(db.Integer, nullable=False)
    previous_stock = db.Column(db.Integer, nullable=False)
    new_stock = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.String(200), nullable=False)
    remarks = db.Column(db.Text)
    adjustment_date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))

    def to_dict(self):
        return {
            'id': self.id,
            'productId': self.product_id,
            'productType': self.product_type,
            'adjustmentType': self.adjustment_type,
            'quantity': self.quantity,
            'previousStock': self.previous_stock,
            'newStock': self.new_stock,
            'reason': self.reason,
            'remarks': self.remarks,
            'adjustmentDate': self.adjustment_date.isoformat() if self.adjustment_date else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'createdBy': self.created_by
        }

class ExpenseEntry(db.Model):
    """Tracks actual expense transactions"""
    id = db.Column(db.Integer, primary_key=True)
    ref_number = db.Column(db.String(50), unique=True, nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'))
    expense_id = db.Column(db.Integer, db.ForeignKey('expenses.id'), nullable=False)
    description = db.Column(db.String(200), nullable=False)
    invoice_number = db.Column(db.String(50))
    remarks = db.Column(db.Text)
    payment_mode = db.Column(db.String(20), nullable=False, default='CASH')  # CASH, CARD, BANK, CHEQUE
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    vat_amount = db.Column(db.Numeric(10, 2), default=0)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))

    # Relationships
    supplier = db.relationship('Supplier', backref='expense_entries')
    expense_category = db.relationship('Expense', backref='expense_entries')
    user = db.relationship('User', backref='expense_entries_created', foreign_keys=[created_by])

    def to_dict(self):
        return {
            'id': self.id,
            'refNumber': self.ref_number,
            'date': self.date.isoformat() if self.date else None,
            'supplierId': self.supplier_id,
            'supplierName': self.supplier.supplier_name if self.supplier else None,
            'expenseId': self.expense_id,
            'expenseName': self.expense_category.expense_name if self.expense_category else None,
            'description': self.description,
            'invoiceNumber': self.invoice_number,
            'remarks': self.remarks,
            'paymentMode': self.payment_mode,
            'amount': float(self.amount) if self.amount else 0,
            'vatAmount': float(self.vat_amount) if self.vat_amount else 0,
            'totalAmount': float(self.total_amount) if self.total_amount else 0,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'createdBy': self.created_by
        }

class DumpEntry(db.Model):
    """Tracks dump/wastage transactions"""
    id = db.Column(db.Integer, primary_key=True)
    ref_number = db.Column(db.String(50), unique=True, nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'))
    product_id = db.Column(db.Integer, nullable=False)  # ID of the product being dumped
    product_type = db.Column(db.String(20), nullable=False)  # 'regular' or 'non'
    description = db.Column(db.String(200), nullable=False)
    remarks = db.Column(db.Text)
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), default=0)
    total_value = db.Column(db.Numeric(10, 2), default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))

    # Relationships
    supplier = db.relationship('Supplier', backref='dump_entries')
    user = db.relationship('User', backref='dump_entries_created', foreign_keys=[created_by])

    def to_dict(self):
        return {
            'id': self.id,
            'refNumber': self.ref_number,
            'date': self.date.isoformat() if self.date else None,
            'supplierId': self.supplier_id,
            'supplierName': self.supplier.supplier_name if self.supplier else None,
            'productId': self.product_id,
            'productType': self.product_type,
            'description': self.description,
            'remarks': self.remarks,
            'quantity': self.quantity,
            'unitPrice': float(self.unit_price) if self.unit_price else 0,
            'totalValue': float(self.total_value) if self.total_value else 0,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'createdBy': self.created_by
        }

class CustomerReturn(db.Model):
    """Tracks customer returns"""
    id = db.Column(db.Integer, primary_key=True)
    ref_number = db.Column(db.String(50), unique=True, nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    sale_id = db.Column(db.Integer, db.ForeignKey('sale.id'))  # Optional, link to original sale
    product_id = db.Column(db.Integer, nullable=False)  # ID of the product being returned
    product_type = db.Column(db.String(20), nullable=False)  # 'regular' or 'non'
    description = db.Column(db.String(200), nullable=False)
    invoice_number = db.Column(db.String(50))  # Original invoice number
    remarks = db.Column(db.Text)
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), default=0)
    total_value = db.Column(db.Numeric(10, 2), default=0)
    return_reason = db.Column(db.String(100))  # e.g., 'damaged', 'wrong item', 'customer request'
    credit_note_issued = db.Column(db.Boolean, default=False)
    credit_note_amount = db.Column(db.Numeric(10, 2), default=0)
    status = db.Column(db.String(20), default='pending')  # 'pending', 'approved', 'rejected', 'completed'
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))

    # Relationships
    customer = db.relationship('Customer', backref='returns')
    sale = db.relationship('Sale', backref='returns')
    user = db.relationship('User', backref='customer_returns_created', foreign_keys=[created_by])

    def to_dict(self):
        return {
            'id': self.id,
            'refNumber': self.ref_number,
            'date': self.date.isoformat() if self.date else None,
            'customerId': self.customer_id,
            'customerName': self.customer.customer_name if self.customer else None,
            'saleId': self.sale_id,
            'productId': self.product_id,
            'productType': self.product_type,
            'description': self.description,
            'invoiceNumber': self.invoice_number,
            'remarks': self.remarks,
            'quantity': self.quantity,
            'unitPrice': float(self.unit_price) if self.unit_price else 0,
            'totalValue': float(self.total_value) if self.total_value else 0,
            'returnReason': self.return_reason,
            'creditNoteIssued': self.credit_note_issued,
            'creditNoteAmount': float(self.credit_note_amount) if self.credit_note_amount else 0,
            'status': self.status,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'createdBy': self.created_by
        }

class SupplierReturn(db.Model):
    """Tracks supplier returns"""
    id = db.Column(db.Integer, primary_key=True)
    ref_number = db.Column(db.String(50), unique=True, nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=False)
    purchase_invoice_id = db.Column(db.Integer, db.ForeignKey('purchase_invoice.id'))  # Optional, link to original purchase
    product_id = db.Column(db.Integer, nullable=False)  # ID of the product being returned
    product_type = db.Column(db.String(20), nullable=False)  # 'regular' or 'non'
    description = db.Column(db.String(200), nullable=False)
    invoice_number = db.Column(db.String(50))  # Original invoice number
    remarks = db.Column(db.Text)
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), default=0)
    total_value = db.Column(db.Numeric(10, 2), default=0)
    return_reason = db.Column(db.String(100))  # e.g., 'damaged', 'wrong item', 'quality issue'
    credit_note_issued = db.Column(db.Boolean, default=False)
    credit_note_amount = db.Column(db.Numeric(10, 2), default=0)
    status = db.Column(db.String(20), default='pending')  # 'pending', 'approved', 'rejected', 'completed'
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))

    # Relationships
    supplier = db.relationship('Supplier', backref='returns')
    purchase_invoice = db.relationship('PurchaseInvoice', backref='returns')
    user = db.relationship('User', backref='supplier_returns_created', foreign_keys=[created_by])

    def to_dict(self):
        return {
            'id': self.id,
            'refNumber': self.ref_number,
            'date': self.date.isoformat() if self.date else None,
            'supplierId': self.supplier_id,
            'supplierName': self.supplier.supplier_name if self.supplier else None,
            'purchaseInvoiceId': self.purchase_invoice_id,
            'productId': self.product_id,
            'productType': self.product_type,
            'description': self.description,
            'invoiceNumber': self.invoice_number,
            'remarks': self.remarks,
            'quantity': self.quantity,
            'unitPrice': float(self.unit_price) if self.unit_price else 0,
            'totalValue': float(self.total_value) if self.total_value else 0,
            'returnReason': self.return_reason,
            'creditNoteIssued': self.credit_note_issued,
            'creditNoteAmount': float(self.credit_note_amount) if self.credit_note_amount else 0,
            'status': self.status,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'createdBy': self.created_by
        }

class CashCarryForward(db.Model):
    __tablename__ = 'cash_carry_forward'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False, unique=True)
    pounds = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    coins = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date.isoformat() if self.date else None,
            'pounds': float(self.pounds),
            'coins': float(self.coins),
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }

class BankingEntry(db.Model):
    __tablename__ = 'banking_entries'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    remarks = db.Column(db.String(255))
    payment_type = db.Column(db.String(20), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    paying_number = db.Column(db.String(50))  # New field
    bag_number = db.Column(db.String(50))     # New field
    cheque_number = db.Column(db.String(50))  # New field
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date.isoformat() if self.date else None,
            'remarks': self.remarks,
            'paymentType': self.payment_type,
            'amount': float(self.amount),
            'payingNumber': self.paying_number,
            'bagNumber': self.bag_number,
            'chequeNumber': self.cheque_number,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }

class UserRestriction(db.Model):
    __tablename__ = 'user_restrictions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    section = db.Column(db.String(50), nullable=False)  # e.g., 'data_entry', 'daily_reports', etc.
    allowed = db.Column(db.Boolean, default=True)

    user = db.relationship('User', backref='user_restrictions') 

class UserBackDateOption(db.Model):
    __tablename__ = 'user_backdate_options'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), unique=True, nullable=False)
    editing = db.Column(db.Boolean, default=False)
    deleting = db.Column(db.Boolean, default=False)

    user = db.relationship('User', backref=db.backref('backdate_option', uselist=False))

    def to_dict(self):
        return {
            'userId': self.user_id,
            'editing': self.editing,
            'deleting': self.deleting
        }

class UserInvoiceRestriction(db.Model):
    __tablename__ = 'user_invoice_restriction'
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), primary_key=True)
    restricted = db.Column(db.Boolean, default=False)

    user = db.relationship('User', backref='invoice_restriction')

class UserDailyBookType(db.Model):
    __tablename__ = 'user_daily_book_type'
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), primary_key=True)
    show_all = db.Column(db.Boolean, default=True)
    show_only = db.Column(db.Boolean, default=False)

    user = db.relationship('User', backref='daily_book_type')

class ClosingStock(db.Model):
    __tablename__ = 'closing_stock'
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, nullable=False)
    product_type = db.Column(db.String(20), nullable=False)  # 'regular' or 'non'
    date = db.Column(db.Date, nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'productId': self.product_id,
            'productType': self.product_type,
            'date': self.date.isoformat(),
            'quantity': self.quantity,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }