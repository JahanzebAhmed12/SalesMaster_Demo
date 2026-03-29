import { z } from "zod";

// System Settings Schema
export const systemSettingsSchema = z.object({
  closingTime: z.string(), // "HH:mm"
  timezone: z.string(),
  autoDateSwitch: z.boolean(),
  weekendHandling: z.string(),
  showOutstandingBalance: z.boolean().optional(),
  invoiceFooter: z.string().optional(),
  deliveryNoteWithPrice: z.boolean().optional(),
  deliveryNoteNameOrCode: z.string().optional(),
  deliveryAcknowledgement: z.boolean().optional(),
  showProfit: z.boolean().optional(),
  withPorterage: z.boolean().optional(),
  porterageCharge: z.number().optional(),
  invoicePrintFormat: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SystemSettings = z.infer<typeof systemSettingsSchema>;

// User Schema
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  userType: z.string(),
  status: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  dailyWage: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const insertUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  userType: z.string(),
  status: z.string(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  dailyWage: z.number().optional().nullable()
});

// Customer Schema
export const customerSchema = z.object({
  id: z.number(),
  customer_code: z.string(),
  sage_code: z.string().nullable(),
  customer_name: z.string(),
  address: z.string().nullable(),
  telephone: z.string().nullable(),
  fax: z.string().nullable(),
  email: z.string().nullable(),
  customer_city: z.string().nullable(),
  customer_country: z.string().nullable(),
  customer_currency: z.string(),
  remarks: z.string().nullable(),
  own_branch: z.string(),
  vat_number: z.string().nullable(),
  credit_limit: z.number().nullable(),
  terms: z.string().nullable(),
  settlement_days: z.number(),
  settlement_discount: z.number().nullable(),
  web_address: z.string().nullable(),
  others: z.string().nullable(),
  runningBalance: z.number().default(0),
  is_active: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export const insertCustomerSchema = customerSchema.omit({
  id: true,
  created_at: true,
  updated_at: true
});

// Sale Item Schema (Defined before SaleSchema)
export const saleItemSchema = z.object({
  id: z.number(),
  saleId: z.number(),
  productId: z.number().nullable(),
  nonProductId: z.number().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalPrice: z.number(),
  productName: z.string().nullable(), // For frontend display
  notes: z.string().nullable(), // Notes for the product item
  addedBy: z.string().nullable(), // Track who added this product
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const insertSaleItemSchema = saleItemSchema.omit({
  id: true,
  productName: true,
  createdAt: true,
  updatedAt: true
});

// Sale Schema
export const saleSchema = z.object({
  id: z.number(),
  invoiceNumber: z.string(),
  customerId: z.number(),
  customerName: z.string().nullable(),
  amount: z.number(),
  vehicleDetails: z.string().nullable(),
  gateNumber: z.string().nullable(),
  date: z.string().nullable(),
  status: z.string(),
  customerType: z.string(),
  paymentStatus: z.string(),
  subtotal: z.number(),
  porterage: z.number(),
  vatRate: z.number(),
  vatAmount: z.number(),
  totalAmount: z.number(),
  paidAmount: z.number().default(0),
  notes: z.string().nullable(),
  items: z.array(saleItemSchema), // Now saleItemSchema is defined
  createdAt: z.string(),
  updatedAt: z.string()
});

export const insertSaleSchema = saleSchema.omit({
  id: true,
  customerName: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  items: z.array(insertSaleItemSchema) // Explicitly include items with the correct schema
});

// Attendance Schema
export const attendanceSchema = z.object({
  id: z.number(),
  userId: z.number(),
  date: z.string(),
  status: z.string(),
  checkIn: z.string().nullable(),
  checkOut: z.string().nullable(),
  regularHours: z.number().nullable(),
  overtimeHours: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const insertAttendanceSchema = attendanceSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Leave Schema
export const leaveSchema = z.object({
  id: z.number(),
  userId: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  type: z.string(),
  status: z.string(),
  reason: z.string(),
  approvedBy: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const insertLeaveSchema = leaveSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Payroll Schema
export const payrollSchema = z.object({
  id: z.number(),
  userId: z.number(),
  year: z.number(),
  month: z.number(),
  workingDays: z.number(),
  dailyWage: z.number(),
  grossPay: z.number(),
  tax: z.number(),
  nationalInsurance: z.number(),
  netPay: z.number(),
  status: z.string(),
  paymentDate: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const insertPayrollSchema = payrollSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Supplier Schema
export const supplierSchema = z.object({
  id: z.number(),
  supplier_code: z.string(),
  sage_code: z.string().nullable(),
  supplier_name: z.string(),
  address: z.string().nullable(),
  telephone: z.string().nullable(),
  fax: z.string().nullable(),
  email: z.string().email().nullable(),
  customer_country: z.string().nullable(),
  supplier_currency: z.string(),
  contact_no1: z.string().nullable(),
  contact_no2: z.string().nullable(),
  remarks: z.string().nullable(),
  vat_number: z.string().nullable(),
  credit_limit: z.number().nullable(),
  terms: z.string().nullable(),
  web_address: z.string().nullable(),
  bank_name: z.string().nullable(),
  bank_address: z.string().nullable(),
  bank_account_name: z.string().nullable(),
  sort_code: z.string().nullable(),
  account_no: z.string().nullable(),
  eec_group: z.string(),
  is_active: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export const insertSupplierSchema = supplierSchema.omit({
  id: true,
  created_at: true,
  updated_at: true
});

// Purchase Schema
export const purchaseSchema = z.object({
  id: z.number(),
  invoiceNumber: z.string(),
  supplierId: z.number().nullable(),
  supplierName: z.string().nullable(),
  amount: z.number(),
  vehicleDetails: z.string().nullable(),
  gateNumber: z.string().nullable(),
  date: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const insertPurchaseSchema = purchaseSchema.omit({
  id: true,
  supplierName: true,
  createdAt: true,
  updatedAt: true
}).extend({
  supplierId: z.number().nullable(),
});

// Expense Schema
export const expenseSchema = z.object({
  id: z.number(),
  expenseCode: z.string(),
  sageCode: z.string().nullable(),
  expenseName: z.string(),
  isActive: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const insertExpenseSchema = expenseSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Base Product Schema (common fields for both types)
const baseProductSchema = {
  id: z.number(),
  productCode: z.string(),
  sageCode: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  sellingPrice: z.number(),
  taxRate: z.number(),
  vatCode: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
};

// Regular Product specific fields
const regularProductFields = {
  hsCode: z.string().nullable(),
  unitOfPurchase: z.string().nullable(),
  unitOfSale: z.string().nullable(),
  location: z.string().nullable(),
  nominalCode: z.string().nullable(),
  stockCategory: z.string().nullable(),
  departmentNumber: z.string().nullable(),
  supplierRef: z.string().nullable(),
  supplierPartNumber: z.string().nullable(),
  reorderLevel: z.number(),
  stockLevelFlag: z.boolean(),
  commodityCode: z.string().nullable(),
  unitWeight: z.number(),
  stockTakeDate: z.string().nullable(),
  reorderQuantity: z.number(),
  lastStockTake: z.number(),
  initialStock: z.number()
};

// Regular Product Schema
export const regularProductSchema = z.object({
  ...baseProductSchema,
  ...regularProductFields
});

// Non-Product Schema
export const nonProductSchema = z.object({
  ...baseProductSchema,
  unitOfPurchase: z.string().nullable(),
  unitOfSale: z.string().nullable(),
  location: z.string().nullable(),
  nominalCode: z.string().nullable(),
  stockCategory: z.string().nullable(),
  departmentNumber: z.string().nullable(),
  supplierRef: z.string().nullable(),
  supplierPartNumber: z.string().nullable(),
  reorderLevel: z.number(),
  stockLevelFlag: z.boolean(),
  commodityCode: z.string().nullable(),
  unitWeight: z.number(),
  stockTakeDate: z.string().nullable(),
  reorderQuantity: z.number(),
  lastStockTake: z.number(),
  initialStock: z.number(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

// Insert schemas
export const insertRegularProductSchema = regularProductSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertNonProductSchema = nonProductSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  productCode: z.string().min(1, "Product code is required"),
  description: z.string().min(1, "Description is required"),
  sellingPrice: z.number().min(0, "Selling price must be positive").default(0),
  taxRate: z.number().min(0, "Tax rate must be positive").default(0),
  stockLevelFlag: z.boolean().default(false),
  reorderLevel: z.number().default(0),
  unitWeight: z.number().default(0),
  reorderQuantity: z.number().default(0),
  lastStockTake: z.number().default(0),
  initialStock: z.number().default(0),
  status: z.string().default("active")
});

// Company Schema
export const companySchema = z.object({
  id: z.number(),
  companyName: z.string().min(1, "Company name is required"),
  address1: z.string().min(1, "Address 1 is required"),
  address2: z.string().optional(),
  telephone: z.string().optional(),
  mobile: z.string().optional(),
  fax: z.string().optional(),
  website: z.string().optional(),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  vatNo: z.string().optional(),
  compRegNo: z.string().optional(),
  bankDetails: z.string().optional(),
  einlNumber: z.string().optional(),
  remarks: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

// Insert schema
export const insertCompanySchema = companySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// User with Attendance Schema
export const userWithAttendanceSchema = z.object({
  id: z.number(),
  username: z.string(),
  userType: z.string(),
  status: z.string(),
  dailyWage: z.number().nullable(),
  attendance: z.object({
    status: z.string(),
    leaveType: z.string().nullable(),
    holidayName: z.string().nullable()
  })
});

// Type definitions
export type User = z.infer<typeof userSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Customer = z.infer<typeof customerSchema>;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Sale = z.infer<typeof saleSchema>;
export type InsertSale = z.infer<typeof insertSaleSchema>;

export type SaleItem = z.infer<typeof saleItemSchema>;
export type InsertSaleItem = z.infer<typeof insertSaleItemSchema>;

export type Attendance = z.infer<typeof attendanceSchema>;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;

export type Leave = z.infer<typeof leaveSchema>;
export type InsertLeave = z.infer<typeof insertLeaveSchema>;

export type Payroll = z.infer<typeof payrollSchema>;
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;

export type Supplier = z.infer<typeof supplierSchema>;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

export type Purchase = z.infer<typeof purchaseSchema>;
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;

export type Expense = z.infer<typeof expenseSchema>;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;

export type RegularProduct = z.infer<typeof regularProductSchema>;
export type NonProduct = z.infer<typeof nonProductSchema>;
export type InsertRegularProduct = z.infer<typeof insertRegularProductSchema>;
export type InsertNonProduct = z.infer<typeof insertNonProductSchema>;

export type UpdateRegularProduct = Omit<RegularProduct, 'createdAt' | 'updatedAt'>;

export type Company = z.infer<typeof companySchema>;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type UserWithAttendance = z.infer<typeof userWithAttendanceSchema>;

// Payment Schema
export const paymentSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  saleId: z.number().nullable(), // Can be null for on-account payments
  amount: z.number(),
  paymentMode: z.string(),
  paymentDate: z.string(),
  remarks: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  currency: z.string().optional(),
});

export const insertPaymentSchema = paymentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type Payment = z.infer<typeof paymentSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

// Supplier Payment Schema
export const supplierPaymentSchema = z.object({
  id: z.number(),
  supplierId: z.number(),
  purchaseInvoiceId: z.number().nullable(), // Can be null for on-account payments
  amount: z.number(),
  paymentMode: z.string(),
  paymentDate: z.string(),
  supplierInvoiceNumber: z.string().nullable(),
  supplierInvoiceDate: z.string().nullable(),
  remarks: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const insertSupplierPaymentSchema = supplierPaymentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type SupplierPayment = z.infer<typeof supplierPaymentSchema>;
export type InsertSupplierPayment = z.infer<typeof insertSupplierPaymentSchema>;

// Stock Movement Schema
export const stockMovementSchema = z.object({
  id: z.number(),
  productId: z.number(),
  productType: z.string(),
  movementType: z.string(),
  quantity: z.number(),
  referenceId: z.number().nullable(),
  referenceType: z.string().nullable(),
  previousStock: z.number(),
  newStock: z.number(),
  remarks: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.number().nullable()
});

export const insertStockMovementSchema = stockMovementSchema.omit({
  id: true,
  createdAt: true
});

// Stock Adjustment Schema
export const stockAdjustmentSchema = z.object({
  id: z.number(),
  productId: z.number(),
  productType: z.string(),
  adjustmentType: z.string(),
  quantity: z.number(),
  previousStock: z.number(),
  newStock: z.number(),
  reason: z.string(),
  remarks: z.string().nullable(),
  adjustmentDate: z.string(),
  createdAt: z.string(),
  createdBy: z.number().nullable()
});

export const insertStockAdjustmentSchema = stockAdjustmentSchema.omit({
  id: true,
  createdAt: true
});

export type StockMovement = z.infer<typeof stockMovementSchema>;
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockAdjustment = z.infer<typeof stockAdjustmentSchema>;
export type InsertStockAdjustment = z.infer<typeof insertStockAdjustmentSchema>;

// Expense Entry Schema
export const expenseEntrySchema = z.object({
  id: z.number(),
  refNumber: z.string(),
  date: z.string(),
  supplierId: z.number().nullable(),
  supplierName: z.string().nullable(),
  expenseId: z.number(),
  expenseName: z.string().nullable(),
  description: z.string(),
  invoiceNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  paymentMode: z.string(),
  amount: z.number(),
  vatAmount: z.number(),
  totalAmount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.number().nullable()
});

export const insertExpenseEntrySchema = expenseEntrySchema.omit({
  id: true,
  supplierName: true,
  expenseName: true,
  createdAt: true,
  updatedAt: true
});

export type ExpenseEntry = z.infer<typeof expenseEntrySchema>;
export type InsertExpenseEntry = z.infer<typeof insertExpenseEntrySchema>;

// Dump Entry Schema
export const dumpEntrySchema = z.object({
  id: z.number(),
  refNumber: z.string(),
  date: z.string(),
  supplierId: z.number().nullable(),
  supplierName: z.string().nullable(),
  productId: z.number(),
  productType: z.string(),
  productName: z.string().nullable(),
  description: z.string(),
  remarks: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalValue: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.number().nullable()
});

export const insertDumpEntrySchema = dumpEntrySchema.omit({
  id: true,
  supplierName: true,
  productName: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true
});

export type DumpEntry = z.infer<typeof dumpEntrySchema>;
export type InsertDumpEntry = z.infer<typeof insertDumpEntrySchema>;

// Customer Return Schema
export const customerReturnSchema = z.object({
  id: z.number(),
  refNumber: z.string(),
  date: z.string(),
  customerId: z.number(),
  customerName: z.string().nullable(),
  saleId: z.number().nullable(),
  productId: z.number(),
  productType: z.string(),
  description: z.string(),
  invoiceNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalValue: z.number(),
  returnReason: z.string().nullable(),
  creditNoteIssued: z.boolean(),
  creditNoteAmount: z.number(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.number().nullable()
});

export const insertCustomerReturnSchema = customerReturnSchema.omit({
  id: true,
  customerName: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true
});

// Supplier Return Schema
export const supplierReturnSchema = z.object({
  id: z.number(),
  refNumber: z.string(),
  date: z.string(),
  supplierId: z.number(),
  supplierName: z.string().nullable(),
  purchaseInvoiceId: z.number().nullable(),
  productId: z.number(),
  productType: z.string(),
  description: z.string(),
  invoiceNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalValue: z.number(),
  returnReason: z.string().nullable(),
  creditNoteIssued: z.boolean(),
  creditNoteAmount: z.number(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.number().nullable()
});

export const insertSupplierReturnSchema = supplierReturnSchema.omit({
  id: true,
  supplierName: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true
});

export type CustomerReturn = z.infer<typeof customerReturnSchema>;
export type InsertCustomerReturn = z.infer<typeof insertCustomerReturnSchema>;

export type SupplierReturn = z.infer<typeof supplierReturnSchema>;
export type InsertSupplierReturn = z.infer<typeof insertSupplierReturnSchema>;

export const cashCarryForwardSchema = z.object({
  id: z.number().optional(),
  date: z.string(), // ISO date string
  pounds: z.number(),
  coins: z.number(),
  createdAt: z.string().optional(),
});

export const insertCashCarryForwardSchema = cashCarryForwardSchema.omit({
  id: true,
  createdAt: true,
});

export type CashCarryForward = z.infer<typeof cashCarryForwardSchema>;
export type InsertCashCarryForward = z.infer<typeof insertCashCarryForwardSchema>;

export const bankingEntrySchema = z.object({
  id: z.number(),
  date: z.string(), // ISO date string
  remarks: z.string(),
  paymentType: z.string(),
  amount: z.number(),
  payingNumber: z.string().nullable().optional(),
  bagNumber: z.string().nullable().optional(), // For CHEQUE payments and backward compatibility
  bagNumbers: z.array(z.string()).optional(), // New field for multiple bag numbers
  bagAmounts: z.array(z.number()).optional(), // New field for individual bag amounts
  bags: z.array(z.object({
    number: z.string(),
    payingNumber: z.string().optional(),
    amount: z.number()
  })).optional(), // Combined bag data
  chequeNumber: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

export const insertBankingEntrySchema = bankingEntrySchema.omit({
  id: true,
  createdAt: true,
});

export type BankingEntry = z.infer<typeof bankingEntrySchema>;
export type InsertBankingEntry = z.infer<typeof insertBankingEntrySchema>;

export const userRestrictionSchema = z.object({
  id: z.number().optional(),
  user_id: z.number(),
  section: z.string(),
  allowed: z.boolean(),
});

export type UserRestriction = z.infer<typeof userRestrictionSchema>;

// Employee Document Schema
export const employeeDocumentSchema = z.object({
  id: z.number().optional(),
  documentName: z.string().min(1, "Document name is required"),
  startDate: z.string().optional().nullable(), // ISO date string
  endDate: z.string().optional().nullable(), // ISO date string
});

export const insertEmployeeDocumentSchema = employeeDocumentSchema.omit({
  id: true,
});

export type EmployeeDocument = z.infer<typeof employeeDocumentSchema>;
export type InsertEmployeeDocument = z.infer<typeof insertEmployeeDocumentSchema>;

// Employee Schema
export const employeeSchema = z.object({
  id: z.number(),
  fullName: z.string().min(1, "Full name is required"),
  title: z.string().optional().nullable(),
  homeAddress: z.string().optional().nullable(),
  homePhoneNumber: z.string().optional().nullable(),
  mobileNumber: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(), // ISO date string
  maritalStatus: z.string().optional().nullable(),
  nationalInsuranceNumber: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(), // ISO date string
  department: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  salary: z.number().optional().nullable(),
  probationPeriod: z.string().optional().nullable(),
  lineManager: z.string().optional().nullable(),
  term: z.string().optional().nullable(), // permanent or contract
  status: z.string().optional().nullable(), // P/T or F/T
  bankName: z.string().optional().nullable(),
  branchName: z.string().optional().nullable(),
  branchAddress: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  sortCode: z.string().optional().nullable(),
  forkLiftCertificateCompanyName: z.string().optional().nullable(),
  licenceCertificateNumber: z.string().optional().nullable(),
  marketPermitNumber: z.string().optional().nullable(),
  entitlementDays: z.number().optional().default(25),
  // Next of Kin Information
  nextOfKinName: z.string().optional().nullable(),
  nextOfKinPhoneNumber: z.string().optional().nullable(),
  nextOfKinEmail: z.string().optional().nullable(),
  nextOfKinAddress: z.string().optional().nullable(),
  nextOfKinRelationship: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  documents: z.array(employeeDocumentSchema).optional().default([]),
  isActive: z.string().default("yes"),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const insertEmployeeSchema = employeeSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  documents: z.array(insertEmployeeDocumentSchema).optional().default([]),
});

export type Employee = z.infer<typeof employeeSchema>;

export const employeeWithAttendanceSchema = z.object({
  id: z.number(),
  fullName: z.string(),
  title: z.string().nullable(),
  dailyWage: z.number().nullable(),
  status: z.string(),
  attendance: z.object({
    status: z.string(),
    leaveType: z.string().nullable(),
    holidayName: z.string().nullable()
  })
});

export type EmployeeWithAttendance = z.infer<typeof employeeWithAttendanceSchema>;

// Holiday Request Schema
export const holidayRequestSchema = z.object({
  id: z.number().optional(),
  employeeId: z.number(),
  employeeName: z.string().min(1, "Employee name is required"),
  jobTitle: z.string().optional(),
  totalDaysRequested: z.number().min(1, "Total days must be at least 1"),
  lastDateAtWork: z.string(),
  returnDateToWork: z.string(),
  signedByEmployee: z.string().optional(),
  dateByEmployee: z.string().optional(),
  status: z.enum(["pending", "granted", "not_granted"]).default("pending"),
  daysGranted: z.number().optional(),
  daysLeftEntitlement: z.number().optional(),
  managerName: z.string().optional(),
  signedByManager: z.string().optional(),
  datedByManager: z.string().optional(),
  managerComments: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const insertHolidayRequestSchema = holidayRequestSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type HolidayRequest = z.infer<typeof holidayRequestSchema>;
export type InsertHolidayRequest = z.infer<typeof insertHolidayRequestSchema>;

// Equipment Schema
export const equipmentSchema = z.object({
  id: z.number().optional(),
  description: z.string().min(1, "Description is required"),
  startDate: z.string(),
  endDate: z.string(),
  isActive: z.string().default("yes"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const insertEquipmentSchema = equipmentSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type Equipment = z.infer<typeof equipmentSchema>;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;