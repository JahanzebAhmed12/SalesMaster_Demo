import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminInvalidation } from './useAdminInvalidation';

export const useAdminCrossTabSync = () => {
  const queryClient = useQueryClient();
  const {
    invalidateCustomerQueries,
    invalidateEmployeeQueries,
    invalidateEquipmentQueries,
    invalidateSupplierQueries,
    invalidateProductQueries,
    invalidateExpenseQueries,
    invalidateUserQueries,
    invalidateCompanyQueries
  } = useAdminInvalidation();

  useEffect(() => {
    // Create a broadcast channel for admin cross-tab communication
    const channel = new BroadcastChannel('admin-updates');

    const handleMessage = (event: MessageEvent) => {
      const { type, data } = event.data;

      console.log('Admin cross-tab sync: Received message', type, data);

      switch (type) {
        case 'CUSTOMER_CREATED':
        case 'CUSTOMER_UPDATED':
        case 'CUSTOMER_DELETED':
          console.log('Cross-tab sync: Customer operation detected, invalidating queries');
          invalidateCustomerQueries();
          break;
          
        case 'EMPLOYEE_CREATED':
        case 'EMPLOYEE_UPDATED':
        case 'EMPLOYEE_DELETED':
          console.log('Cross-tab sync: Employee operation detected, invalidating queries');
          invalidateEmployeeQueries();
          break;
          
        case 'EQUIPMENT_CREATED':
        case 'EQUIPMENT_UPDATED':
        case 'EQUIPMENT_DELETED':
          console.log('Cross-tab sync: Equipment operation detected, invalidating queries');
          invalidateEquipmentQueries();
          break;
          
        case 'SUPPLIER_CREATED':
        case 'SUPPLIER_UPDATED':
        case 'SUPPLIER_DELETED':
          console.log('Cross-tab sync: Supplier operation detected, invalidating queries');
          invalidateSupplierQueries();
          break;
          
        case 'PRODUCT_CREATED':
        case 'PRODUCT_UPDATED':
        case 'PRODUCT_DELETED':
        case 'NON_PRODUCT_CREATED':
        case 'NON_PRODUCT_UPDATED':
        case 'NON_PRODUCT_DELETED':
          console.log('Cross-tab sync: Product operation detected, invalidating queries');
          invalidateProductQueries();
          break;
          
        case 'EXPENSE_CREATED':
        case 'EXPENSE_UPDATED':
        case 'EXPENSE_DELETED':
          console.log('Cross-tab sync: Expense operation detected, invalidating queries');
          invalidateExpenseQueries();
          break;
          
        case 'USER_CREATED':
        case 'USER_UPDATED':
        case 'USER_DELETED':
          console.log('Cross-tab sync: User operation detected, invalidating queries');
          invalidateUserQueries();
          break;
          
        case 'COMPANY_UPDATED':
          console.log('Cross-tab sync: Company details updated, invalidating queries');
          invalidateCompanyQueries();
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
    invalidateCustomerQueries,
    invalidateEmployeeQueries,
    invalidateEquipmentQueries,
    invalidateSupplierQueries,
    invalidateProductQueries,
    invalidateExpenseQueries,
    invalidateUserQueries,
    invalidateCompanyQueries
  ]);

  // Broadcast functions for different admin operations
  const broadcastCustomerOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED', data?: any) => {
    const channel = new BroadcastChannel('admin-updates');
    channel.postMessage({
      type: `CUSTOMER_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastEmployeeOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED', data?: any) => {
    const channel = new BroadcastChannel('admin-updates');
    channel.postMessage({
      type: `EMPLOYEE_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastEquipmentOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED', data?: any) => {
    const channel = new BroadcastChannel('admin-updates');
    channel.postMessage({
      type: `EQUIPMENT_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastSupplierOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED', data?: any) => {
    const channel = new BroadcastChannel('admin-updates');
    channel.postMessage({
      type: `SUPPLIER_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastProductOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED', data?: any) => {
    const channel = new BroadcastChannel('admin-updates');
    channel.postMessage({
      type: `PRODUCT_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastNonProductOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED', data?: any) => {
    const channel = new BroadcastChannel('admin-updates');
    channel.postMessage({
      type: `NON_PRODUCT_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastExpenseOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED', data?: any) => {
    const channel = new BroadcastChannel('admin-updates');
    channel.postMessage({
      type: `EXPENSE_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastUserOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED', data?: any) => {
    const channel = new BroadcastChannel('admin-updates');
    channel.postMessage({
      type: `USER_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastCompanyUpdate = (data?: any) => {
    const channel = new BroadcastChannel('admin-updates');
    channel.postMessage({
      type: 'COMPANY_UPDATED',
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  return {
    broadcastCustomerOperation,
    broadcastEmployeeOperation,
    broadcastEquipmentOperation,
    broadcastSupplierOperation,
    broadcastProductOperation,
    broadcastNonProductOperation,
    broadcastExpenseOperation,
    broadcastUserOperation,
    broadcastCompanyUpdate
  };
};