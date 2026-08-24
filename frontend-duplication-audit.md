# SalesMasterDashboard Frontend Architecture and Duplication Audit

**Repository:** `JahanzebAhmed12/SalesMasterDashboard`  
**Audited revision:** `8ee64cc` (`Fixed product dropdown`)  
**Scope:** `client/src` TypeScript and TSX code  
**Author:** **Manus AI**  
**Audit date:** 23 August 2026

## Executive conclusion

The frontend is a large React/Vite business application with a clear domain vocabulary, but its implementation is currently organized as a route-oriented collection of very large pages rather than as a set of domain modules composed from shared UI, data, and workflow primitives. The duplication is substantial and measurable: the token-based copy detector found **551 clone matches**, with approximately **9,565 duplicated lines out of 69,303 analyzed lines**, or **13.8%** overall. TSX duplication is higher at **14.5%**, while plain TypeScript duplication is only **2.6%**. These figures include some legitimate repetition and same-file repeated markup, so they should be treated as a prioritization signal rather than an exact amount of removable code. [A1]

The most important finding is that several of the strongest duplication clusters are not isolated accidents. They are repeated page families with the same state machine, filters, fetch lifecycle, export behavior, table structure, and loading/error states, differentiated mainly by entity names and endpoint paths. The two aging reports are a near-clone pair, the two on-account screens are a near-clone pair, the product sales/purchase history pages are a near-clone pair, and the A4/A5 invoice print pages are effectively one print template with size-specific presentation differences. [A2]

The codebase also contains shared abstractions that are not being consistently adopted. A generic `PaginatedTable` already exists, but several database pages implement their own table and pagination markup. A reusable `DateRangeFilter` exists, but many reports still hand-build date controls. There are two overlapping business-date hooks, two pagination hooks with nearly identical validity logic, three entity-search components that duplicate the same autocomplete controller, and three domain mutation hooks that repeat the same mutation/toast/broadcast pattern. This means the best first refactors are not speculative redesigns; they are consolidation of abstractions the repository already needs and, in several cases, has already partially implemented.

## 1. Frontend shape and architectural map

The audited frontend contains **200 TypeScript/TSX files** and approximately **69,324 source lines**. It is divided into 94 page files, 70 components, 28 hooks, 6 library modules, and the root `App.tsx`/`main.tsx` entry files. The page count is high for a single route file: `App.tsx` declares 96 route elements covering 94 distinct paths and imports 107 modules. The route shell is therefore a central coupling point and a likely future candidate for route metadata and lazy-loaded route modules. [A1]

| Area | Approx. size | Current responsibility | Architectural observation |
|---|---:|---|---|
| `client/src/pages` | 94 files | Screens for data entry, reports, payments, payroll, admin, print, and profile | Most domain behavior, API calls, local state, table markup, exports, and formatting live directly in pages. |
| `client/src/components` | 70 files | shadcn/Radix primitives plus layout, search, state providers, and a few domain widgets | The primitive layer is healthy, but domain-level reusable components are comparatively sparse. |
| `client/src/hooks` | 28 files | Auth, business date, search state, pagination, state managers, invalidation, and mutations | Contains useful abstractions, but also parallel implementations and repeated boilerplate. |
| `client/src/lib` | 6 files | API client, auth, config, exports, invoice PDF, and formatting utilities | The API boundary is partly centralized and partly bypassed by direct `fetch` and local URL helpers. |
| `client/src/App.tsx` | 656 lines | All route declarations and top-level provider composition | Route registration, page imports, access metadata, layout decisions, and print routes are coupled in one file. |

There are two page-shell systems. `DashboardLayout` is the route-protection layout used by `ProtectedRoute`, while `PageLayout` is used directly by approximately 38 page files and contains its own authentication redirect behavior. `DashboardLayout` renders the header, sidebar, mobile overlay, main content, and session timer; `PageLayout` renders a different shell and imports `Header` without actually rendering it in the returned markup. The coexistence is not necessarily wrong because some print and specialized pages have different needs, but it is a maintenance risk: new screens can silently diverge in navigation, authentication behavior, spacing, and responsive handling. [S1] [S2]

