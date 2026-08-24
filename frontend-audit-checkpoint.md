Frontend audit checkpoint — SalesMasterDashboard

The frontend contains 200 TypeScript/TSX files and approximately 69,324 lines under client/src. The structure includes 94 page files, 70 components, 28 hooks, 6 library files, App.tsx, and main.tsx. App.tsx declares 96 route elements covering 94 distinct paths and imports 107 modules, making it a high-centrality routing and composition file.

The largest page files are sales-invoice.tsx (3,295 lines), customer-payment.tsx (2,029), daily-summary.tsx (1,810), daily-book-sales.tsx (1,649), and admin-functions.tsx (1,638). The largest shared UI files include components/ui/sidebar.tsx (771 lines), components/ui/chart.tsx (365), components/layout/sidebar.tsx (364), components/ui/customer-search.tsx (311), supplier-search.tsx (303), product-search.tsx (285), and lib/invoice-pdf.ts (302).

API access is spread across the frontend. The audit found 9 local getApiUrl definitions, 19 files using direct fetch(), and many pages using apiRequest(). The most repeated API families by literal occurrence are /api/settings (34), /api/suppliers (29), /api/customers (28), /api/users (23), /api/employees (17), /api/send-email (16), /api/equipment (15), /api/products (14), and /api/business-date (11). There are also 4 backend URL derivations using window.location.origin.replace(...), which is a separate URL strategy from the shared config helper.

Local import concentration is strong around queryClient (104 importing files), utils (102), Button (87), Card (82), Input (71), use-toast (60), Table (54), Label (47), use-business-date (43), export-utils (41), Popover (42), Select (40), Calendar (39), PageLayout (38), and use-company-details (35).

The audit detected 200 candidate repeated eight-line normalized blocks across files. These are candidates, not proof of semantic duplication; the next pass must group them by domain and inspect representative source locations to separate true reusable patterns from generic JSX/UI boilerplate.
