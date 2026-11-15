# Aquatica closeout test report — 2026-11-14

## Release status

**NOT READY FOR HOSTING.** The final isolated rerun passed 238 backend assertions, all 10 live-data Playwright tests, and both production builds. Temporary test records and helper files were removed. Actual 150%/200% owner-page zoom and valid Lighthouse navigation scores for Orders and Reports remain unverified; production-host checks also remain.

All mutating backend suites in this report used the isolated database `aquanova_test_20261114_074204_c39ae8`. The configured `aquanova` database was not used for test mutations.

## Status by area

| Area | Status | Evidence and remaining gap |
|---|---|---|
| (b) Authentication and roles | PASS (isolated local test) | Registration and email verification passed through the local SMTP catcher (8 assertions). Supplying `owner` as the requested role still created a customer. This does not verify production SMTP or deployment. |
| (c) Catalog and cart | PASS (isolated live API) | Playwright uses the real PHP API and isolated database; the customer cart survives refresh. |
| (d) Orders and checkout | PASS (isolated live API) | Live browser flows cover short stock, both cancellation paths and stock return, COD delivery, pickup cash, and paid completion actions; database status, stock, and stock-log records are checked. |
| (e) GCash proof payment | PASS (isolated live API) | Live browser flow covers rejection with reason, duplicate-reference rejection, re-upload, approval, stock deducted once, next-order selection, Ready, and Completed. |
| (f) Owner Orders inbox | PASS (isolated live API) | Real-data browser flows cover the order tabs, actions, and automatic next-order selection. Responsive rendering passes at tested widths. |
| (g) Inventory | PASS (isolated API) | Randomized stock-to-log invariant passed across checkout, GCash approval, cash confirmation, cancellation, restock, and adjustment; it also asserts stock never goes below zero. |
| (h) Reports | PASS (isolated live API) | Reports rendered in Playwright from live test orders and were checked against the database-backed API response. Backend report formulas pass the dedicated suite. |
| (i) Settings | PASS (local API coverage) | Field validation, PATCH compatibility, payment availability, audit records, delivery-fee snapshots, verified QR upload, and authorized QR reads pass. Hosting-specific upload behavior remains unverified. |
| (j) Notifications | PASS (isolated live API) | The browser flow verifies notifications for the exercised order/proof events occur once; XSS product text renders as text. |
| (k) Auto-cancel | PASS (isolated integration coverage) | Expiry rules, reminder timing, repeat runs, parallel reminder runs, order history, audit, and customer notification pass. The production scheduled task is not configured. |
| Readability/design/responsive release checks | PARTIAL | The live-data screenshot matrix covers five customer views at 1440, 1024, 768, and 390 CSS px, plus Orders, Inventory, Reports, and Settings at 1440, 1024, and 768 CSS px. Responsive overflow checks pass. Actual owner-page browser zoom could not be verified: the native Chrome window remained blank after test-owner sign-in. Historical before-change screenshots are unavailable. |

## Test output

| Validation | Result |
|---|---|
| `php tests\commerce_schema_test.php` | PASS — `Commerce schema tests passed (49 assertions).` |
| `php tests\commerce_auto_cancel_test.php` | PASS — `Commerce auto-cancel tests passed (25 assertions).` |
| `php tests\commerce_reports_test.php` | PASS — `Commerce reports tests passed (36 assertions).` |
| `php -d extension=gd tests\commerce_api_security_test.php` | PASS — `Commerce API security tests passed (120 assertions).` Rerun random-invariant seed: `2818179`. Ran against the isolated PHP test router/database. |
| `php tests\auth_registration_verification_test.php` | PASS — `Registration and email verification passed (SMTP catcher, code verification, customer-only role; 8 assertions).` |
| `npm run build` | PASS — both root and webapp Vite production builds completed. |
| `npm run test:e2e -- --workers=1` | PASS — 10/10 Playwright tests passed (1.8 min) against `tests/api_test_router.php` and the isolated database. Includes live-data cart refresh, GCash rejection/duplicate reference/re-upload/approval/next-order/Ready/Completed, COD delivery, pickup cash, short stock, customer and owner cancellation with stock return, owner-route denial, XSS-as-text, database status/stock/log/report/notification assertions, responsive checks, and screenshots. No API fixtures are used. |
| `php -l tests\api_test_router.php` | PASS — no syntax errors. |
| `git diff --check` | PASS — no whitespace errors. |
| Isolated database backup/restore | PASS — separate restore database matched all 17 tables, table row counts, schema dump hash, and data dump hash; the restore database and temporary dump were removed. |
| CSS font-size search | PASS — no pixel-valued `font-size` declarations found in `webapp/src`; the smallest shared size token is `.75rem` (12px at the 16px root), used for permitted group-label/small-hint text. |
| Reports sample-data search | PASS — the screenshot example values and insight text are absent from `webapp/src`; sample fixtures remain only in the Playwright test file. |

