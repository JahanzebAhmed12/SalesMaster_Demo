# Mixed Payment Feature Implementation Plan

- [x] 1. Add mixed payment mode to payment mode selector


  - Modify payment mode toggle to include "Mixed Payment" option
  - Update state management to handle three payment modes
  - Add conditional rendering logic for mixed payment interface
  - _Requirements: 1.1, 1.2_



- [ ] 2. Implement payment type selection per invoice
  - Add PaymentTypeSelector component for individual invoices
  - Create state management for invoice payment configurations
  - Add payment type column to invoice table in mixed mode
  - Implement payment type change handlers


  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 3. Enhance payment calculation logic
  - Create calculateMixedPaymentTotals function
  - Implement real-time calculation updates


  - Add validation for mixed payment scenarios
  - Create payment breakdown display component
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Update invoice selection handlers


  - Modify handleInvoiceSelection for mixed payment mode
  - Update handleSelectAll to work with payment type configurations
  - Implement automatic payment type assignment for new selections
  - Add payment amount distribution logic
  - _Requirements: 2.1, 2.2, 3.1_


- [ ] 5. Create mixed payment submission logic
  - Implement handleMixedPaymentSubmit function
  - Create mixed payment payload structure
  - Add validation for mixed payment submissions
  - Update payment mutation to handle mixed payments
  - _Requirements: 4.1, 4.2, 1.4_

- [x] 6. Update payment summary and display components

  - Create PaymentBreakdownSummary component
  - Update remaining balance calculations for mixed payments
  - Enhance payment total displays with breakdown
  - Add visual indicators for payment types
  - _Requirements: 3.1, 3.2, 4.3_



- [ ] 7. Modify backend API to support mixed payments
  - Update /api/payments/bulk endpoint to handle mixed payment payload
  - Implement mixed payment processing logic
  - Ensure proper batch ID assignment for mixed payments
  - Add payment type tracking in database records
  - _Requirements: 4.1, 4.2, 4.4_

- [ ] 8. Update payment history display for mixed payments
  - Modify groupedPaymentHistory to show payment type breakdown
  - Update payment history table to display mixed payment details
  - Enhance payment editing to support mixed payment modifications
  - Update export functions to include payment type information


  - _Requirements: 4.3, 4.4_

- [ ] 9. Add comprehensive validation and error handling
  - Implement mixed payment validation rules
  - Add clear error messages for validation failures



  - Create helper functions for payment amount validation
  - Add permission checks for mixed payment scenarios
  - _Requirements: 3.4, 1.3_

- [ ] 10. Test and refine mixed payment functionality
  - Test all mixed payment scenarios (various combinations)
  - Verify payment calculations and validations
  - Test payment submission and batch creation
  - Validate payment history and editing functionality
  - _Requirements: 1.1, 2.1, 3.1, 4.1_