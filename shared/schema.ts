import { z } from "zod";

// User Schema
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  userType: z.string(),
  status: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  joinDate: z.string().nullable(),
  hourlyRate: z.number().nullable(),
  overtimeRate: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const insertUserSchema = userSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
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
  email: z.string().email().nullable(),
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
  is_active: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export const insertCustomerSchema = customerSchema.omit({
  id: true,
  created_at: true,
  updated_at: true
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
  createdAt: z.string(),
  updatedAt: z.string()
});

export const insertSaleSchema = saleSchema.omit({
  id: true,
  customerName: true,
  createdAt: true,
  updatedAt: true
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
  regularHours: z.number(),
  overtimeHours: z.number(),
  hourlyRate: z.number(),
  overtimeRate: z.number(),
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
  supplierId: z.number(),
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
  lastStockTake: z.number()
};

// Regular Product Schema
export const regularProductSchema = z.object({
  ...baseProductSchema,
  ...regularProductFields
});

// Non-Product Schema
export const nonProductSchema = z.object({
  ...baseProductSchema
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

// Type definitions
export type User = z.infer<typeof userSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Customer = z.infer<typeof customerSchema>;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Sale = z.infer<typeof saleSchema>;
export type InsertSale = z.infer<typeof insertSaleSchema>;

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
