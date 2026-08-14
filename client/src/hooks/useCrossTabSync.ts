import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSalesInvalidation } from './useSalesInvalidation';

export const useCrossTabSync = () => {
  const queryClient = useQueryClient();
  const { invalidateAllSalesQueries, invalidateCustomerQueries } = useSalesInvalidation();

  useEffect(() => {
    // Create a broadcast channel for cross-tab communication
    const channel = new BroadcastChannel('sales-updates');

    const handleMessage = (event: MessageEvent) => {
      const { type, data } = event.data;

      switch (type) {
        case 'INVOICE_CREATED':
        case 'INVOICE_UPDATED':
          console.log('Cross-tab sync: Invoice operation detected, invalidating queries');
          invalidateAllSalesQueries();
          if (data?.customerId) {
            invalidateCustomerQueries(data.customerId);
          }
          break;
        case 'STOCK_UPDATED':
          console.log('Cross-tab sync: Stock update detected, invalidating queries');
          invalidateAllSalesQueries();
          break;
        case 'PAYMENT_UPDATED':
          console.log('Cross-tab sync: Payment update detected, invalidating queries');
          invalidateAllSalesQueries();
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
  }, [invalidateAllSalesQueries, invalidateCustomerQueries]);

  const broadcastInvoiceCreated = (invoiceData: { invoiceNumber: string; customerId?: number }) => {
    const channel = new BroadcastChannel('sales-updates');
    channel.postMessage({
      type: 'INVOICE_CREATED',
      data: invoiceData,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastInvoiceUpdated = (invoiceData: { invoiceNumber: string; customerId?: number }) => {
    const channel = new BroadcastChannel('sales-updates');
    channel.postMessage({
      type: 'INVOICE_UPDATED',
      data: invoiceData,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastPaymentUpdated = (paymentData: { invoiceNumbers?: string[]; customerId?: number }) => {
    const channel = new BroadcastChannel('sales-updates');
    channel.postMessage({
      type: 'PAYMENT_UPDATED',
      data: paymentData,
      timestamp: Date.now()
    });
    channel.close();
  };

  return {
    broadcastInvoiceCreated,
    broadcastInvoiceUpdated,
    broadcastPaymentUpdated
  };
};