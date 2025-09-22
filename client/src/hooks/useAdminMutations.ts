import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAdminState } from '@/components/admin/AdminStateProvider';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

/**
 * Custom hook that provides standardized admin mutations with automatic
 * state management and cross-tab synchronization
 */
export const useAdminMutations = () => {
  const queryClient = useQueryClient();
  const adminState = useAdminState();
  const { toast } = useToast();

  // Customer mutations
  const useCustomerMutations = () => ({
    create: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/customers', data),
      onSuccess: (result, variables) => {
        adminState.broadcast.customer.created({ id: result?.id, ...variables });
        toast({ title: 'Success', description: 'Customer created successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create customer',
          variant: 'destructive' 
        });
      }
    }),
    
    update: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/customers/${id}`, data),
      onSuccess: (result, variables) => {
        adminState.broadcast.customer.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Customer updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update customer',
          variant: 'destructive' 
        });
      }
    }),
    
    delete: useMutation({
      mutationFn: (id: number) => apiRequest('DELETE', `/api/customers/${id}`),
      onSuccess: (_, deletedId) => {
        adminState.broadcast.customer.deleted({ id: deletedId });
        toast({ title: 'Success', description: 'Customer deleted successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete customer',
          variant: 'destructive' 
        });
      }
    })
  });

  // Employee mutations
  const useEmployeeMutations = () => ({
    create: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/employees', data),
      onSuccess: (result, variables) => {
        adminState.broadcast.employee.created({ id: result?.id, ...variables });
        toast({ title: 'Success', description: 'Employee created successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create employee',
          variant: 'destructive' 
        });
      }
    }),
    
    update: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/employees/${id}`, data),
      onSuccess: (result, variables) => {
        adminState.broadcast.employee.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Employee updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update employee',
          variant: 'destructive' 
        });
      }
    }),
    
    delete: useMutation({
      mutationFn: (id: number) => apiRequest('DELETE', `/api/employees/${id}`),
      onSuccess: (_, deletedId) => {
        adminState.broadcast.employee.deleted({ id: deletedId });
        toast({ title: 'Success', description: 'Employee deleted successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete employee',
          variant: 'destructive' 
        });
      }
    })
  });

  // Equipment mutations
  const useEquipmentMutations = () => ({
    create: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/equipment', data),
      onSuccess: (result, variables) => {
        adminState.broadcast.equipment.created({ id: result?.id, ...variables });
        toast({ title: 'Success', description: 'Equipment created successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create equipment',
          variant: 'destructive' 
        });
      }
    }),
    
    update: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/equipment/${id}`, data),
      onSuccess: (result, variables) => {
        adminState.broadcast.equipment.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Equipment updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update equipment',
          variant: 'destructive' 
        });
      }
    }),
    
    delete: useMutation({
      mutationFn: (id: number) => apiRequest('DELETE', `/api/equipment/${id}`),
      onSuccess: (_, deletedId) => {
        adminState.broadcast.equipment.deleted({ id: deletedId });
        toast({ title: 'Success', description: 'Equipment deleted successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete equipment',
          variant: 'destructive' 
        });
      }
    })
  });

  // Supplier mutations
  const useSupplierMutations = () => ({
    create: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/suppliers', data),
      onSuccess: (result, variables) => {
        adminState.broadcast.supplier.created({ id: result?.id, ...variables });
        toast({ title: 'Success', description: 'Supplier created successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create supplier',
          variant: 'destructive' 
        });
      }
    }),
    
    update: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/suppliers/${id}`, data),
      onSuccess: (result, variables) => {
        adminState.broadcast.supplier.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Supplier updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update supplier',
          variant: 'destructive' 
        });
      }
    }),
    
    delete: useMutation({
      mutationFn: (id: number) => apiRequest('DELETE', `/api/suppliers/${id}`),
      onSuccess: (_, deletedId) => {
        adminState.broadcast.supplier.deleted({ id: deletedId });
        toast({ title: 'Success', description: 'Supplier deleted successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete supplier',
          variant: 'destructive' 
        });
      }
    })
  });

  // Product mutations
  const useProductMutations = () => ({
    create: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/products/regular', data),
      onSuccess: (result, variables) => {
        adminState.broadcast.product.created({ id: result?.id, ...variables });
        toast({ title: 'Success', description: 'Product created successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create product',
          variant: 'destructive' 
        });
      }
    }),
    
    update: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/products/regular/${id}`, data),
      onSuccess: (result, variables) => {
        adminState.broadcast.product.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Product updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update product',
          variant: 'destructive' 
        });
      }
    }),
    
    delete: useMutation({
      mutationFn: (id: number) => apiRequest('DELETE', `/api/products/regular/${id}`),
      onSuccess: (_, deletedId) => {
        adminState.broadcast.product.deleted({ id: deletedId });
        toast({ title: 'Success', description: 'Product deleted successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete product',
          variant: 'destructive' 
        });
      }
    })
  });

  // Expense mutations
  const useExpenseMutations = () => ({
    create: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/expenses', data),
      onSuccess: (result, variables) => {
        adminState.broadcast.expense.created({ id: result?.id, ...variables });
        toast({ title: 'Success', description: 'Expense created successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create expense',
          variant: 'destructive' 
        });
      }
    }),
    
    update: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/expenses/${id}`, data),
      onSuccess: (result, variables) => {
        adminState.broadcast.expense.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Expense updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update expense',
          variant: 'destructive' 
        });
      }
    }),
    
    delete: useMutation({
      mutationFn: (id: number) => apiRequest('DELETE', `/api/expenses/${id}`),
      onSuccess: (_, deletedId) => {
        adminState.broadcast.expense.deleted({ id: deletedId });
        toast({ title: 'Success', description: 'Expense deleted successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete expense',
          variant: 'destructive' 
        });
      }
    })
  });

  // User mutations
  const useUserMutations = () => ({
    create: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/users', data),
      onSuccess: (result, variables) => {
        adminState.broadcast.user.created({ id: result?.id, ...variables });
        toast({ title: 'Success', description: 'User created successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create user',
          variant: 'destructive' 
        });
      }
    }),
    
    update: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/users/${id}`, data),
      onSuccess: (result, variables) => {
        adminState.broadcast.user.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'User updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update user',
          variant: 'destructive' 
        });
      }
    }),
    
    delete: useMutation({
      mutationFn: (id: number) => apiRequest('DELETE', `/api/users/${id}`),
      onSuccess: (_, deletedId) => {
        adminState.broadcast.user.deleted({ id: deletedId });
        toast({ title: 'Success', description: 'User deleted successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete user',
          variant: 'destructive' 
        });
      }
    })
  });

  return {
    customer: useCustomerMutations(),
    employee: useEmployeeMutations(),
    equipment: useEquipmentMutations(),
    supplier: useSupplierMutations(),
    product: useProductMutations(),
    expense: useExpenseMutations(),
    user: useUserMutations(),
    
    // Utility functions
    adminState,
    queryClient,
    toast
  };
};