import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePaymentsState } from '@/components/payments/PaymentsStateProvider';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

/**
 * Custom hook that provides standardized payment mutations with automatic
 * state management and cross-tab synchronization
 */
export const usePaymentsMutations = () => {
  const queryClient = useQueryClient();
  const paymentsState = usePaymentsState();
  const { toast } = useToast();

  // Customer payment mutations
  const useCustomerPaymentMutations = () => ({
    create: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/payments/customer-bulk', data),
      onSuccess: (result, variables) => {
        paymentsState.broadcast.customerPayment.created({ 
          batchId: result?.paymentId, 
          ...variables 
        });
        toast({ 
          title: 'Success', 
          description: `Payment recorded successfully. Batch ID: ${result?.paymentId}` 
        });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create customer payment',
          variant: 'destructive' 
        });
      }
    }),
    
    update: useMutation({
      mutationFn: ({ batchId, ...data }: any) => apiRequest('PUT', `/api/payments/batch/${batchId}`, data),
      onSuccess: (result, variables) => {
        paymentsState.broadcast.customerPayment.updated({ 
          batchId: variables.batchId, 
          ...variables 
        });
        toast({ title: 'Success', description: 'Customer payment updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update customer payment',
          variant: 'destructive' 
        });
      }
    }),
    
    delete: useMutation({
      mutationFn: (batchId: number) => apiRequest('DELETE', `/api/payments/batch/${batchId}`),
      onSuccess: (_, deletedBatchId) => {
        paymentsState.broadcast.customerPayment.deleted({ batchId: deletedBatchId });
        toast({ 
          title: 'Success', 
          description: 'Payment deleted successfully. All related transactions have been reverted.' 
        });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete customer payment',
          variant: 'destructive' 
        });
      }
    }),

    createSingle: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/payments/customer', data),
      onSuccess: (result, variables) => {
        paymentsState.broadcast.customerPayment.created({ id: result?.id, ...variables });
        toast({ title: 'Success', description: 'Customer payment created successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create customer payment',
          variant: 'destructive' 
        });
      }
    })
  });

  // Supplier payment mutations
  const useSupplierPaymentMutations = () => ({
    create: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/supplier-payments', data),
      onSuccess: (result, variables) => {
        paymentsState.broadcast.supplierPayment.created({ id: result?.id, ...variables });
        toast({ title: 'Success', description: 'Supplier payment created successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create supplier payment',
          variant: 'destructive' 
        });
      }
    }),
    
    update: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/supplier-payments/${id}`, data),
      onSuccess: (result, variables) => {
        paymentsState.broadcast.supplierPayment.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Supplier payment updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update supplier payment',
          variant: 'destructive' 
        });
      }
    }),
    
    delete: useMutation({
      mutationFn: (id: number) => apiRequest('DELETE', `/api/supplier-payments/${id}`),
      onSuccess: (_, deletedId) => {
        paymentsState.broadcast.supplierPayment.deleted({ id: deletedId });
        toast({ title: 'Success', description: 'Supplier payment deleted successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete supplier payment',
          variant: 'destructive' 
        });
      }
    }),

    bulkCreate: useMutation({
      mutationFn: (payments: any[]) => {
        const promises = payments.map(payment => 
          apiRequest('POST', '/api/supplier-payments', payment)
        );
        return Promise.all(promises);
      },
      onSuccess: (results, variables) => {
        paymentsState.broadcast.supplierPayment.created({ 
          count: results.length, 
          payments: variables 
        });
        toast({ 
          title: 'Success', 
          description: `Successfully created ${results.length} supplier payment(s)` 
        });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create supplier payments',
          variant: 'destructive' 
        });
      }
    })
  });

  // Invoice and balance update mutations
  const useInvoiceBalanceMutations = () => ({
    updateCustomerInvoice: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/invoices/${id}`, data),
      onSuccess: (result, variables) => {
        paymentsState.broadcast.customerInvoice.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Customer invoice updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update customer invoice',
          variant: 'destructive' 
        });
      }
    }),

    updateCustomerBalance: useMutation({
      mutationFn: ({ customerId, ...data }: any) => apiRequest('PUT', `/api/customers/${customerId}/balance`, data),
      onSuccess: (result, variables) => {
        paymentsState.broadcast.customerBalance.updated({ customerId: variables.customerId, ...variables });
        toast({ title: 'Success', description: 'Customer balance updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update customer balance',
          variant: 'destructive' 
        });
      }
    }),

    updateSupplierInvoice: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/purchase-invoices/${id}`, data),
      onSuccess: (result, variables) => {
        paymentsState.broadcast.supplierInvoice.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Supplier invoice updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update supplier invoice',
          variant: 'destructive' 
        });
      }
    }),

    updateSupplierBalance: useMutation({
      mutationFn: ({ supplierId, ...data }: any) => apiRequest('PUT', `/api/suppliers/${supplierId}/balance`, data),
      onSuccess: (result, variables) => {
        paymentsState.broadcast.supplierBalance.updated({ supplierId: variables.supplierId, ...variables });
        toast({ title: 'Success', description: 'Supplier balance updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update supplier balance',
          variant: 'destructive' 
        });
      }
    })
  });

  // Payment batch operations
  const usePaymentBatchMutations = () => ({
    create: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/payments/batch', data),
      onSuccess: (result, variables) => {
        paymentsState.broadcast.paymentBatch.created({ batchId: result?.batchId, ...variables });
        toast({ title: 'Success', description: 'Payment batch created successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create payment batch',
          variant: 'destructive' 
        });
      }
    }),

    update: useMutation({
      mutationFn: ({ batchId, ...data }: any) => apiRequest('PUT', `/api/payments/batch/${batchId}`, data),
      onSuccess: (result, variables) => {
        paymentsState.broadcast.paymentBatch.updated({ batchId: variables.batchId, ...variables });
        toast({ title: 'Success', description: 'Payment batch updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update payment batch',
          variant: 'destructive' 
        });
      }
    }),

    delete: useMutation({
      mutationFn: (batchId: number) => apiRequest('DELETE', `/api/payments/batch/${batchId}`),
      onSuccess: (_, deletedBatchId) => {
        paymentsState.broadcast.paymentBatch.deleted({ batchId: deletedBatchId });
        toast({ title: 'Success', description: 'Payment batch deleted successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete payment batch',
          variant: 'destructive' 
        });
      }
    })
  });

  return {
    customerPayment: useCustomerPaymentMutations(),
    supplierPayment: useSupplierPaymentMutations(),
    invoiceBalance: useInvoiceBalanceMutations(),
    paymentBatch: usePaymentBatchMutations(),
    
    // Utility functions
    paymentsState,
    queryClient,
    toast
  };
};