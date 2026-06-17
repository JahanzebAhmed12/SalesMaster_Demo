# SalesMasterDashboard — Complete Project Audit Report

**Audit Date:** June 17, 2026  
**Scope:** Full repository — Flask backend, React/TypeScript frontend, print-service, configuration, dependencies, and git hygiene  
**Method:** Static code analysis, pattern search, dependency review, and cross-module inspection

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Overview](#2-project-overview)
3. [Critical Security Findings](#3-critical-security-findings)
4. [High Severity Issues](#4-high-severity-issues)
5. [Medium Severity Issues](#5-medium-severity-issues)
6. [Low Severity Issues](#6-low-severity-issues)
7. [Secrets & Git Hygiene](#7-secrets--git-hygiene)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [Frontend Security](#9-frontend-security)
10. [Print Service Security](#10-print-service-security)
11. [Error Handling Gaps](#11-error-handling-gaps)
12. [Code Duplication](#12-code-duplication)
13. [Dead & Unnecessary Code](#13-dead--unnecessary-code)
14. [Architecture & Best Practices](#14-architecture--best-practices)
15. [TypeScript & Type Safety](#15-typescript--type-safety)
16. [Dependency Audit](#16-dependency-audit)
17. [Configuration Issues](#17-configuration-issues)
18. [Files That Should Not Be in the Repository](#18-files-that-should-not-be-in-the-repository)
19. [Positive Findings](#19-positive-findings)
20. [Priority Remediation Matrix](#20-priority-remediation-matrix)
21. [Appendix: Key File Index](#21-appendix-key-file-index)

---

## 1. Executive Summary

SalesMasterDashboard is a full-stack business management application (sales, inventory, payroll, payments, reporting) built with **Flask + SQLite** on the backend and **React + Vite + wouter** on the frontend, plus a **Node.js print-service** that polls a remote server for print jobs.

The application has substantial business functionality but carries **serious production-readiness and security gaps**. The most urgent problems are:

| Priority | Issue | Impact |
|----------|-------|--------|
| **P0** | ~147 of 254 API routes lack authentication | Full data read/write without login |
| **P0** | Secrets committed to git (`.env`, Gmail app password, DB backups) | Credential theft, GDPR breach |
| **P0** | Default admin account (`admin` / `admin123`) auto-created on startup | Trivial initial access |
| **P0** | Unauthenticated print routes and print-queue API | Invoice/payment data exposure |
| **P1** | Debug mode + `0.0.0.0` binding in `app.py` main block | Remote code execution risk |
| **P1** | JWT stored in `localStorage` + passed in URL query strings | Token theft via XSS/logs |
| **P1** | Permission system fails open; granular route protection disabled | Authorization bypass |
| **P2** | 15,253-line monolithic `app.py` | Unmaintainable, error-prone |
| **P2** | Massive dependency bloat (Express, Drizzle, Passport unused) | Larger attack surface, confusion |
| **P2** | 8+ duplicate print-service scripts | Maintenance burden, inconsistent fixes |

**Finding counts (approximate):**

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 14 | 18 | 12 | 8 |
| Code quality | — | 6 | 10 | 12 |
| Duplication | — | 8 patterns | — | — |
| Dead/unnecessary code | — | 12 items | 15 items | 20+ items |

> **Note:** A prior security audit exists at `security-audit-report.md` (May 2026). This report expands that scope to include duplications, dead code, dependency bloat, configuration, and error-handling analysis.

---

## 2. Project Overview

### 2.1 Repository Structure

```
SalesMasterDashboard/
├── backend/                 # Flask API (~15,253 lines in app.py alone)
│   ├── app.py               # Monolithic route + business logic file
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas (underused)
│   ├── users.py             # Admin bootstrap
│   ├── mail_utils.py        # Email + PDF helpers
│   ├── invoice_pdf_routes.py
│   ├── export_routes.py     # NOT registered in app
│   ├── instance/            # SQLite DB, email config, backups (in git!)
│   └── debug/test scripts
├── client/src/              # React frontend (~97 page components)
│   ├── pages/               # data-entry, admin, reports, print, payroll
│   ├── hooks/               # State managers, permissions, cross-tab sync
│   ├── components/ui/       # shadcn/Radix UI kit
│   └── lib/                 # auth, config, queryClient
├── print-service/           # 8+ overlapping Node print pollers
├── shared/schema.ts         # Zod schemas (active, used by frontend)
├── backend/models/user.ts   # Drizzle/Postgres schema (orphaned)
├── package.json             # Frontend + unused server deps
├── requirements.txt         # Root Python deps (partial)
├── vite.config.ts
├── drizzle.config.ts        # Misaligned with SQLite backend
└── security-audit-report.md # Prior audit (May 2026)
```

### 2.2 Technology Stack (Actual vs Declared)

| Layer | Actually Used | Declared but Unused |
|-------|---------------|---------------------|
| Backend | Flask, SQLAlchemy, SQLite, JWT | Drizzle, PostgreSQL, Neon |
| Frontend routing | wouter | react-router-dom |
| Frontend state | Zustand, TanStack Query | — |
| Node server | None | Express, Passport, connect-pg-simple |
| Print | Node pollers (outbound HTTP) | ws, http-proxy-middleware |
| Build | Vite + React | Replit plugins (legacy) |

### 2.3 Scale Metrics

| Metric | Count |
|--------|-------|
| API routes (`@app.route`) | 247 in `app.py` + 7 in route modules |
| Routes with `@jwt_required()` | ~100 in `app.py` (~40%) |
| Frontend page components | ~97 |
| `console.log` in frontend | ~292 occurrences |
| `print()` debug in backend | ~100 occurrences |
| `any` / `as any` in frontend | 500+ across 80+ files |
| Print-service JS files | 15+ (8 production-like, 7 test/debug) |

---

## 3. Critical Security Findings

### C-01: Mass Unauthenticated API Access

**Location:** `backend/app.py` — approximately **147 of 247 routes** lack `@jwt_required()`.

Any network client that can reach the server can access business data without credentials.

**Highest-impact unprotected endpoints:**

| Endpoint | Methods | Risk |
|----------|---------|------|
| `/api/users`, `/api/users/<id>` | GET, POST, PUT, DELETE | Create users, set passwords, assign admin role |
| `/api/customers/*`, `/api/suppliers/*` | CRUD | Customer/supplier PII and balances |
| `/api/products/*` | CRUD | Inventory and pricing |
| `/api/sales`, `/api/dashboard/*` | GET | Sales data, business metrics |
| `/api/settings`, `/api/company-details` | GET, PUT | System configuration |
| `/api/expenses/*`, attendance CRUD | CRUD | Financial and HR data |
| `/api/purchase-invoices` | POST | Creates invoices + stock movements |
| `/api/fix/product-prices` | POST | Arbitrary price changes |
| `/api/email-config` | GET, PUT | Read/write SMTP credentials |
| `/api/employees/documents/<id>` | GET | HR document download |
| `/api/print-queue/pending`, `/api/print-queue/<id>/status` | GET, POST | Print job data manipulation |
| `/api/reports/*` (many) | GET | Payroll, attendance, financial reports |
| `/api/test/mail` | POST | Send email via app SMTP |

**Also unprotected:** All routes in `invoice_pdf_routes.py` (`/api/generate-invoice-pdf`, `/api/test-pdf`).

---

### C-02: Secrets Committed to Git

The following sensitive files are **tracked in git**:

| File | Contents |
|------|----------|
| `backend/.env` | Database URL, Flask config, Meta/WhatsApp tokens |
| `backend/instance/email_config.json` | **Plaintext Gmail app password** and email address |
| `backend/instance/salesmaster.db.backup_20251001_124023` | Full database backup |
| `backend/instance/salesmaster.db.backup_20251001_124622` | Full database backup |

`.gitignore` only ignores `*.db` — backup files with `.backup_*` suffix bypass this rule. `.env` and `instance/` are not ignored.

**Immediate action required:** Rotate all exposed credentials, remove from git history, update `.gitignore`.

---

### C-03: Default Admin Account with Known Password

**Location:** `backend/users.py` lines 15–26, called on startup at `app.py` lines 126 and 15818.

```python
admin = User(
    username='admin',
    password=generate_password_hash('admin123'),
    ...
)
```

Also referenced in `backend/test_stock_full.py` line 133.

---

### C-04: Hardcoded Secret Fallbacks

**Location:** `backend/app.py`

```python
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-here')
app.config["JWT_SECRET_KEY"] = os.getenv('JWT_SECRET_KEY', 'super-secret-key')
```

If environment variables are unset, JWT tokens and sessions are forgeable.

---

### C-05: Unauthenticated Email Configuration Write + Password Exposure

**Location:** `backend/app.py` lines 15063–15091

- `GET /api/email-config` returns `MAIL_PASSWORD` in response (no auth on first handler)
- `PUT /api/email-config` has **no authentication** — anyone can overwrite SMTP credentials
- Passwords persisted to `backend/instance/email_config.json` via `mail_utils.py`

---

### C-06: Unauthenticated Print Queue API

**Location:** `backend/app.py` lines 180–240

| Endpoint | Auth | Risk |
|----------|------|------|
| `POST /api/print-queue/add` | `@jwt_required()` | OK |
| `GET /api/print-queue/pending` | **None** | Returns full `print_data` (customer names, addresses, line items) |
| `POST /api/print-queue/<job_id>/status` | **None** | Mark jobs completed/failed |
| `GET /api/print-queue/<job_id>/status` | **None** | Job enumeration |

Mobile-only enqueue enforced via **User-Agent string** check — trivially spoofable.

---

### C-07: Unauthenticated Public Print Routes (Frontend)

**Location:** `client/src/App.tsx` lines 579–618

All `/print/*` routes have **no** `ProtectedRoute`. Several pages use unauthenticated `publicApiRequest`:

- `invoice.tsx`, `a5-invoice.tsx`, `delivery-note.tsx`, `packing-list.tsx`
- `purchase-invoice.tsx`, `supplier-payment-receipt.tsx`, `payment-receipt-print.tsx`

Anyone with an invoice/payment ID can fetch data if the backend allows it.

---

### C-08: JWT in URL Query Strings

**Locations:**
- `client/src/pages/daily-report/daily-summary.tsx` (~line 433)
- `client/src/pages/print/daily-summary-print.tsx` (lines 24–28)
- `backend/app.py` `daily_summary_pdf()` (lines 12065–12072) accepts `?token=`

Tokens leak via browser history, server access logs, Referer headers, and proxy logs.

---

### C-09: Debug Page Exposed Without Auth

**Location:** `client/src/pages/test-permissions.tsx`, routed at `/test-permissions` in `App.tsx`

No login or permission check. Exposes user ID, username, userType, and full permission map to anyone who navigates there.

---

### C-10: Production Server with Debug Enabled

**Location:** `backend/app.py` line 15819

```python
app.run(debug=True, host='0.0.0.0', port=5000)
```

Enables Flask/Werkzeug debugger (RCE if exposed) and binds to all interfaces. `backend/run.py` uses `debug=False` on localhost — inconsistent entry points.

---

### C-11: Permission System Fails Open

**Locations:** `client/src/components/protected-route.tsx`, `client/src/hooks/usePermissions.tsx`

- Routes check **coarse** keys (`data_entry`, `daily_reports`) while backend uses **granular** keys (`sales_entry`, `daily_book_sales`, etc.)
- Logic: `permissions[key] !== false` → **missing key = allowed**
- `useRouteProtection` (correct granular map) is **commented out** in `App.tsx` lines 123–124

---

### C-12: JWT Stored in localStorage

**Locations:** `client/src/lib/auth.ts`, `client/src/lib/queryClient.ts`, and 10+ pages with direct `localStorage.getItem('jwt_token')`

Any XSS vulnerability enables token exfiltration. HttpOnly Secure cookies are the recommended approach.

---

### C-13: Unauthenticated Employee Document Download

**Location:** `backend/app.py` lines 3635–3709

Upload requires JWT (line 3462); download/view endpoints do not.

---

### C-14: Sensitive Business Data in localStorage

**Locations:** `sales-invoice.tsx`, `sales-entry.tsx`, `closing-time.tsx`

`heldInvoices` and `currentInvoiceDraft` store invoice/customer/sale line data client-side indefinitely with no encryption.

---

## 4. High Severity Issues

### Backend

| ID | Issue | Location |
|----|-------|----------|
| H-01 | No role-based access control — any logged-in user can call `/api/admin/*` | `app.py` (only one admin check at line 1214) |
| H-02 | 10+ debug/test API routes in production code | `app.py` lines 3719, 6246, 6278, 7673, 7713, 9573, 13670; `invoice_pdf_routes.py` 82 |
| H-03 | `/api/whatsapp/status` info disclosure | `app.py` 15319–15341 — returns token length, phone_number_id, Meta API JSON |
| H-04 | No login rate limiting or account lockout | `app.py` 757–812 |
| H-05 | 24-hour JWT lifetime | `app.py` line 244 |
| H-06 | Mixed session + JWT auth without cookie hardening | `app.py` 799–802 — no explicit Secure/HttpOnly/SameSite |
| H-07 | `create_purchase_invoice` without auth, `user_id=None` | `app.py` 5938+ |
| H-08 | Permission bypass endpoints writable without JWT | `app.py` 14924–15054 |
| H-09 | `get_supplier_payment` marked public | `app.py` 6542–6555 |
| H-10 | Invoice PDF/data routes unauthenticated | `app.py` 11093+, `invoice_pdf_routes.py` 25–80 |
| H-11 | Error detail leakage — `jsonify({'error': str(e)})` in ~95+ handlers | Throughout `app.py` |
| H-12 | No password policy on user creation | `app.py` 2755+ |

### Frontend

| ID | Issue | Location |
|----|-------|----------|
| H-13 | Stale auth from Zustand persist; `checkAuth` unused in routes | `auth.ts`, `protected-route.tsx` |
| H-14 | `checkAuth` failure does not clear JWT | `auth.ts` lines 103–107 |
| H-15 | Login response stored wholesale as `user` (may include token) | `auth.ts` lines 52–54 |
| H-16 | Email credentials loaded into React state | `admin-functions.tsx` lines 516–520, 1279–1280 |
| H-17 | Login permission check fails open | `login.tsx` lines 49–51 — redirects to dashboard on `/api/auth/me` failure |
| H-18 | Direct `fetch` bypassing centralized 401 handling | `sales-invoice.tsx`, `employee-database.tsx`, `login.tsx` |

### Print Service

| ID | Issue | Location |
|----|-------|----------|
| H-19 | `exec()` shell injection — `printerName`/`filePath` unescaped in PowerShell/cmd | `print-service/print-helper.js` lines 11–78 |
| H-20 | Hardcoded production VPS URL | All print-service JS files (`https://tropifruituk.net`) |
| H-21 | Invoice HTML built from API data without escaping | All `generateInvoiceHTML()` implementations |

---

## 5. Medium Severity Issues

| ID | Issue | Location |
|----|-------|----------|
| M-01 | File upload: extension-only checks, no magic-byte validation | `app.py` 3494–3505, 15620–15638 |
| M-02 | Employee uploads skip `secure_filename` | `app.py` 3500–3502 |
| M-03 | CSP allows `'unsafe-inline'` / `'unsafe-eval'` | `app.py` 252–254 |
| M-04 | Print via `innerHTML` / `document.write` with DOM/API data | 15+ report/payment pages |
| M-05 | `document.body.innerHTML` replacement breaks SPA | `compare-with-purchase.tsx` lines 48–51 |
| M-06 | `restricted-landing` not auth-gated | `App.tsx` lines 131–134 |
| M-07 | Dual auth model (JWT Bearer + `credentials: 'include'`) | `auth.ts`, `queryClient.ts` |
| M-08 | Hardcoded dev backend URL substitution (`:5173` → `:5000`) | `sales-invoice.tsx`, `daily-summary.tsx` |
| M-09 | CORS locked to `localhost:5173` only | `app.py` 51–57 — breaks production cross-origin |
| M-10 | SQLite `check_same_thread: False` | `app.py` 77–78 — concurrency risk |
| M-11 | Pydantic schemas imported but used at ~8 call sites only | Most routes use raw `request.get_json()` |
| M-12 | Puppeteer launched with `--no-sandbox` | Print-service files |
| M-13 | Temp print files not cleaned up | `pc-print-service.js` lines 172–176 |
| M-14 | Password column `String(120)` may be tight for some hash formats | `models.py` line 10 |
| M-15 | `apiRequest` always calls `response.json()` — fails on PDF/204 | `queryClient.ts` line 65 |
| M-16 | Query client retries failed auth requests 3× | `queryClient.ts` |

---

## 6. Low Severity Issues

| ID | Issue | Location |
|----|-------|----------|
| L-01 | ~292 `console.log` in production frontend paths | Worst: `sales-invoice.tsx` (78), `customer-payment.tsx` (35) |
| L-02 | ~100 `print()` debug statements in backend | Throughout `app.py` |
| L-03 | `sanitize_input()`, `validate_email()`, `validate_phone()` defined but unused | `app.py` 295–318 |
| L-04 | `verify_password()` imported but never called | `users.py` 8, `app.py` 20 |
| L-05 | `requireAdmin` prop exists but no route uses it | `protected-route.tsx` |
| L-06 | Unused login `Checkbox` import | `login.tsx` |
| L-07 | User-Agent mobile check for print proxy (spoofable) | `app.py` 146–153 |
| L-08 | Operational metadata committed | `print-service/service-status.json`, `auto-chrome-status.json` |
| L-09 | Fake/random weather on restricted landing | `restricted-landing.tsx` |
| L-10 | `dangerouslySetInnerHTML` in chart styles (static config) | `chart.tsx` lines 81–98 |
| L-11 | Incomplete `requirements.txt` vs actual imports | Missing several packages in backend deps |
| L-12 | `tsconfig.json` includes non-existent `server/**/*` | Root config |

---

## 7. Secrets & Git Hygiene

### 7.1 Committed Secrets (Confirmed via `git ls-files`)

```
backend/.env
backend/instance/email_config.json
backend/instance/salesmaster.db.backup_20251001_124023
backend/instance/salesmaster.db.backup_20251001_124622
```

### 7.2 Current `.gitignore` Gaps

**Present:** `node_modules`, `dist`, `*.db`, `*.pyc`, `venv`, `*.html`

**Missing (recommended):**
```
.env
.env.*
backend/.env
backend/instance/
backend/instance/*.backup*
print-service/temp/
print-service/*-status.json
*.backup_*
```

### 7.3 Secret Storage Locations

| Location | Type | In Git? |
|----------|------|---------|
| `backend/.env` | Env vars (DB, Meta token) | Yes |
| `backend/instance/email_config.json` | Gmail SMTP password | Yes |
| `backend/app.py` fallbacks | Default JWT/secret keys | Yes (source) |
| `backend/users.py` | Default admin password hash | Yes (source) |
| React state | MAIL_PASSWORD in admin UI | Runtime only |

---

## 8. Authentication & Authorization

### 8.1 Backend Auth Flow

```
Login POST /api/auth/login
  → check_password_hash()
  → create_access_token(identity=str(user.id))
  → Return JWT (24h expiry)
  → Optional Flask session cookie (mixed model)
```

**Gaps:**
- ~60% of routes skip `@jwt_required()`
- No RBAC decorator — admin routes check JWT only, not role
- No rate limiting on login
- JWT accepted via URL query parameter for PDF endpoints

### 8.2 Frontend Auth Flow

```
Login → localStorage.setItem('jwt_token') + Zustand persist
App mount → checkAuth() once (not on route entry)
ProtectedRoute → isAuthenticated && coarse permission !== false
useRouteProtection → DISABLED (commented out in App.tsx)
```

**Gaps:**
- Token not validated on route entry
- Permissions default to allow when keys absent
- Persisted Zustand state trusted before redirect effect runs
- 11 `/print/*` routes completely unprotected

### 8.3 Permission Key Mismatch

| Frontend Route Guard | Backend Restriction Key |
|---------------------|------------------------|
| `data_entry` | `sales_entry`, `purchase_entry`, `expenses_entry`, etc. |
| `daily_reports` | `daily_book_sales`, `daily_summary`, `stock_check`, etc. |
| `historical_reports` | `customer_history`, `supplier_history`, etc. |
| `admin_setup` | Various admin keys |

`useRouteProtection.tsx` has the correct ~87-route mapping but is disabled.

---

## 9. Frontend Security

### 9.1 XSS Vectors

| Vector | Files | Risk |
|--------|-------|------|
| `innerHTML` for print | 15+ pages (payments, reports, banking) | Medium — if API data contains script |
| `document.write()` in print windows | Multiple report pages | Medium |
| `document.body.innerHTML` replacement | `compare-with-purchase.tsx` | High — destroys React root |
| `dangerouslySetInnerHTML` | `chart.tsx` (static CSS) | Low |

React JSX auto-escaping protects normal rendering; print flows bypass this.

### 9.2 Session/Token Handling Issues

- JWT in `localStorage` (not HttpOnly cookie)
- JWT in URL query strings for PDF generation
- Dual auth: Bearer header + `credentials: 'include'`
- Token not cleared on `checkAuth` failure
- Direct `fetch` calls bypass centralized 401 redirect (10+ files)

### 9.3 Route Protection Summary

| Route Class | Auth | Permission | Risk |
|-------------|------|------------|------|
| `/` (login) | Public | N/A | OK |
| Most app routes | Coarse ProtectedRoute | Fail-open | **High** |
| `/test-permissions` | **None** | **None** | **Critical** |
| `/restricted-landing` | **None** | N/A | Medium |
| All `/print/*` (11 routes) | **None** | **None** | **Critical** |
| Admin pages | Coarse `admin_setup` | No `requireAdmin` | Medium |

---

## 10. Print Service Security

### 10.1 Architecture

- No local HTTP server — services poll outbound to VPS
- Hardcoded VPS URL: `https://tropifruituk.net`
- No shared secret/API key for print-queue authentication

### 10.2 Duplicate Implementations (8+ files)

| File | Role |
|------|------|
| `pc-print-service.js` | Main Puppeteer → PDF → spooler |
| `121.js` | Near-duplicate of `pc-print-service.js` |
| `chrome-print-service.js` | Chrome window + auto-print |
| `auto-chrome-service.js` | Puppeteer auto-print variant |
| `full-auto-chrome.js` | Another Chrome automation variant |
| `windows-auto-print.js` | Windows-specific variant |
| `print-helper.js` | Shared Windows print spooler helper |
| 6× `.bat` launchers | Various start scripts |

Same invoice HTML generation logic copy-pasted across multiple files.

### 10.3 Security Issues

| Issue | Severity | File |
|-------|----------|------|
| `exec()` with unescaped printer/path args | High | `print-helper.js` |
| No auth on print-queue polling endpoints | Critical | Backend `app.py` |
| HTML injection in temp print files | Medium | All print services |
| Puppeteer `--no-sandbox` | Medium | Multiple files |
| Temp files kept for "inspection" | Low | `pc-print-service.js` |
| Runtime status JSON in git | Low | `service-status.json` |

---

## 11. Error Handling Gaps

### 11.1 Backend

| Pattern | Count | Issue |
|---------|-------|-------|
| `except Exception as e: return jsonify({'error': str(e)})` | ~95+ | Information disclosure |
| Broad `except Exception` | ~100 | No structured logging |
| No centralized `@app.errorhandler(500)` | — | Inconsistent 500 responses |
| Login prints user id type to stdout | 1 | Debug leak |
| Some routes return `[]` on error silently | Multiple | Silent failures |
| Database retry logic | Sales only | Not applied consistently |

### 11.2 Frontend

| Area | Issue | File |
|------|-------|------|
| `apiRequest` | Always parses JSON; fails on PDF/204 | `queryClient.ts` |
| 401 handling | Hard redirect without Zustand logout sync | `queryClient.ts` |
| ProtectedRoute | No loading state while permissions load | `protected-route.tsx` |
| Print pages | Generic "Failed to load", no auth redirect | Most `pages/print/*.tsx` |
| Mutations | Inconsistent error surfacing; some only `console.error` | Widespread |

### 11.3 Broken Debug Script

`backend/debug_payments.py` appears corrupted/truncated with syntax errors — not runnable.

---

## 12. Code Duplication

### 12.1 Frontend — State Management Trio

Nearly identical architecture repeated 3×:

| Domain | State Manager | Cross-Tab Sync | Invalidation | Provider |
|--------|--------------|----------------|--------------|----------|
| Admin | `useAdminStateManager.ts` | `useAdminCrossTabSync.ts` | `useAdminInvalidation.ts` | `AdminStateProvider.tsx` |
| Payroll | `usePayrollStateManager.ts` | `usePayrollCrossTabSync.ts` | `usePayrollInvalidation.ts` | `PayrollStateProvider.tsx` |
| Payments | `usePaymentsStateManager.ts` | `usePaymentsCrossTabSync.ts` | `usePaymentsInvalidation.ts` | `PaymentsStateProvider.tsx` |

**Recommendation:** Generic `createDomainStateManager(domain)` factory.

### 12.2 Frontend — Search Components

| Pair | Lines | Notes |
|------|-------|-------|
| `customer-search.tsx` + `useCustomerSearch.ts` | ~300 each | Full UI duplicate |
| `supplier-search.tsx` + `useSupplierSearch.ts` | ~300 each | Could be generic `EntitySearch` |

### 12.3 Frontend — Other Duplications

| Pattern | Locations |
|---------|-----------|
| `useBusinessDate` ×2 | `hooks/useBusinessDate.ts` vs `hooks/use-business-date.ts` (~40 vs 3 files) |
| `publicApiRequest` copy-pasted | 7 print pages |
| Pagination hooks | `usePagination.ts` vs `useTablePagination.ts` |
| Cross-tab sync | `useCrossTabSync.ts` + 3 domain variants |
| Duplicate route registration | `/historical-reports/supplier-return` twice in `App.tsx` |
| Duplicate `/daily-summary` route | Two paths to same component |

### 12.4 Backend Duplications

| Pattern | Locations |
|---------|-----------|
| PDF generation (identical logic) | `mail_utils.py` — invoice, statement, history PDFs |
| Email render helpers | `mail_utils.py` — 5 similar `render_*_html` functions |
| `employee_documents` table-exists check | `app.py` lines 3471, 3597, 3641 |
| Closing stock endpoints | `/api/closing-stock` vs `/api/stock/closing` |
| Duplicate `/api/email-config` GET | Lines 15063 and 15093 |
| Duplicate imports | `app.py` lines 1–40 (datetime, os, func, or_, etc.) |
| Attendance marking logic | User vs employee attendance (3033 vs 3116) |

### 12.5 Infrastructure Duplications

| Item | Copies |
|------|--------|
| Python requirements | Root `requirements.txt`, `backend/requirements_export.txt` |
| Schema definitions | `shared/schema.ts` (active) vs `backend/models/user.ts` (orphaned Drizzle) |
| Routing libraries | wouter (used) vs react-router-dom (package.json only) |
| Print service scripts | 8+ overlapping implementations |

---

## 13. Dead & Unnecessary Code

### 13.1 Unregistered / Orphan Files

| File | Status |
|------|--------|
| `backend/export_routes.py` | `add_export_routes()` never called in `app.py` |
| `backend/models/user.ts` | Drizzle/Postgres schema — not imported anywhere |
| `drizzle.config.ts` | No migrations folder; backend uses SQLite |
| `client/src/pages/admin/user-database-edit.tsx` | Not registered in `App.tsx` |
| `client/src/pages/historical-reports/supplier-returns.tsx` | Stub; not routed (live page is `supplier-return.tsx`) |
| `client/src/components/admin/AdminStateDebugger.tsx` | Only in docs, never mounted |
| `client/src/components/admin/AdminLayout.tsx` | Documented but admin pages don't use it |

### 13.2 Unused Imports / Functions

| Item | File |
|------|------|
| `verify_password` | `users.py` — never called |
| `sanitize_input`, `validate_email`, `validate_phone` | `app.py` — defined, never used |
| `secure_filename` | `app.py` — only used in holiday upload, not employee docs |
| `send_invoice_email_placeholder()` | `app.py` line 841 — empty stub |
| `checkAuth` import | `protected-route.tsx` — imported, never called |
| `usePermissions` import | `login.tsx` — imported, unused |
| `useRouteProtection` import | `App.tsx` — imported, commented out |

### 13.3 Unused UI Components

| Component | Notes |
|-----------|-------|
| `carousel.tsx` | No page imports |
| `drawer.tsx` | No page imports |
| `input-otp.tsx` | No page imports |
| `resizable.tsx` | No page imports |

### 13.4 Debug / Test Scripts (Should Not Ship)

**Backend:**
- `debug_payments.py` (broken)
- `test_stock_full.py` (uses `admin123`)
- `test_till_float.py`
- `add_running_balance.py` (one-time migration)
- `fix_print_queue_table.py` (one-time schema fix)

**Print-service:**
- `debug-print.js`, `121.js`, `test-print.js`, `test-pdf-generation.js`
- `test-print-methods.js`, `test-printer.js`, `simple-chrome-test.js`

**Frontend:**
- `test-permissions.tsx` (wired into production routes!)

### 13.5 Debug API Routes in Production Code

| Route | Line |
|-------|------|
| `/api/debug/documents/<employee_id>` | 3719 |
| `/api/debug/stock-movements/<product_id>/<type>` | 6246 |
| `/api/debug/products` | 6278 |
| `/api/test/customer-returns` | 9573 |
| `/api/test/mail` | 13670 |
| `/api/admin/test-stock-update/<sale_id>` | 7673 |
| `/api/admin/debug-sale-update/<sale_id>` | 7713 |
| `/api/test-pdf` | `invoice_pdf_routes.py` 82 |

### 13.6 Placeholder Routes

| Route | File | Status |
|-------|------|--------|
| `/admin/timings-setup` | `App.tsx` 441–447 | Stub only |
| `/restricted-landing` | `restricted-landing.tsx` | Placeholder weather widget |

### 13.7 Commented / Unreachable Code

- Commented `/api/auth/me` at `app.py` 814–828 (superseded by 14880)
- Unreachable code in `invoice_pdf_routes.py` 117–122
- Example `app.run(debug=True)` blocks at bottom of route modules

---

## 14. Architecture & Best Practices

### 14.1 Monolithic Backend

`backend/app.py` at **15,253 lines** contains:
- All route definitions (~247 routes)
- Business logic inline
- Report generation
- PDF/email handling
- Stock management
- Payroll calculations

**Violations:**
- Single Responsibility Principle
- No service layer separation
- No blueprint/modular routing
- Difficult to test, review, or secure consistently

### 14.2 Validation Gap

- Pydantic schemas defined in `schemas.py` (~300 lines)
- Used at approximately **8 call sites**
- Most routes accept raw `request.get_json()` without validation
- `UserSchema` exists but user CRUD bypasses it

### 14.3 Logging

- Backend uses `print()` (~100 occurrences) instead of structured logging
- Frontend uses `console.log` (~292 occurrences) including sensitive data
- Only export/PDF modules use proper logging

### 14.4 Production Readiness

| Check | Status |
|-------|--------|
| Authentication on all routes | ❌ ~60% unprotected |
| RBAC | ❌ Not implemented |
| CSRF protection | ❌ Missing |
| Rate limiting | ❌ Missing |
| Secret management | ❌ Hardcoded fallbacks + git commits |
| Debug mode disabled | ❌ `debug=True` in main block |
| WSGI server (gunicorn/waitress) | ❌ Uses Flask dev server |
| Structured logging | ❌ print()/console.log |
| Input validation | ❌ Mostly absent |
| Test coverage | ❌ Ad-hoc scripts only |
| `.gitignore` for secrets | ❌ Incomplete |

---

## 15. TypeScript & Type Safety

### 15.1 `any` Usage

**500+ occurrences** of `any` / `as any` across 80+ files.

**Worst offenders:**

| File | Count |
|------|-------|
| `sales-invoice.tsx` | 37 |
| `useAdminMutations.ts` | 35 |
| `product-sales-history.tsx` | 33 |
| `usePayrollMutations.ts` | 29 |
| `daily-accounts.tsx` | 28 |
| `usePaymentsMutations.ts` | 27 |
| `useAdminStateManager.ts` | 25 |
| `customer-payment.tsx` | 24 |

### 15.2 Type Safety Issues

| Issue | Example |
|-------|---------|
| Default generic `any` | `apiRequest<T = any>` in `queryClient.ts` |
| Duplicate local interfaces | `Supplier` in `supplier-search.tsx` vs `@shared/schema` |
| Non-null assertions | `holiday-request-print.tsx`: `parseInt(id!)` |
| Loose component types | `sidebar.tsx`: `icon: React.ComponentType<any>` |
| State manager `any` params | All `*StateManager.ts` `broadcastAndInvalidate(data?: any)` |

---

## 16. Dependency Audit

### 16.1 Unused Node Dependencies (in `package.json`, zero imports)

| Package | Notes |
|---------|-------|
| `express`, `express-session` | No Node server exists |
| `passport`, `passport-local` | Unused |
| `connect-pg-simple`, `memorystore` | Unused session stores |
| `@neondatabase/serverless` | Unused |
| `drizzle-orm`, `drizzle-zod` | Only in orphaned `backend/models/user.ts` |
| `http-proxy-middleware` | Unused (no Vite proxy configured) |
| `ws`, `bufferutil` | Unused |
| `react-router-dom` | App uses wouter exclusively |
| `framer-motion` | No imports |
| `react-icons` | Uses lucide-react instead |
| `classnames` | Uses clsx/tailwind-merge |
| `react-to-print` | No imports |
| `zod-validation-error` | No imports |
| `tw-animate-css` | Not imported |
| `@jridgewell/trace-mapping` | No direct imports |
| `embla-carousel-react` | Only in unused `carousel.tsx` |
| `input-otp` | Only in unused `input-otp.tsx` |
| `vaul` | Only in unused `drawer.tsx` |
| `react-resizable-panels` | Only in unused `resizable.tsx` |

**Associated unused devDependencies:** `@types/express`, `@types/express-session`, `@types/passport`, `@types/passport-local`, `@types/connect-pg-simple`, `@types/ws`, `drizzle-kit`, `tsx`, `esbuild`

### 16.2 Replit Legacy Plugins

| Plugin | Status |
|--------|--------|
| `@replit/vite-plugin-runtime-error-modal` | Always loaded — unnecessary outside Replit |
| `@replit/vite-plugin-cartographer` | Gated on `REPL_ID` — harmless locally |

### 16.3 Python Dependencies

**Fragmented across 3 files:**

| File | Contents |
|------|----------|
| `requirements.txt` (root) | Broader set but incomplete |
| `backend/requirements_export.txt` | openpyxl, pandas, xlsxwriter |
| Backend minimal deps | Far too incomplete for `app.py` imports |

**Missing from declared requirements:** Several packages imported in `app.py` (flask-jwt-extended, flask-migrate, flask-mail, reportlab, requests, werkzeug, etc.) may not be fully pinned.

### 16.4 Used Dependencies (Confirmed)

**Frontend:** react, react-dom, wouter, @tanstack/react-query, zustand, zod, react-hook-form, date-fns, lucide-react, recharts, jspdf, xlsx, html2canvas, react-phone-input-2, cmdk, clsx, tailwind-merge, all active @radix-ui/* packages

**Backend:** flask, flask-cors, flask-sqlalchemy, flask-jwt-extended, flask-migrate, flask-mail, sqlalchemy, pydantic, werkzeug, reportlab, requests, python-dotenv

---

## 17. Configuration Issues

| Issue | Location | Detail |
|-------|----------|--------|
| Wrong backend script path | `package.json` | `"dev:backend": "python run.py"` but `run.py` is at `backend/run.py` |
| Drizzle vs SQLite mismatch | `drizzle.config.ts` | Expects PostgreSQL `DATABASE_URL`; Flask uses SQLite |
| No Vite dev proxy | `vite.config.ts` | Frontend hits backend directly via hardcoded URL |
| CORS hardcoded to localhost | `backend/app.py` | Breaks production unless Nginx same-origin |
| `tsconfig.json` phantom path | Root | Includes `server/**/*` — folder doesn't exist |
| Over-broad `.gitignore` | `.gitignore` | `*.html` ignores all HTML globally |
| Inconsistent entry points | `app.py` vs `run.py` | Different debug/host/port settings |
| Active schema location | `shared/schema.ts` | Zod-only; used by frontend |
| Orphan schema | `backend/models/user.ts` | Drizzle/Postgres — unused |

---

## 18. Files That Should Not Be in the Repository

### 18.1 Secrets & Sensitive Data

- `backend/.env`
- `backend/instance/email_config.json`
- `backend/instance/salesmaster.db.backup_*`

### 18.2 Debug / Test / One-Off Scripts

See [Section 13.4](#134-debug--test-scripts-should-not-ship) and [Section 13.5](#135-debug-api-routes-in-production-code).

### 18.3 Runtime State

- `print-service/service-status.json`
- `print-service/auto-chrome-status.json`
- `print-service/temp/` (if created)

---

## 19. Positive Findings

| Area | Detail |
|------|--------|
| Password hashing | Uses `werkzeug.security.generate_password_hash` / `check_password_hash` |
| SQL injection | No high-risk SQL injection — ORM and parameterized `text()` queries used |
| React JSX | Auto-escaping protects normal component rendering |
| CORS origin | Restricted to specific origin (good for dev; needs production update) |
| Security headers | CSP, X-Frame-Options, etc. configured (though CSP has unsafe-inline) |
| Zod schemas | Well-defined in `shared/schema.ts` for frontend validation |
| UUID filenames | Used for some uploads |
| Zustand + TanStack Query | Solid state management foundation |
| shadcn/Radix UI | Consistent component library |
| Print service architecture | Outbound polling (no exposed local ports) |
| `backend/run.py` | Binds localhost with `debug=False` (better than main block) |

---

## 20. Priority Remediation Matrix

### P0 — Immediate (Before Any Production Exposure)

1. **Rotate all committed secrets** — Gmail app password, Meta token, JWT secret, database credentials
2. **Remove secrets from git history** — use `git filter-repo` or BFG; update `.gitignore`
3. **Add `@jwt_required()` to all `/api/*` routes** except `/api/auth/login`, `/api/health`
4. **Add admin-only decorator** for user management, settings, admin/debug routes
5. **Remove default `admin123` admin** — force password change on first login
6. **Remove secret fallbacks** — fail startup if `SECRET_KEY` / `JWT_SECRET_KEY` unset
7. **Protect print-queue endpoints** — API key or mTLS for print-service polling
8. **Protect or remove `/test-permissions`** and unauthenticated print routes
9. **Never return passwords in API responses** — fix `/api/email-config`

### P1 — High Priority (Within 1–2 Sprints)

1. **Move JWT to HttpOnly Secure cookies** — remove localStorage and URL token passing
2. **Re-enable and fix `useRouteProtection`** — align permission keys with backend
3. **Change permission default to deny** when restrictions exist
4. **Set `debug=False`**, use production WSGI server (gunicorn/waitress)
5. **Remove all debug API routes and scripts**
6. **Add RBAC** — admin-only checks on sensitive endpoints
7. **Add login rate limiting**
8. **Consolidate print-service** to one maintained script; sanitize `exec()` inputs
9. **Protect employee document download** with JWT + authorization
10. **Strip production logging** — remove `console.log` and `print()` debug statements

### P2 — Medium Priority (Technical Debt)

1. **Split `app.py` into blueprints** — auth, customers, products, reports, admin, print
2. **Remove unused Node dependencies** — Express, Passport, Drizzle, react-router-dom, etc.
3. **Unify Python requirements** into one authoritative file
4. **Fix `dev:backend` script path** in `package.json`
5. **Remove orphaned files** — `backend/models/user.ts`, `drizzle.config.ts`, dead pages
6. **Consolidate duplicate hooks** — state managers, search components, business date hooks
7. **Apply Pydantic validation** on all route inputs
8. **Remove Replit plugins** from `vite.config.ts`
9. **Update CORS** for production domain
10. **Add centralized error handling** — structured logging, sanitized error responses
11. **Reduce `any` usage** — start with highest-count files
12. **Add CSRF protection** if using cookie-based auth

### P3 — Low Priority (Polish)

1. Remove unused UI components (carousel, drawer, input-otp, resizable)
2. Remove placeholder routes (timings-setup, restricted-landing weather)
3. Fix duplicate route registrations in `App.tsx`
4. Add password policy on user creation
5. Clean up temp print files after processing
6. Move debug scripts to `tests/` or `scripts/` directory
7. Add `.env.example` with documented required variables (no values)

---

## 21. Appendix: Key File Index

| Category | Path |
|----------|------|
| Backend monolith | `backend/app.py` |
| Auth bootstrap | `backend/users.py` |
| Models | `backend/models.py` |
| Schemas (underused) | `backend/schemas.py` |
| Email/PDF | `backend/mail_utils.py` |
| PDF routes | `backend/invoice_pdf_routes.py` |
| Export routes (unregistered) | `backend/export_routes.py` |
| Dev entry point | `backend/run.py` |
| Frontend entry | `client/src/App.tsx` |
| Auth store | `client/src/lib/auth.ts` |
| API client | `client/src/lib/queryClient.ts` |
| API config | `client/src/lib/config.ts` |
| Route protection | `client/src/components/protected-route.tsx` |
| Granular permissions (disabled) | `client/src/hooks/useRouteProtection.tsx` |
| Shared Zod schema | `shared/schema.ts` |
| Print service (main) | `print-service/pc-print-service.js` |
| Print helper | `print-service/print-helper.js` |
| Vite config | `vite.config.ts` |
| Package manifest | `package.json` |
| Prior security audit | `security-audit-report.md` |

---

*End of audit report. Generated June 17, 2026.*
