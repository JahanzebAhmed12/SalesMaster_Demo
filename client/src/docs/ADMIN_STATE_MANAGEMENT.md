# Admin State Management System

This document describes the comprehensive state management system implemented for the admin section of the SalesMasterDashboard application.

## Overview

The admin state management system provides:
- Cross-tab synchronization for real-time updates
- Centralized query invalidation
- Standardized mutation patterns
- Development debugging tools
- Automatic state consistency

## Architecture

### Core Components

1. **useAdminInvalidation** - Centralized query invalidation logic
2. **useAdminCrossTabSync** - Cross-tab communication using BroadcastChannel API
3. **useAdminStateManager** - Main orchestrator combining all functionality
4. **AdminStateProvider** - React context provider for admin state
5. **useAdminMutations** - Standardized mutation hooks with automatic state management

### File Structure

```
client/src/
├── hooks/
│   ├── useAdminInvalidation.ts      # Query invalidation logic
│   ├── useAdminCrossTabSync.ts      # Cross-tab synchronization
│   ├── useAdminStateManager.ts      # Main state manager
│   └── useAdminMutations.ts         # Standardized mutations
├── components/admin/
│   ├── AdminStateProvider.tsx       # Context provider
│   ├── AdminLayout.tsx              # Layout wrapper
│   └── AdminStateDebugger.tsx       # Development debugging tool
└── docs/
    └── ADMIN_STATE_MANAGEMENT.md    # This documentation
```

## Usage

### Basic Setup

1. **Wrap admin pages with AdminLayout:**

```tsx
import { AdminLayout } from '@/components/admin/AdminLayout';

function AdminPage() {
  return (
    <AdminLayout>
      <YourAdminComponent />
    </AdminLayout>
  );
}
```

2. **Use standardized mutations:**

```tsx
import { useAdminMutations } from '@/hooks/useAdminMutations';

function CustomerComponent() {
  const { customer } = useAdminMutations();
  
  const handleCreate = (data) => {
    customer.create.mutate(data);
  };
  
  const handleUpdate = (data) => {
    customer.update.mutate(data);
  };
  
  const handleDelete = (id) => {
    customer.delete.mutate(id);
  };
}
```

3. **Access admin state directly:**

```tsx
import { useAdminState } from '@/components/admin/AdminStateProvider';

function AdminComponent() {
  const adminState = useAdminState();
  
  // Force refresh specific data
  const refreshCustomers = () => {
    adminState.forceRefresh.customers();
  };
  
  // Get cache status
  const status = adminState.getAdminCacheStatus();
}
```

### Cross-Tab Synchronization

The system automatically synchronizes state across browser tabs:

```tsx
// When a customer is created in Tab A
customer.create.mutate(customerData);

// Tab B automatically receives the update and refreshes its customer queries
// No additional code needed - happens automatically
```

### Supported Operations

The system supports the following admin entities:
- **Customers** - Create, Update, Delete
- **Employees** - Create, Update, Delete
- **Equipment** - Create, Update, Delete
- **Suppliers** - Create, Update, Delete
- **Products** - Create, Update, Delete
- **Non-Products** - Create, Update, Delete
- **Expenses** - Create, Update, Delete
- **Users** - Create, Update, Delete
- **Company** - Update

## Advanced Features

### Bulk Operations

```tsx
const adminState = useAdminState();

// Refresh all admin data
await adminState.bulkOperations.refreshAdminData();

// Invalidate all queries
adminState.bulkOperations.invalidateAll();
```

### Development Debugging

Add the debugger component to see real-time state information:

```tsx
import { AdminStateDebugger } from '@/components/admin/AdminStateDebugger';

function App() {
  return (
    <div>
      <YourApp />
      <AdminStateDebugger />
    </div>
  );
}
```

The debugger shows:
- Total queries in cache
- Stale queries count
- Currently fetching queries
- Error queries
- Individual query status
- Quick refresh actions

### Manual Broadcasting

For custom operations, you can manually broadcast updates:

