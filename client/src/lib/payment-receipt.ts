export interface PaymentReceiptPayment {
  paymentMode?: string | null;
  paymentType?: string | null;
  invoiceNumber?: string | number | null;
}

export function getPaymentMethodKey(payment: PaymentReceiptPayment): string {
  return payment.paymentMode?.toLowerCase() === "bank"
    ? "card"
    : (payment.paymentMode || "other");
}

export function getInvoiceNumbersByPaymentMethod(
  payments: PaymentReceiptPayment[],
): Record<string, string[]> {
  return payments.reduce<Record<string, string[]>>((byMethod, payment) => {
    // Account/on-account receipts are not tied to a specific invoice and must
    // never display an invoice number on the payment receipt.
    if (payment.paymentType === "on-account" || !payment.invoiceNumber) return byMethod;

    const method = getPaymentMethodKey(payment);
    const invoiceNumber = String(payment.invoiceNumber);
    if (!byMethod[method]) byMethod[method] = [];
    if (!byMethod[method].includes(invoiceNumber)) byMethod[method].push(invoiceNumber);
    return byMethod;
  }, {});
}

export function getNonAccountInvoiceNumbers(payments: PaymentReceiptPayment[]): string[] {
  return Array.from(new Set(
    payments
      .filter(payment => payment.paymentType !== "on-account")
      .map(payment => payment.invoiceNumber)
      .filter((invoiceNumber): invoiceNumber is string | number => Boolean(invoiceNumber))
      .map(invoiceNumber => String(invoiceNumber)),
  ));
}

export function formatPaymentMethodLabel(
  method: string,
  invoiceNumbers: string[] = [],
): string {
  const methodLabels: Record<string, string> = {
    cash: "Cash",
    card: "Card",
    bank_transfer: "Bank Transfer",
    cheque: "Cheque",
  };
  const label = methodLabels[method] || method;
  return invoiceNumbers.length > 0
    ? `${label} — Invoice ${invoiceNumbers.join(", ")}`
    : label;
}
