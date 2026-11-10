import { getApiUrl } from "@/lib/config";

interface CustomerReturnPrintRecord {
  customer: Record<string, unknown>;
  product: Record<string, unknown>;
  originalInvoiceDate?: string;
  returnItem: {
    id: number;
    refNumber: string;
    documentInvoiceNumber?: string;
    sourceSaleItemId?: number;
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
    originalInvoiceDate?: string;
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

  const groupedReturns = new Map<string, {
    customer: Record<string, unknown>;
    documentNumber: string;
    date: string;
    originalInvoiceNumber?: string;
    originalInvoiceDate?: string;
    items: CustomerReturnInvoiceData["items"];
    total: number;
    notes: string[];
  }>();

  for (const { customer, returnItem, originalInvoiceDate } of responseData.returns) {
    const documentNumber = returnItem.documentInvoiceNumber || returnItem.refNumber;
    const key = returnItem.documentInvoiceNumber
      ? `document-${returnItem.documentInvoiceNumber}`
      : `return-${returnItem.id}`;
    const group = groupedReturns.get(key) || {
      customer,
      documentNumber,
      date: returnItem.date,
      originalInvoiceNumber: returnItem.invoiceNumber,
      originalInvoiceDate,
      items: [],
      total: 0,
      notes: [],
    };
    const amount = -Math.abs(Number(returnItem.totalValue || 0));
    const itemNotes = Array.from(new Set(
      [returnItem.returnReason, returnItem.remarks]
        .map(note => note?.trim())
        .filter((note): note is string => Boolean(note)),
    )).join(" - ");
    group.items.push({
      id: returnItem.id,
      productName: returnItem.description,
      description: returnItem.description,
      quantity: Number(returnItem.quantity || 0),
      unitPrice: Number(returnItem.unitPrice || 0),
      totalPrice: amount,
      total_price: amount,
      notes: itemNotes || undefined,
      remarks: itemNotes || undefined,
    });
    group.total += amount;
    if (itemNotes && !group.notes.includes(itemNotes)) group.notes.push(itemNotes);
    groupedReturns.set(key, group);
  }

  return Array.from(groupedReturns.values()).map((group) => ({
    company: responseData.company,
    customer: group.customer,
    sale: {
      invoice_number: group.documentNumber,
      invoiceNumber: group.documentNumber,
      date: group.date,
      subtotal: group.total,
      total_amount: group.total,
      totalAmount: group.total,
      vat_amount: 0,
      porterage: 0,
      customer_id: group.customer.id,
      customer_type: "account",
      isCustomerReturn: true as const,
      originalInvoiceNumber: group.originalInvoiceNumber,
      originalInvoiceDate: group.originalInvoiceDate,
    },
    items: group.items,
    paidAmount: 0,
    balance: group.total,
    notes: group.notes.join(" - "),
  }));
}