The application-level provider composition is compact but the route table is not. `App.tsx` wraps the application in `QueryClientProvider`, `ThemeProvider`, `TooltipProvider`, `Toaster`, and `SessionStatus`, then invokes `checkAuth` and auto-logout globally. All pages are statically imported, which means the initial bundle includes the complete application. The production build succeeds, but the main JavaScript chunk is approximately **2.77 MB before gzip**, and Vite warns that some chunks exceed 500 kB. That is not a duplication finding by itself, but it reinforces the value of route-level lazy loading after the structural refactor. [S3]

## 2. Duplication evidence and strongest page families

The independent copy-detection pass found 543 TSX clone matches and 8 TypeScript clone matches. The following clusters are the most actionable because they represent meaningful page or workflow families rather than generated UI primitives.

| Priority | Duplication family | Evidence | What is repeated | Recommended target |
|---|---|---|---|---|
| P0 | Customer and supplier aging reports | `customer-aging-rpt.tsx` and `supplier-aging-rpt.tsx` score **93.7%** similar; 16 clone matches and about 448 duplicated lines | Date/business-date synchronization, filter state, currency loading, server pagination, totals, error handling, export setup, and report table structure | `AgingReportPage` or `useAgingReport` plus configurable columns, endpoint, labels, and entity field mapping. |
| P0 | Product sales and product purchase history | Pair similarity **83.1%**; 13 clone matches and about 250 duplicated lines | Date/filter state, API query construction, table/report layout, exports, and empty/loading/error handling | A configurable `ProductHistoryReport` with a `mode`/report definition object. |
| P0 | Customer and supplier on-account screens | Pair similarity **83.7%**; 12 clone matches and about 240 duplicated lines | Three-card screen structure, entity selection, date filtering, invoice lookup, payment submission, history table, and toast flow | Shared `OnAccountPaymentPage` with customer/supplier adapters for search, invoice lookup, payload, and history columns. |
| P0 | A4 invoice and A5 invoice print pages | Pair similarity **83.8%**; the A5 file is predominantly a size/presentation variant of `invoice.tsx` | Public API loader, settings loader, invoice data types, header, customer block, invoice metadata, items table, totals, footer, print/close controls | `InvoicePrintTemplate` plus `InvoicePrintPage` and a size preset such as `{ page: "A4" | "A5" }`. |
| P1 | Admin database/list pages | Customer/supplier pages score **69.0%** similar; customer/products also share a 47-line clone; supplier and other database screens repeat the same list/export/pagination pattern | Search, sort, page-size state, page clamping, row actions, delete mutation, confirmation, toast, Excel/PDF/print exports, and table footer | Generic `EntityListPage`/`CrudTable` driven by typed column definitions and an entity-specific data adapter. |
| P1 | Daily report full views | `daily-sales-full-view.tsx` and `product-purchase-full-view.tsx` share 12 clone matches and about 393 duplicated lines | Date range, query construction, report table, totals, loading/error/empty states, and export/print affordances | `FullViewReportPage` with report-specific columns and endpoint configuration. |
| P1 | Daily book purchase and product purchase report | 5 clone matches and about 161 duplicated lines | Date controls, report fetch lifecycle, table setup, totals, and export behavior | Shared `ReportTablePage` primitives first; then a domain-specific adapter. |
| P1 | Print pages beyond invoices | Delivery note, packing list, purchase invoice, payment receipt, employee forms, and dot-matrix screens repeat public fetching, settings/company loading, print controls, and inline print CSS | Public fetch helper, loading/error shell, settings retrieval, print actions, and document scaffolding | `PublicPrintPage`, `usePublicPrintData`, `PrintDocumentShell`, and document-specific templates. |
| P2 | Repeated sections within a single large page | `sales-invoice.tsx` has 13 clone matches and about 209 repeated lines; `admin-functions.tsx` and `monthly-reports.tsx` also contain same-file clones | Repeated product/payment/summary rows, button groups, and tabular blocks | Extract local subcomponents before attempting cross-page generic abstractions. |

