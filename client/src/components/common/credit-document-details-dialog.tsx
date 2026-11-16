import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/config";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatQuantity } from "@/lib/utils";

const money = (value: number | null | undefined) => `£${Number(value || 0).toFixed(2)}`;

interface DiscountPrintLine {
  customer: Record<string, unknown>;
  discount: {
    id: number;
    documentInvoiceNumber: string | null;
    originalInvoiceNumber?: string | null;
    originalInvoiceDate?: string | null;
    date: string;
    productName: string;
    quantity: number;
    originalQuantity: number;
    averagePriceAfterDiscount: number;
    unitPrice: number;
    amount: number;
    reason: string;
  };
}

interface ReturnPrintLine {
  customer: Record<string, unknown>;
  product: Record<string, unknown>;
  originalInvoiceDate?: string;
  returnItem: {
    id: number;
    refNumber: string;
    documentInvoiceNumber?: string;
    date: string;
    invoiceNumber?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalValue: number;
    returnReason?: string;
    remarks?: string;
    itemRemarks?: string;
  };
}

interface CreditDocumentDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "discount" | "return";
  /** Positive CustomerDiscount or CustomerReturn line id — the API expands it to the whole document. */
  lineId: number | null;
}

async function fetchPrintJson<T>(path: string): Promise<T> {
  const response = await fetch(getApiUrl(path), { headers: { Accept: "application/json" } });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `HTTP error! status: ${response.status}`);
  }
  return data as T;
}

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB");
};

export function CreditDocumentDetailsDialog({ open, onOpenChange, kind, lineId }: CreditDocumentDetailsDialogProps) {
  const isDiscount = kind === "discount";
  const endpoint = isDiscount ? "/api/customer-discounts/print" : "/api/customer-returns/print";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["credit-document-details", kind, lineId],
    queryFn: () => fetchPrintJson<{ discounts?: DiscountPrintLine[]; returns?: ReturnPrintLine[] }>(
      `${endpoint}?ids=${lineId}`,
    ),
    enabled: open && !!lineId,
  });

  const records = isDiscount ? (data?.discounts ?? []) : (data?.returns ?? []);
  const firstCustomer = records[0]?.customer as { customer_name?: string; customerName?: string } | undefined;
  const customerName = firstCustomer?.customer_name || firstCustomer?.customerName || "";
  const documentNumber = isDiscount
    ? (records[0] as DiscountPrintLine | undefined)?.discount?.documentInvoiceNumber
    : (records[0] as ReturnPrintLine | undefined)?.returnItem?.documentInvoiceNumber;
  const title = isDiscount ? "Discount Ticket" : "Customer Return";

  const totalAmount = isDiscount
    ? records.reduce((sum, r) => sum + Number((r as DiscountPrintLine).discount?.amount || 0), 0)
    : records.reduce((sum, r) => sum + Number((r as ReturnPrintLine).returnItem?.totalValue || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {title}{documentNumber ? ` ${documentNumber}` : ""}
          </DialogTitle>
          {customerName && (
            <p className="text-sm text-muted-foreground">
              {customerName}
              {records[0] && (
                <>
                  {" · "}
                  {formatDate(
                    isDiscount
                      ? (records[0] as DiscountPrintLine).discount?.date
                      : (records[0] as ReturnPrintLine).returnItem?.date,
                  )}
                </>
              )}
            </p>
          )}
        </DialogHeader>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading details…</p>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-destructive">Failed to load details.</p>
        ) : records.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No details found.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">{isDiscount ? "Each box" : "Unit price"}</TableHead>
                  <TableHead className="text-right">{isDiscount ? "Discount" : "Total"}</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isDiscount
                  ? (records as DiscountPrintLine[]).map((record) => {
                      const d = record.discount;
                      const qty = Number(d.originalQuantity ?? d.quantity ?? 0);
                      const perBox = qty > 0 ? Number(d.amount || 0) / qty : Number(d.amount || 0);
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.productName || "Customer discount"}</TableCell>
                          <TableCell>
                            {d.originalInvoiceNumber || "-"}
                            {d.originalInvoiceDate && <span className="block text-xs text-muted-foreground">{formatDate(d.originalInvoiceDate)}</span>}
                          </TableCell>
                          <TableCell className="text-center">{formatQuantity(qty)}</TableCell>
                          <TableCell className="text-right">{money(perBox)}</TableCell>
                          <TableCell className="text-right">{money(-Number(d.amount || 0))}</TableCell>
                          <TableCell className="max-w-[180px] whitespace-normal text-xs">{d.reason || "-"}</TableCell>
                        </TableRow>
                      );
                    })
                  : (records as ReturnPrintLine[]).map((record) => {
                      const r = record.returnItem;
                      const remarks = [r.itemRemarks || r.returnReason, r.remarks].filter(Boolean).join(" — ");
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.description || "Product"}</TableCell>
                          <TableCell>
                            {r.invoiceNumber || "-"}
                            {record.originalInvoiceDate && <span className="block text-xs text-muted-foreground">{formatDate(record.originalInvoiceDate)}</span>}
                          </TableCell>
                          <TableCell className="text-center">{formatQuantity(r.quantity)}</TableCell>
                          <TableCell className="text-right">{money(r.unitPrice)}</TableCell>
                          <TableCell className="text-right">{money(-Math.abs(Number(r.totalValue || 0)))}</TableCell>
                          <TableCell className="max-w-[180px] whitespace-normal text-xs">{remarks || "-"}</TableCell>
                        </TableRow>
                      );
                    })}
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold">
                    {money(isDiscount ? -totalAmount : -Math.abs(totalAmount))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
