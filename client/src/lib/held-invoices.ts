import { apiRequest } from "./queryClient";
import { getApiUrl } from "./config";

export interface HeldInvoice {
  holdId: string;
  customerId?: string | number;
  vehicleDetails?: string;
  gateNumber?: string;
  notes?: string;
  saleItems: any[];
  holdTime: string;
  expiresAt?: string;
  currentSale?: any | null;
  createdBy?: number;
  updatedBy?: number;
  status?: string;
}

const LEGACY_HOLDS_KEY = "heldInvoices";

export function readLegacyHeldInvoices(): HeldInvoice[] {
  try {
    const raw = localStorage.getItem(LEGACY_HOLDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Copy old browser-local holds to the server using their existing hold IDs.
 * The server upsert is idempotent, so retrying this migration cannot double
 * reserve a hold. Local data is removed only after every record is accepted.
 */
export async function migrateLegacyHeldInvoices(): Promise<boolean> {
  const legacy = readLegacyHeldInvoices();
  if (legacy.length === 0) return false;

  const results = await Promise.allSettled(
    legacy.map((invoice) => apiRequest("POST", "/api/held-invoices", invoice))
  );
  if (results.every((result) => result.status === "fulfilled")) {
    localStorage.removeItem(LEGACY_HOLDS_KEY);
    return true;
  }
  return false;
}

export function saveHeldInvoice(
  invoice: Omit<HeldInvoice, "holdTime"> & { holdTime?: string },
  options: { keepalive?: boolean } = {},
): Promise<HeldInvoice> {
  const payload = {
    ...invoice,
    holdTime: invoice.holdTime || new Date().toISOString(),
  };

  if (!options.keepalive) {
    return apiRequest<HeldInvoice>("POST", "/api/held-invoices", payload);
  }

  const token = localStorage.getItem("jwt_token");
  return fetch(getApiUrl("/api/held-invoices"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify(payload),
    keepalive: true,
  }).then(async (response) => {
    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(responseData.message || responseData.error || `HTTP error! status: ${response.status}`);
    }
    return responseData as HeldInvoice;
  });
}

export function releaseHeldInvoice(holdId: string) {
  return apiRequest("DELETE", `/api/held-invoices/${encodeURIComponent(holdId)}`);
}

export function clearLegacyInvoiceDraft() {
  localStorage.removeItem("currentInvoiceDraft");
}
