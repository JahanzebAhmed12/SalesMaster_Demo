# Requirements Document

## Introduction

This feature adds an `is_company` boolean flag to both the `Customer` and `Supplier` models. When a customer or supplier is tagged as a company, their transactions continue to appear in all report listings (daily book sales, daily summary, etc.) for visibility, but their associated amounts are excluded from all financial totals (cash totals, card totals, banking totals, etc.). Stock movements are unaffected. The flag is managed via a checkbox in the customer and supplier add/edit forms.

## Glossary

- **Customer**: A buyer entity stored in the `Customer` model, identified by `customer_code` and `customer_name`.
- **Supplier**: A seller/vendor entity stored in the `Supplier` model, identified by `supplier_code` and `supplier_name`.
- **Company_Customer**: A `Customer` record where `is_company` is `True`.
- **Company_Supplier**: A `Supplier` record where `is_company` is `True`.
- **Financial_Total**: Any aggregated monetary sum shown in reports, including cash totals, card totals, bank transfer totals, cheque totals, banking totals, and account sales totals.
- **Report_Listing**: The individual transaction rows displayed in a report, as distinct from the totals row or summary figures.
- **Daily_Book_Sales**: The report endpoint and page that lists individual sales transactions with a totals row.
- **Daily_Summary**: The report endpoint and page that shows aggregated financial totals for a date range.
- **Daily_Accounts**: The report endpoint and page that shows receivables, payables, and banking summaries.
- **CustomerSchema**: The Marshmallow schema used to serialise and deserialise `Customer` objects.
- **SupplierSchema**: The Marshmallow schema used to serialise and deserialise `Supplier` objects.
- **Migration**: An `ALTER TABLE` SQL statement executed at application startup to add new columns to existing database tables.

---

## Requirements

### Requirement 1: Customer Model — is_company Flag

**User Story:** As an administrator, I want to mark a customer as a company, so that their transactions are visible in reports but excluded from financial totals.

#### Acceptance Criteria

1. THE `Customer` model SHALL include an `is_company` boolean column with a default value of `False`.
2. WHEN the application starts and the `is_company` column does not exist in the `customer` table, THE Migration SHALL execute `ALTER TABLE customer ADD COLUMN is_company BOOLEAN DEFAULT 0` to add the column.
3. THE `CustomerSchema` SHALL include `is_company` as a serialisable and deserialisable boolean field.
4. THE `Customer.to_dict()` method SHALL include `is_company` as a boolean value in its returned dictionary.

---

### Requirement 2: Supplier Model — is_company Flag

**User Story:** As an administrator, I want to mark a supplier as a company, so that their transactions are visible in reports but excluded from financial totals.

#### Acceptance Criteria

1. THE `Supplier` model SHALL include an `is_company` boolean column with a default value of `False`.
2. WHEN the application starts and the `is_company` column does not exist in the `suppliers` table, THE Migration SHALL execute `ALTER TABLE suppliers ADD COLUMN is_company BOOLEAN DEFAULT 0` to add the column.
3. THE `SupplierSchema` SHALL include `is_company` as a serialisable and deserialisable boolean field.
4. THE `Supplier.to_dict()` method SHALL include `is_company` as a boolean value in its returned dictionary.

---

### Requirement 3: Customer Add/Edit Form — Company Checkbox

**User Story:** As an administrator, I want a checkbox in the customer form to set the company flag, so that I can designate a customer as a company without leaving the data-entry workflow.

#### Acceptance Criteria

1. THE Customer_Form SHALL display an "Is Company" checkbox field in the customer add and edit forms.
2. WHEN a customer record is loaded for editing, THE Customer_Form SHALL pre-populate the "Is Company" checkbox to reflect the stored `is_company` value.
3. WHEN the customer form is submitted, THE Customer_Form SHALL include the `is_company` boolean value in the request payload sent to the API.
4. WHEN the API returns a saved customer record, THE Customer_Form SHALL display the updated `is_company` value without requiring a page reload.

---

### Requirement 4: Supplier Add/Edit Form — Company Checkbox