```tsx
const adminState = useAdminState();

// Broadcast custom customer operation
adminState.crossTabSync.broadcastCustomerOperation('UPDATED', { 
  id: customerId, 
  customData: 'value' 
});
```

## Implementation Details

### Query Keys

The system uses standardized query keys:
- Customers: `['/api/customers']`
- Employees: `['employees']`
- Equipment: `['/api/equipment']`
- Suppliers: `['/api/suppliers']`
- Products: `['/api/products']`
- Expenses: `['/api/expenses']`
- Users: `['/api/users']`
- Company: `['/api/company']`

### BroadcastChannel Events

Cross-tab communication uses these event types:
- `CUSTOMER_CREATED`, `CUSTOMER_UPDATED`, `CUSTOMER_DELETED`
- `EMPLOYEE_CREATED`, `EMPLOYEE_UPDATED`, `EMPLOYEE_DELETED`
- `EQUIPMENT_CREATED`, `EQUIPMENT_UPDATED`, `EQUIPMENT_DELETED`
- `SUPPLIER_CREATED`, `SUPPLIER_UPDATED`, `SUPPLIER_DELETED`
- `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_DELETED`
- `NON_PRODUCT_CREATED`, `NON_PRODUCT_UPDATED`, `NON_PRODUCT_DELETED`
- `EXPENSE_CREATED`, `EXPENSE_UPDATED`, `EXPENSE_DELETED`
- `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`
- `COMPANY_UPDATED`

### Error Handling

All mutations include standardized error handling:
- Toast notifications for success/error states
- Automatic query invalidation on success
- Cross-tab broadcasting on success
- Detailed error messages

## Migration Guide

### Updating Existing Components

1. **Replace manual mutations:**

```tsx
// Before
const deleteMutation = useMutation({
  mutationFn: (id) => apiRequest('DELETE', `/api/customers/${id}`),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
    toast({ title: 'Success', description: 'Customer deleted' });
  }
});

// After
const { customer } = useAdminMutations();
const deleteMutation = customer.delete;
```

2. **Add AdminLayout wrapper:**

```tsx
// Before
function CustomerDatabase() {
  return <div>Customer content</div>;
}

// After
import { AdminLayout } from '@/components/admin/AdminLayout';

function CustomerDatabase() {
  return (
    <AdminLayout>
      <div>Customer content</div>
    </AdminLayout>
  );
}
```

3. **Remove manual cross-tab sync:**

```tsx
// Before - manual BroadcastChannel usage
const channel = new BroadcastChannel('admin-updates');
channel.postMessage({ type: 'CUSTOMER_DELETED', id });

// After - automatic via useAdminMutations
const { customer } = useAdminMutations();
customer.delete.mutate(id); // Broadcasting happens automatically
```

## Performance Considerations

- **Query Deduplication**: React Query automatically deduplicates identical queries
- **Stale Time**: Queries are marked stale after 5 minutes by default
- **Background Refetching**: Stale queries refetch when window regains focus
- **Memory Management**: BroadcastChannels are properly cleaned up on unmount
- **Selective Invalidation**: Only relevant queries are invalidated per operation

## Troubleshooting

### Common Issues

1. **Cross-tab sync not working**
   - Ensure AdminLayout wraps your components
   - Check browser console for BroadcastChannel errors
   - Verify both tabs are using the same domain

2. **Queries not invalidating**
   - Check query keys match the standardized format
   - Ensure useAdminMutations is used instead of manual mutations
   - Verify AdminStateProvider is in the component tree

3. **Performance issues**
   - Use the AdminStateDebugger to identify excessive queries
   - Check for unnecessary re-renders
   - Consider implementing query-specific stale times

### Debug Commands

```tsx
// Get current cache status
const status = adminState.getAdminCacheStatus();
console.log('Cache Status:', status);

// Force refresh all data
await adminState.bulkOperations.refreshAdminData();

// Clear entire cache
adminState.clearAdminCache();
```

## Future Enhancements

Planned improvements:
- WebSocket integration for real-time updates
- Optimistic updates for better UX
- Offline support with sync on reconnect
- Advanced caching strategies
- Performance monitoring and analytics