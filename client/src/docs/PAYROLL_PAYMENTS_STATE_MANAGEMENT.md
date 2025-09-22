# Payroll & Payments State Management System

This document describes the comprehensive state management systems implemented for the payroll and payments sections of the SalesMasterDashboard application.

## Overview

The payroll and payments state management systems provide:
- Cross-tab synchronization for real-time updates
- Centralized query invalidation
- Standardized mutation patterns
- Development debugging tools
- Automatic state consistency

## Architecture

### Payroll State Management

#### Core Components

1. **usePayrollInvalidation** - Centralized query invalidation for payroll operations
2. **usePayrollCrossTabSync** - Cross-tab communication for payroll updates
3. **usePayrollStateManager** - Main orchestrator for payroll state
4. **PayrollStateProvider** - React context provider for payroll state
5. **usePayrollMutations** - Standardized mutation hooks for payroll operations

#### File Structure

```
client/src/
├── hooks/
│   ├── usePayrollInvalidation.ts       # Query invalidation logic
│   ├── usePayrollCrossTabSync.ts       # Cross-tab synchronization
│   ├── usePayrollStateManager.ts       # Main state manager
│   └── usePayrollMutations.ts          # Standardized mutations
├── components/payroll/
│   ├── PayrollStateProvider.tsx        # Context provider
│   └── PayrollLayout.tsx               # Layout wrapper
└── pages/payroll/
    ├── holiday-requests.tsx            # Updated with state management
    ├── monthly-reports.tsx             # Payroll reports
    └── payroll.tsx                     # Daily attendance
```

### Payments State Management

#### Core Components

1. **usePaymentsInvalidation** - Centralized query invalidation for payment operations
2. **usePaymentsCrossTabSync** - Cross-tab communication for payment updates
3. **usePaymentsStateManager** - Main orchestrator for payments state
4. **PaymentsStateProvider** - React context provider for payments state
5. **usePaymentsMutations** - Standardized mutation hooks for payment operations

#### File Structure

```
client/src/
├── hooks/
│   ├── usePaymentsInvalidation.ts      # Query invalidation logic
│   ├── usePaymentsCrossTabSync.ts      # Cross-tab synchronization
│   ├── usePaymentsStateManager.ts      # Main state manager
│   └── usePaymentsMutations.ts         # Standardized mutations
├── components/payments/
│   ├── PaymentsStateProvider.tsx       # Context provider
│   └── PaymentsLayout.tsx              # Layout wrapper
└── pages/payments/
    ├── customer-payment.tsx            # Customer payment processing
    ├── supplier-payment.tsx            # Updated with state management
    ├── customer-payment-history.tsx    # Payment history
    └── sup-payment-history.tsx         # Supplier payment history
```

## Usage

### Payroll State Management

#### Basic Setup

1. **Wrap payroll pages with PayrollLayout:**

```tsx
import { PayrollLayout } from '@/components/payroll/PayrollLayout';

function PayrollPage() {
  return (
    <PayrollLayout>
      <YourPayrollComponent />
    </PayrollLayout>
  );
}
```

2. **Use standardized mutations:**

```tsx
import { usePayrollMutations } from '@/hooks/usePayrollMutations';

function HolidayRequestComponent() {
  const { holidayRequest } = usePayrollMutations();
  
  const handleCreate = (data) => {
    holidayRequest.create.mutate(data);
  };
  
  const handleApprove = (id, data) => {
    holidayRequest.approve.mutate({ id, ...data });
  };
  
  const handleUploadForm = (id, file) => {
    holidayRequest.uploadSignedForm.mutate({ id, file });
  };
}
```

3. **Access payroll state directly:**

```tsx
import { usePayrollState } from '@/components/payroll/PayrollStateProvider';

function PayrollComponent() {
  const payrollState = usePayrollState();
  
  // Force refresh specific data
  const refreshAttendance = () => {
    payrollState.forceRefresh.attendance();
  };
  
  // Get cache status
  const status = payrollState.getPayrollCacheStatus();
}
```

### Payments State Management

#### Basic Setup

1. **Wrap payment pages with PaymentsLayout:**

```tsx
import { PaymentsLayout } from '@/components/payments/PaymentsLayout';

function PaymentPage() {
  return (
    <PaymentsLayout>
      <YourPaymentComponent />
    </PaymentsLayout>
  );
}
```

2. **Use standardized mutations:**

```tsx
import { usePaymentsMutations } from '@/hooks/usePaymentsMutations';

function CustomerPaymentComponent() {
  const { customerPayment } = usePaymentsMutations();
  
  const handleCreate = (data) => {
    customerPayment.create.mutate(data);
  };
  
  const handleUpdate = (batchId, data) => {
    customerPayment.update.mutate({ batchId, ...data });
  };
  
  const handleDelete = (batchId) => {
    customerPayment.delete.mutate(batchId);
  };
}
```

