from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, time, date

class SaleItemSchema(BaseModel):
    product_id: Optional[int] = None
    non_product_id: Optional[int] = None
    quantity: float
    unit_price: float
    total_price: float
    notes: Optional[str] = None

    class Config:
        from_attributes = True
        populate_by_name = True
        alias_generator = lambda x: x.replace('productId', 'product_id') \
            .replace('nonProductId', 'non_product_id') \
            .replace('unitPrice', 'unit_price') \
            .replace('totalPrice', 'total_price')

class SaleSchema(BaseModel):
    invoice_number: Optional[str] = None
    customer_id: int
    customer_type: str = 'account'
    payment_status: str = 'pending'
    subtotal: float
    porterage: float = 0
    porterage_type: Optional[str] = 'per_unit'
    porterage_rate: Optional[float] = 0
    vat_rate: float = 0
    vat_amount: float = 0
    total_amount: float
    vehicle_details: Optional[str] = None
    gate_number: Optional[str] = None
    notes: Optional[str] = None
    status: str = 'draft'
    date: Optional[str] = None  # Business date
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
    invoice_date: str = Field(alias='invoiceDate')
    delivery_no: str = Field(alias='deliveryNo')
    supplier_invoice: str = Field(alias='supplierInvoice')
    awb: str
    remarks: Optional[str] = None
    supplier_id: int = Field(alias='supplierId')
    amount: float = 0  # Default amount, will be calculated from invoice items

    class Config:
        from_attributes = True
        populate_by_name = True

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
    initial_stock: int = 0  # New field for initial stock

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
            .replace('lastStockTake', 'last_stock_take') \
            .replace('initialStock', 'initial_stock')

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
    initial_stock: int = 0  # New field for initial stock

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
            .replace('lastStockTake', 'last_stock_take') \
            .replace('initialStock', 'initial_stock')

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
    others: Optional[str] = None
    running_balance: float = 0
    is_active: str = 'yes'
    is_company: bool = False

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
    is_company: bool = False

    class Config:
        from_attributes = True

class SystemSettingsSchema(BaseModel):
    closing_time: time = Field(default=time(23, 59))
    timezone: str = Field(default="Europe/London")
    auto_date_switch: bool = Field(default=True)
    weekend_handling: str = Field(default="skip")
    delivery_note_name_or_code: str = Field(default="name")
    delivery_acknowledgement: bool = Field(default=False)
    show_profit: bool = Field(default=True)
    with_porterage: bool = Field(default=False)
    porterage_charge: float = Field(default=0)
    invoice_print_format: str = Field(default="A4")
    lock_invoices: bool = Field(default=False)
    till_float: float = Field(default=0)

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

class SupplierPaymentSchema(BaseModel):
    supplier_id: int = Field(alias='supplierId')
    purchase_invoice_id: Optional[int] = Field(default=None, alias='purchaseInvoiceId') # Can be null for on-account payments
    amount: float
    payment_mode: str = Field(alias='paymentMode')
    payment_date: date = Field(alias='paymentDate')
    supplier_invoice_number: Optional[str] = Field(default=None, alias='supplierInvoiceNumber')
    supplier_invoice_date: Optional[date] = Field(default=None, alias='supplierInvoiceDate')
    remarks: Optional[str] = None

    class Config:
        from_attributes = True
        populate_by_name = True

class StockMovementSchema(BaseModel):
    product_id: int = Field(alias='productId')
    product_type: str = Field(alias='productType')
    movement_type: str = Field(alias='movementType')
    quantity: float
    reference_id: Optional[int] = Field(default=None, alias='referenceId')
    reference_type: Optional[str] = Field(default=None, alias='referenceType')
    remarks: Optional[str] = None

    class Config:
        from_attributes = True
        populate_by_name = True

class StockAdjustmentSchema(BaseModel):
    product_id: int = Field(alias='productId')
    product_type: str = Field(alias='productType')
    adjustment_type: str = Field(alias='adjustmentType')
    quantity: float
    reason: str
    remarks: Optional[str] = None
    adjustment_date: date = Field(alias='adjustmentDate')

    class Config:
        from_attributes = True
        populate_by_name = True

