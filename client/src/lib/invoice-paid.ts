/**
 * Shared "is this invoice fully paid?" check for print pages.
 *
 * An invoice counts as paid when:
 *  - backend `paymentStatus` is 'paid' / 'overpaid' (set when cash is taken
 *    at sale time or a customer payment later covers the total), OR
 *  - paid amount covers the total (covers cash sales and credit-note
 *    applications where the status field may lag), OR
 *  - the reported balance is ~zero.
 */
export function isInvoicePaid(
  sale: any,
  paidAmount?: number | null,
  balance?: number | null,
): boolean {
  const status = String(
    sale?.paymentStatus ?? sale?.payment_status ?? "",
  ).toLowerCase();
  if (status === "paid" || status === "overpaid") return true;

  const total = Number(sale?.totalAmount ?? sale?.total_amount ?? 0);
  if (!(total > 0)) return false;

  const paid = Number(
    sale?.paidAmount ?? sale?.paid_amount ?? paidAmount ?? 0,
  );
  if (paid >= total - 0.01) return true;
  if (balance != null && Number(balance) <= 0.01) return true;

  return false;
}