3. **Access payments state directly:**

```tsx
import { usePaymentsState } from '@/components/payments/PaymentsStateProvider';

function PaymentComponent() {
  const paymentsState = usePaymentsState();
  
  // Force refresh specific data
  const refreshCustomerPayments = () => {
    paymentsState.forceRefresh.customerPayments();
  };
  
  // Get cache status
  const status = paymentsState.getPaymentsCacheStatus();
}
```

## Cross-Tab Synchronization

### Payroll Events

The payroll system automatically synchronizes these events across browser tabs:
- **Holiday Requests**: `CREATED`, `UPDATED`, `DELETED`, `APPROVED`, `REJECTED`
- **Attendance**: `CREATED`, `UPDATED`, `DELETED`, `BULK_UPDATE`
- **Payroll**: `CALCULATED`, `UPDATED`, `GENERATED`
- **Employee Payroll**: `PAYROLL_UPDATED`, `SALARY_UPDATED`, `ATTENDANCE_UPDATED`

### Payments Events

The payments system automatically synchronizes these events across browser tabs:
- **Customer Payments**: `CREATED`, `UPDATED`, `DELETED`
- **Supplier Payments**: `CREATED`, `UPDATED`, `DELETED`
- **Invoice Updates**: `CUSTOMER_INVOICE_UPDATED`, `SUPPLIER_INVOICE_UPDATED`
- **Balance Updates**: `CUSTOMER_BALANCE_UPDATED`, `SUPPLIER_BALANCE_UPDATED`
- **Payment Batches**: `CREATED`, `UPDATED`, `DELETED`

## Supported Operations

### Payroll Operations

- **Holiday Requests** - Create, Update, Delete, Approve, Reject, Upload Forms, Reset Entitlements
- **Attendance** - Create, Update, Delete, Bulk Update
- **Payroll** - Calculate, Update, Generate
- **Employee Payroll** - Update Salary, Update Payroll Data

### Payment Operations

- **Customer Payments** - Create, Update, Delete, Batch Operations
- **Supplier Payments** - Create, Update, Delete, Bulk Create
- **Invoice Management** - Update Customer/Supplier Invoices
- **Balance Management** - Update Customer/Supplier Balances
- **Payment Batches** - Create, Update, Delete

## Advanced Features

### Bulk Operations

#### Payroll

```tsx
const payrollState = usePayrollState();

// Refresh all payroll data
await payrollState.bulkOperations.refreshPayrollData();

// Invalidate all queries
payrollState.bulkOperations.invalidateAll();
```

#### Payments

```tsx
const paymentsState = usePaymentsState();

// Refresh all payments data
await paymentsState.bulkOperations.refreshPaymentsData();

// Invalidate all queries
paymentsState.bulkOperations.invalidateAll();
```

### Development Debugging

Both systems include debugging capabilities:

```tsx
// Payroll debugging
const payrollStatus = payrollState.getPayrollCacheStatus();
console.log('Payroll Cache Status:', payrollStatus);

// Payments debugging
const paymentsStatus = paymentsState.getPaymentsCacheStatus();
console.log('Payments Cache Status:', paymentsStatus);
```

### Manual Broadcasting

For custom operations, you can manually broadcast updates:

#### Payroll

```tsx
const payrollState = usePayrollState();

// Broadcast custom holiday request operation
payrollState.crossTabSync.broadcastHolidayRequestOperation('APPROVED', { 
  id: requestId, 
  approvedBy: userId 
});
```

#### Payments

```tsx
const paymentsState = usePaymentsState();

// Broadcast custom payment operation
paymentsState.crossTabSync.broadcastCustomerPaymentOperation('CREATED', { 
  batchId: batchId, 
  amount: paymentAmount 
});
```

## Implementation Details

### Query Keys

#### Payroll Query Keys
- Holiday Requests: `['/api/holiday-requests']`
- Attendance: `['/api/attendance']`, `['/api/reports/attendance']`
- Payroll: `['/api/payroll']`, `['/api/reports/payroll']`
- Employee Payroll: `['/api/employees']` (with additional parameters)

#### Payments Query Keys
- Customer Payments: `['/api/payments']`, `['/api/customer-payments']`
- Supplier Payments: `['/api/supplier-payments']`
- Outstanding Invoices: `['/api/customers/{id}/outstanding_invoices']`, `['/api/suppliers/{id}/outstanding_invoices']`
- Payment History: `['/api/payments/history']`

