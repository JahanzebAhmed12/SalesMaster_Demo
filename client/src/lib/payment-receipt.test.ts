import assert from "node:assert/strict";
import {
  formatPaymentMethodLabel,
  getInvoiceNumbersByPaymentMethod,
  getNonAccountInvoiceNumbers,
} from "./payment-receipt";

const payments = [
  { paymentMode: "cash", paymentType: "direct", invoiceNumber: "INV-100" },
  { paymentMode: "cash", paymentType: "direct", invoiceNumber: "INV-100" },
  { paymentMode: "card", paymentType: "direct", invoiceNumber: "INV-200" },
  { paymentMode: "bank", paymentType: "direct", invoiceNumber: "INV-300" },
  { paymentMode: "cash", paymentType: "on-account", invoiceNumber: "ACC-400" },
  { paymentMode: "cash", paymentType: "on-account", invoiceNumber: null },
  { paymentMode: "cheque", paymentType: "direct", invoiceNumber: null },
];

const byMethod = getInvoiceNumbersByPaymentMethod(payments);
assert.deepEqual(byMethod, {
  cash: ["INV-100"],
  card: ["INV-200", "INV-300"],
});
assert.equal(formatPaymentMethodLabel("cash", byMethod.cash), "Cash — Invoice INV-100");
assert.equal(formatPaymentMethodLabel("card", byMethod.card), "Card — Invoice INV-200, INV-300");
assert.equal(formatPaymentMethodLabel("cheque"), "Cheque");
assert.deepEqual(getNonAccountInvoiceNumbers(payments), ["INV-100", "INV-200", "INV-300"]);
console.log("Payment receipt invoice-number rules passed.");
