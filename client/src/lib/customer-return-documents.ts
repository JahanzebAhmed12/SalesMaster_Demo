export interface CustomerReturnLineRecord {
  id: number;
  date: string;
  customerName?: string | null;
  productDescription?: string | null;
  description?: string | null;
  invoiceNumber?: string | null;
  documentInvoiceNumber?: string | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  remarks?: string | null;
  itemRemarks?: string | null;
}

export type CustomerReturnDocument<T extends CustomerReturnLineRecord> = T & {
  items: T[];
  productDescription: string;
  invoiceNumber: string | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  itemRemarks: string | null;
};

export function groupCustomerReturnDocuments<T extends CustomerReturnLineRecord>(
  lines: T[],
): CustomerReturnDocument<T>[] {
  const grouped = new Map<string, T[]>();
  for (const line of lines) {
    const key = line.documentInvoiceNumber
      ? `document-${line.documentInvoiceNumber}`
      : `return-${line.id}`;
    const documentLines = grouped.get(key) || [];
    documentLines.push(line);
    grouped.set(key, documentLines);
  }

  return Array.from(grouped.values(), (items) => {
    const first = items[0];
    const quantity = items.reduce((total, item) => total + Number(item.quantity || 0), 0);
    const totalValue = items.reduce((total, item) => total + Number(item.totalValue || 0), 0);
    const itemRemarks = Array.from(new Set(
      items
        .map((item) => item.itemRemarks?.trim())
        .filter((remark): remark is string => Boolean(remark)),
    )).join("; ");
    const products = items.map((item) => {
      const description = item.productDescription || item.description || "Product";
      return `${description} (${Number(item.quantity || 0)})`;
    });

    return {
      ...first,
      items,
      productDescription: products.join(", "),
      invoiceNumber: first.documentInvoiceNumber || first.invoiceNumber || null,
      quantity,
      unitPrice: quantity ? totalValue / quantity : 0,
      totalValue,
      itemRemarks: itemRemarks || null,
    };
  });
}
