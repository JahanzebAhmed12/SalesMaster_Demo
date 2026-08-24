export interface InvoiceEditLockOwner {
  locked: true;
  userId: number;
  username: string | null;
  acquiredAt: string | null;
  updatedAt: string | null;
}

interface IndicatorOptions {
  isReadOnly: boolean;
  ownsLock: boolean;
  lockOwner?: InvoiceEditLockOwner;
  canEditInvoice: boolean;
}

export type InvoiceEditLockIndicator =
  | {
      kind: "active";
      title: "Editing locked to you.";
      description: string;
    }
  | {
      kind: "readonly";
      title: "Read-Only Mode:";
      description: string;
      protectionNote?: string;
    }
  | null;

export function getInvoiceEditLockIndicator({
  isReadOnly,
  ownsLock,
  lockOwner,
  canEditInvoice,
}: IndicatorOptions): InvoiceEditLockIndicator {
  if (!isReadOnly && ownsLock && lockOwner) {
    return {
      kind: "active",
      title: "Editing locked to you.",
      description: "Other users can view this invoice, but cannot edit it until you save or cancel.",
    };
  }

  if (!isReadOnly) return null;

  const ownerDescription = lockOwner?.username
    ? `Currently being edited by ${lockOwner.username}.`
    : !canEditInvoice
      ? "Only users with invoice-edit permission can edit it."
      : "Another user may currently hold the edit lock.";

  return {
    kind: "readonly",
    title: "Read-Only Mode:",
    description: `This invoice cannot be edited from this session. ${ownerDescription}`,
    protectionNote: lockOwner
      ? "The invoice remains protected until the active editor saves or cancels."
      : undefined,
  };
}
