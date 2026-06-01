# Security Audit Report — SalesMasterDashboard

**Date:** 2026-05-30
**Scope:** Full-stack audit (Flask/Python backend + React/TypeScript frontend + SQLite database + Configuration)
**Auditor:** opencode AI security audit

---

## Executive Summary

A comprehensive security audit of the SalesMasterDashboard application identified **38 findings** across the codebase: **12 critical**, **16 high**, **10 medium**, and **10 low** severity issues. The most urgent concerns are:

1. **91 API routes have no authentication** — anyone can read/write all business data
2. **Debug mode enabled in production** — allows remote code execution via Werkzeug debugger
3. **Live API tokens and passwords hardcoded in source** — Meta/WhatsApp token, Gmail SMTP password, JWT secret keys
4. **No CSRF protection** despite credentialed CORS
5. **Email configuration endpoints are publicly accessible** — SMTP credentials exposed
6. **18+ print functions use `document.write()` with unsanitized user data** — XSS vector
7. **Employee PII stored in plaintext** — bank accounts, National Insurance numbers, DOB (GDPR violation)

The application has good foundations (password hashing, React JSX auto-escaping, CORS origin restriction, security headers) but lacks fundamental authentication controls, rate limiting, and CSRF protection that would be expected in a production system.

---

## Severity Summary

| Severity | Count | Key Examples |
|---|---|---|
| **CRITICAL** | 12 | 91 public routes, debug mode in production, secrets in source, no CSRF, email config exposed |
| **HIGH** | 16 | Weak passwords, no rate limiting, mass assignment, PII in plaintext, XSS in print functions |
| **MEDIUM** | 10 | No CSP, JWT in localStorage, SQLite in production, debug logging, unsanitized file uploads |
| **LOW** | 10 | Missing field validations, hardcoded localhost URLs, inconsistent env var usage |
| **INFO** | 5 | Good password hashing, security headers (mostly), CORS origin restriction, UUID filenames |

---

## CRITICAL FINDINGS

### C-01: 91 API Routes Have No Authentication

**Location:** `backend/app.py` — 91 of 247 route decorators lack `@jwt_required()`

**Affected Routes:**

| Category | Routes | Methods | Lines |
|---|---|---|---|
| Customers | `/api/customers`, `/api/customers/<id>` | GET, POST, PUT, DELETE | 2203, 2233, 2323, 2328, 2351 |
| Suppliers | `/api/suppliers`, `/api/suppliers/<id>` | GET, POST, PUT, DELETE | 2363, 2388, 2380, 2401, 2418 |
| Products | `/api/products`, `/api/products/regular`, `/api/products/regular/<id>`, `/api/products/non`, `/api/products/non/<id>` | GET, POST, PUT, DELETE | 1898, 1907, 1915, 1923, 1993, 2044, 2056, 2064, 2072, 2141, 2191 |
| Users | `/api/users`, `/api/users/<id>` | GET, POST, PUT, DELETE | 2867, 2872, 2877, 2915, 2951 |
| Sales | `/api/sales`, `/api/purchases` | GET | 960, 1846 |
| Settings | `/api/settings` | GET, PUT | 2590, 2599 |
| Company | `/api/company-details` | GET, PUT | 2754, 2773 |
| Employees | `/api/employees`, `/api/employees/<id>`, `/api/employees/<id>/daily-wage`, `/api/employees/<employee_id>/documents`, `/api/employees/documents/<document_id>` | GET, PUT, GET | 3356, 3401, 3326, 3789, 3836, 3889, 3954 |
| Attendance | `/api/attendance`, `/api/users/attendance`, `/api/employees/attendance` | GET, POST, PUT | 2659, 2726, 2738, 3128, 3155, 3211, 3238 |
| Print Queue | `/api/print-queue/pending`, `/api/print-queue/<job_id>/status` | GET, POST | 304, 325, 349 |
| Expenses | `/api/expenses`, `/api/expenses/<id>`, `/api/expense-entries`, `/api/dump-entries` | GET, POST, PUT, DELETE | 2794, 2802, 2819, 2837, 2855, 8347, 8446, 8488, 8518, 8532, 8568, 8627, 8657 |
| Reports | `/api/dashboard/stats`, `/api/dashboard/charts`, `/api/reports/monthly-stats`, `/api/reports/payroll`, `/api/reports/weekly-stats`, `/api/reports/weekly-payroll`, `/api/reports/daily-summary/pdf`, `/api/reports/product-sales`, `/api/reports/daily-summary` | GET | 2430, 2476, 4236, 4273, 4351, 4384, 12189, 6027, 11622 |
| Stock | `/api/purchase-invoices`, `/api/purchase-invoices/<id>`, `/api/purchase-invoices/<id>/print`, `/api/purchase-invoices/<id>/send`, `/api/stock/closing` | GET, POST | 6140, 6210, 6419, 6433, 7664 |
| Email | `/api/email-config` | GET, PUT | 15189, 15200 |
| Business Date | `/api/business-date`, `/api/user-backdate-options`, `/api/user-invoice-restriction`, `/api/user-daily-book-type` | GET, PUT | 4156, 15050, 15057, 15066, 15138, 15152, 15160, 15172 |
| Debug | `/api/debug/*`, `/api/fix/*`, `/api/test/*` | GET, POST | 3920, 6448, 6480, 6507, 9699, 13796 |

