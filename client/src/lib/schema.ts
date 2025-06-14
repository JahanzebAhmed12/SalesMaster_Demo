import { z } from "zod";

// Sale Item Schema
export const saleItemSchema = z.object({
  id: z.number().optional(),
  saleId: z.number().optional(),
  productId: z.number().nullable(),
  nonProductId: z.number().nullable(),
  productName: z.string().nullable(),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.number().min(0, "Unit price must be positive"),
  totalPrice: z.number().min(0, "Total price must be positive"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type SaleItem = z.infer<typeof saleItemSchema>;

// Sale Schema
export const saleSchema = z.object({
  id: z.number().optional(),
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  customerId: z.number().min(1, "Customer is required"),
  customerName: z.string().optional(),
  date: z.string().optional(),
  customerType: z.enum(["credit", "cash"]).default("credit"),
  paymentStatus: z.enum(["pending", "paid", "partial"]).default("pending"),
  subtotal: z.number().min(0, "Subtotal must be positive"),
  porterage: z.number().min(0, "Porterage must be positive").default(0),
  vatRate: z.number().min(0, "VAT rate must be positive").default(0),
  vatAmount: z.number().min(0, "VAT amount must be positive").default(0),
  totalAmount: z.number().min(0, "Total amount must be positive"),
  vehicleDetails: z.string().optional(),
  gateNumber: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["draft", "confirmed", "cancelled"]).default("draft"),
  items: z.array(saleItemSchema).min(1, "At least one item is required"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Sale = z.infer<typeof saleSchema>;

// Customer Schema
export const customerSchema = z.object({
  id: z.number().optional(),
  customerCode: z.string().min(1, "Customer code is required"),
  sageCode: z.string().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  address: z.string().optional(),
  telephone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().email("Invalid email").optional(),
  customerCity: z.string().optional(),
  customerCountry: z.string().optional(),
  customerCurrency: z.string().default("GBP"),
  remarks: z.string().optional(),
  ownBranch: z.string().default("no"),
  vatNumber: z.string().optional(),
  creditLimit: z.number().min(0).optional(),
  terms: z.string().optional(),
  settlementDays: z.number().min(0).default(0),
  settlementDiscount: z.number().min(0).default(0),
  webAddress: z.string().optional(),
  isActive: z.string().default("yes"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Customer = z.infer<typeof customerSchema>;

// Regular Product Schema
export const regularProductSchema = z.object({
  id: z.number().optional(),
  productCode: z.string().min(1, "Product code is required"),
  sageCode: z.string().optional(),
  hsCode: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  sellingPrice: z.number().min(0, "Selling price must be positive").default(0),
  taxRate: z.number().min(0, "Tax rate must be positive").default(0),
  vatCode: z.string().optional(),
  unitOfPurchase: z.string().optional(),
  unitOfSale: z.string().optional(),
  location: z.string().optional(),
  nominalCode: z.string().optional(),
  stockCategory: z.string().optional(),
  departmentNumber: z.string().optional(),
  supplierRef: z.string().optional(),
  supplierPartNumber: z.string().optional(),
  reorderLevel: z.number().min(0).default(0),
  stockLevelFlag: z.boolean().default(false),
  commodityCode: z.string().optional(),
  unitWeight: z.number().min(0).default(0),
  stockTakeDate: z.string().optional(),
  reorderQuantity: z.number().min(0).default(0),
  lastStockTake: z.number().min(0).default(0),
  status: z.string().default("active"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type RegularProduct = z.infer<typeof regularProductSchema>;

// Non Product Schema
export const nonProductSchema = z.object({
  id: z.number().optional(),
  productCode: z.string().min(1, "Product code is required"),
  sageCode: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  sellingPrice: z.number().min(0, "Selling price must be positive").default(0),
  taxRate: z.number().min(0, "Tax rate must be positive").default(0),
  vatCode: z.string().optional(),
  status: z.string().default("active"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type NonProduct = z.infer<typeof nonProductSchema>;

// Form Schemas
export const saleFormSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  customerId: z.number().min(1, "Customer is required"),
  customerType: z.enum(["credit", "cash"]).default("credit"),
  items: z.array(z.object({
    productId: z.number().nullable(),
    nonProductId: z.number().nullable(),
    quantity: z.number().min(1, "Quantity must be at least 1"),
    unitPrice: z.number().min(0, "Unit price must be positive"),
  })).min(1, "At least one item is required"),
  vehicleDetails: z.string().optional(),
  gateNumber: z.string().optional(),
  notes: z.string().optional(),
});

export type SaleFormData = z.infer<typeof saleFormSchema>; 