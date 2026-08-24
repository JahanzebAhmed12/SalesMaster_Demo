import { useCallback, useEffect } from 'react';
import { useSalesInvalidation } from './useSalesInvalidation';

type InventoryMutationData = {
  productId?: number;
  productType?: 'regular' | 'non';
  source?: 'customer-return' | 'dump' | 'supplier-return' | 'sale' | 'purchase' | 'closing-stock';
};

type CrossTabSyncOptions = {
  enabled?: boolean;
  enablePolling?: boolean;
  pollingIntervalMs?: number;
};

const CHANNEL_NAME = 'sales-updates';

export const useCrossTabSync = ({
  enabled = true,
  enablePolling = false,
  pollingIntervalMs = 30000,
}: CrossTabSyncOptions = {}) => {
  const {
    invalidateInventoryQueries,
    refetchInventoryQueries,
    invalidateAllSalesQueries,
    invalidateCustomerQueries,
  } = useSalesInvalidation();

  useEffect(() => {
    if (!enabled || typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(CHANNEL_NAME);
    const handleMessage = (event: MessageEvent) => {
      const { type, data } = event.data ?? {};

      switch (type) {
        case 'INVOICE_CREATED':
        case 'INVOICE_UPDATED':
          invalidateAllSalesQueries();
          if (data?.customerId) invalidateCustomerQueries(data.customerId);
          break;
        case 'STOCK_UPDATED':
        case 'INVENTORY_MUTATED':
          invalidateInventoryQueries();
          break;
        case 'PAYMENT_UPDATED':
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
  }, [enabled, invalidateAllSalesQueries, invalidateCustomerQueries, invalidateInventoryQueries]);

  useEffect(() => {
    if (!enabled || !enablePolling || pollingIntervalMs <= 0) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void refetchInventoryQueries();
      }
    };

    const intervalId = window.setInterval(refreshWhenVisible, pollingIntervalMs);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [enabled, enablePolling, pollingIntervalMs, refetchInventoryQueries]);

  const broadcast = useCallback((type: string, data?: unknown) => {
    if (!enabled || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type, data, timestamp: Date.now() });
    channel.close();
  }, [enabled]);

  const broadcastInventoryMutation = useCallback((data: InventoryMutationData = {}) => {
    broadcast('INVENTORY_MUTATED', data);
  }, [broadcast]);

  const notifyInventoryMutation = useCallback((data: InventoryMutationData = {}) => {
    invalidateInventoryQueries();
    broadcastInventoryMutation(data);
  }, [broadcastInventoryMutation, invalidateInventoryQueries]);

  const broadcastInvoiceCreated = useCallback((invoiceData: { invoiceNumber: string; customerId?: number }) => {
    broadcast('INVOICE_CREATED', invoiceData);
  }, [broadcast]);

  const broadcastInvoiceUpdated = useCallback((invoiceData: { invoiceNumber: string; customerId?: number }) => {
    broadcast('INVOICE_UPDATED', invoiceData);
  }, [broadcast]);

  const broadcastPaymentUpdated = useCallback((paymentData: { invoiceNumbers?: string[]; customerId?: number }) => {
    broadcast('PAYMENT_UPDATED', paymentData);
  }, [broadcast]);

  return {
    broadcastInvoiceCreated,
    broadcastInvoiceUpdated,
    broadcastPaymentUpdated,
    broadcastInventoryMutation,
    notifyInventoryMutation,
  };
};