**Risk:** Anyone who knows a server URL can read, create, modify, and delete all business data — customers, suppliers, products, employees (with full PII), sales records, financial reports, and system settings.

**Fix:** Add `@jwt_required()` decorator to every route except `/api/auth/login`.

---

### C-02: Debug Mode Enabled in Production (RCE)

**Location:** `backend/app.py:15945`
```python
app.run(debug=True, host='0.0.0.0')
```
Also `backend/run.py:4` — `debug=True`

**Risk:** Flask's Werkzeug debugger provides an interactive console at `/console` that allows arbitrary Python code execution on the server. An attacker who discovers this can execute system commands, read/write arbitrary files, access the database, and pivot to internal networks.

**Fix:** Set `debug=False` in production. Never deploy with debug mode enabled.

---

### C-03: Hardcoded Secrets and API Tokens in Source Code

#### C-03a: Live Meta/WhatsApp API Token
**Location:** `backend/.env:11-12`
```
META_TOKEN = EAALPfQBROBsBPLV6UmN3uYtZAEo7j6MN9N4dLwMvhYkprOhchwgQlvacLGizvhRMbO6FXtdaH0HDrzRKcpQbJZCqdlZCZAL5We7FgO1F7ZAtyOVEXMCLAV4ZB29Hil9s9jRgQ3SlQnK4v5ZCozSZBi4nEXRFnK5qbsyXY08cr3PnPNivO13zTDLz72ProH9FiaGZBriGqjQkTQotXla1ZC6FJUGPWAMeECSa4U5QICoZCPzEzJJHAZDZD
PHONE_NUMBER_ID = 576980015493048
```
**Risk:** Attacker with repo access can send WhatsApp messages, incur Meta API charges, and access private conversations.

#### C-03b: Gmail SMTP Password
**Location:** `backend/instance/email_config.json`
```json
{"MAIL_PASSWORD": "wcmd dgsi huvr xafg", "MAIL_EMAIL": "jahanzebahmed12pk@gmail.com"}
```
**Risk:** SMTP credentials exposed — attacker can send phishing emails from the company domain, read sent emails.

#### C-03c: JWT Secret Key Fallback
**Location:** `backend/app.py:367`
```python
app.config["JWT_SECRET_KEY"] = os.getenv('JWT_SECRET_KEY', 'super-secret-key')
```
**Risk:** Default key `'super-secret-key'` allows anyone to forge valid JWTs and impersonate any user.

#### C-03d: Flask Session Secret Key Fallback
**Location:** `backend/app.py:47`
```python
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-here')
```
**Risk:** Session forgery and decoding of signed session cookies.

#### C-03e: Admin Password Hardcoded
**Location:** `backend/users.py:21`
```python
password=generate_password_hash('admin123')
```
**Risk:** Default credential `admin:admin123` is well-known and trivially guessable.

**Fix:** Rotate ALL exposed tokens/keys immediately. Remove `.env` from version control and add to `.gitignore`. Use environment variables only (no string fallbacks in code). Enforce strong random secrets in production.

---

### C-04: Email Configuration Endpoints Are Unauthenticated

**Location:** `backend/app.py:15189-15217`

```python
@app.route('/api/email-config', methods=['GET'])    # NO @jwt_required!
def get_email_config():
    ...
    return jsonify({'MAIL_PASSWORD': ..., 'MAIL_EMAIL': ...})  # Returns plaintext password

@app.route('/api/email-config', methods=['PUT'])    # NO @jwt_required!
def update_email_config():
    data = request.get_json()
    config['MAIL_PASSWORD'] = data.get('MAIL_PASSWORD', '')   # Anyone can change SMTP creds
```

**Risk:** Unauthenticated attacker can read SMTP credentials (password in plaintext) AND overwrite them to redirect all outbound emails through their own server.

**Fix:** Add `@jwt_required()` and admin permission checks to both routes.

---

### C-05: No CSRF Protection

**Issue:** The application has CORS configured with `supports_credentials: True` (`backend/app.py:56`) which allows cookies to be sent cross-origin, but there is NO CSRF token validation anywhere in the codebase. Zero references to CSRF, XSRF, or anti-forgery tokens.

**Risk:** A malicious website can trick an authenticated user's browser into making state-changing API calls (create sales, modify settings, delete records). Since cookies are sent automatically with credentialed requests, the backend cannot distinguish legitimate requests from forged ones.

**Fix:** Implement Flask-WTF `CSRFProtect` middleware on the backend and include CSRF tokens in all state-changing requests. Additionally, set `SameSite=Strict` or `SameType=Lax` on session cookies.

---

### C-06: JWT Token Exposed in URL Query Parameters

**Location:**
- `client/src/pages/daily-report/daily-summary.tsx:422`
- `client/src/pages/print/daily-summary-print.tsx:24-28`

```tsx
const url = `${backendUrl}/api/reports/daily-summary/pdf?date=${date}&token=${token}&includeStock=${includeStock}`;
```

**Risk:** The JWT authentication token appears in:
- Browser history (persists after session ends)
- Server access logs (full URL logged)
- HTTP `Referer` headers (leaks to third-party sites)
- Browser URL bar (visible to shoulder surfers)

**Fix:** Send tokens via `Authorization: Bearer <token>` header only. Never put authentication tokens in URL query strings.

---

### C-07: `document.body.innerHTML` Overwrite (Direct XSS)

**Location:** `client/src/pages/daily-report/compare-with-purchase.tsx:46-52`

