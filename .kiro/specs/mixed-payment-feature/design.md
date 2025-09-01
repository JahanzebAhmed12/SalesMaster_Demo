# Mixed Payment Feature Design

## Overview

The mixed payment feature extends the existing customer payment system to support hybrid transactions where users can combine direct invoice payments and on-account payments in a single batch. This design maintains backward compatibility while adding new functionality through a clean, intuitive interface.

## Architecture

### Component Structure
- **PaymentModeSelector**: Enhanced to include "Mixed Payment" option
- **InvoiceTable**: Extended with payment type selection per invoice
- **PaymentSummary**: New component showing breakdown of payment types
- **PaymentCalculator**: Enhanced logic for mixed payment calculations
- **PaymentSubmission**: Modified to handle mixed payment payloads

### Data Flow
1. User selects Mixed Payment mode
2. User selects invoices and specifies payment type per invoice
3. System calculates totals for direct and on-account payments
4. User enters split payment amounts
5. System validates and submits mixed payment batch
6. Backend processes both payment types under single batch ID

## Components and Interfaces

### Enhanced State Management

```typescript
// New payment type enum
type PaymentType = 'direct' | 'on-account';

// Enhanced invoice payment tracking
interface InvoicePaymentConfig {
  invoiceId: number;
  paymentType: PaymentType;
  amount: number;
}

// New state for mixed payments
const [invoicePaymentConfigs, setInvoicePaymentConfigs] = useState<Map<number, InvoicePaymentConfig>>(new Map());
const [paymentMode, setPaymentMode] = useState<'invoice' | 'on-account' | 'mixed'>('invoice');
```

### Payment Type Selector Component

```typescript
interface PaymentTypeSelectorProps {
  invoiceId: number;
  currentType: PaymentType;
  onTypeChange: (invoiceId: number, type: PaymentType) => void;
  disabled?: boolean;
}
```

### Enhanced Payment Summary

```typescript
interface PaymentBreakdown {
  directPaymentTotal: number;
  onAccountTotal: number;
  selectedInvoicesTotal: number;
  remainingForOnAccount: number;
}
```

## Data Models

### Enhanced Payment Payload

```typescript
interface MixedPaymentPayload {
  customerId: number;
  amount: number;
  paymentDate: string;
  remarks: string;
  splitPayment: SplitPaymentAmounts;
  directPayments: {
    invoiceId: number;
    invoiceNumber: string;
    amount: number;
    paymentMode: string;
  }[];
  onAccountPayments: {
    invoiceId?: number; // Optional - can be pure on-account
    invoiceNumber?: string;
    amount: number;
  }[];
}
```

### Database Schema Considerations

The existing payment table structure can accommodate mixed payments:
- `batch_id`: Groups all payments in the mixed transaction
- `sale_id`: NULL for pure on-account payments, invoice ID for direct payments
- `payment_type`: New field to distinguish 'direct' vs 'on-account'
- `remarks`: Enhanced to include payment type context

## Error Handling

### Validation Rules
1. **Amount Validation**: Total split payment must equal sum of direct + on-account amounts
2. **Invoice Validation**: Direct payments cannot exceed invoice balance
3. **Permission Validation**: User must have permissions for selected payment date
4. **Selection Validation**: At least one invoice must be selected in mixed mode

### Error Messages
- Clear breakdown showing expected vs actual amounts
- Specific validation for each payment type
- Contextual help for mixed payment scenarios

## Testing Strategy

### Unit Tests
- Payment calculation logic for mixed scenarios
- Validation functions for different payment combinations
- State management for invoice payment configurations

### Integration Tests
- End-to-end mixed payment creation
- Payment batch grouping and retrieval
- Receipt generation for mixed payments

### User Acceptance Tests
- Mixed payment workflow scenarios
- Edge cases (all direct, all on-account, mixed)
- Payment history display and editing