class ExpenseEntrySchema(BaseModel):
    refNumber: str = Field(alias='refNumber')
    date: date
    supplierId: Optional[int] = Field(default=None, alias='supplierId')
    expenseId: int = Field(alias='expenseId')
    invoiceNumber: Optional[str] = Field(default=None, alias='invoiceNumber')
    remarks: Optional[str] = None
    paymentMode: str = Field(default='CASH', alias='paymentMode')
    amount: float
    vatAmount: float = Field(default=0, alias='vatAmount')
    totalAmount: float = Field(alias='totalAmount')

    class Config:
        from_attributes = True
        populate_by_name = True

class DumpEntrySchema(BaseModel):
    refNumber: str = Field(alias='refNumber')
    date: date
    supplierId: Optional[int] = Field(default=None, alias='supplierId')
    productId: int = Field(alias='productId')
    productType: str = Field(alias='productType')
    description: str
    remarks: Optional[str] = None
    quantity: float
    unitPrice: float = Field(default=0, alias='unitPrice')
    totalValue: float = Field(alias='totalValue')

    class Config:
        from_attributes = True
        populate_by_name = True

class CustomerReturnSchema(BaseModel):
    refNumber: str = Field(alias='refNumber')
    date: date
    customerId: int = Field(alias='customerId')
    saleId: Optional[int] = Field(default=None, alias='saleId')
    productId: int = Field(alias='productId')
    productType: str = Field(alias='productType')
    description: str
    invoiceNumber: Optional[str] = Field(default=None, alias='invoiceNumber')
    remarks: Optional[str] = None
    quantity: float
    unitPrice: float = Field(default=0, alias='unitPrice')
    totalValue: float = Field(alias='totalValue')
    returnReason: Optional[str] = Field(default=None, alias='returnReason')
    creditNoteIssued: bool = Field(default=False, alias='creditNoteIssued')
    creditNoteAmount: float = Field(default=0, alias='creditNoteAmount')
    status: str = Field(default='pending', alias='status')

    class Config:
        from_attributes = True
        populate_by_name = True

class SupplierReturnSchema(BaseModel):
    refNumber: str = Field(alias='refNumber')
    date: date
    supplierId: int = Field(alias='supplierId')
    purchaseInvoiceId: Optional[int] = Field(default=None, alias='purchaseInvoiceId')
    productId: int = Field(alias='productId')
    productType: str = Field(alias='productType')
    description: str
    invoiceNumber: Optional[str] = Field(default=None, alias='invoiceNumber')
    remarks: Optional[str] = None
    quantity: float
    unitPrice: float = Field(default=0, alias='unitPrice')
    totalValue: float = Field(alias='totalValue')
    returnReason: Optional[str] = Field(default=None, alias='returnReason')
    creditNoteIssued: bool = Field(default=False, alias='creditNoteIssued')
    creditNoteAmount: float = Field(default=0, alias='creditNoteAmount')
    status: str = Field(default='pending', alias='status')

    class Config:
        from_attributes = True
        populate_by_name = True

class CashCarryForwardSchema(BaseModel):
    id: int | None = None
    date: date
    pounds: float
    coins: float
    created_at: datetime | None = None

    class Config:
        orm_mode = True

class UserRestrictionSchema(BaseModel):
    user_id: int
    section: str
    allowed: bool

    class Config:
        orm_mode = True

class UserRestrictionOutSchema(UserRestrictionSchema):
    id: int

class BankingEntrySchema(BaseModel):
    date: date
    remarks: Optional[str] = None
    payment_type: str = Field(alias='paymentType')
    amount: float
    paying_number: Optional[str] = Field(default=None, alias='payingNumber')
    bag_number: Optional[str] = Field(default=None, alias='bagNumber')
    cheque_number: Optional[str] = Field(default=None, alias='chequeNumber')

    class Config:
        from_attributes = True
        populate_by_name = True

class EmployeeDocumentSchema(BaseModel):
    documentName: str = Field(alias='documentName')
    startDate: Optional[date] = Field(default=None, alias='startDate')
    endDate: Optional[date] = Field(default=None, alias='endDate')

    class Config:
        from_attributes = True
        populate_by_name = True