```tsx
const printContents = document.getElementById('compare-with-purchase-table')?.outerHTML;
if (printContents) {
  const originalContents = document.body.innerHTML;
  document.body.innerHTML = printContents;
  window.print();
  document.body.innerHTML = originalContents;
}
```

**Risk:** If any table cell contains user-controlled data with embedded HTML/JS (e.g., `<img src=x onerror=alert(document.cookie)>`), it executes in the context of the main application page — giving it full access to localStorage (JWT tokens), cookies, and the DOM.

**Fix:** Use CSS `@media print` stylesheet instead of manipulating `innerHTML`. Never overwrite `document.body.innerHTML`.

---

### C-08: Print Queue Endpoints Unauthenticated

**Location:** `backend/app.py:304-363`
- `GET /api/print-queue/pending` (line 304) — no auth
- `POST /api/print-queue/<job_id>/status` (line 325) — no auth
- `GET /api/print-queue/<job_id>/status` (line 349) — no auth

**Risk:** Anyone can read pending print jobs (which contain full invoice JSON with customer data) or modify print job statuses (acknowledge, complete, cancel). An attacker could disrupt the printing workflow of the entire business.

**Fix:** Add `@jwt_required()` authentication to all print queue endpoints.

---

### C-09: Unauthenticated Employee PII Exposure

**Location:** `backend/app.py:3356-3405`

```python
@app.route('/api/employees', methods=['GET'])              # NO @jwt_required()
@app.route('/api/employees/<int:id>', methods=['GET'])     # NO @jwt_required()
```

**Risk:** These endpoints return full employee PII including bank account numbers, sort codes, National Insurance numbers, date of birth, marital status, home address, phone numbers, and next-of-kin information — all without any authentication.

**Fix:** Add `@jwt_required()` to both routes.

---

### C-10: Settings Endpoint Allows Unauthenticated Modification

**Location:** `backend/app.py:2599`
```python
@app.route('/api/settings', methods=['PUT'])    # NO @jwt_required()
```

**Risk:** Anyone can modify system settings including `closing_time`, `weekend_handling`, `auto_date_switch`, `with_porterage`, `porterage_charge`, `till_float`, `lock_invoices`, `invoice_print_format`, etc.

**Fix:** Add `@jwt_required()` with admin role check.

---

### C-11: Business Date and User Restriction Endpoints Unauthenticated

**Location:** `backend/app.py:4156, 15050-15172`

Routes include:
- `GET /api/business-date` — no auth
- `GET/PUT /api/user-backdate-options` — no auth
- `PUT /api/user-invoice-restriction/<user_id>` — no auth
- `GET/PUT /api/user-daily-book-type` — no auth

**Risk:** Anyone can read and modify user restriction settings, potentially bypassing date-based controls or invoice restrictions.

**Fix:** Add `@jwt_required()` to all.

---

### C-12: Unauthenticated Test and Debug Endpoints

**Location:** `backend/app.py:3920, 6448, 6480, 6507, 9699, 13796`

Routes include:
- `GET /api/debug/documents/<employee_id>` — shows file paths, upload folders, DB URI
- `GET /api/debug/stock-movements/<product_id>/<product_type>` — internal data
- `POST /api/fix/product-prices` — modifies product prices
- `GET /api/test/customer-returns` — test data
- `POST /api/test/mail` — sends test emails using configured SMTP

**Risk:** Debug endpoints expose internal application structure; test endpoints allow unauthenticated email sending and data modification.

**Fix:** Remove debug endpoints in production or add `@jwt_required()`.

---

## HIGH FINDINGS

### H-01: No Rate Limiting

**Location:** All endpoints, especially `backend/app.py:881-936` (`/api/auth/login`)

**Risk:** Brute force attacks on the login endpoint are trivial. An attacker can try thousands of passwords per minute with no account lockout, CAPTCHA, or IP-based throttling.

**Fix:** Implement Flask-Limiter with:
- Login endpoint: 5 attempts per minute per IP
- Other endpoints: 60-100 requests per minute per user
- Account lockout after 10 failed attempts

---

### H-02: Sensitive PII Stored in Plaintext (GDPR Risk)

**Location:** `backend/models.py`

#### Employee Model (lines 1234-1263)

| Field | Type | Risk |
|---|---|---|
| `home_address` | String | Identifies residence |
| `home_phone_number` | String | Personal contact |
| `mobile_number` | String | Personal contact |
| `date_of_birth` | Date | Identity theft, age discrimination |
| `marital_status` | String | **Special category data (UK GDPR Art. 9)** |
| `national_insurance_number` | String | **UK equivalent of SSN — identity theft** |
| `bank_name` | String | Bank affiliation |
| `branch_name` | String | Bank branch |
| `branch_address` | String | Bank branch location |
| `account_number` | String | **Financial fraud risk** |
| `sort_code` | String | **Financial fraud risk** |
| `next_of_kin_name` | String | Third-party PII |
| `next_of_kin_phone_number` | String | Third-party PII |
| `next_of_kin_email` | String | Third-party PII |
| `next_of_kin_address` | String | Third-party PII |

All of these are exposed in `Employee.to_dict()` (lines 1282-1316) and returned via unauthenticated API endpoints.

#### Supplier Model (lines 385-422)

Bank name, bank address, bank account name, sort code, and account number stored and returned in plaintext.

**Risk:** A data breach would expose data enabling identity theft, financial fraud, and UK GDPR fines (up to £17.5M or 4% of global turnover). Marital status is a special category under Article 9.

