from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, time, date

class SaleItemSchema(BaseModel):
    product_id: Optional[int] = None
    non_product_id: Optional[int] = None
    quantity: int
    unit_price: float
    total_price: float

    class Config:
        from_attributes = True
        populate_by_name = True
        alias_generator = lambda x: x.replace('productId', 'product_id') \
            .replace('nonProductId', 'non_product_id') \
            .replace('unitPrice', 'unit_price') \
            .replace('totalPrice', 'total_price')

class SaleSchema(BaseModel):
    invoice_number: str
    customer_id: int
    customer_type: str = 'credit'
    payment_status: str = 'pending'
    subtotal: float
    porterage: float = 0
    vat_rate: float = 0
    vat_amount: float = 0
    total_amount: float
    vehicle_details: Optional[str] = None
    gate_number: Optional[str] = None
    notes: Optional[str] = None
    status: str = 'draft'
    items: List[SaleItemSchema]

    class Config:
        from_attributes = True
        populate_by_name = True
        alias_generator = lambda x: x.replace('invoiceNumber', 'invoice_number') \
            .replace('customerId', 'customer_id') \
            .replace('customerType', 'customer_type') \
            .replace('paymentStatus', 'payment_status') \
            .replace('totalAmount', 'total_amount') \
            .replace('vatRate', 'vat_rate') \
            .replace('vatAmount', 'vat_amount') \
            .replace('vehicleDetails', 'vehicle_details') \
            .replace('gateNumber', 'gate_number')

class PaymentSchema(BaseModel):
    customer_id: int = Field(alias='customerId')
    sale_id: Optional[int] = Field(default=None, alias='saleId') # Can be null for on-account payments
    amount: float
    payment_mode: str = Field(alias='paymentMode')
    payment_date: date = Field(alias='paymentDate')
    remarks: Optional[str] = None

    class Config:
        from_attributes = True
        populate_by_name = True

class PurchaseSchema(BaseModel):
    supplier_name: str
    amount: float

class RegularProductSchema(BaseModel):
    product_code: str
    sage_code: Optional[str] = None
    hs_code: Optional[str] = None
    description: str
    selling_price: float = 0
    tax_rate: float = 0
    vat_code: Optional[str] = None
    unit_of_purchase: Optional[str] = None
    unit_of_sale: Optional[str] = None
    location: Optional[str] = None
    nominal_code: Optional[str] = None
    stock_category: Optional[str] = None
    department_number: Optional[str] = None
    supplier_ref: Optional[str] = None
    supplier_part_number: Optional[str] = None
    reorder_level: int = 0
    stock_level_flag: bool = False
    commodity_code: Optional[str] = None
    unit_weight: float = 0
    stock_take_date: Optional[date] = None
    reorder_quantity: int = 0
    last_stock_take: int = 0
    status: str = 'active'

    class Config:
        from_attributes = True
        populate_by_name = True
        alias_generator = lambda x: x.replace('productCode', 'product_code') \
            .replace('sageCode', 'sage_code') \
            .replace('hsCode', 'hs_code') \
            .replace('sellingPrice', 'selling_price') \
            .replace('taxRate', 'tax_rate') \
            .replace('vatCode', 'vat_code') \
            .replace('unitOfPurchase', 'unit_of_purchase') \
            .replace('unitOfSale', 'unit_of_sale') \
            .replace('nominalCode', 'nominal_code') \
            .replace('stockCategory', 'stock_category') \
            .replace('departmentNumber', 'department_number') \
            .replace('supplierRef', 'supplier_ref') \
            .replace('supplierPartNumber', 'supplier_part_number') \
            .replace('reorderLevel', 'reorder_level') \
            .replace('stockLevelFlag', 'stock_level_flag') \
            .replace('commodityCode', 'commodity_code') \
            .replace('unitWeight', 'unit_weight') \
            .replace('stockTakeDate', 'stock_take_date') \
            .replace('reorderQuantity', 'reorder_quantity') \
            .replace('lastStockTake', 'last_stock_take')