The most concrete page-level evidence is in the admin customer screen. The file owns its query, filter and sort state, pagination calculations, delete mutation, export dispatcher, Excel generation, PDF generation, print HTML generation, toolbar, table rows, and pagination footer in one module. `supplier-database.tsx` repeats the same responsibilities with slightly different fields and an additional Sage export. The project already has `components/common/paginated-table.tsx`, but these pages do not use it. This is a high-confidence extraction opportunity because the shared component boundary is already implied by the existing code. [S4] [S5]

The aging-report pair is an even stronger semantic clone. Both files define the same response shape for rows, totals, pagination, and filters; synchronize the report date with the business date; fetch currencies; debounce search; fetch a paginated report; show the same toast on failure; and then construct Excel/PDF/table output. The meaningful differences are the entity noun, filter field, endpoint, response row field names, and report title. Those differences belong in configuration or adapters, not in two complete page implementations. [S6] [S7]

## 3. Shared-component duplication and missed reuse

### Entity search controls

`CustomerSearch`, `SupplierSearch`, and `ProductSearch` each implement their own autocomplete controller. Across the three components, the repeated responsibilities are local search text, selected entity, dropdown visibility, highlighted index, input/dropdown refs, keyboard navigation, click-outside handling, delayed blur, clear behavior, focus behavior, size classes, and nearly identical dropdown markup. The differences are the query endpoint, result normalization, icon, display fields, and callback name. `CustomerSearch` alone is 311 lines, `SupplierSearch` is 303 lines, and `ProductSearch` is 285 lines; the clone detector ranks all three among the most duplicated files. [S8] [S9]

The correct abstraction is not one component with dozens of customer/supplier/product conditionals. It should be a generic `EntityCombobox<T>` that accepts a query function or data source, `getKey`, `getLabel`, optional `getCode`, optional secondary text, an icon, empty/loading labels, and a typed selection callback. The three existing components can remain thin domain wrappers so callers preserve a clear business vocabulary.

### Pagination

The project has two shared pagination hooks with almost the same implementation. `usePagination<T>` owns the in-memory slice and navigation helpers, while `useTablePagination` owns start/end indexes and a pagination-props object. Both calculate total pages, clamp the current page, reset on page-size changes, and expose next/previous state. Both also update React state during render when the current page becomes invalid. [S10] [S11]

These should be consolidated around a single pure pagination model and a single hook. The shared model should define `totalItems`, `pageSize`, `currentPage`, `startIndex`, `endIndex`, `totalPages`, and clamped navigation. The hook should use an effect for corrective state updates rather than calling `setCurrentPage` during render. A separate `useServerPagination` can handle APIs that return pagination metadata, while the table component can consume a common `PaginationProps` contract.

The adoption gap is material. The generic pagination hook is referenced by only a small number of files, `PaginatedTable` is referenced by one file, while several admin pages hand-roll `currentPage`, `pageSize`, `totalPages`, `slice`, and page-button markup. This is an example where duplication is being created despite the presence of a repository abstraction.

### Date filters and business date

`DateRangeFilter` already encapsulates paired date-picker popovers, labels, formatting, disabled state, manual-change refs, and extension content. Many report pages still build date controls locally or duplicate date synchronization and formatting. The report layer should standardize on `DateRangeFilter` plus a business-date-aware hook.

There are also two business-date hooks: `hooks/use-business-date.ts` and `hooks/useBusinessDate.ts`. Both query `/api/business-date`, return a `businessDate`, expose loading/error/refetch state, and poll periodically. The hyphenated version adds formatting helpers and polls every 30 seconds; the camel-case version polls every 60 seconds and returns `nextBusinessDate` but no formatting helpers. Most pages import the hyphenated version, while payment/payroll screens import the camel-case version. This is a real duplicate module boundary with slightly incompatible contracts, not merely a naming inconsistency. [S12] [S13]

The recommended approach is to keep one canonical `useBusinessDate` hook with a stable return contract, move date formatting to pure functions in `lib/date-utils.ts`, and migrate imports gradually. The polling interval should be a deliberate option or a single documented default, not an accidental difference based on filename.

### Mutation and provider boilerplate