**Fix:**
- Encrypt at rest using field-level encryption (e.g., `sqlalchemy-utils` `EncryptedType`, or Python `cryptography` Fernet)
- Mask account numbers and sort codes in API responses (show last 4 digits)
- Encrypt National Insurance numbers
- Audit whether `to_dict()` needs to expose all fields
- Remove marital status if not legally required

---

### H-03: Mass Assignment on Supplier Update

**Location:** `backend/app.py:2405-2410`
```python
supplier_data = SupplierSchema(**data)
supplier = Supplier.query.get_or_404(id)
for key, value in supplier_data.dict().items():
    setattr(supplier, key, value)
```

**Risk:** Every field in `SupplierSchema` is directly set on the model from user-supplied data. An attacker could overwrite `supplier_code`, `is_active`, `credit_limit`, or `bank_*` fields that weren't intended to be modified from a particular form.

**Fix:** Define a whitelist of updatable fields per role. Never blindly iterate over all schema fields with `setattr`.

---

### H-04: No Role-Based Access Control (RBAC)

**Location:** All `@jwt_required()` routes in `backend/app.py`

**Issue:** While `User.user_type` exists (values like `admin`, `user`), there is no middleware or decorator that enforces role-based access. Every authenticated user can access every endpoint.

**Risk:** A regular employee can:
- Create, modify, delete other users
- Change system settings
- View payroll and attendance data for all employees
- Access all financial reports

**Fix:**
1. Create an `@admin_required` decorator:
```python
from functools import wraps
from flask_jwt_extended import get_jwt_identity

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        if not user or user.user_type != 'admin':
            return jsonify({'message': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function
```
2. Apply to sensitive routes: user management, settings, employees, payroll, reports

---

### H-05: User Update Allows Privilege Escalation

**Location:** `backend/app.py:2915-2949`
```python
@app.route('/api/users/<int:id>', methods=['PUT'])
@jwt_required()
def update_user(id):
    data = request.get_json()
    ...
    user = User.query.get(id)
    user.username = data.get('username', user.username)
    user.user_type = data.get('user_type', user.user_type)   # ANY USER CAN SET THIS
    ...
```

**Risk:** Any authenticated user can modify any other user's `user_type` to `admin`, or change their password. No check verifies the authenticated user is an admin or the target user themselves.

**Fix:** Verify `get_jwt_identity()` matches the target `id`, OR check `current_user.user_type == 'admin'`.

---

### H-06: XSS via `document.write()` in 18+ Print Functions

**Location:** The following files use `document.write()` with template-literal-interpolated data from API responses:

- `client/src/pages/data-entry/banking.tsx:236-268`
- `client/src/pages/data-entry/expenses.tsx:259-313`
- `client/src/pages/daily-report/product-sales-history.tsx:90-100`
- `client/src/pages/daily-report/product-purchase-full-view.tsx:77-99`
- `client/src/pages/daily-report/profit-loss.tsx:135-168`
- `client/src/pages/daily-report/daily-sales-full-view.tsx:115`
- `client/src/pages/daily-report/stock-template.tsx:65`
- `client/src/pages/payments/customer-payment-history.tsx:135-137`
- `client/src/pages/payments/sup-payment-history.tsx:113`
- `client/src/pages/historical-reports/customer-statement.tsx:260`
- `client/src/pages/historical-reports/customer-history.tsx:345`
- `client/src/pages/historical-reports/purchase-history.tsx:168`
- `client/src/pages/historical-reports/product-history.tsx:407`
- `client/src/pages/historical-reports/all-supplier-history.tsx:93`
- `client/src/pages/historical-reports/all-customer-history.tsx:274`
- `client/src/pages/admin/employee-database.tsx:419`
- `client/src/pages/print/dot-matrix-invoice.tsx:721, 749`
- `client/src/pages/data-entry/dumps.tsx:195`
- `client/src/pages/data-entry/closing-stock.tsx:288`

**Pattern:**
```tsx
printWindow.document.write(`<div>${companyDetails.companyName}</div>`);
printWindow.document.write(`<td>${item.supplierName || '-'}</td>`);
```

**Risk:** User-supplied data (product names, customer names, notes, addresses) is interpolated directly into HTML of a new window. If a value contains `<script>alert(document.cookie)</script>`, it executes in the print window's origin. While the print window is `about:blank` in most browsers, modern browser behavior varies, and this is still unsafe.

**Fix:**
- Use `textContent` instead of HTML string interpolation
- Or sanitize with `DOMPurify.sanitize()` before writing
- Or better: render the print content as a React component and use `react-to-print` library

---

### H-07: CSP Contains `'unsafe-inline'` and `'unsafe-eval'`

**Location:** `backend/app.py:378`
```python
"CSP": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
```

**Risk:** These directives defeat the primary purpose of Content Security Policy:
- `'unsafe-inline'` allows all inline `<script>` tags — any XSS vulnerability becomes exploitable
- `'unsafe-eval'` allows `eval()`, `setTimeout(string)`, `new Function()` — enables code injection

**Fix:** Use nonces or hashes for legitimate inline scripts. Remove `'unsafe-inline'` and `'unsafe-eval'` where possible. Add `'strict-dynamic'` for better security.

---

### H-08: Stack Traces Exposed to Users

