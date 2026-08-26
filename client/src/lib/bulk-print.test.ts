import assert from "node:assert/strict";
import { getBulkPrintInvoiceNumbers } from "./bulk-print";

assert.deepEqual(
  getBulkPrintInvoiceNumbers("invs=INV-100%2CINV-200%2CINV-300"),
  ["INV-100", "INV-200", "INV-300"],
);
assert.deepEqual(
  getBulkPrintInvoiceNumbers("?invs= INV-100%2C%20INV-200 "),
  ["INV-100", "INV-200"],
);
assert.deepEqual(getBulkPrintInvoiceNumbers(""), []);
assert.deepEqual(getBulkPrintInvoiceNumbers("invs="), []);

console.log("Bulk print invoice-selection query regression: OK");