`useAdminMutations`, `usePaymentsMutations`, and `usePayrollMutations` repeat the same mutation scaffolding: call `apiRequest`, invalidate or broadcast domain state, show success toast, and show destructive error toast. The domain-specific endpoint and payload differences are valid, but the lifecycle wrapper can be centralized as a typed mutation factory or `useApiMutation` helper. The special multipart upload in payroll should remain an explicit adapter rather than being forced into a JSON-only abstraction.

The domain state providers also follow the same shape. Admin, payments, and payroll providers create context, instantiate a state manager, log stale/error cache status in development, refresh stale data on `visibilitychange`, and expose the manager. A generic `DomainStateProvider` could remove this boilerplate, although this is lower priority than the page-family extractions because provider changes can affect refresh behavior across the application.

## 4. API and data-access inconsistencies

The frontend has a useful `apiRequest` function in `lib/queryClient.ts`, but the application does not consistently use it. The audit found **19 files with direct `fetch` calls** and **9 local `getApiUrl` definitions**. The API URL strategies currently include the shared `API_BASE_URL`, local public-print helpers, hard-coded `http://localhost:5000`, relative `/api/...` requests, and `window.location.origin.replace(':5173', ':5000')`. [A1]

| Pattern | Evidence | Risk | Refactoring direction |
|---|---|---|---|
| Shared `apiRequest` | Used widely across pages and domain hooks | Good foundation, but response typing is weak and endpoint strings are scattered | Keep as the transport layer; add typed domain API modules above it. |
| Local `getApiUrl` helpers | Nine definitions, including print and employee document pages | URL/auth behavior can diverge between pages | Replace with one `buildApiUrl`/`publicApiRequest` module. |
| Direct `fetch` | 19 files, including auth, uploads, profile, print, and login follow-up | Inconsistent headers, credentials, error handling, and environment behavior | Route JSON requests through the shared client; keep explicit multipart/download helpers. |
| Hard-coded localhost | Payroll mutation/upload and employee pages; shared development fallback | Breaks remote review and deployment contexts | Use `API_BASE_URL` or an environment-aware request client everywhere. |
| Port replacement | Sales invoice, daily summary, and print pages | Works only for a local port topology; fails for temporary/public preview hosts | Use the configured API origin rather than deriving it from the browser origin. |
| Literal endpoints in pages | Frequent `/api/customers`, `/api/settings`, `/api/business-date`, `/api/users`, etc. | Endpoint spelling and response contracts are duplicated | Introduce domain API modules such as `customerApi`, `reportApi`, `paymentApi`, and `settingsApi`. |

There is also a behavior risk in `login.tsx`: after a successful login, the follow-up permissions request uses a relative `/api/auth/me` call rather than the same API URL helper used by the auth store. This is easy to miss because local development can work when frontend and backend are co-located, while a remote preview or split deployment can send the request to the wrong origin. The broader principle is that authentication, public printing, uploads, and JSON CRUD should each use explicit shared request functions with consistent environment handling.

## 5. Large-file and responsibility map

The largest page files are not inherently wrong, but their size shows where UI, data access, state transitions, and document formatting have become inseparable.

| File | Lines | Main responsibilities currently combined | First extraction step |
|---|---:|---|---|
| `pages/data-entry/sales-invoice.tsx` | 3,295 | Invoice state machine, product selection, pricing, payment modes, stock, validation, API writes, previews, exports, and print navigation | Extract `InvoiceItemsTable`, `InvoiceTotals`, `PaymentPanel`, `InvoiceActions`, and an invoice workflow hook. |
| `pages/payments/customer-payment.tsx` | 2,029 | Customer search, invoice allocation, payment form, batch handling, history, validation, and UI | Extract payment allocation model, customer-payment API adapter, and reusable payment form/table sections. |
| `pages/daily-report/daily-summary.tsx` | 1,810 | Filters, multiple report queries, summary cards, table sections, exports, print navigation, and public backend URL derivation | Extract report query hook, summary section components, and export configuration. |
| `pages/daily-report/daily-book-sales.tsx` | 1,649 | Report fetch, multiple payment-category tables, totals, filters, exports, and repeated table sections | Extract `PaymentCategoryTable` and a report definition array. |
| `pages/admin/admin-functions.tsx` | 1,638 | Many unrelated admin settings/forms and repeated save/query/error blocks | Split by setting domain first; then use common settings form primitives. |
| `pages/print/dot-matrix-invoice.tsx` | 1,176 | Data loading, dot-matrix layout, repeated rows/sections, print behavior, and document-specific formatting | Extract document data loader and reusable dot-matrix row/section components. |