**Location:** Multiple places in `backend/app.py`, including:
- Lines 1295-1297 (sale update)
- Lines 2653-2655 (settings update)
- Lines 3397-3398 (employee creation)
- Lines 3832-3833 (document retrieval)
- Line 8865, 9356 (various operations)

**Pattern:**
```python
except Exception as e:
    import traceback
    print(traceback.format_exc())
    return jsonify({'message': str(e)}), 400
```

**Risk:** Error messages expose internal implementation details — database structure, file paths, library versions, SQL query fragments. This helps attackers craft more targeted exploits.

**Fix:** Log the full traceback server-side (file, line number, stack trace). Return a generic error message to the client (e.g., "An internal error occurred").

---

### H-09: `secure_filename()` Not Used for Employee Document Uploads

**Location:** `backend/app.py:3701`

```python
# secure_filename is imported at line 19 but NOT called at line 3701
filename = str(uuid.uuid4()) + '_' + file.filename
```

**Risk:** While a UUID prefix is prepended (mitigating path traversal to some degree), the original filename is included. If `file.filename` contains path traversal sequences (`../../etc/passwd`) or special characters, it could cause unexpected file system behavior. Additionally, the extension is taken from the unsanitized filename.

**Fix:** Use `secure_filename()`:
```python
from werkzeug.utils import secure_filename
safe_name = secure_filename(file.filename)
filename = str(uuid.uuid4()) + '_' + safe_name
```

---

### H-10: Plaintext Passwords Logged During User Creation

**Location:** `backend/app.py:2880`
```python
print('DEBUG: Received user data:', data)    # data contains 'password' field in plaintext
```

**Risk:** Plaintext passwords written to stdout/logs. System administrators or log aggregators can see user passwords. This is a violation of security best practices and may have compliance implications.

**Fix:** Strip the `password` field before logging:
```python
safe_data = {k: v for k, v in data.items() if k != 'password'}
print('DEBUG: Received user data:', safe_data)
```

---

### H-11: No Input Sanitization Despite Having a `sanitize_input()` Function

**Location:** `backend/app.py:419-427`

```python
def sanitize_input(value):
    """Sanitize user input to prevent XSS attacks"""
    if isinstance(value, str):
        value = html.escape(value)
        value = re.sub(r'[<>\"\']', '', value)
    return value
```

**Issue:** This function is defined but **never called anywhere** in the application. All user input passes directly to database operations without sanitization.

**Additional Issue:** The function logic is questionable — it HTML-escapes first (`<` → `&lt;`), then removes `<>` characters with regex, but after escaping they're already `&lt;` so the regex finds nothing. The function does nothing useful even if it were called.

**Fix:** Either use the function properly (call it on all string input before processing) or remove it. Consider using a well-tested library like `bleach` instead.

---

### H-12: No Password Strength Validation

**Location:** `backend/schemas.py:291`
```python
password: str    # Accepts ANY string — "a" is valid
```

**Risk:** Users can set trivial passwords like `"1"` or `"password"`, making brute force and credential stuffing attacks trivial.

**Fix:**
```python
password: str = Field(min_length=8)
```
And add complexity validation (uppercase, lowercase, digit, special character).

---

### H-13: No Email Format Validation in Schemas

**Location:** Multiple schema files including:
- `CustomerSchema` (line 185)
- `UserSchema` (line 294)
- `SupplierSchema` (line 212)
- `EmployeeSchema` (line 492)

**Pattern:**
```python
email: Optional[str]    # Accepts any string — "not-an-email" would pass
```

**Fix:** Use Pydantic's `EmailStr`:
```python
from pydantic import EmailStr
email: Optional[EmailStr] = None
```

---

### H-14: SQL F-String in Database Migration Script

**Location:** `backend/fix_print_queue_table.py:88`
```python
conn.execute(text(f"ALTER TABLE print_queue ADD COLUMN {col_name} {col_type} {default_value}"))
```

**Risk:** SQL query built with f-string interpolation. While `col_name`, `col_type`, and `default_value` come from a hardcoded dictionary in this specific file, this is a dangerous pattern that could lead to SQL injection if code is modified later.

**Fix:** Validate that `col_name` and `col_type` match an allowlist of known values.

---

### H-15: Lack of Input Length Constraints

**Location:** `backend/schemas.py` — all schemas

**Issue:** Most `str` fields have no `max_length` constraints. An attacker could send enormous strings that:
- Consume excessive server memory during processing
- Cause database errors when values exceed column sizes
- Enable denial-of-service through resource exhaustion

**Fix:** Add `Field(max_length=N)` to all string fields matching their database column sizes.

---

### H-16: Frontend Lacks Content Security Policy

**Location:** `client/index.html`, `client/vite.config.ts`

**Issue:** The frontend has no Content Security Policy header or meta tag. There are no restrictions on what scripts can execute, what styles can be applied, or what resources can be loaded.

**Risk:** Any XSS vulnerability becomes immediately exploitable with no defense in depth.

