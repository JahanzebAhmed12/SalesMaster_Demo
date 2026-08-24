import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePaymentsCrossTabSync } from './usePaymentsCrossTabSync';
import { usePaymentsInvalidation } from './usePaymentsInvalidation';

/**
 * Comprehensive payments state management hook that coordinates:
 * - Cross-tab synchronization
 * - Query invalidation
 * - State consistency across payment operations
 */
export const usePaymentsStateManager = () => {
  const queryClient = useQueryClient();
  const crossTabSync = usePaymentsCrossTabSync();
  const invalidation = usePaymentsInvalidation();

  // Enhanced broadcast functions that also handle local state updates
  const broadcastAndInvalidate = {
    customerPayment: {
      created: (data?: any) => {
        crossTabSync.broadcastCustomerPaymentOperation('CREATED', data);
        invalidation.invalidateCustomerPaymentQueries();
        invalidation.invalidateCustomerInvoiceQueries();
        invalidation.invalidateCustomerBalanceQueries();
        invalidation.invalidatePaymentHistoryQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastCustomerPaymentOperation('UPDATED', data);
        invalidation.invalidateCustomerPaymentQueries();
        invalidation.invalidateCustomerInvoiceQueries();
        invalidation.invalidateCustomerBalanceQueries();
        invalidation.invalidatePaymentHistoryQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastCustomerPaymentOperation('DELETED', data);
        invalidation.invalidateCustomerPaymentQueries();
        invalidation.invalidateCustomerInvoiceQueries();
        invalidation.invalidateCustomerBalanceQueries();
        invalidation.invalidatePaymentHistoryQueries();
      }
    },
    supplierPayment: {
      created: (data?: any) => {
        crossTabSync.broadcastSupplierPaymentOperation('CREATED', data);
        invalidation.invalidateSupplierPaymentQueries();
        invalidation.invalidateSupplierBalanceQueries();
        invalidation.invalidatePaymentHistoryQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastSupplierPaymentOperation('UPDATED', data);
        invalidation.invalidateSupplierPaymentQueries();
        invalidation.invalidateSupplierBalanceQueries();
        invalidation.invalidatePaymentHistoryQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastSupplierPaymentOperation('DELETED', data);
        invalidation.invalidateSupplierPaymentQueries();
        invalidation.invalidateSupplierBalanceQueries();
        invalidation.invalidatePaymentHistoryQueries();
      }
    },
    customerInvoice: {
      updated: (data?: any) => {
        crossTabSync.broadcastCustomerInvoiceUpdate(data);
        invalidation.invalidateCustomerInvoiceQueries();
        invalidation.invalidateCustomerBalanceQueries();
      }
    },
    customerBalance: {
      updated: (data?: any) => {
        crossTabSync.broadcastCustomerBalanceUpdate(data);
        invalidation.invalidateCustomerBalanceQueries();
      }
    },
    supplierInvoice: {
      updated: (data?: any) => {
        crossTabSync.broadcastSupplierInvoiceUpdate(data);
        invalidation.invalidateSupplierPaymentQueries();
        invalidation.invalidateSupplierBalanceQueries();
      }
    },
    supplierBalance: {
      updated: (data?: any) => {
        crossTabSync.broadcastSupplierBalanceUpdate(data);
        invalidation.invalidateSupplierBalanceQueries();
      }
    },
    paymentBatch: {
      created: (data?: any) => {
        crossTabSync.broadcastPaymentBatchOperation('CREATED', data);
        invalidation.invalidateAllPaymentQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastPaymentBatchOperation('UPDATED', data);
        invalidation.invalidateAllPaymentQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastPaymentBatchOperation('DELETED', data);
        invalidation.invalidateAllPaymentQueries();
      }
    }
  };

  // Bulk operations for mass updates
  const bulkOperations = {
    invalidateAll: () => {
      invalidation.invalidateAllPaymentQueries();
    },
    
    refreshPaymentsData: async () => {
      console.log('Payments State Manager: Refreshing all payments data');
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['/api/payments'] }),
        queryClient.refetchQueries({ queryKey: ['/api/customer-payments'] }),
        queryClient.refetchQueries({ queryKey: ['/api/supplier-payments'] }),
        queryClient.refetchQueries({ queryKey: ['/api/customers'] }),
        queryClient.refetchQueries({ queryKey: ['/api/suppliers'] }),
        queryClient.refetchQueries({ 
          predicate: (query) => {
            const key = query.queryKey[0] as string;
            return key?.includes('outstanding_invoices') || key?.includes('history');
          }
        })
      ]);
    }
  };

  // State monitoring and debugging
  const getPaymentsCacheStatus = () => {
    const cache = queryClient.getQueryCache();
    const paymentsQueries = cache.getAll().filter(query => {
      const key = query.queryKey[0] as string;
      return key?.includes('/api/payments') || 
             key?.includes('/api/customer-payments') ||
             key?.includes('/api/supplier-payments') ||
             key?.includes('outstanding_invoices') ||
             key?.includes('history') ||
             (key?.includes('/api/customers') && query.queryKey.length > 1) ||
             (key?.includes('/api/suppliers') && query.queryKey.length > 1);
    });

    return {
      totalQueries: paymentsQueries.length,
      staleQueries: paymentsQueries.filter(q => q.isStale()).length,
      fetchingQueries: paymentsQueries.filter(q => q.state.fetchStatus === 'fetching').length,
      errorQueries: paymentsQueries.filter(q => q.state.status === 'error').length,
      queries: paymentsQueries.map(q => ({
        key: q.queryKey,
        status: q.state.status,
        dataUpdatedAt: q.state.dataUpdatedAt,
        isStale: q.isStale(),
        isFetching: q.state.fetchStatus === 'fetching'
      }))
    };
  };

  return {
    // Main broadcast and invalidation functions
    broadcast: broadcastAndInvalidate,
    
    // Bulk operations
    bulkOperations,
    
    // Direct access to underlying hooks
    crossTabSync,
    invalidation,
    
    // Debugging and monitoring
    getPaymentsCacheStatus,
    
    // Utility functions
    clearPaymentsCache: () => {
      const cache = queryClient.getQueryCache();
      const paymentsQueries = cache.getAll().filter(query => {
        const key = query.queryKey[0] as string;
        return key?.includes('/api/payments') || 
               key?.includes('/api/customer-payments') ||
               key?.includes('/api/supplier-payments') ||
               key?.includes('outstanding_invoices') ||
               key?.includes('history');
      });
      
      paymentsQueries.forEach(query => {
        queryClient.removeQueries({ queryKey: query.queryKey });
      });
    },
    
    // Force refresh specific payments data
    forceRefresh: {
      customerPayments: () => queryClient.refetchQueries({ queryKey: ['/api/payments'] }),
      supplierPayments: () => queryClient.refetchQueries({ queryKey: ['/api/supplier-payments'] }),
      customerInvoices: () => queryClient.refetchQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return key?.includes('outstanding_invoices') && key?.includes('customers');
        }
      }),
      supplierInvoices: () => queryClient.refetchQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return key?.includes('outstanding_invoices') && key?.includes('suppliers');
        }
      }),
      paymentHistory: () => queryClient.refetchQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return key?.includes('history');
        }
      }),
      customers: () => queryClient.refetchQueries({ queryKey: ['/api/customers'] }),
      suppliers: () => queryClient.refetchQueries({ queryKey: ['/api/suppliers'] })
    }
  };
};