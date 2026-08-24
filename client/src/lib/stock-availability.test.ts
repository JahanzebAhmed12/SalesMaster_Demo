import assert from "node:assert/strict";
import { calculateAvailableStock } from "./stock-availability";

assert.equal(
  calculateAvailableStock({
    rawStock: 10,
    currentInvoiceQuantity: 2,
    sharedReservedQuantity: 3,
    isEditing: false,
  }),
  5,
);

assert.equal(
  calculateAvailableStock({
    rawStock: 7,
    originalSavedQuantity: 4,
    currentInvoiceQuantity: 5,
    sharedReservedQuantity: 2,
    isEditing: true,
  }),
  4,
);

// Replacing the current edit quantity with the original saved quantity leaves
// the same available stock when no other state changes.
assert.equal(
  calculateAvailableStock({
    rawStock: 7,
    originalSavedQuantity: 4,
    currentInvoiceQuantity: 4,
    sharedReservedQuantity: 2,
    isEditing: true,
  }),
  calculateAvailableStock({
    rawStock: 7,
    currentInvoiceQuantity: 0,
    sharedReservedQuantity: 2,
    isEditing: false,
  }),
);

console.log("E26 availability formula regression: OK");