**User Story:** As an administrator, I want a checkbox in the supplier form to set the company flag, so that I can designate a supplier as a company without leaving the data-entry workflow.

#### Acceptance Criteria

1. THE Supplier_Form SHALL display an "Is Company" checkbox field in the supplier add and edit forms.
2. WHEN a supplier record is loaded for editing, THE Supplier_Form SHALL pre-populate the "Is Company" checkbox to reflect the stored `is_company` value.
3. WHEN the supplier form is submitted, THE Supplier_Form SHALL include the `is_company` boolean value in the request payload sent to the API.
4. WHEN the API returns a saved supplier record, THE Supplier_Form SHALL display the updated `is_company` value without requiring a page reload.

---

### Requirement 5: Daily Book Sales — Company Transactions Visible but Excluded from Totals

**User Story:** As a manager, I want company customer sales to appear in the daily book sales listing but not affect the totals row, so that I can see all transactions while keeping financial totals accurate.

#### Acceptance Criteria

1. WHEN the `daily_book_sales` endpoint returns data, THE Daily_Book_Sales report SHALL include all sale rows for Company_Customers in the listing.
2. WHEN the `daily_book_sales` endpoint calculates the totals row, THE Daily_Book_Sales report SHALL exclude the `total_amount` of all sales belonging to Company_Customers from the cash total, card total, account total, and any other Financial_Total fields in that row.
3. WHEN the `daily_book_sales` endpoint calculates the totals row, THE Daily_Book_Sales report SHALL exclude the payment amounts of all payments linked to Company_Customers from all Financial_Total fields in that row.

---

### Requirement 6: Daily Summary Report — Company Amounts Excluded from Totals

**User Story:** As a manager, I want company customer amounts excluded from the daily summary financial totals, so that the summary reflects only non-company cash flow.

#### Acceptance Criteria

1. WHEN the `daily_summary_report` endpoint calculates `cash_sales`, THE Daily_Summary report SHALL exclude sale amounts where the associated `Customer.is_company` is `True`.
2. WHEN the `daily_summary_report` endpoint calculates `card_sales`, THE Daily_Summary report SHALL exclude payment amounts where the associated `Customer.is_company` is `True`.
3. WHEN the `daily_summary_report` endpoint calculates `account_sales`, THE Daily_Summary report SHALL exclude sale amounts where the associated `Customer.is_company` is `True`.
4. WHEN the `daily_summary_report` endpoint calculates `banking_total`, THE Daily_Summary report SHALL exclude amounts derived from Company_Customer transactions.
5. WHILE a Company_Customer transaction exists for the queried date range, THE Daily_Summary report SHALL still display that transaction in any listing rows but SHALL NOT include its amount in any Financial_Total.

---

### Requirement 7: Daily Accounts Report — Company Payments Excluded from Totals

**User Story:** As a manager, I want company customer payments excluded from the daily accounts receivables totals, so that the accounts report reflects only non-company receivables.

#### Acceptance Criteria

1. WHEN the `daily_accounts_report` endpoint calls `sum_payment()` for any payment mode, THE Daily_Accounts report SHALL exclude `Payment` records where the associated `Customer.is_company` is `True`.
2. WHEN the `daily_accounts_report` endpoint calculates `total_cash`, THE Daily_Accounts report SHALL exclude cash payments linked to Company_Customers.
3. WHEN the `daily_accounts_report` endpoint calculates `total_others`, THE Daily_Accounts report SHALL exclude cheque, card, bank transfer, and other payments linked to Company_Customers.
4. WHEN the `daily_accounts_report` endpoint calculates `total_banking`, THE Daily_Accounts report SHALL exclude banking entries that originate from Company_Customer transactions.

---

### Requirement 8: Stock Movements — No Change

**User Story:** As a warehouse operator, I want stock movements to remain unaffected by the company flag, so that inventory accuracy is preserved regardless of customer classification.

#### Acceptance Criteria

1. WHILE a sale is created for a Company_Customer, THE System SHALL decrement stock levels by the sold quantity in the same manner as for a non-company customer.
2. THE System SHALL NOT apply any special stock logic based on the `is_company` flag on either the `Customer` or `Supplier` model.
