import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

export const useInvoicePermissions = () => {
  const { user } = useAuth();

  // Fetch system settings to check if invoices are locked
  const { data: settings } = useQuery<any>({
    queryKey: ['/api/settings'],
    queryFn: () => apiRequest('GET', '/api/settings'),
  });

  const canEditInvoice = () => {
    // If invoice locking is disabled, everyone can edit
    if (!settings?.lockInvoices) {
      return true;
    }

    // If invoice locking is enabled, only admin users can edit
    return user?.userType === 'admin';
  };

  const isInvoiceLocked = () => {
    return settings?.lockInvoices && user?.userType !== 'admin';
  };

  const canEditPaymentMode = () => {
    // Payment mode can always be edited, even when invoice is locked
    return true;
  };

  return {
    canEditInvoice: canEditInvoice(),
    isInvoiceLocked: isInvoiceLocked(),
    canEditPaymentMode: canEditPaymentMode(),
    lockInvoicesEnabled: settings?.lockInvoices || false,
  };
};