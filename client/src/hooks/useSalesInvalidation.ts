import { useCallback } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';

const INVENTORY_QUERY_ROOTS = new Set([
  'currentStock',
  'products',
  '/api/products',
  '/api/regular_products',
  '/api/non_products',
  'stock-check',
  '/api/reports/stock-check',
  'customer-returns',
  'dump-entries',
  'supplier-returns',
]);

const isInventoryQuery = (query: Query) => {
  const root = query.queryKey[0];
  return typeof root === 'string' && INVENTORY_QUERY_ROOTS.has(root);
};

export const useSalesInvalidation = () => {
  const queryClient = useQueryClient();

  const invalidateInventoryQueries = useCallback(() => {
    queryClient.invalidateQueries({ predicate: isInventoryQuery });
  }, [queryClient]);

  const refetchInventoryQueries = useCallback(() => {
    return queryClient.refetchQueries({ predicate: isInventoryQuery, type: 'active' });
  }, [queryClient]);

  const invalidateAllSalesQueries = useCallback(() => {
    // Core sales queries
    queryClient.invalidateQueries({ queryKey: ["/api/sales"] });

    // Daily book sales queries - invalidate all variations
    queryClient.invalidateQueries({ queryKey: ["daily-book-sales"] });
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === "daily-book-sales",
    });

    // Dashboard and stats
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    invalidateInventoryQueries();

    // Reports that might include sales data
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key.includes('/api/reports/') ||
          key.includes('daily-book') ||
          key.includes('sales-report') ||
          key.includes('daily-summary')
        );
      },
    });

    // Force refetch of active daily-book queries to ensure immediate updates.
    return queryClient.refetchQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key === "daily-book-sales" ||
          key.includes('/api/reports/daily-book-sales')
        );
      },
      type: 'active',
    });
  }, [invalidateInventoryQueries, queryClient]);

  const invalidateCustomerQueries = useCallback((customerId: number | string) => {
    queryClient.invalidateQueries({
      queryKey: ["/api/customers", customerId.toString(), "outstanding_invoices"],
    });
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey.includes(customerId.toString()),
    });
  }, [queryClient]);

  return {
    invalidateInventoryQueries,
    refetchInventoryQueries,
    invalidateAllSalesQueries,
    invalidateCustomerQueries,
  };
};
