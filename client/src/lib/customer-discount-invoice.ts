import { getApiUrl } from "@/lib/config";

interface CustomerDiscountPrintRecord {
  customer: Record<string, unknown>;
  discount: {
    id: number;
    documentInvoiceNumber: string;
    originalInvoiceNumber?: string;
    date: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    reason: string;
  };
}

interface CustomerDiscountPrintResponse {
  company: Record<string, unknown>;
  discounts: CustomerDiscountPrintRecord[];
}

export interface CustomerDiscountInvoiceData {
  company: Record<string, unknown>;
  customer: Record<string, unknown>;
  sale: Record<string, unknown> & {
    invoice_number: string;
    invoiceNumber: string;
    date: string;
    subtotal: number;
    total_amount: number;
    totalAmount: number;
    vat_amount: number;
    customer_type: string;
    isCustomerDiscount: true;
    originalInvoiceNumber?: string;
  };
  items: Array<Record<string, unknown> & {
    id: number;
    productName: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    total_price: number;
    notes: string;
  }>;
  paidAmount: number;
  balance: number;
  notes: string;
}

export async function fetchCustomerDiscountInvoices(ids: string[]): Promise<CustomerDiscountInvoiceData[]> {
  const uniqueIds = Array.from(new Set(ids.filter(id => /^\d+$/.test(id) && Number(id) > 0)));
  if (uniqueIds.length === 0) return [];

  const response = await fetch(getApiUrl(`/api/customer-discounts/print?ids=${encodeURIComponent(uniqueIds.join(","))}`), {
    headers: { Accept: "application/json" },
  });
  const responseData = await response.json() as CustomerDiscountPrintResponse & { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(responseData.message || responseData.error || `HTTP error! status: ${response.status}`);
  }

  return responseData.discounts.map(({ customer, discount }) => {
    const amount = Number(discount.amount || 0);
    const notes = discount.reason;
    const item = {
      id: discount.id,
      productName: discount.productName || "Customer discount",
      description: discount.productName || "Customer discount",
      quantity: 1,
      unitPrice: amount,
      totalPrice: -amount,
      total_price: -amount,
      notes,
    };

    return {
      company: responseData.company,
      customer,
      sale: {
        invoice_number: discount.documentInvoiceNumber,
        invoiceNumber: discount.documentInvoiceNumber,
        date: discount.date,
        subtotal: -amount,
        total_amount: -amount,
        totalAmount: -amount,
        vat_amount: 0,
        porterage: 0,
        customer_type: "account",
        isCustomerDiscount: true,
        originalInvoiceNumber: discount.originalInvoiceNumber,
      },
      items: [item],
      paidAmount: 0,
      balance: -amount,
      notes,
    };
  });
}