**Fix:** Add either a CSP meta tag in `index.html`:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';">
```
Or configure CSP headers in `vite.config.ts` for the dev server and your reverse proxy for production.

---

## MEDIUM FINDINGS

### M-01: JWT Stored in localStorage

**Location:** `client/src/lib/auth.ts:50, 79, 90` and used in 19+ files

**Issue:** The JWT token is stored in `localStorage` under the key `jwt_token`. This is accessible by **any JavaScript** executing in the same origin.

**Risk:** A single XSS vulnerability (even minor) allows an attacker to read `localStorage` and exfiltrate the JWT token, gaining full access to the victim's account. The token persists in localStorage until explicitly cleared (even after browser close).

**Fix:** Use `httpOnly` cookies for authentication tokens. If not feasible, store the token in a JavaScript closure (memory-only) and use a refresh token pattern stored in an `httpOnly` cookie.

---

### M-02: SQLite in Production

**Location:** `backend/app.py:71`
```python
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', f'sqlite:///{db_path}')`
```

**Issues:**
- **No concurrency:** SQLite serializes all writes — multiple users writing simultaneously causes `database is locked` errors
- **No access control:** Database file is a regular file readable by anyone with filesystem access
- **No backup safety:** File corruption during write = total data loss
- **No network access:** Can't scale to separate database server
- **Scalability limit:** Practical limit of ~1GB / ~100 concurrent users

**Additional settings making it worse:**
- Line 79: `check_same_thread: False` — allows concurrent writes, risking corruption
- Line 80: `isolation_level: None` — puts SQLite in autocommit mode, losing transactional integrity

**Fix:** Migrate to PostgreSQL for production.

---

### M-03: Debug Print Statements Throughout Production Code

**Location:** `backend/app.py` — 30+ `print()` statements including:
- Line 1351: `print(f"[DEBUG] Update sale data: {data}")`
- Line 2647: `print(f'[DEBUG] Setting attribute {key} = {value}')`
- Line 2880: `print('DEBUG: Received user data:', data)` — includes plaintext password
- Lines 4580, 4582: Debug prints for report generation
- And many more

**Risk:** Debug output can leak sensitive data to logs, stdout, or monitoring systems. Performance overhead from unnecessary string formatting.

**Fix:** Replace `print()` with Python's `logging` module. Use appropriate log levels (`logging.DEBUG`, `logging.INFO`, `logging.WARNING`, `logging.ERROR`). Never log passwords or tokens.

---

### M-04: No Session Timeout / Token Expiry Too Long

**Location:** `backend/app.py:368`
```python
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=24)
```

**Risk:** 24-hour token lifetime means a stolen token is valid for a full day. No refresh token mechanism exists. No idle session timeout.

**Fix:**
- Reduce access token lifetime to 15-30 minutes
- Implement refresh tokens with 7-day expiry
- Implement idle session timeout (e.g., 30 minutes of inactivity)
- Force re-login after token refresh failure

---

### M-05: File Upload Content-Type Not Verified

**Location:** `backend/app.py:86-97`

```python
ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx'}
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
```

**Risk:** Only file extension is checked, not the actual content type. An attacker could upload a `.pdf` file that is actually an executable, a `.jpg` that is actually a PHP webshell, etc. The `Content-Type` header from the upload request is not validated.

**Fix:** Verify the actual file content type using `python-magic` or `python-magic-bin`:
```python
import magic
mime = magic.from_buffer(file.read(2048), mime=True)
if mime not in ALLOWED_MIME_TYPES:
    return jsonify({'message': 'Invalid file type'}), 400
file.seek(0)  # Reset file pointer
```

---

### M-06: Authorization Header Token Key Inconsistency

**Location:** `client/src/pages/admin/employee-database.tsx:66`
```tsx
'Authorization': `Bearer ${localStorage.getItem('token')}`,  // Wrong key — should be 'jwt_token'
```

**Risk:** This page reads from `localStorage` key `'token'` while the rest of the application uses `'jwt_token'`. This means:
1. Document uploads from the employee database page will always fail with 401 (undefined token)
2. If another mechanism sets `'token'`, it could be exploited for authentication

**Fix:** Use `localStorage.getItem('jwt_token')` consistently.

---

### M-07: Hardcoded HTTP Backend URL in Development/Production Code

**Location:** Multiple files:
- `client/src/lib/config.ts:14`
- `client/src/pages/payroll/holiday-requests.tsx:181`
- `client/src/hooks/usePayrollMutations.ts:102`
- `client/src/pages/admin/employee-database.tsx:27-31`

**Pattern:**
```tsx
if (hostname === 'localhost' || hostname === '127.0.0.1') {
  API_BASE_URL = "http://localhost:5000";   // Hardcoded HTTP
}
```

**Risk:** Mixed content issues — if the frontend is served over HTTPS but backend calls go to `http://localhost:5000`, browsers block the requests. Hardcoded URLs make deployment to different environments fragile.

**Fix:** Centralize URL construction. Use relative URLs with a reverse proxy (Nginx/Apache) in production. Use `window.location.origin` to derive protocol dynamically. Remove hardcoded hostname checks.

---

### M-08: `process.env.NODE_ENV` Used Instead of `import.meta.env`

**Location:**
- `client/src/hooks/useFormActivityTracker.ts:13`
- `client/src/hooks/useAutoLogout.ts:80`
- `client/src/components/payments/PaymentsStateProvider.tsx:27`
- `client/src/components/payroll/PayrollStateProvider.tsx:27`
- `client/src/components/admin/AdminStateDebugger.tsx:14`
- `client/src/components/admin/AdminStateProvider.tsx:27`

**Pattern:**
```typescript
if (process.env.NODE_ENV !== 'production') { ... }
```

**Risk:** In a Vite environment, `process.env` is polyfilled but may behave inconsistently across builds. Vite's correct API is `import.meta.env.DEV` / `import.meta.env.PROD`.

**Fix:** Replace all `process.env.NODE_ENV` with `import.meta.env.DEV` or `import.meta.env.PROD` as appropriate.