### BroadcastChannel Events

#### Payroll Events
- `HOLIDAY_REQUEST_CREATED`, `HOLIDAY_REQUEST_UPDATED`, `HOLIDAY_REQUEST_DELETED`
- `HOLIDAY_REQUEST_APPROVED`, `HOLIDAY_REQUEST_REJECTED`
- `ATTENDANCE_CREATED`, `ATTENDANCE_UPDATED`, `ATTENDANCE_DELETED`, `ATTENDANCE_BULK_UPDATE`
- `PAYROLL_CALCULATED`, `PAYROLL_UPDATED`, `PAYROLL_GENERATED`
- `EMPLOYEE_PAYROLL_UPDATED`, `EMPLOYEE_SALARY_UPDATED`, `EMPLOYEE_ATTENDANCE_UPDATED`

#### Payments Events
- `CUSTOMER_PAYMENT_CREATED`, `CUSTOMER_PAYMENT_UPDATED`, `CUSTOMER_PAYMENT_DELETED`
- `SUPPLIER_PAYMENT_CREATED`, `SUPPLIER_PAYMENT_UPDATED`, `SUPPLIER_PAYMENT_DELETED`
- `CUSTOMER_INVOICE_UPDATED`, `SUPPLIER_INVOICE_UPDATED`
- `CUSTOMER_BALANCE_UPDATED`, `SUPPLIER_BALANCE_UPDATED`
- `PAYMENT_BATCH_CREATED`, `PAYMENT_BATCH_UPDATED`, `PAYMENT_BATCH_DELETED`

### Error Handling

All mutations include standardized error handling:
- Toast notifications for success/error states
- Automatic query invalidation on success
- Cross-tab broadcasting on success
- Detailed error messages

## Migration Guide

### Updating Existing Payroll Components

1. **Replace manual mutations:**

```tsx
// Before
const createHolidayRequestMutation = useMutation({
  mutationFn: (data) => apiRequest('POST', '/api/holiday-requests', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/holiday-requests'] });
    toast({ title: 'Success', description: 'Holiday request created' });
  }
});

// After
const { holidayRequest } = usePayrollMutations();
const createHolidayRequestMutation = holidayRequest.create;
```

2. **Add PayrollLayout wrapper:**

```tsx
// Before
function HolidayRequests() {
  return <div>Holiday requests content</div>;
}

// After
import { PayrollLayout } from '@/components/payroll/PayrollLayout';

function HolidayRequests() {
  return (
    <PayrollLayout>
      <div>Holiday requests content</div>
    </PayrollLayout>
  );
}
```

### Updating Existing Payment Components

1. **Replace manual mutations:**

```tsx
// Before
const createPaymentMutation = useMutation({
  mutationFn: (data) => apiRequest('POST', '/api/payments/customer-bulk', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
    toast({ title: 'Success', description: 'Payment created' });
  }
});

// After
const { customerPayment } = usePaymentsMutations();
const createPaymentMutation = customerPayment.create;
```

2. **Add PaymentsLayout wrapper:**

```tsx
// Before
function CustomerPayment() {
  return <div>Customer payment content</div>;
}

// After
import { PaymentsLayout } from '@/components/payments/PaymentsLayout';

function CustomerPayment() {
  return (
    <PaymentsLayout>
      <div>Customer payment content</div>
    </PaymentsLayout>
  );
}
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
   - Ensure Layout components wrap your pages
   - Check browser console for BroadcastChannel errors
   - Verify both tabs are using the same domain

2. **Queries not invalidating**
   - Check query keys match the standardized format
   - Ensure standardized mutations are used
   - Verify StateProvider is in the component tree

3. **Performance issues**
   - Use debugging tools to identify excessive queries
   - Check for unnecessary re-renders
   - Consider implementing query-specific stale times

### Debug Commands

```tsx
// Payroll debugging
const payrollStatus = payrollState.getPayrollCacheStatus();
console.log('Payroll Cache Status:', payrollStatus);
await payrollState.bulkOperations.refreshPayrollData();
payrollState.clearPayrollCache();

// Payments debugging
const paymentsStatus = paymentsState.getPaymentsCacheStatus();
console.log('Payments Cache Status:', paymentsStatus);
await paymentsState.bulkOperations.refreshPaymentsData();
paymentsState.clearPaymentsCache();
```

## Future Enhancements

Planned improvements:
- WebSocket integration for real-time updates
- Optimistic updates for better UX
- Offline support with sync on reconnect
- Advanced caching strategies
- Performance monitoring and analytics
- Integration with notification system
- Audit trail for payment operations
- Advanced reporting capabilities