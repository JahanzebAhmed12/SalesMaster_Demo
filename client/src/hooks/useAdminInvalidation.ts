import { useQueryClient } from '@tanstack/react-query';

export const useAdminInvalidation = () => {
  const queryClient = useQueryClient();

  // Customer-related invalidations
  const invalidateCustomerQueries = () => {
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

  // Employee-related invalidations
  const invalidateEmployeeQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/employees');
      }
    });
    
    // Force refetch active employee queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key === "employees" || 
          key.includes('/api/employees')
        );
      }
    });
  };

  // Equipment-related invalidations
  const invalidateEquipmentQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/equipment');
      }
    });
    
    // Force refetch active equipment queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/equipment');
      }
    });
  };

  // Supplier-related invalidations
  const invalidateSupplierQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
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
        return typeof key === 'string' && (
          key === "suppliers" || 
          key.includes('/api/suppliers')
        );
      }
    });
  };

  // Product-related invalidations
  const invalidateProductQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/regular_products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/non_products"] });
    queryClient.invalidateQueries({ queryKey: ["currentStock"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key.includes('/api/products') ||
          key.includes('/api/regular_products') ||
          key.includes('/api/non_products') ||
          key === "products" ||
          key === "currentStock"
        );
      }
    });
    
    // Force refetch active product queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key === "products" || 
          key === "currentStock" ||
          key.includes('/api/products') ||
          key.includes('/api/regular_products') ||
          key.includes('/api/non_products')
        );
      }
    });
  };

  // Expense-related invalidations
  const invalidateExpenseQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/expenses');
      }
    });
    
    // Force refetch active expense queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key === "expenses" || 
          key.includes('/api/expenses')
        );
      }
    });
  };

  // User-related invalidations
  const invalidateUserQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/users');
      }
    });
    
    // Force refetch active user queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/users');
      }
    });
  };

  // Company details invalidations
  const invalidateCompanyQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/company-details"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/company-details');
      }
    });
    
    // Force refetch active company queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/company-details');
      }
    });
  };

  // Invalidate all admin-related queries
  const invalidateAllAdminQueries = () => {
    invalidateCustomerQueries();
    invalidateEmployeeQueries();
    invalidateEquipmentQueries();
    invalidateSupplierQueries();
    invalidateProductQueries();
    invalidateExpenseQueries();
    invalidateUserQueries();
    invalidateCompanyQueries();
  };

  return {
    invalidateCustomerQueries,
    invalidateEmployeeQueries,
    invalidateEquipmentQueries,
    invalidateSupplierQueries,
    invalidateProductQueries,
    invalidateExpenseQueries,
    invalidateUserQueries,
    invalidateCompanyQueries,
    invalidateAllAdminQueries
  };
};