import { useQueryClient } from '@tanstack/react-query';

export const usePaymentsInvalidation = () => {
  const queryClient = useQueryClient();

  // Customer payment related invalidations
  const invalidateCustomerPaymentQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/payments/history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/customer-payments"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key.includes('/api/payments') ||
          key.includes('/api/customer-payments')
        );
      }
    });
    
    // Force refetch active customer payment queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key.includes('/api/payments') ||
          key.includes('/api/customer-payments')
        );
      }
    });
  };

  // Supplier payment related invalidations
  const invalidateSupplierPaymentQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/suppliers/outstanding_invoices"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key.includes('/api/supplier-payments') ||
          key.includes('/api/suppliers/outstanding_invoices')
        );
      }
    });
    
    // Force refetch active supplier payment queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key.includes('/api/supplier-payments') ||
          key.includes('/api/suppliers/outstanding_invoices')
        );
      }
    });
  };

  // Customer outstanding invoices invalidations
  const invalidateCustomerInvoiceQueries = () => {
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('outstanding_invoices');
      }
    });
    
    // Force refetch active customer invoice queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('outstanding_invoices');
      }
    });
  };

  // Customer balance related invalidations
  const invalidateCustomerBalanceQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/customers');
      }
    });
    
    // Force refetch active customer queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/customers');
      }
    });
  };

  // Supplier balance related invalidations
  const invalidateSupplierBalanceQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/suppliers');
      }
    });
    
    // Force refetch active supplier queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/suppliers');
      }
    });
  };

  // Payment history related invalidations
  const invalidatePaymentHistoryQueries = () => {
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('history');
      }
    });
    
    // Force refetch active payment history queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('history');
      }
    });
  };

  // Invalidate all payment-related queries
  const invalidateAllPaymentQueries = () => {
    invalidateCustomerPaymentQueries();
    invalidateSupplierPaymentQueries();
    invalidateCustomerInvoiceQueries();
    invalidateCustomerBalanceQueries();
    invalidateSupplierBalanceQueries();
    invalidatePaymentHistoryQueries();
  };

  return {
    invalidateCustomerPaymentQueries,
    invalidateSupplierPaymentQueries,
    invalidateCustomerInvoiceQueries,
    invalidateCustomerBalanceQueries,
    invalidateSupplierBalanceQueries,
    invalidatePaymentHistoryQueries,
    invalidateAllPaymentQueries
  };
};