class EmployeeSchema(BaseModel):
    fullName: str = Field(alias='fullName')
    title: Optional[str] = None
    homeAddress: Optional[str] = Field(default=None, alias='homeAddress')
    homePhoneNumber: Optional[str] = Field(default=None, alias='homePhoneNumber')
    mobileNumber: Optional[str] = Field(default=None, alias='mobileNumber')
    dateOfBirth: Optional[date] = Field(default=None, alias='dateOfBirth')
    maritalStatus: Optional[str] = Field(default=None, alias='maritalStatus')
    nationalInsuranceNumber: Optional[str] = Field(default=None, alias='nationalInsuranceNumber')
    startDate: Optional[date] = Field(default=None, alias='startDate')
    department: Optional[str] = None
    position: Optional[str] = None
    salary: Optional[float] = None
    probationPeriod: Optional[str] = Field(default=None, alias='probationPeriod')
    lineManager: Optional[str] = Field(default=None, alias='lineManager')
    term: Optional[str] = None  # permanent or contract
    status: Optional[str] = None  # P/T or F/T
    bankName: Optional[str] = Field(default=None, alias='bankName')
    branchName: Optional[str] = Field(default=None, alias='branchName')
    branchAddress: Optional[str] = Field(default=None, alias='branchAddress')
    accountNumber: Optional[str] = Field(default=None, alias='accountNumber')
    sortCode: Optional[str] = Field(default=None, alias='sortCode')
    forkLiftCertificateCompanyName: Optional[str] = Field(default=None, alias='forkLiftCertificateCompanyName')
    licenceCertificateNumber: Optional[str] = Field(default=None, alias='licenceCertificateNumber')
    marketPermitNumber: Optional[str] = Field(default=None, alias='marketPermitNumber')
    entitlementDays: Optional[int] = Field(default=25, alias='entitlementDays')
    # Next of Kin Information
    nextOfKinName: Optional[str] = Field(default=None, alias='nextOfKinName')
    nextOfKinPhoneNumber: Optional[str] = Field(default=None, alias='nextOfKinPhoneNumber')
    nextOfKinEmail: Optional[str] = Field(default=None, alias='nextOfKinEmail')
    nextOfKinAddress: Optional[str] = Field(default=None, alias='nextOfKinAddress')
    nextOfKinRelationship: Optional[str] = Field(default=None, alias='nextOfKinRelationship')
    email: Optional[str] = Field(default=None, alias='email')
    documents: Optional[List[EmployeeDocumentSchema]] = Field(default=[], alias='documents')
    isActive: str = Field(default="yes", alias='isActive')

    class Config:
        from_attributes = True
        populate_by_name = True
class HolidayRequestSchema(BaseModel):
    employeeId: int = Field(alias='employeeId')
    employeeName: str = Field(alias='employeeName')
    jobTitle: Optional[str] = Field(default=None, alias='jobTitle')
    totalDaysRequested: int = Field(alias='totalDaysRequested')
    lastDateAtWork: date = Field(alias='lastDateAtWork')
    returnDateToWork: date = Field(alias='returnDateToWork')
    signedByEmployee: Optional[str] = Field(default=None, alias='signedByEmployee')
    dateByEmployee: Optional[date] = Field(default=None, alias='dateByEmployee')
    status: Optional[str] = Field(default='pending', alias='status')
    daysGranted: Optional[int] = Field(default=None, alias='daysGranted')
    daysLeftEntitlement: Optional[int] = Field(default=None, alias='daysLeftEntitlement')
    managerName: Optional[str] = Field(default=None, alias='managerName')
    signedByManager: Optional[str] = Field(default=None, alias='signedByManager')
    datedByManager: Optional[date] = Field(default=None, alias='datedByManager')
    managerComments: Optional[str] = Field(default=None, alias='managerComments')

    class Config:
        from_attributes = True
        populate_by_name = True
        
class EquipmentSchema(BaseModel):
    description: str
    startDate: date = Field(alias='startDate')
    endDate: date = Field(alias='endDate')
    isActive: Optional[str] = Field(default='yes', alias='isActive')

    class Config:
        from_attributes = True
        populate_by_name = True