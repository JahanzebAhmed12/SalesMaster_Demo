import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePaymentsInvalidation } from './usePaymentsInvalidation';

export const usePaymentsCrossTabSync = () => {
  const queryClient = useQueryClient();
  const {
    invalidateCustomerPaymentQueries,
    invalidateSupplierPaymentQueries,
    invalidateCustomerInvoiceQueries,
    invalidateCustomerBalanceQueries,
    invalidateSupplierBalanceQueries,
    invalidatePaymentHistoryQueries
  } = usePaymentsInvalidation();

  useEffect(() => {
    // Create a broadcast channel for payments cross-tab communication
    const channel = new BroadcastChannel('payments-updates');

    const handleMessage = (event: MessageEvent) => {
      const { type, data } = event.data;

      console.log('Payments cross-tab sync: Received message', type, data);

      switch (type) {
        case 'CUSTOMER_PAYMENT_CREATED':
        case 'CUSTOMER_PAYMENT_UPDATED':
        case 'CUSTOMER_PAYMENT_DELETED':
          console.log('Cross-tab sync: Customer payment operation detected, invalidating queries');
          invalidateCustomerPaymentQueries();
          invalidateCustomerInvoiceQueries();
          invalidateCustomerBalanceQueries();
          invalidatePaymentHistoryQueries();
          break;
          
        case 'SUPPLIER_PAYMENT_CREATED':
        case 'SUPPLIER_PAYMENT_UPDATED':
        case 'SUPPLIER_PAYMENT_DELETED':
          console.log('Cross-tab sync: Supplier payment operation detected, invalidating queries');
          invalidateSupplierPaymentQueries();
          invalidateSupplierBalanceQueries();
          invalidatePaymentHistoryQueries();
          break;
          
        case 'CUSTOMER_INVOICE_UPDATED':
        case 'CUSTOMER_BALANCE_UPDATED':
          console.log('Cross-tab sync: Customer invoice/balance updated, invalidating queries');
          invalidateCustomerInvoiceQueries();
          invalidateCustomerBalanceQueries();
          break;
          
        case 'SUPPLIER_INVOICE_UPDATED':
        case 'SUPPLIER_BALANCE_UPDATED':
          console.log('Cross-tab sync: Supplier invoice/balance updated, invalidating queries');
          invalidateSupplierPaymentQueries();
          invalidateSupplierBalanceQueries();
          break;
          
        case 'PAYMENT_BATCH_CREATED':
        case 'PAYMENT_BATCH_UPDATED':
        case 'PAYMENT_BATCH_DELETED':
          console.log('Cross-tab sync: Payment batch operation detected, invalidating all payment queries');
          invalidateCustomerPaymentQueries();
          invalidateSupplierPaymentQueries();
          invalidatePaymentHistoryQueries();
          break;
          
        default:
          break;
      }
    };

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [
    invalidateCustomerPaymentQueries,
    invalidateSupplierPaymentQueries,
    invalidateCustomerInvoiceQueries,
    invalidateCustomerBalanceQueries,
    invalidateSupplierBalanceQueries,
    invalidatePaymentHistoryQueries
  ]);

  // Broadcast functions for different payment operations
  const broadcastCustomerPaymentOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED', data?: any) => {
    const channel = new BroadcastChannel('payments-updates');
    channel.postMessage({
      type: `CUSTOMER_PAYMENT_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastSupplierPaymentOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED', data?: any) => {
    const channel = new BroadcastChannel('payments-updates');
    channel.postMessage({
      type: `SUPPLIER_PAYMENT_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastCustomerInvoiceUpdate = (data?: any) => {
    const channel = new BroadcastChannel('payments-updates');
    channel.postMessage({
      type: 'CUSTOMER_INVOICE_UPDATED',
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastCustomerBalanceUpdate = (data?: any) => {
    const channel = new BroadcastChannel('payments-updates');
    channel.postMessage({
      type: 'CUSTOMER_BALANCE_UPDATED',
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastSupplierInvoiceUpdate = (data?: any) => {
    const channel = new BroadcastChannel('payments-updates');
    channel.postMessage({
      type: 'SUPPLIER_INVOICE_UPDATED',
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastSupplierBalanceUpdate = (data?: any) => {
    const channel = new BroadcastChannel('payments-updates');
    channel.postMessage({
      type: 'SUPPLIER_BALANCE_UPDATED',
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastPaymentBatchOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED', data?: any) => {
    const channel = new BroadcastChannel('payments-updates');
    channel.postMessage({
      type: `PAYMENT_BATCH_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  return {
    broadcastCustomerPaymentOperation,
    broadcastSupplierPaymentOperation,
    broadcastCustomerInvoiceUpdate,
    broadcastCustomerBalanceUpdate,
    broadcastSupplierInvoiceUpdate,
    broadcastSupplierBalanceUpdate,
    broadcastPaymentBatchOperation
  };
};