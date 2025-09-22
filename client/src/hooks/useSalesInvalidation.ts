import { useQueryClient } from '@tanstack/react-query';

export const useSalesInvalidation = () => {
  const queryClient = useQueryClient();

  const invalidateAllSalesQueries = () => {
    // Core sales queries
    queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
    
    // Daily book sales queries - invalidate all variations
    queryClient.invalidateQueries({ queryKey: ["daily-book-sales"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        return query.queryKey[0] === "daily-book-sales";
      }
    });
    
    // Dashboard and stats
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    queryClient.invalidateQueries({ queryKey: ["currentStock"] });
    
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
      }
    });
    
    // Force refetch of active queries to ensure immediate updates
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key === "daily-book-sales" ||
          key.includes('/api/reports/daily-book-sales')
        );
      }
    });
  };

  const invalidateCustomerQueries = (customerId: number | string) => {
    queryClient.invalidateQueries({ 
      queryKey: ["/api/customers", customerId.toString(), "outstanding_invoices"] 
    });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        return query.queryKey.includes(customerId.toString());
      }
    });
  };

  return {
    invalidateAllSalesQueries,
    invalidateCustomerQueries
  };
};