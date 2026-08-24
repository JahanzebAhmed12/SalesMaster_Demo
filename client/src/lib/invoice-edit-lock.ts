import { ApiRequestError, apiRequest } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/config";

export interface InvoiceEditLock {
  locked: true;
  saleId: number;
  userId: number;
  username: string | null;
  lockToken: string;
  acquiredAt: string | null;
  updatedAt: string | null;
}

export interface InvoiceEditLockConflict {
  error: string;
  code: "INVOICE_EDIT_LOCKED";
  userId: number;
  username: string | null;
  acquiredAt: string | null;
  updatedAt: string | null;
}

export class InvoiceEditLockConflictError extends Error {
  readonly status = 409;
  readonly conflict: InvoiceEditLockConflict;

  constructor(message: string, conflict: InvoiceEditLockConflict) {
    super(message);
    this.name = "InvoiceEditLockConflictError";
    this.conflict = conflict;
  }
}

function isLockConflict(data: unknown): data is InvoiceEditLockConflict {
  return typeof data === "object" && data !== null &&
    (data as { code?: unknown }).code === "INVOICE_EDIT_LOCKED";
}

export async function acquireInvoiceEditLock(saleId: number): Promise<InvoiceEditLock> {
  try {
    return await apiRequest<InvoiceEditLock>("POST", `/api/sales/${saleId}/edit-lock`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 409 && isLockConflict(error.data)) {
      throw new InvoiceEditLockConflictError(error.message, error.data);
    }
    throw error;
  }
}

export async function releaseInvoiceEditLock(saleId: number, lockToken: string): Promise<void> {
  await apiRequest("DELETE", `/api/sales/${saleId}/edit-lock`, { lockToken });
}

export function releaseInvoiceEditLockOnUnload(saleId: number, lockToken: string): void {
  const token = localStorage.getItem("jwt_token");
  if (!token) return;

  void fetch(getApiUrl(`/api/sales/${saleId}/edit-lock`), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({ lockToken }),
    keepalive: true,
  }).catch(() => {
    // A browser may terminate unload requests; the server lock intentionally
    // remains in place when release cannot be delivered.
  });
}