class NonProductSchema(BaseModel):
    product_code: str
    sage_code: Optional[str] = None
    description: str
    selling_price: float = 0
    tax_rate: float = 0
    vat_code: Optional[str] = None
    unit_of_purchase: Optional[str] = None
    unit_of_sale: Optional[str] = None
    location: Optional[str] = None
    nominal_code: Optional[str] = None
    stock_category: Optional[str] = None
    department_number: Optional[str] = None
    supplier_ref: Optional[str] = None
    supplier_part_number: Optional[str] = None
    reorder_level: int = 0
    stock_level_flag: bool = False
    commodity_code: Optional[str] = None
    unit_weight: float = 0
    stock_take_date: Optional[date] = None
    reorder_quantity: int = 0
    last_stock_take: int = 0
    status: str = 'active'

    class Config:
        from_attributes = True
        populate_by_name = True
        alias_generator = lambda x: x.replace('productCode', 'product_code') \
            .replace('sageCode', 'sage_code') \
            .replace('sellingPrice', 'selling_price') \
            .replace('taxRate', 'tax_rate') \
            .replace('vatCode', 'vat_code') \
            .replace('unitOfPurchase', 'unit_of_purchase') \
            .replace('unitOfSale', 'unit_of_sale') \
            .replace('nominalCode', 'nominal_code') \
            .replace('stockCategory', 'stock_category') \
            .replace('departmentNumber', 'department_number') \
            .replace('supplierRef', 'supplier_ref') \
            .replace('supplierPartNumber', 'supplier_part_number') \
            .replace('reorderLevel', 'reorder_level') \
            .replace('stockLevelFlag', 'stock_level_flag') \
            .replace('commodityCode', 'commodity_code') \
            .replace('unitWeight', 'unit_weight') \
            .replace('stockTakeDate', 'stock_take_date') \
            .replace('reorderQuantity', 'reorder_quantity') \
            .replace('lastStockTake', 'last_stock_take')

class CustomerSchema(BaseModel):
    customer_code: str
    sage_code: Optional[str] = None
    customer_name: str
    address: Optional[str] = None
    telephone: Optional[str] = None
    fax: Optional[str] = None
    email: Optional[str] = None
    customer_city: Optional[str] = None
    customer_country: Optional[str] = None
    customer_currency: str = 'GBP'
    remarks: Optional[str] = None
    own_branch: str = 'no'
    vat_number: Optional[str] = None
    credit_limit: float = 0
    terms: Optional[str] = None
    settlement_days: int = 0
    settlement_discount: float = 0
    web_address: Optional[str] = None
    is_active: str = 'yes'

    class Config:
        from_attributes = True

class SupplierSchema(BaseModel):
    supplier_code: str
    sage_code: Optional[str] = None
    supplier_name: str
    address: Optional[str] = None
    telephone: Optional[str] = None
    fax: Optional[str] = None
    email: Optional[str] = None
    customer_country: Optional[str] = None
    supplier_currency: str = 'GBP'
    contact_no1: Optional[str] = None
    contact_no2: Optional[str] = None
    remarks: Optional[str] = None
    vat_number: Optional[str] = None
    credit_limit: Optional[float] = None
    terms: Optional[str] = None
    web_address: Optional[str] = None
    bank_name: Optional[str] = None
    bank_address: Optional[str] = None
    bank_account_name: Optional[str] = None
    sort_code: Optional[str] = None
    account_no: Optional[str] = None
    eec_group: str = 'No'
    is_active: str = 'Yes'

    class Config:
        from_attributes = True

class SystemSettingsSchema(BaseModel):
    closing_time: time = Field(default=time(23, 59))
    timezone: str = Field(default="Europe/London")
    auto_date_switch: bool = Field(default=True)
    weekend_handling: str = Field(default="skip")

class AttendanceSchema(BaseModel):
    employee_id: int
    attendance_date: date
    status: str  # 'present', 'absent', 'leave', 'holiday'
    check_in_time: Optional[time] = None
    check_out_time: Optional[time] = None
    remarks: Optional[str] = None
    leave_type: Optional[str] = None  # 'annual', 'sick', 'unpaid', 'other'
    holiday_name: Optional[str] = None  # Name of the holiday if status is 'holiday'

class CompanySchema(BaseModel):
    companyName: str
    address1: str
    address2: Optional[str] = None
    telephone: Optional[str] = None
    mobile: Optional[str] = None
    fax: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    vatNo: Optional[str] = None
    compRegNo: Optional[str] = None
    bankDetails: Optional[str] = None
    einlNumber: Optional[str] = None
    remarks: Optional[str] = None

    class Config:
        from_attributes = True
        populate_by_name = True
        alias_generator = lambda x: x.replace('companyName', 'company_name').replace('address1', 'address1').replace('address2', 'address2').replace('vatNo', 'vat_no').replace('compRegNo', 'comp_reg_no').replace('bankDetails', 'bank_details').replace('einlNumber', 'einl_number')

class ExpenseSchema(BaseModel):
    expenseCode: str
    sageCode: Optional[str] = None
    expenseName: str
    isActive: str = "Yes"

    class Config:
        from_attributes = True
        populate_by_name = True
        alias_generator = lambda x: x.replace('expenseCode', 'expense_code').replace('sageCode', 'sage_code').replace('expenseName', 'expense_name').replace('isActive', 'is_active')

class UserSchema(BaseModel):
    username: str
    password: str
    user_type: str = 'user'
    status: str = 'Active'
    email: Optional[str] = None
    phone: Optional[str] = None
    daily_wage: Optional[float] = None

    class Config:
        from_attributes = True