`App.tsx` is also a high-centrality file despite being only 656 lines. It statically imports every screen and places access-control metadata, titles, breadcrumbs, and route paths inline. A later route refactor should define a typed route registry containing path, lazy component, access section, title, breadcrumb, and whether the route is public-print. The registry can then render routes consistently and make missing metadata easier to detect.

## 6. Recommended target architecture

The target should preserve the current business domains but separate each screen into four layers: route composition, page workflow/state, domain API/query logic, and reusable presentation. The goal is not to turn every page into an abstract generic component. The goal is to move repeated behavior to the lowest layer where it remains understandable.

```text
client/src/
  app/
    routes.tsx                 # typed route registry and lazy route loading
    providers.tsx              # query, theme, auth/session, domain providers
  components/
    common/
      PageShell.tsx
      ReportToolbar.tsx
      DataTable.tsx
      Pagination.tsx
      ExportActions.tsx
      AsyncState.tsx
    entities/
      EntityCombobox.tsx
      CustomerSearch.tsx       # thin customer adapter
      SupplierSearch.tsx       # thin supplier adapter
      ProductSearch.tsx        # thin product adapter
    reports/
      ReportPageShell.tsx
      ReportTable.tsx
      AgingReport.tsx
      ProductHistoryReport.tsx
    print/
      PublicPrintPage.tsx
      InvoicePrintTemplate.tsx
      PrintDocumentShell.tsx
  domains/
    customers/
      api.ts
      types.ts
      queries.ts
      components/
    suppliers/
      api.ts
      types.ts
      queries.ts
      components/
    products/
    payments/
    payroll/
    reports/
    settings/
  hooks/
    useBusinessDate.ts
    usePagination.ts
    useServerPagination.ts
    useApiMutation.ts
  lib/
    api-client.ts
    date-utils.ts
    formatters.ts
    export-utils.ts
```

This structure keeps domain-specific naming at the edges while making shared behavior explicit. For example, the customer screen can still be called `CustomerDatabasePage`, but it should compose `EntityListPage<Customer>` with customer columns, customer query functions, and customer-specific row actions. The aging reports can share the report engine while retaining separate endpoint and field mappings.

## 7. Prioritized refactoring sequence

The refactor should be staged with characterization tests and visual review after every family. The safest sequence is to consolidate behavior without changing API contracts or user-facing layout first, then improve types and route loading.

| Stage | Work | Why this order |
|---|---|---|
| 0 | Record current behavior for representative customer, supplier, aging, on-account, invoice-print, and admin-list screens. Add focused tests for pagination, date formatting, API URL construction, and export data mapping. | Prevents a generic extraction from silently changing business behavior. |
| 1 | Consolidate `useBusinessDate`/`use-business-date`, pagination hooks, API URL construction, and public request helpers. | Small shared-layer changes remove inconsistency across many pages. |
| 2 | Build `AsyncState`, `Pagination`, `ReportToolbar`, `ExportActions`, and `EntityCombobox` primitives. Migrate one customer/supplier pair first. | Establishes reusable primitives before larger page rewrites. |
| 3 | Refactor admin database pages into a typed entity-list pattern. Start with customer and supplier, then products, employees, equipment, expenses, and users. | High leverage and relatively easy to verify visually. |
| 4 | Refactor the strongest report pairs: aging, product history, full-view reports, and daily-book/product-purchase reports. | Removes the largest cross-file duplication after the list framework exists. |
| 5 | Refactor invoice and public print pages into data loaders plus templates. | Print output is sensitive; isolate data and presentation before changing styling. |
| 6 | Split `sales-invoice.tsx`, payment screens, daily summary, and admin functions into local subcomponents and workflow hooks. | These are large single-page state machines and should be decomposed after shared patterns are stable. |
| 7 | Convert route registration to a typed lazy route registry and address the large initial bundle. | Performance and maintainability improvements become safer once page boundaries are explicit. |

