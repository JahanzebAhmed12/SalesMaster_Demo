import { getApiUrl } from "@/lib/config";

interface CustomerReturnPrintRecord {
  customer: Record<string, unknown>;
  product: Record<string, unknown>;
  returnItem: {
    id: number;
    refNumber: string;
    date: string;
    invoiceNumber?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalValue: number;
    returnReason?: string;
    remarks?: string;
  };
}

interface CustomerReturnPrintResponse {
  company: Record<string, unknown>;
  returns: CustomerReturnPrintRecord[];
}

export interface CustomerReturnInvoiceData {
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
    isCustomerReturn: true;
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
    notes?: string;
    remarks?: string;
  }>;
  paidAmount: number;
  balance: number;
  notes: string;
}

export async function fetchCustomerReturnInvoices(ids: string[]): Promise<CustomerReturnInvoiceData[]> {
  const uniqueIds = Array.from(new Set(ids.filter(id => /^\d+$/.test(id) && Number(id) > 0)));
  if (uniqueIds.length === 0) return [];

  const response = await fetch(getApiUrl(`/api/customer-returns/print?ids=${encodeURIComponent(uniqueIds.join(","))}`), {
    headers: { Accept: "application/json" },
  });
  const responseData = await response.json() as CustomerReturnPrintResponse & { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(responseData.message || responseData.error || `HTTP error! status: ${response.status}`);
  }

  return responseData.returns.map(({ customer, returnItem }) => {
    const amount = Number(returnItem.totalValue || 0);
    const itemNotes = [returnItem.returnReason, returnItem.remarks].filter(Boolean).join(" - ");
    const item = {
      id: returnItem.id,
      productName: returnItem.description,
      description: returnItem.description,
      quantity: Number(returnItem.quantity || 0),
      unitPrice: Number(returnItem.unitPrice || 0),
      totalPrice: amount,
      total_price: amount,
      notes: itemNotes || undefined,
      remarks: itemNotes || undefined,
    };

    return {
      company: responseData.company,
      customer,
      sale: {
        invoice_number: returnItem.refNumber,
        invoiceNumber: returnItem.refNumber,
        date: returnItem.date,
        subtotal: amount,
        total_amount: amount,
        totalAmount: amount,
        vat_amount: 0,
        porterage: 0,
        customer_id: customer.id,
        customer_type: "account",
        isCustomerReturn: true,
        originalInvoiceNumber: returnItem.invoiceNumber,
      },
      items: [item],
      paidAmount: 0,
      balance: amount,
      notes: itemNotes,
    };
  });
}
