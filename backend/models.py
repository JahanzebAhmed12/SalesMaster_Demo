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
    __table_args__ = (
        db.Index('ix_sale_date', 'date'),
        db.Index('ix_sale_status', 'status'),
        db.Index('ix_sale_customer_id', 'customer_id'),
        db.Index('ix_sale_created_by', 'created_by'),
    )

    id = db.Column(db.Integer, primary_key=True)
    invoice_number = db.Column(db.String(50), nullable=False, unique=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    date = db.Column(db.DateTime, default=datetime.utcnow)
    customer_type = db.Column(db.String(20), default='account')  # account or cash
    payment_status = db.Column(db.String(20), default='pending')  # pending, paid, partial
    subtotal = db.Column(db.Numeric(10, 2), nullable=False)
    porterage = db.Column(db.Numeric(10, 2), default=0)
    porterage_type = db.Column(db.String(10), default='per_unit')  # 'per_unit' or 'fixed'
    porterage_rate = db.Column(db.Numeric(10, 4), default=0)  # per-unit rate or fixed amount
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
            'porterageType': self.porterage_type or 'per_unit',
            'porterageRate': float(self.porterage_rate) if self.porterage_rate else 0,
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


class InvoiceDocumentNumber(db.Model):
    """Shared number-series counter for invoices, returns, and discounts."""
    __tablename__ = 'invoice_document_number'

    id = db.Column(db.Integer, primary_key=True)
    last_number = db.Column(db.Integer, nullable=False, default=0, server_default='0')


class VoidedInvoiceDocument(db.Model):
    """Preserves numbered sales, returns, and discounts after deletion."""
    __tablename__ = 'voided_invoice_document'
    __table_args__ = (
        db.Index('ix_voided_invoice_document_date', 'date'),
    )

    id = db.Column(db.Integer, primary_key=True)
    invoice_number = db.Column(db.String(50), nullable=False, unique=True)
    document_type = db.Column(db.String(20), nullable=False)
    date = db.Column(db.Date, nullable=False)
    date_unknown = db.Column(db.Boolean, nullable=False, default=False, server_default='0')
    customer_name = db.Column(db.String(200), nullable=False, default='')
    original_invoice_number = db.Column(db.String(50))
    salesman = db.Column(db.String(100), nullable=False, default='')
    voided_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class SaleEditLock(db.Model):
    """Exclusive server-side lease for editing an existing invoice.

    This is intentionally separate from SaleHold: a stock hold may be resumed,
    while an edit lock belongs to exactly one user and is released only when
    that edit is completed or explicitly abandoned.
    """
    __tablename__ = 'sale_edit_locks'
    __table_args__ = (
        db.UniqueConstraint('sale_id', name='uq_sale_edit_lock_sale_id'),
        db.Index('ix_sale_edit_lock_user_id', 'user_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey('sale.id'), nullable=False, unique=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    lock_token = db.Column(db.String(128), nullable=False, unique=True)
    acquired_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    sale = db.relationship('Sale', foreign_keys=[sale_id])
    user = db.relationship('User', foreign_keys=[user_id])

    def to_dict(self):
        return {
            'saleId': self.sale_id,
            'userId': self.user_id,
            'username': self.user.username if self.user else None,
            'acquiredAt': self.acquired_at.isoformat() if self.acquired_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }


class SaleItem(db.Model):
    __table_args__ = (
        db.Index('ix_sale_item_sale_id', 'sale_id'),
        db.Index('ix_sale_item_product_id', 'product_id'),
        db.Index('ix_sale_item_non_product_id', 'non_product_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey('sale.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('regular_products.id'))
    non_product_id = db.Column(db.Integer, db.ForeignKey('non_products.id'))
    quantity = db.Column(db.Numeric(10, 3), nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    total_price = db.Column(db.Numeric(10, 2), nullable=False)
    notes = db.Column(db.Text)  # Notes for the product item
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    added_by = db.Column(db.String(255), nullable=True)  # Username of who added this item
    highlighted = db.Column(db.Boolean, nullable=False, default=False, server_default='0')

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
            'quantity': float(self.quantity) if self.quantity is not None else 0,
            'unitPrice': float(self.unit_price),
            'totalPrice': float(self.total_price),
            'notes': self.notes,
            'createdAt': self.created_at.isoformat(),
            'updatedAt': self.updated_at.isoformat(),
            'addedBy': self.added_by,
            'highlighted': bool(self.highlighted)
        }

class SaleHold(db.Model):
    """Server-side held invoice and its stock reservation payload.

    Holds are deliberately separate from Sale rows: they reserve stock while an
    invoice is being prepared without changing current_stock or the stock
    movement ledger. The JSON payload preserves the existing resume experience,
    while the server calculates reservation totals from its canonical copy.
    """
    __tablename__ = 'sale_holds'
    __table_args__ = (
        db.Index('ix_sale_hold_status_expires_at', 'status', 'expires_at'),
        db.Index('ix_sale_hold_created_by', 'created_by'),
        db.Index('ix_sale_hold_sale_id', 'sale_id'),
    )

    hold_id = db.Column(db.String(64), primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=True)
    sale_id = db.Column(db.Integer, db.ForeignKey('sale.id'), nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    updated_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    payload = db.Column(db.JSON, nullable=False)
    status = db.Column(db.String(20), nullable=False, default='active')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)

    creator = db.relationship('User', foreign_keys=[created_by])
    updater = db.relationship('User', foreign_keys=[updated_by])
    sale = db.relationship('Sale', foreign_keys=[sale_id])

    def to_dict(self):
        data = dict(self.payload or {})
        data.update({
            'holdId': self.hold_id,
            'holdTime': self.updated_at.isoformat() if self.updated_at else None,
            'expiresAt': self.expires_at.isoformat() if self.expires_at else None,
            'createdBy': self.created_by,
            'createdByName': self.creator.username if self.creator else None,
            'updatedBy': self.updated_by,
            'updatedByName': self.updater.username if self.updater else None,
            'status': self.status,
        })
        return data


class Purchase(db.Model):
    __table_args__ = (
        db.Index('ix_purchase_supplier_id', 'supplier_id'),
        db.Index('ix_purchase_date', 'date'),
    )

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
    initial_stock = db.Column(db.Numeric(10, 3), default=0)
    current_stock = db.Column(db.Numeric(10, 3), default=0)
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
            'initialStock': float(self.initial_stock) if self.initial_stock else 0,
            'currentStock': float(self.current_stock) if self.current_stock else 0,
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
    initial_stock = db.Column(db.Numeric(10, 3), default=0)
    current_stock = db.Column(db.Numeric(10, 3), default=0)
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
            'initialStock': float(self.initial_stock) if self.initial_stock else 0,
            'currentStock': float(self.current_stock) if self.current_stock else 0,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class Customer(db.Model):
    __table_args__ = (
        db.Index('ix_customer_customer_name', 'customer_name'),
    )

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
    others = db.Column(db.String(100))  # Others/Gate field for sales entry
    is_active = db.Column(db.String(3), default='yes')
    is_company = db.Column(db.Boolean, default=False)
    running_balance = db.Column(db.Numeric(12, 2), default=0)  # Running balance field
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
            'others': self.others,
            'is_active': self.is_active,
            'is_company': bool(self.is_company),
            'runningBalance': float(self.running_balance) if self.running_balance else 0,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

class Payment(db.Model):
    __table_args__ = (
        db.Index('ix_payment_customer_id', 'customer_id'),
        db.Index('ix_payment_sale_id', 'sale_id'),
        db.Index('ix_payment_payment_date', 'payment_date'),
        db.Index('ix_payment_payment_source', 'payment_source'),
    )

    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    sale_id = db.Column(db.Integer, db.ForeignKey('sale.id')) # Optional, for payments linked to specific invoices
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_mode = db.Column(db.String(50), nullable=False) # e.g., 'cash', 'card', 'bank transfer'
    payment_date = db.Column(db.Date, nullable=False)
    batch_id = db.Column(db.Integer) # For grouping related payments in the same transaction
    payment_type = db.Column(db.String(20), default=None) # 'direct', 'on-account', or NULL for legacy payments
    payment_source = db.Column(db.String(50), default='customer_payment') # 'customer_payment', 'daily_book_sales'
    remarks = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True) # User who created the payment
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = db.relationship('Customer', backref='payments')
    sale = db.relationship('Sale', backref='payments')
    creator = db.relationship('User', foreign_keys=[created_by], backref='payments_created')

    def to_dict(self):
        return {
            'id': self.id,
            'customerId': self.customer_id,
            'saleId': self.sale_id,
            'amount': float(self.amount),
            'paymentMode': self.payment_mode,
            'paymentDate': self.payment_date.isoformat(),
            'batchId': self.batch_id,
            'paymentType': self.payment_type,
            'paymentSource': self.payment_source,
            'remarks': self.remarks,
            'createdBy': self.created_by,
            'createdByUsername': self.creator.username if self.creator else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class Supplier(db.Model):
    __tablename__ = 'suppliers'
    __table_args__ = (
        db.Index('ix_supplier_supplier_name', 'supplier_name'),
    )
    
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
    is_company = db.Column(db.Boolean, default=False)
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
            'is_company': bool(self.is_company),
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
    # Invoice print format
    invoice_print_format = db.Column(db.String(20), nullable=False, default='A4')
    # Invoice lock setting
    lock_invoices = db.Column(db.Boolean, nullable=False, default=False)
    # Till float — cash kept in drawer, set once by admin
    till_float = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    # Per-PC Windows print-service package defaults. Each download can override these values.
    print_service_url = db.Column(db.String(500), nullable=False, default='https://tropifruituk.net')
    print_service_printer_name = db.Column(db.String(255), nullable=False, default='EPSON LQ-350 ESC/P2')
    print_service_poll_interval_ms = db.Column(db.Integer, nullable=False, default=10000)

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
            'porterageCharge': float(self.porterage_charge) if self.porterage_charge else 0,
            'invoicePrintFormat': self.invoice_print_format,
            'lockInvoices': self.lock_invoices,
            'tillFloat': float(self.till_float) if self.till_float else 0,
            'printServiceUrl': self.print_service_url,
            'printServicePrinterName': self.print_service_printer_name,
            'printServicePollingIntervalMs': self.print_service_poll_interval_ms,
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
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
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
    __table_args__ = (
        db.Index('ix_purchase_invoice_purchase_id', 'purchase_id'),
        db.Index('ix_purchase_invoice_date', 'date'),
        db.Index('ix_purchase_invoice_supplier_id', 'supplier_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    purchase_id = db.Column(db.Integer, db.ForeignKey('purchase.id'), nullable=False)
    supplier_id = db.Column(db.Integer, nullable=True)  # NEW: Link to Supplier
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
            'supplierId': self.supplier_id,  # NEW
            'date': self.date.isoformat() if self.date else None,
            'remarks': self.remarks,
            'paidAmount': float(self.paid_amount),
            'paymentStatus': self.payment_status,
            'items': [item.to_dict() for item in self.items],
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class PurchaseInvoiceItem(db.Model):
    __table_args__ = (
        db.Index('ix_purchase_invoice_item_invoice_id', 'invoice_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.Integer, db.ForeignKey('purchase_invoice.id'), nullable=False)
    product_id = db.Column(db.Integer, nullable=False)
    product_name = db.Column(db.String(255))
    quantity = db.Column(db.Numeric(10, 3), nullable=False)
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
    __table_args__ = (
        db.Index('ix_supplier_payment_supplier_id', 'supplier_id'),
        db.Index('ix_supplier_payment_purchase_invoice_id', 'purchase_invoice_id'),
        db.Index('ix_supplier_payment_payment_date', 'payment_date'),
    )

    id = db.Column(db.Integer, primary_key=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=False)
    purchase_invoice_id = db.Column(db.Integer, db.ForeignKey('purchase_invoice.id')) # Optional, for payments linked to specific invoices
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_mode = db.Column(db.String(50), nullable=False) # e.g., 'cash', 'card', 'bank transfer'
    payment_date = db.Column(db.Date, nullable=False)
    supplier_invoice_number = db.Column(db.String(100)) # Supplier's invoice number
    supplier_invoice_date = db.Column(db.Date) # Date when supplier created the invoice
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
            'supplierInvoiceNumber': self.supplier_invoice_number,
            'supplierInvoiceDate': self.supplier_invoice_date.isoformat() if self.supplier_invoice_date else None,
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
    quantity = db.Column(db.Numeric(10, 3), nullable=False)  # Positive for additions, negative for reductions
    reference_id = db.Column(db.Integer)  # ID of the related sale, purchase, or adjustment
    reference_type = db.Column(db.String(20))  # 'sale', 'purchase', 'adjustment'
    previous_stock = db.Column(db.Numeric(10, 3), nullable=False)
    new_stock = db.Column(db.Numeric(10, 3), nullable=False)
    movement_date = db.Column(db.Date, nullable=True)  # Business date of the movement (separate from created_at timestamp)
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
            'movementDate': self.movement_date.isoformat() if self.movement_date else None,
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
    quantity = db.Column(db.Numeric(10, 3), nullable=False)
    previous_stock = db.Column(db.Numeric(10, 3), nullable=False)
    new_stock = db.Column(db.Numeric(10, 3), nullable=False)
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
    description = db.Column(db.String(200), nullable=True)
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
    quantity = db.Column(db.Numeric(10, 3), nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), default=0)
    total_value = db.Column(db.Numeric(10, 2), default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))

    # Relationships
    supplier = db.relationship('Supplier', backref='dump_entries')
    user = db.relationship('User', backref='dump_entries_created', foreign_keys=[created_by])

    def to_dict(self):
        # Get product name based on product type
        product_name = None
        if self.product_type == 'regular':
            product = RegularProduct.query.get(self.product_id)
            product_name = product.description if product else None
        elif self.product_type == 'non':
            product = NonProduct.query.get(self.product_id)
            product_name = product.description if product else None
        
        return {
            'id': self.id,
            'refNumber': self.ref_number,
            'date': self.date.isoformat() if self.date else None,
            'supplierId': self.supplier_id,
            'supplierName': self.supplier.supplier_name if self.supplier else None,
            'productId': self.product_id,
            'productType': self.product_type,
            'productName': product_name,
            'description': self.description,
            'remarks': self.remarks,
            'quantity': float(self.quantity) if self.quantity else 0,
            'unitPrice': float(self.unit_price) if self.unit_price else 0,
            'totalValue': float(self.total_value) if self.total_value else 0,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'createdBy': self.created_by
        }

class CustomerReturn(db.Model):
    """Tracks customer returns"""
    __table_args__ = (
        db.Index('ix_customer_return_date', 'date'),
        db.Index('ix_customer_return_customer_id', 'customer_id'),
        db.Index('ix_customer_return_source_sale_item_id', 'source_sale_item_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    ref_number = db.Column(db.String(50), unique=True, nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    sale_id = db.Column(db.Integer, db.ForeignKey('sale.id'))  # Optional, link to original sale
    source_sale_item_id = db.Column(db.Integer, db.ForeignKey('sale_item.id'))
    is_manual = db.Column(db.Boolean, nullable=False, default=False, server_default='0')
    item_remarks = db.Column(db.Text)
    product_id = db.Column(db.Integer, nullable=False)  # ID of the product being returned
    product_type = db.Column(db.String(20), nullable=False)  # 'regular' or 'non'
    description = db.Column(db.String(200), nullable=False)
    invoice_number = db.Column(db.String(50))  # Original invoice number
    document_invoice_number = db.Column(db.String(50), nullable=True)
    remarks = db.Column(db.Text)
    quantity = db.Column(db.Numeric(10, 3), nullable=False)
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
    source_sale_item = db.relationship('SaleItem')
    user = db.relationship('User', backref='customer_returns_created', foreign_keys=[created_by])

    def to_dict(self):
        return {
            'id': self.id,
            'refNumber': self.ref_number,
            'date': self.date.isoformat() if self.date else None,
            'customerId': self.customer_id,
            'customerName': self.customer.customer_name if self.customer else None,
            'saleId': self.sale_id,
            'sourceSaleItemId': self.source_sale_item_id,
            'isManual': bool(self.is_manual),
            'itemRemarks': self.item_remarks,
            'productId': self.product_id,
            'productType': self.product_type,
            'description': self.description,
            'productDescription': self.description,  # Add alias for frontend compatibility
            'invoiceNumber': self.invoice_number,
            'documentInvoiceNumber': self.document_invoice_number,
            'remarks': self.remarks,
            'quantity': float(self.quantity) if self.quantity else 0,
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

class CustomerDiscount(db.Model):
    __tablename__ = 'customer_discount'
    __table_args__ = (
        db.Index('ix_customer_discount_date', 'date'),
        db.Index('ix_customer_discount_customer_date', 'customer_id', 'date'),
        db.Index('ix_customer_discount_sale_id', 'sale_id'),
        db.Index('ix_customer_discount_sale_item_id', 'sale_item_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    sale_id = db.Column(db.Integer, db.ForeignKey('sale.id'), nullable=False)
    sale_item_id = db.Column(db.Integer, db.ForeignKey('sale_item.id'), nullable=False)
    document_invoice_number = db.Column(db.String(50), nullable=True)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    date = db.Column(db.Date, nullable=False)
    reason = db.Column(db.String(500), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_by = db.Column(db.Integer, db.ForeignKey('user.id'))
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_deleted = db.Column(db.Boolean, nullable=False, default=False, server_default='0')
    deleted_by = db.Column(db.Integer, db.ForeignKey('user.id'))
    deleted_at = db.Column(db.DateTime)
    deletion_reason = db.Column(db.String(500))

    customer = db.relationship('Customer')
    sale = db.relationship('Sale')
    sale_item = db.relationship('SaleItem')
    creator = db.relationship('User', foreign_keys=[created_by])
    updater = db.relationship('User', foreign_keys=[updated_by])
    deleter = db.relationship('User', foreign_keys=[deleted_by])

    @property
    def reference(self):
        return f"CD-{self.id:06d}"

    def to_dict(self):
        return {
            'id': self.id,
            'reference': self.reference,
            'customerId': self.customer_id,
            'customerName': self.customer.customer_name if self.customer else None,
            'saleId': self.sale_id,
            'saleItemId': self.sale_item_id,
            'invoiceNumber': self.sale.invoice_number if self.sale else None,
            'documentInvoiceNumber': self.document_invoice_number,
            'productName': (
                self.sale_item.product.description if self.sale_item and self.sale_item.product
                else self.sale_item.non_product.description if self.sale_item and self.sale_item.non_product
                else None
            ),
            'amount': float(self.amount or 0),
            'date': self.date.isoformat() if self.date else None,
            'reason': self.reason,
            'createdBy': self.created_by,
            'createdByUsername': self.creator.username if self.creator else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedBy': self.updated_by,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'isDeleted': bool(self.is_deleted),
            'deletedBy': self.deleted_by,
            'deletedAt': self.deleted_at.isoformat() if self.deleted_at else None,
            'deletionReason': self.deletion_reason,
        }

class CustomerDiscountAudit(db.Model):
    __tablename__ = 'customer_discount_audit'
    __table_args__ = (
        db.Index('ix_customer_discount_audit_discount_id', 'discount_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    discount_id = db.Column(db.Integer, db.ForeignKey('customer_discount.id'), nullable=False)
    action = db.Column(db.String(20), nullable=False)
    before_values = db.Column(db.JSON)
    after_values = db.Column(db.JSON)
    reason = db.Column(db.String(500))
    changed_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    changed_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    discount = db.relationship('CustomerDiscount')
    user = db.relationship('User')

class SupplierReturn(db.Model):
    """Tracks supplier returns"""
    id = db.Column(db.Integer, primary_key=True)
    ref_number = db.Column(db.String(50), unique=True, nullable=False)
    document_ref_number = db.Column(db.String(50), index=True)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=False)
    purchase_invoice_id = db.Column(db.Integer, db.ForeignKey('purchase_invoice.id'))  # Optional, link to original purchase
    source_purchase_invoice_item_id = db.Column(db.Integer, index=True)
    is_manual = db.Column(db.Boolean, nullable=False, default=False, server_default='0')
    product_id = db.Column(db.Integer, nullable=False)  # ID of the product being returned
    product_type = db.Column(db.String(20), nullable=False)  # 'regular' or 'non'
    description = db.Column(db.String(200), nullable=False)
    invoice_number = db.Column(db.String(50))  # Original invoice number
    remarks = db.Column(db.Text)
    quantity = db.Column(db.Numeric(10, 3), nullable=False)
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
        document_ref_number = self.document_ref_number or self.ref_number
        return {
            'id': self.id,
            'refNumber': document_ref_number,
            'lineRefNumber': self.ref_number,
            'documentRefNumber': document_ref_number,
            'date': self.date.isoformat() if self.date else None,
            'supplierId': self.supplier_id,
            'supplierName': self.supplier.supplier_name if self.supplier else None,
            'purchaseInvoiceId': self.purchase_invoice_id,
            'sourcePurchaseInvoiceItemId': self.source_purchase_invoice_item_id,
            'isManual': self.is_manual,
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
    bag_number = db.Column(db.String(50))     # New field - kept for backward compatibility
    cheque_number = db.Column(db.String(50))  # New field
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # Relationship to bag numbers
    bag_numbers = db.relationship('BankingBagNumber', backref='banking_entry', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date.isoformat() if self.date else None,
            'remarks': self.remarks,
            'paymentType': self.payment_type,
            'amount': float(self.amount),
            'payingNumber': self.paying_number,
            'bagNumber': self.bag_number,  # Keep for backward compatibility
            'bagNumbers': [bag.bag_number for bag in self.bag_numbers],  # Bag numbers
            'bagPayingNumbers': [bag.paying_number for bag in self.bag_numbers],  # Individual paying numbers
            'bagAmounts': [float(bag.amount) if bag.amount else 0 for bag in self.bag_numbers],  # Individual bag amounts
            'bags': [{'number': bag.bag_number, 'payingNumber': bag.paying_number, 'amount': float(bag.amount) if bag.amount else 0} for bag in self.bag_numbers],  # Combined bag data
            'chequeNumber': self.cheque_number,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }

class BankingBagNumber(db.Model):
    __tablename__ = 'banking_bag_numbers'
    id = db.Column(db.Integer, primary_key=True)
    banking_entry_id = db.Column(db.Integer, db.ForeignKey('banking_entries.id'), nullable=False)
    bag_number = db.Column(db.String(50), nullable=False)
    paying_number = db.Column(db.String(50), nullable=True)  # Individual paying number for each bag
    amount = db.Column(db.Numeric(10, 2), nullable=True, default=0)  # Individual bag amount
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'bankingEntryId': self.banking_entry_id,
            'bagNumber': self.bag_number,
            'payingNumber': self.paying_number,
            'amount': float(self.amount) if self.amount else 0,
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
    current_editing = db.Column(db.Boolean, default=True)

    user = db.relationship('User', backref=db.backref('backdate_option', uselist=False))

    def to_dict(self):
        return {
            'userId': self.user_id,
            'editing': self.editing,
            'deleting': self.deleting,
            'current_editing': self.current_editing
        }

class UserTimingRestriction(db.Model):
    __tablename__ = 'user_timing_restrictions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), unique=True, nullable=False)
    start_time = db.Column(db.String(5), default='00:01')  # Format: HH:MM
    end_time = db.Column(db.String(5), default='23:59')    # Format: HH:MM
    enabled = db.Column(db.Boolean, default=False)

    user = db.relationship('User', backref=db.backref('timing_restriction', uselist=False))

    def to_dict(self):
        return {
            'userId': self.user_id,
            'startTime': self.start_time,
            'endTime': self.end_time,
            'enabled': self.enabled
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
    quantity = db.Column(db.Numeric(10, 3), nullable=False)
    manual_entry = db.Column(db.Boolean, nullable=False, default=True)  # True for manual entries, False for automatic
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'productId': self.product_id,
            'productType': self.product_type,
            'date': self.date.isoformat(),
            'quantity': self.quantity,
            'manualEntry': self.manual_entry,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class EmployeeDocument(db.Model):
    __tablename__ = 'employee_documents'
    
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employees.id'), nullable=False)
    document_name = db.Column(db.String(200), nullable=False)
    file_name = db.Column(db.String(255))  # Original filename
    file_path = db.Column(db.String(500))  # Path to stored file
    file_size = db.Column(db.Integer)      # File size in bytes
    file_type = db.Column(db.String(100))  # MIME type
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'documentName': self.document_name,
            'fileName': self.file_name,
            'filePath': self.file_path,
            'fileSize': self.file_size,
            'fileType': self.file_type,
            'startDate': self.start_date.isoformat() if self.start_date else None,
            'endDate': self.end_date.isoformat() if self.end_date else None,
            'hasFile': bool(self.file_path),
        }

class HolidayRequest(db.Model):
    __tablename__ = 'holiday_requests'
    
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employees.id'), nullable=False)
    employee_name = db.Column(db.String(200), nullable=False)
    job_title = db.Column(db.String(200))
    total_days_requested = db.Column(db.Integer, nullable=False)
    last_date_at_work = db.Column(db.Date, nullable=False)
    return_date_to_work = db.Column(db.Date, nullable=False)
    signed_by_employee = db.Column(db.String(200))
    date_by_employee = db.Column(db.Date)
    
    # Management decision
    status = db.Column(db.String(20), default='pending')  # pending, granted, not_granted
    days_granted = db.Column(db.Integer)
    days_left_entitlement = db.Column(db.Integer)
    manager_name = db.Column(db.String(200))
    signed_by_manager = db.Column(db.String(200))
    dated_by_manager = db.Column(db.Date)
    manager_comments = db.Column(db.Text)
    
    # Signed form upload
    signed_form_path = db.Column(db.String(500))  # Path to uploaded signed form
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))

    # Relationships with explicit foreign_keys and lazy loading
    employee = db.relationship('Employee', foreign_keys=[employee_id], lazy='select')
    user = db.relationship('User', foreign_keys=[created_by], lazy='select')

    def to_dict(self):
        return {
            'id': self.id,
            'employeeId': self.employee_id,
            'employeeName': self.employee_name,
            'jobTitle': self.job_title,
            'totalDaysRequested': self.total_days_requested,
            'lastDateAtWork': self.last_date_at_work.isoformat() if self.last_date_at_work else None,
            'returnDateToWork': self.return_date_to_work.isoformat() if self.return_date_to_work else None,
            'signedByEmployee': self.signed_by_employee,
            'dateByEmployee': self.date_by_employee.isoformat() if self.date_by_employee else None,
            'status': self.status,
            'daysGranted': self.days_granted,
            'daysLeftEntitlement': self.days_left_entitlement,
            'managerName': self.manager_name,
            'signedByManager': self.signed_by_manager,
            'datedByManager': self.dated_by_manager.isoformat() if self.dated_by_manager else None,
            'managerComments': self.manager_comments,
            'signedFormPath': self.signed_form_path,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }

class BusinessDate(db.Model):
    __tablename__ = 'business_date'
    
    id = db.Column(db.Integer, primary_key=True)
    current_date = db.Column(db.Date, nullable=False)
    is_manual_override = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'currentDate': self.current_date.isoformat() if self.current_date else None,
            'isManualOverride': self.is_manual_override,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class Employee(db.Model):
    __tablename__ = 'employees'
    
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(200), nullable=False)
    title = db.Column(db.String(50))
    home_address = db.Column(db.Text)
    home_phone_number = db.Column(db.String(20))
    mobile_number = db.Column(db.String(20))
    date_of_birth = db.Column(db.Date)
    marital_status = db.Column(db.String(20))
    national_insurance_number = db.Column(db.String(20))
    start_date = db.Column(db.Date)
    department = db.Column(db.String(100))
    position = db.Column(db.String(100))
    salary = db.Column(db.Numeric(10, 2))
    probation_period = db.Column(db.String(50))
    line_manager = db.Column(db.String(200))
    term = db.Column(db.String(20))  # permanent or contract
    status = db.Column(db.String(10))  # P/T or F/T
    bank_name = db.Column(db.String(100))
    branch_name = db.Column(db.String(100))
    branch_address = db.Column(db.Text)
    account_number = db.Column(db.String(20))
    sort_code = db.Column(db.String(10))
    fork_lift_certificate_company_name = db.Column(db.String(200))  # New field
    licence_certificate_number = db.Column(db.String(50))  # New field
    market_permit_number = db.Column(db.String(50))  # New field
    entitlement_days = db.Column(db.Integer, default=25)  # Annual holiday entitlement days
    # Next of Kin Information
    next_of_kin_name = db.Column(db.String(200))
    next_of_kin_phone_number = db.Column(db.String(20))
    next_of_kin_email = db.Column(db.String(100))
    next_of_kin_address = db.Column(db.Text)
    next_of_kin_relationship = db.Column(db.String(50))
    email = db.Column(db.String(200))
    is_active = db.Column(db.String(3), default='yes')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    documents = db.relationship('EmployeeDocument', backref='employee', cascade='all, delete-orphan')

    def to_dict(self):
        try:
            # Safely handle documents relationship
            documents_list = []
            if hasattr(self, 'documents') and self.documents:
                documents_list = [doc.to_dict() for doc in self.documents]
        except Exception as e:
            print(f"Error loading documents for employee {self.id}: {str(e)}")
            documents_list = []
        
        return {
            'id': self.id,
            'fullName': self.full_name,
            'title': self.title,
            'homeAddress': self.home_address,
            'homePhoneNumber': self.home_phone_number,
            'mobileNumber': self.mobile_number,
            'dateOfBirth': self.date_of_birth.isoformat() if self.date_of_birth else None,
            'maritalStatus': self.marital_status,
            'nationalInsuranceNumber': self.national_insurance_number,
            'startDate': self.start_date.isoformat() if self.start_date else None,
            'department': self.department,
            'position': self.position,
            'salary': float(self.salary) if self.salary else None,
            'probationPeriod': self.probation_period,
            'lineManager': self.line_manager,
            'term': self.term,
            'status': self.status,
            'bankName': self.bank_name,
            'branchName': self.branch_name,
            'branchAddress': self.branch_address,
            'accountNumber': self.account_number,
            'sortCode': self.sort_code,
            'forkLiftCertificateCompanyName': self.fork_lift_certificate_company_name,
            'licenceCertificateNumber': self.licence_certificate_number,
            'marketPermitNumber': self.market_permit_number,
            'entitlementDays': self.entitlement_days,
            # Next of Kin Information
            'nextOfKinName': self.next_of_kin_name,
            'nextOfKinPhoneNumber': self.next_of_kin_phone_number,
            'nextOfKinEmail': self.next_of_kin_email,
            'nextOfKinAddress': self.next_of_kin_address,
            'nextOfKinRelationship': self.next_of_kin_relationship,
            'email': self.email,
            'documents': documents_list,
            'isActive': self.is_active,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }
class Equipment(db.Model):
    __tablename__ = 'equipment'
    
    id = db.Column(db.Integer, primary_key=True)
    description = db.Column(db.String(500), nullable=False)
    start_date = db.Column(db.Date, nullable=True)
    end_date = db.Column(db.Date, nullable=False)
    is_active = db.Column(db.String(3), default='yes')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'description': self.description,
            'startDate': self.start_date.isoformat() if self.start_date else None,
            'endDate': self.end_date.isoformat() if self.end_date else None,
            'isActive': self.is_active,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class PrintQueue(db.Model):
    """Print Queue Model for Mobile Print Proxy - Only for mobile devices"""
    __tablename__ = 'print_queue'
    
    id = db.Column(db.String(36), primary_key=True)
    invoice_number = db.Column(db.String(50), nullable=False)
    print_type = db.Column(db.String(20), default='dot_matrix')
    status = db.Column(db.String(20), default='pending')  # pending, printing, completed, failed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)
    print_data = db.Column(db.Text, nullable=False)  # JSON string
    error_message = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    device_type = db.Column(db.String(20), default='mobile')  # mobile, desktop
    
    # Relationships
    user = db.relationship('User', backref='print_jobs', foreign_keys=[created_by])

    def to_dict(self):
        return {
            'id': self.id,
            'invoiceNumber': self.invoice_number,
            'printType': self.print_type,
            'status': self.status,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'completedAt': self.completed_at.isoformat() if self.completed_at else None,
            'printData': self.print_data,
            'errorMessage': self.error_message,
            'createdBy': self.created_by,
            'deviceType': self.device_type
        }