export interface StockAvailabilityInput {
  rawStock: number;
  currentInvoiceQuantity: number;
  sharedReservedQuantity: number;
  originalSavedQuantity?: number;
  isEditing: boolean;
}

/**
 * Calculate invoice-entry availability from one formula.
 *
 * New invoice: raw stock - this invoice quantity - other shared holds.
 * Edit invoice: raw stock + original saved quantity - this invoice quantity
 *               - other shared holds.
 *
 * The current hold is excluded by the reservations API query, so this helper
 * never needs to know whether a reservation belongs to the current invoice.
 */
export function calculateAvailableStock({
  rawStock,
  currentInvoiceQuantity,
  sharedReservedQuantity,
  originalSavedQuantity = 0,
  isEditing,
}: StockAvailabilityInput): number {
  return (
    Number(rawStock || 0) + (isEditing ? Number(originalSavedQuantity || 0) : 0)
    - Number(currentInvoiceQuantity || 0)
    - Number(sharedReservedQuantity || 0)
  );
}