PHP CLI prints `Module "mysqli" is already loaded` before PHP suite output. The warning did not fail the test commands. GD was explicitly enabled for the API upload suite.

Named passing security cases from the final API run: two-owner last-item approval race; approve-twice rejection; PHP renamed `.jpg`; oversize upload; wrong content type; appended PHP image payload; SQL injection search; CSRF rejection.

The API suite was served with `tests/api_test_router.php`, which requires a local `aquanova_test_*` database name before routing requests. One retry omitted the isolated API base URL and failed at test-account sign-in; rerunning with the correct base URL passed. The configured `aquanova` database was not used for test mutations.

## Browser screenshots and responsive evidence

Playwright generated 20 customer and 12 owner live-data responsive screenshots in `test-results/playwright/screenshots/`:

- Customer Shop, Cart, Checkout, GCash, and My Orders at 1440, 1024, 768, and 390 CSS px (`real-data-customer-*.png`).
- Owner Orders, Inventory, Reports, and Settings at 1440, 1024, and 768 CSS px (`real-data-owner-*.png`).
- Additional live owner Reports and customer GCash screenshots are in the same folder.

The browser suite passed without document-level horizontal overflow at owner widths 1440, 1024, 768, 960, 720, 683, and 512 CSS px, and customer widths 1440, 1024, 768, and 390 CSS px. Narrow viewports are **not actual browser zoom tests**. A native Chrome check with a temporary isolated owner still showed a blank page, so actual 150%/200% checks and zoom screenshots remain unverified. The temporary owner, products, QR, and helper files were removed; a database check confirmed zero `e2e-*` users/products and zero temporary QR files.

## Typography and contrast

The root font size is 100% (16px default); body text uses the 15px token, captions use 13px, and the 12px token is reserved for small group labels/hints. Font sizes are rem-based. No exception below 12px was found by the CSS search.

| Text/element | Foreground / background | Contrast |
|---|---|---:|
| Primary text | `#E9ECF1` / `#181B21` | 14.56:1 |
| Secondary text | `#B0BAC8` / `#21252D` | 7.83:1 |
| Secondary text | `#B0BAC8` / `#181B21` | 8.79:1 |
| Placeholder | `#B0BAC8` / `#21252D` | 7.83:1 |
| Link | `#9FC4FF` / `#21252D` | 8.64:1 |
| Blue button text | `#FFFFFF` / `#3B82F6` | 4.83:1 |
| Focus indicator | `#7DB4FF` / `#181B21` | 8.09:1 |
| Error text | `#FF858A` / `#21252D` | 6.56:1 |

These listed combinations meet WCAG AA contrast thresholds.

## Lighthouse

The available report is `test-results/lighthouse/owner-orders-reports-flow.json` (Lighthouse 13.6.0). The authenticated Owner workspace navigation scored 53 performance, 100 accessibility, and 96 best practices (SEO 90). Owner Orders and Reports are flow snapshots, not navigation audits: each reports 100 accessibility and 100 best practices, while its `0` performance value is a missing-score placeholder, not a valid score. The requested Orders/Reports navigation performance audits therefore remain unverified. Earlier Home and Shop accessibility scores were 96 each.

## Deployment plan and remaining release blockers

The deployment guide targets a PHP-capable cPanel/VPS host with MySQL, HTTPS, GD, PDO MySQL, required rewrite/security rules, protected uploads, and a scheduled CLI auto-cancel job. The PHP API must not be deployed to Vercel. No production deployment or production-equivalent HTTPS verification was performed.

Do not mark **READY FOR HOSTING** until these are complete:

1. Reproduce the owner Orders and Reports screens in the native browser, perform actual 150% and 200% zoom checks, and save zoom screenshots. Narrow viewport tests are not a substitute.
2. Run Lighthouse navigation audits on authenticated owner Orders and Reports. The current flow snapshots do not provide valid performance scores.
3. Verify production SMTP, HTTPS headers/cookies and session behavior, upload limits/storage denials, scheduled job configuration, and backup/restore on the target host. Local SMTP-catcher verification and isolated backup/restore passed, but do not prove host configuration.

Login implementation and behavior were not changed.