## 8. Risks and guardrails

The main risk is over-generalization. Customer and supplier screens look similar, but they may have different accounting semantics, payload shapes, permissions, and validation rules. Shared components should own presentation and mechanical workflow behavior, while domain adapters own endpoint paths, payload construction, field mapping, and business rules.

Export behavior deserves particular caution. Current pages independently build Excel, PDF, and print data, and some exports include company identity, currency, running balances, or Sage-specific fields. A shared export framework should accept typed column definitions and a document title, but it must not assume that all tables share the same columns or formatting.

The current type-check baseline is not clean: `npm run check` reports **294 TypeScript errors**, with the largest concentrations in customer payment, monthly reports, banking, the two full-view reports, and customer statement. The production build nevertheless succeeds, producing the large-chunk warning noted above. This means refactoring should avoid combining structural changes with a wholesale type-system rewrite. First preserve runtime behavior, then use the new boundaries to repair types domain by domain. [A3]

The local workspace currently contains audit scripts/data and prior preview-enablement changes in addition to the clean repository revision. The audit itself did not intentionally alter business UI behavior. Before committing work, separate or remove the generated audit artifacts and decide whether the preview changes belong in the repository. The current modified files include `backend/app.py`, `backend/run.py`, and `vite.config.ts`; generated audit artifacts include `frontend-audit-data.json`, `jscpd-summary.json`, `page-similarity.json`, and the `scripts/` audit utilities.

## Final recommendation

The first implementation target should be the **customer/supplier admin list pair** or the **customer/supplier aging report pair**, depending on whether the immediate priority is everyday CRUD usability or reporting consistency. My recommendation is to start with the admin list pair because the repository already contains a reusable pagination/table component and because the behavior is easier to characterize than print output. After that, extract the shared aging-report engine, then consolidate the print templates and the invoice workflow.

This approach should reduce duplication without flattening the domain model. It also creates a reliable review loop: after each family is migrated, the preview can be refreshed, the affected routes can be checked side by side, and the resulting diff can be kept small enough to diagnose if a business rule changes.

## References

[A1]: `frontend-audit-data.json` — generated structural, import, endpoint, and pattern inventory.

[A2]: `page-similarity.json` and `jscpd-summary.json` — generated page-similarity and token-based clone reports.

[A3]: `/tmp/salesmaster-frontend-check.log` and `/tmp/salesmaster-frontend-build.log` — baseline TypeScript and production-build outputs.

[S1]: [App.tsx at audited revision](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/App.tsx)

[S2]: [DashboardLayout](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/components/layout/dashboard-layout.tsx) and [PageLayout](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/components/common/page-layout.tsx)

[S3]: [package.json](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/package.json) and [vite.config.ts](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/vite.config.ts)

[S4]: [customer-database.tsx](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/pages/admin/customer-database.tsx)

[S5]: [supplier-database.tsx](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/pages/admin/supplier-database.tsx)

[S6]: [customer-aging-rpt.tsx](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/pages/historical-reports/customer-aging-rpt.tsx)

[S7]: [supplier-aging-rpt.tsx](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/pages/historical-reports/supplier-aging-rpt.tsx)

[S8]: [customer-search.tsx](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/components/ui/customer-search.tsx)

[S9]: [product-search.tsx](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/components/ui/product-search.tsx) and [supplier-search.tsx](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/components/ui/supplier-search.tsx)

[S10]: [usePagination.ts](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/hooks/usePagination.ts)

[S11]: [useTablePagination.ts](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/hooks/useTablePagination.ts)

[S12]: [use-business-date.ts](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/hooks/use-business-date.ts)

[S13]: [useBusinessDate.ts](https://github.com/JahanzebAhmed12/SalesMasterDashboard/blob/8ee64cc/client/src/hooks/useBusinessDate.ts)
