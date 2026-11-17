import { getApiUrl } from "@/lib/config";

interface CustomerDiscountPrintRecord {
  customer: Record<string, unknown>;
  discount: {
    id: number;
    documentInvoiceNumber: string | null;
    originalInvoiceNumber?: string | null;
    date: string;
    createdAt?: string | null;
    productName: string;
    originalInvoiceDate?: string;
    quantity: number;
    originalQuantity: number;
    averagePriceAfterDiscount: number;
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
    originalInvoiceDate?: string;
    originalQuantity: number;
    averagePriceAfterDiscount: number;
    discountPerBox: number;
    hasMultipleDiscountLines: boolean;
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

  const groupedDiscounts = new Map<string, CustomerDiscountPrintRecord[]>();
  responseData.discounts.forEach(record => {
    const key = record.discount.documentInvoiceNumber || `discount-${record.discount.id}`;
    groupedDiscounts.set(key, [...(groupedDiscounts.get(key) || []), record]);
  });

  return Array.from(groupedDiscounts.values()).map(records => {
    const [firstRecord] = records;
    const discounts = records.map(record => record.discount);
    const totalAmount = discounts.reduce((total, discount) => total + Number(discount.amount || 0), 0);
    const invoiceNumbers = Array.from(new Set(
      discounts.map(discount => discount.originalInvoiceNumber).filter((value): value is string => !!value),
    ));
    const invoiceDates = Array.from(new Set(
      discounts.map(discount => discount.originalInvoiceDate).filter((value): value is string => !!value),
    ));
    const hasMultipleDiscountLines = discounts.length > 1;
    const items = discounts.map(discount => {
      const amount = Number(discount.amount || 0);
      const quantity = Number(discount.quantity || discount.originalQuantity || 0) || 1;
      const perBox = quantity > 0 ? amount / quantity : amount;
      const lineNotes = [
        `Invoice ${discount.originalInvoiceNumber || "-"}`,
        discount.originalInvoiceDate ? formatInvoiceDate(discount.originalInvoiceDate) : "",
        `Each box: £${perBox.toFixed(2)}`,
        discount.reason,
      ].filter(Boolean).join(" · ");

      return {
        id: discount.id,
        productName: discount.productName || "Customer discount",
        description: discount.productName || "Customer discount",
        quantity,
        unitPrice: perBox,
        totalPrice: -amount,
        total_price: -amount,
        notes: lineNotes,
      };
    });

    return {
      company: responseData.company,
      customer: firstRecord.customer,
      sale: {
        invoice_number: firstRecord.discount.documentInvoiceNumber || "",
        invoiceNumber: firstRecord.discount.documentInvoiceNumber || "",
        date: firstRecord.discount.createdAt || firstRecord.discount.date,
        subtotal: -totalAmount,
        total_amount: -totalAmount,
        totalAmount: -totalAmount,
        vat_amount: 0,
        porterage: 0,
        customer_type: "account",
        isCustomerDiscount: true,
        originalInvoiceNumber: invoiceNumbers.join(", "),
        originalInvoiceDate: invoiceDates.length === 1 ? invoiceDates[0] : undefined,
        originalQuantity: hasMultipleDiscountLines
          ? 0
          : Number(discounts[0].originalQuantity ?? discounts[0].quantity ?? 0),
        averagePriceAfterDiscount: hasMultipleDiscountLines
          ? 0
          : Number(discounts[0].averagePriceAfterDiscount ?? 0),
        discountPerBox: hasMultipleDiscountLines
          ? 0
          : (() => {
              const qty = Number(discounts[0]?.quantity ?? discounts[0]?.originalQuantity ?? 0);
              return qty > 0 ? totalAmount / qty : 0;
            })(),
        hasMultipleDiscountLines,
      },
      items,
      paidAmount: 0,
      balance: -totalAmount,
      notes: "",
    };
  });
}

function formatInvoiceDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