---

### M-09: No Security Meta Tags in `index.html`

**Location:** `client/index.html`

**Missing:**
- `Referrer-Policy: no-referrer` — controls what info is sent in HTTP Referer headers
- `X-Content-Type-Options: nosniff` — prevents MIME type sniffing (backend sets this but frontend should too)
- `X-Frame-Options: DENY` — prevents clickjacking
- Content Security Policy meta tag

**Fix:** Add appropriate meta tags to `<head>`.

---

### M-10: `dangerouslySetInnerHTML` in Chart Component

**Location:** `client/src/components/ui/chart.tsx:80-98`

```tsx
<style dangerouslySetInnerHTML={{ __html: Object.entries(THEMES).map(...) }} />
```

**Risk:** The `config` object used to generate CSS includes `itemConfig.color` which may contain user-controlled values. If a user can influence chart config colors (e.g., through admin settings), this becomes an XSS vector.

**Fix:** Validate/sanitize color values. Restrict to known color formats (hex, rgb, named colors) using a regex whitelist.

---

## LOW FINDINGS

### L-01: No Data Retention/Deletion Policy

**Location:** All models in `backend/models.py`

**Issue:** No models have soft-delete fields, retention periods, or automated cleanup. Data accumulates indefinitely. Old invoices, sales, and employee records cannot be systematically purged.

**Fix:** Implement:
- Soft-delete (`is_deleted` boolean + `deleted_at` timestamp) on key models
- Automated cleanup scripts for old audit logs
- Data retention configuration with configurable periods

---

### L-02: Password Field Length May Be Insufficient

**Location:** `backend/models.py:10`
```python
password = db.Column(db.String(120), nullable=False)
```

**Issue:** `String(120)` may be insufficient for some bcrypt/pbkdf2 hash outputs. Werkzeug's default `generate_password_hash` produces ~60-64 character hashes, but increased rounds or alternative algorithms could produce longer hashes.

**Fix:** Change to `String(256)` or `Text`.

---

### L-03: `populate_by_name` in Pydantic Schemas Allows Bypass

**Location:** All schemas in `backend/schemas.py`

**Issue:** `model_config = ConfigDict(populate_by_name=True)` accepts both `snake_case` and `camelCase` field names. This can lead to unexpected field mapping and reduces the strictness of the schema.

**Fix:** Remove `populate_by_name` and use aliases consistently. Or validate that only one naming convention is used per request.

---

### L-04: Commented-Out Gmail Credentials in `.env`

**Location:** `backend/.env:8-9`
```
# MAIL_USERNAME=jahanzebahmed12pk@gmail.com
# MAIL_PASSWORD=jspj pckf kehc ouwj
```

**Risk:** While commented out, these reveal previous credential patterns. Could be accidentally uncommented.

**Fix:** Remove commented credentials from version control.

---

### L-05: `HSTS` Not Set in Non-Debug Mode

**Location:** `backend/app.py:413-414`
```python
if not app.debug:
    TinyOWASP(app)  # HSTS header only set when not in debug mode
```

**Issue:** HSTS is correctly only enabled outside debug mode, but the deployment may not be serving HTTPS at all (no TLS configuration found).

**Fix:** Ensure TLS/HTTPS is configured in production. HSTS without HTTPS provides no benefit.

---

### L-06: Hardcoded Company Name in Print Templates

**Location:**
- `client/src/pages/daily-report/product-sales-history.tsx:97`
- `client/src/pages/daily-report/profit-loss.tsx:157`

**Issue:** Company name hardcoded as "TROPIFRUIT UK LTD" instead of fetched dynamically from company settings.

**Fix:** Fetch company name from `/api/company-details` API endpoint.

---

### L-07: User-Agent Sniffing in Print Logic

**Location:** `client/src/pages/print/dot-matrix-invoice.tsx:281`
```tsx
const isMobileSafari = /iPhone|iPad/.test(navigator.userAgent);
```

**Risk:** User-agent parsing is unreliable and can be spoofed.

**Fix:** Use feature detection instead (e.g., check for `window.print` support).

---

### L-08: No HTTPS Configuration

**Location:** Both frontend and backend

**Issue:** No TLS/SSL configuration found. All traffic between frontend and backend travels in plaintext.

**Risk:** Credentials, JWT tokens, and all business data can be intercepted on the network. Session hijacking via packet sniffing.

**Fix:** Configure TLS certificates and enforce HTTPS in production.

---

### L-09: `host='0.0.0.0'` Binds to All Network Interfaces

**Location:** `backend/app.py:15945`
```python
app.run(debug=True, host='0.0.0.0')
```

**Risk:** The server is accessible from any network interface, not just localhost. On shared networks (office WiFi, cloud VPS), this exposes the application to any machine on the network.

**Fix:** Bind to `127.0.0.1` behind a reverse proxy (Nginx, Apache, or a cloud load balancer).

---

### L-10: Dependencies Missing from `requirements.txt`

**Location:** `backend/requirements.txt`

**Missing packages that are used in code:**
- `flask-jwt-extended`
- `flask-migrate`
- `flask-mail`
- `xhtml2pdf`
- `reportlab`
- `requests`
- `openpyxl`

**Risk:** New developers or deployment scripts using only `pip install -r requirements.txt` will have a broken application with missing dependencies.

**Fix:** Update `requirements.txt` with all actual dependencies (run `pip freeze > requirements.txt` in the virtual environment).

