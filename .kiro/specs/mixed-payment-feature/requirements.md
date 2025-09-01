# Mixed Payment Feature Requirements

## Introduction

This feature enhances the customer payment system to allow mixed payment types in a single transaction. Users can combine direct invoice payments and on-account payments within one payment batch, providing greater flexibility for complex payment scenarios.

## Requirements

### Requirement 1: Mixed Payment Mode

**User Story:** As a payment processor, I want to create a single payment that includes both direct invoice payments and on-account payments, so that I can handle complex customer payment scenarios efficiently.

#### Acceptance Criteria

1. WHEN user selects mixed payment mode THEN system SHALL display interface allowing selection of payment type per invoice
2. WHEN user selects invoices THEN system SHALL allow marking each invoice as "Direct Payment" or "On-Account Payment"
3. WHEN user enters payment amounts THEN system SHALL validate total matches selected invoice amounts plus on-account amount
4. WHEN user submits mixed payment THEN system SHALL create single payment batch with both payment types

### Requirement 2: Payment Type Selection per Invoice

**User Story:** As a user, I want to specify whether each selected invoice should be paid directly or as on-account credit, so that I can control how payments are applied.

#### Acceptance Criteria

1. WHEN invoice is selected THEN system SHALL display payment type selector (Direct/On-Account)
2. WHEN payment type is changed THEN system SHALL update payment calculations automatically
3. WHEN direct payment is selected THEN system SHALL apply payment directly to invoice balance
4. WHEN on-account payment is selected THEN system SHALL add payment to customer credit balance

### Requirement 3: Enhanced Payment Calculations

**User Story:** As a user, I want to see clear breakdown of direct payments vs on-account payments, so that I understand how the total payment is distributed.

#### Acceptance Criteria

1. WHEN invoices are selected with different payment types THEN system SHALL display separate totals for direct and on-account payments
2. WHEN payment amounts change THEN system SHALL recalculate totals in real-time
3. WHEN total payment exceeds selected amounts THEN system SHALL show remaining balance for on-account credit
4. WHEN payment is insufficient THEN system SHALL show validation error with clear breakdown

### Requirement 4: Single Payment Batch Creation

**User Story:** As a payment processor, I want mixed payments to be recorded as a single batch, so that I can track and manage the entire transaction together.

#### Acceptance Criteria

1. WHEN mixed payment is submitted THEN system SHALL create single payment batch ID
2. WHEN payment is recorded THEN system SHALL maintain separate records for direct and on-account portions
3. WHEN payment receipt is generated THEN system SHALL show both payment types under single batch
4. WHEN payment history is viewed THEN system SHALL display mixed payments with clear breakdown