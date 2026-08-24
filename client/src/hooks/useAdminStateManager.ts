import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminCrossTabSync } from './useAdminCrossTabSync';
import { useAdminInvalidation } from './useAdminInvalidation';

/**
 * Comprehensive admin state management hook that coordinates:
 * - Cross-tab synchronization
 * - Query invalidation
 * - State consistency across admin operations
 */
export const useAdminStateManager = () => {
  const queryClient = useQueryClient();
  const crossTabSync = useAdminCrossTabSync();
  const invalidation = useAdminInvalidation();

  // Enhanced broadcast functions that also handle local state updates
  const broadcastAndInvalidate = {
    customer: {
      created: (data?: any) => {
        crossTabSync.broadcastCustomerOperation('CREATED', data);
        invalidation.invalidateCustomerQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastCustomerOperation('UPDATED', data);
        invalidation.invalidateCustomerQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastCustomerOperation('DELETED', data);
        invalidation.invalidateCustomerQueries();
      }
    },
    employee: {
      created: (data?: any) => {
        crossTabSync.broadcastEmployeeOperation('CREATED', data);
        invalidation.invalidateEmployeeQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastEmployeeOperation('UPDATED', data);
        invalidation.invalidateEmployeeQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastEmployeeOperation('DELETED', data);
        invalidation.invalidateEmployeeQueries();
      }
    },
    equipment: {
      created: (data?: any) => {
        crossTabSync.broadcastEquipmentOperation('CREATED', data);
        invalidation.invalidateEquipmentQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastEquipmentOperation('UPDATED', data);
        invalidation.invalidateEquipmentQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastEquipmentOperation('DELETED', data);
        invalidation.invalidateEquipmentQueries();
      }
    },
    supplier: {
      created: (data?: any) => {
        crossTabSync.broadcastSupplierOperation('CREATED', data);
        invalidation.invalidateSupplierQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastSupplierOperation('UPDATED', data);
        invalidation.invalidateSupplierQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastSupplierOperation('DELETED', data);
        invalidation.invalidateSupplierQueries();
      }
    },
    product: {
      created: (data?: any) => {
        crossTabSync.broadcastProductOperation('CREATED', data);
        invalidation.invalidateProductQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastProductOperation('UPDATED', data);
        invalidation.invalidateProductQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastProductOperation('DELETED', data);
        invalidation.invalidateProductQueries();
      }
    },
    nonProduct: {
      created: (data?: any) => {
        crossTabSync.broadcastNonProductOperation('CREATED', data);
        invalidation.invalidateProductQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastNonProductOperation('UPDATED', data);
        invalidation.invalidateProductQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastNonProductOperation('DELETED', data);
        invalidation.invalidateProductQueries();
      }
    },
    expense: {
      created: (data?: any) => {
        crossTabSync.broadcastExpenseOperation('CREATED', data);
        invalidation.invalidateExpenseQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastExpenseOperation('UPDATED', data);
        invalidation.invalidateExpenseQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastExpenseOperation('DELETED', data);
        invalidation.invalidateExpenseQueries();
      }
    },
    user: {
      created: (data?: any) => {
        crossTabSync.broadcastUserOperation('CREATED', data);
        invalidation.invalidateUserQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastUserOperation('UPDATED', data);
        invalidation.invalidateUserQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastUserOperation('DELETED', data);
        invalidation.invalidateUserQueries();
      }
    },
    company: {
      updated: (data?: any) => {
        crossTabSync.broadcastCompanyUpdate(data);
        invalidation.invalidateCompanyQueries();
      }
    }
  };

  // Bulk operations for mass updates
  const bulkOperations = {
    invalidateAll: () => {
      invalidation.invalidateCustomerQueries();
      invalidation.invalidateEmployeeQueries();
      invalidation.invalidateEquipmentQueries();
      invalidation.invalidateSupplierQueries();
      invalidation.invalidateProductQueries();
      invalidation.invalidateExpenseQueries();
      invalidation.invalidateUserQueries();
      invalidation.invalidateCompanyQueries();
    },
    
    refreshAdminData: async () => {
      console.log('Admin State Manager: Refreshing all admin data');
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['/api/customers'] }),
        queryClient.refetchQueries({ queryKey: ['employees'] }),
        queryClient.refetchQueries({ queryKey: ['/api/equipment'] }),
        queryClient.refetchQueries({ queryKey: ['/api/suppliers'] }),
        queryClient.refetchQueries({ queryKey: ['/api/products'] }),
        queryClient.refetchQueries({ queryKey: ['/api/expenses'] }),
        queryClient.refetchQueries({ queryKey: ['/api/users'] }),
        queryClient.refetchQueries({ queryKey: ['/api/company'] })
      ]);
    }
  };

  // State monitoring and debugging
  const getAdminCacheStatus = () => {
    const cache = queryClient.getQueryCache();
    const adminQueries = cache.getAll().filter(query => {
      const key = query.queryKey[0] as string;
      return key?.includes('/api/customers') || 
             key?.includes('employees') || 
             key?.includes('/api/equipment') ||
             key?.includes('/api/suppliers') ||
             key?.includes('/api/products') ||
             key?.includes('/api/expenses') ||
             key?.includes('/api/users') ||
             key?.includes('/api/company');
    });

    return {
      totalQueries: adminQueries.length,
      staleQueries: adminQueries.filter(q => q.isStale()).length,
      fetchingQueries: adminQueries.filter(q => q.state.fetchStatus === 'fetching').length,
      errorQueries: adminQueries.filter(q => q.state.status === 'error').length,
      queries: adminQueries.map(q => ({
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
    getAdminCacheStatus,
    
    // Utility functions
    clearAdminCache: () => {
      queryClient.clear();
    },
    
    // Force refresh specific admin data
    forceRefresh: {
      customers: () => queryClient.refetchQueries({ queryKey: ['/api/customers'] }),
      employees: () => queryClient.refetchQueries({ queryKey: ['employees'] }),
      equipment: () => queryClient.refetchQueries({ queryKey: ['/api/equipment'] }),
      suppliers: () => queryClient.refetchQueries({ queryKey: ['/api/suppliers'] }),
      products: () => queryClient.refetchQueries({ queryKey: ['/api/products'] }),
      expenses: () => queryClient.refetchQueries({ queryKey: ['/api/expenses'] }),
      users: () => queryClient.refetchQueries({ queryKey: ['/api/users'] }),
      company: () => queryClient.refetchQueries({ queryKey: ['/api/company'] })
    }
  };
};