---

## POSITIVE FINDINGS (What's Done Right)

| Item | Location | Notes |
|---|---|---|
| Passwords hashed with werkzeug | `backend/app.py:21, 2899, 2935` | Not stored in plaintext |
| CORS origin restricted | `backend/app.py:53` | Only `http://localhost:5173` allowed |
| Security headers set | `backend/app.py:389-410` | X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy |
| No `eval()`, `exec()`, `pickle` | Entire codebase | Dangerous functions not used |
| React JSX auto-escaping | All React components | Main UI is XSS-resistant |
| Zod validation on forms | Frontend forms | Client-side validation in place |
| Auto-logout on 401 | `client/src/lib/queryClient.ts` | Handles expired tokens |
| UUID-based filenames | `backend/app.py:3701` | Unpredictable upload paths |
| Vite filesystem restrictions | `vite.config.ts` | `fs.strict: true`, `fs.deny: ['**/.*']` |
| Print button has `className="no-print"` | Multiple print pages | Print-specific CSS class |

---

## Priority Remediation Plan

### P0 — Fix This Week

| # | Issue | Effort | Quick Fix |
|---|---|---|---|
| 1 | Add `@jwt_required()` to all 91 routes | 2-4 hrs | Add decorator to each route; create a helper to batch-apply |
| 2 | Disable debug mode | 5 min | `debug=False` in `app.py:15945` and `run.py:4` |
| 3 | Rotate all exposed secrets | 1 hr | META_TOKEN, Gmail password, JWT_SECRET_KEY, SECRET_KEY — revoke and regenerate |
| 4 | Remove `.env` from repo | 10 min | `git rm --cached .env`, add to `.gitignore` |
| 5 | Authenticate email-config endpoints | 15 min | Add `@jwt_required()` to lines 15189, 15200 |
| 6 | Stop exposing JWT in URL params | 30 min | Change to `Authorization: Bearer` header in daily-summary print |
| 7 | Fix `document.body.innerHTML` in compare-with-purchase | 30 min | Use `@media print` CSS instead |
| 8 | Remove hardcoded default secrets from source | 15 min | Remove fallback string values; require env vars |

### P1 — Fix This Month

| # | Issue | Effort | Quick Fix |
|---|---|---|---|
| 9 | Add CSRF protection | 2 hrs | Flask-WTF CSRFProtect + SameSite cookies |
| 10 | Add rate limiting | 1 hr | Flask-Limiter on login endpoint |
| 11 | Add RBAC decorator | 2 hrs | Create `@admin_required`; apply to sensitive routes |
| 12 | Sanitize `document.write()` calls | 4 hrs | Use DOMPurify or textContent in 18+ print files |
| 13 | Fix mass assignment | 2 hrs | Whitelist updatable fields per endpoint |
| 14 | Encrypt PII at rest | 4 hrs | Field-level encryption for NINO, bank details, DOB |
| 15 | Stop exposing stack traces | 2 hrs | Log server-side; return generic errors |
| 16 | Fix user update privilege escalation | 30 min | Add identity/role check |
| 17 | Add CSP meta tag to index.html | 15 min | Add `<meta http-equiv="Content-Security-Policy">` |

### P2 — Fix This Quarter

| # | Issue | Effort | Quick Fix |
|---|---|---|---|
| 18 | Migrate to PostgreSQL | 1-2 weeks | Replace SQLite with PostgreSQL |
| 19 | Proper logging (replace `print()`) | 2 days | Use Python `logging` module with levels |
| 20 | Add password strength validation | 1 hr | Pydantic `min_length=8` + complexity rules |
| 21 | Add email format validation | 30 min | Use `EmailStr` in Pydantic schemas |
| 22 | Move JWT from localStorage to httpOnly cookie | 2 days | Backend cookie setting + frontend memory store |
| 23 | Add file content-type verification | 2 hrs | Use `python-magic` for upload validation |
| 24 | Fix hardcoded localhost URLs | 1 hr | Centralize in config; use relative URLs |
| 25 | Add HTTPS/TLS | 1 day | Certbot + Nginx reverse proxy |

---

## Appendix: Files Referenced

| File | Lines | Description |
|---|---|---|
| `backend/app.py` | 15945 | Main Flask application |
| `backend/models.py` | 1372 | SQLAlchemy models |
| `backend/schemas.py` | 528 | Pydantic validation schemas |
| `backend/users.py` | ~50 | User initialization |
| `backend/mail_utils.py` | ~30 | Email configuration helpers |
| `backend/.env` | ~15 | Environment variables |
| `backend/instance/email_config.json` | ~5 | Email config (plaintext passwords) |
| `backend/requirements.txt` | ~20 | Python dependencies |
| `backend/run.py` | ~10 | Flask runner |
| `backend/fix_print_queue_table.py` | ~100 | Database migration script |
| `client/index.html` | ~15 | HTML entry point |
| `client/vite.config.ts` | ~50 | Vite build configuration |
| `client/src/lib/auth.ts` | ~100 | Authentication logic |
| `client/src/lib/queryClient.ts` | ~80 | API client with token handling |
| `client/src/lib/config.ts` | ~30 | Configuration (frontend) |
| `client/src/pages/login.tsx` | ~150 | Login page |
| `client/src/pages/print/*.tsx` | 10+ files | Print templates |

---

*End of Report. Generated 2026-05-30 by opencode Security Audit.*
