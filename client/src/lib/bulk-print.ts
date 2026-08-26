export function getBulkPrintInvoiceNumbers(search: string): string[] {
  const params = new URLSearchParams(search);
  return (params.get("invs") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
