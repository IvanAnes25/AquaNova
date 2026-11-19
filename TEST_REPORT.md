# Aquatica implementation test report — Batch B verification 2026-11-19

## Release status

**Batch B items 11–12: DONE. Overall release: NOT DONE — not ready for hosting.** Batch B’s shop hours/status, closed-order policy, grouped notifications, mobile header cleanup, and validation are complete. Broader release checks remain incomplete, including actual browser zoom/Lighthouse navigation audits and host-specific verification.

## Batch B final verification — 2026-11-19

All database-backed tests used only `aquanova_test_20261114_074204_c39ae8`; both `DB_NAME` and `AQUATICA_TEST_DB_NAME` were set to that isolated database with `APP_ENV=local`. The real `aquanova` database was not accessed.

| Suite | Final result |
|---|---|
| Production build (`npm run build`) | PASS — root and webapp Vite builds |
| Fulfillment wording | PASS — 40 assertions |
| Commerce schema | PASS — 69 assertions |
| Commerce auto-cancel | PASS — 25 assertions |
| Commerce reports | PASS — 36 assertions |
| Commerce API security | PASS — 167 assertions |
| Auth registration and verification | PASS — 9 assertions |
| Playwright end-to-end (`npm run test:e2e`) | PASS — 18/18 tests |

The Playwright run includes closed-order policies, notification grouping/read-delete, the server-computed Home status, the mobile navigation race regression, and the 320px workspace-header layout test. The complete run ended `18 passed (2.4m)`. PHP emitted duplicate `mysqli`/`gd` module warnings; they did not fail tests.

The exact command to apply the Batch B migration to the isolated test database is:

```powershell
$env:DB_NAME='aquanova_test_20261114_074204_c39ae8'
$env:AQUATICA_TEST_DB_NAME=$env:DB_NAME
$env:APP_ENV='local'
php scripts\migrate.php up
```

The migration `20261121_shop_hours_notification_groups` was applied only to that isolated database. Shop status is computed in PHP using Asia/Manila; manual Open/Closed override takes precedence until “Follow weekday hours.” Closed ordering follows the configured policy and is disclosed at checkout and on the order. Notifications are grouped with read-gated soft deletion and duplicate-action coverage.

The phone header was adjusted to keep navigation and controls within a 320px viewport, use a single-line page title, and display a compact accessible Open/Closed status. The new 320px regression test passed.

### Login redirect-loop follow-up — 2026-11-19

The app’s session bootstrap redirected to the login page for any startup exception, including transient session-check and workspace-data failures. Since the login page redirects an already-authenticated user back to the workspace, this could produce the repeated navigation/blink. `playwright.config.js` only manages the test servers and was not the redirect source.

The app now offers a retry screen for transient session verification errors and keeps a valid session in the workspace when initial data loading fails. Navigation verification errors also show a retry instead of forcibly redirecting. The production build passed, as did the focused transient-recovery and existing login-flow tests (2/2). A later full Playwright run had 18/19 pass: one existing order-approval browser test read the database before its second approval request completed. That specific test passed on isolated rerun (1/1); its unrelated timing assertion was not changed.

## Historical verification — 2026-11-18

All database-backed commands below explicitly set both `DB_NAME` and `AQUATICA_TEST_DB_NAME` to `aquanova_test_20261114_074204_c39ae8`, with `APP_ENV=local`. The configured `aquanova` database was not used. Migrations `20261118_idempotency_requests` and `20261119_idempotency_replay` were applied only to that isolated database. An existing pre-change test database backup is at the session files location; no production database was backed up, queried, or migrated.

| Command/check | Actual result |
|---|---|
| `php scripts\migrate.php up` | PASS — existing migrations were confirmed and `20261120_stock_reason_image_archive up completed.` The pickup wording migration previously reported 0 matching rows before and 0 after. |
| `php tests\fulfillment_wording_test.php` | PASS — `Fulfillment wording tests passed (40 assertions).` |
| `php tests\commerce_schema_test.php` | PASS — `Commerce schema tests passed (64 assertions).` |
| `php tests\commerce_auto_cancel_test.php` | PASS — `Commerce auto-cancel tests passed (25 assertions).` |
| `php tests\commerce_reports_test.php` | PASS — `Commerce reports tests passed (36 assertions).` |
| `php tests\commerce_api_security_test.php` with the isolated test router | PASS — `Commerce API security tests passed (144 assertions).` The run passed replay, payload mismatch, user scoping, parallel order and product races, 4xx/5xx key handling, stock reasons/archive, product-image security, randomized stock invariants, and named security cases. |
| `php tests\auth_registration_verification_test.php` with `AQUATICA_TEST_MAIL_HOST=127.0.0.1` and port `2526` | PASS — 3 consecutive runs passed, each reporting `Registration and email verification passed (SMTP catcher, code verification, customer-only role; 9 assertions).` |
| `npx playwright test -g "short stock" --trace on --workers=1 --repeat-each=3 --reporter=line` | PASS — exact summary: `3 passed (56.8s)`. This includes the UI quantity reduction after stock rejection and successful order recovery. |
| `npm run test:e2e` | PASS — exact summary: `13 passed (1.3m)`. This includes stock reason/image management, double-click order placement, and dropped-response retry. |
| `npm run build` | PASS — final root and webapp Vite production builds completed. |
| Targeted category URL rerun | PASS — shop category chips remained visible and URL restore behavior passed. |
| `php -l` on changed PHP files and PHP test/router files | PASS — no syntax errors. |
| `git diff --check` | PASS — final edits checked. |
| Forgot-password link contrast | Measured `#155e75` on white: 7.27:1; hover `#164e63` on white: 9.11:1. Both exceed WCAG AA. |

PHP CLI reports `Module "mysqli" is already loaded`; the warning did not fail the passing commands. Playwright generated temporary output; tracked baseline screenshots were restored afterward.

### Short-stock regression diagnosis

The original timeout trace showed the customer already on “Order placed!”, and recorded repeated calls to `placeOrder` from React's state-update path after the expected stock error. `notify()` passed the retry function directly to `setToastRetry`; React interpreted the function as a state updater and executed it (repeatedly in Strict Mode), which could submit another order after the stock error and empty the cart. Temporarily reverting the submission lock did not make the original test pass: it failed at the same “Continue to checkout” locator, confirming the lock was not the root cause. Wrapping the stored retry callback in an updater (`setToastRetry(() => retry)`) prevents accidental invocation; the lock still guards concurrent submits and failed attempts still clear their idempotency key.

The recovery assertion now decreases quantity through the UI, confirms checkout is enabled within 9 seconds, places the corrected order, and checks its one-item quantity. The shared order helper and owner-cancellation assertion also use bounded 9-second waits for the expected UI/database state.

### Idempotency replay verification

Before this change, the migration stored only key metadata and duplicate claims returned `409`. The controller now stores canonical payload and endpoint hashes, original status/body, completion state, and a 24-hour expiry. Completed same-payload requests replay their response with `Idempotent-Replay: true`; differing payloads or endpoints return `422`; concurrent in-progress claims return `409` with `Retry-After: 1`; 5xx responses release the key.

The replay behavior covers order creation, customer cancellation, GCash proof submission, owner order actions, product creation, stock movement, product-image upload, and product-image removal. PHP coverage passed 144 assertions, including replay, payload mismatch, parallel order creation, cross-user key isolation, definitive 4xx handling, 5xx release, stock archives, and image security. Playwright passed 13 tests, including stock/image management, double-click order placement, and an aborted/dropped response retried with the same key.

### Registration SMTP regression diagnosis

The auth suite initially failed when the API server was already running without `AQUATICA_TEST_MAIL_HOST` and `AQUATICA_TEST_MAIL_PORT`; the registration endpoint therefore used private mail settings instead of the suite's local catcher. With both variables inherited by the API server, the suite passed 3 consecutive runs. Reverting the replay change was unnecessary because the replay hook is confined to mutating commerce requests and the auth endpoint was never replayed; the regression was server environment propagation, not application replay handling.

No application code or login behavior was changed for this regression diagnosis.

### Stock and product-image batch

The workspace name-level requirements covered by this batch are “stock reasons and large-change archive” and “product image upload, replace and remove.” The original numbered requirement text and item numbers were not available in the current workspace documents, so implementation follows the explicit task text: reasons are required, 50-unit-or-larger changes require confirmation and are archived, stock cannot go below zero, and product images are verified JPEG/PNG/WebP files limited to 2 MB.

PHP verification passed 144 assertions including owner-only image endpoints, customer denial, renamed PHP and appended-payload rejection, wrong content type, oversize rejection, replacement cleanup, removal cleanup, reason validation, large-change confirmation, archive creation, and randomized stock/log consistency. Playwright passed the owner stock reason/history flow and upload/replace/remove flow with database verification.

The registration suite uses only disposable `registration-*@example.test` addresses and sends mail only to the local SMTP catcher in 3/3 passing runs. I cannot prove whether the earlier failed registration run sent any real email outside the configured mail route; no outbound message audit was available. It was not sent to a production recipient, and the final configuration was explicitly limited to `127.0.0.1:2526`.

### Broader scope still incomplete after Batch B

- Item 1: the pickup/delivery wording fixes and matrix exist, but no packing-slip or order-email renderer was found, and the migration's current 0→0 count does not demonstrate rewriting a matching live test notification.
- Item 2: not every action has a loading/retry state or a double-click Playwright assertion. Idempotency replay is implemented and covered; remaining action-level loading/retry UX coverage is incomplete.
- Item 3: navigation/back handling is partial; dedicated login/back/logout and deep-link/back tests are not done.
- Item 6: first-login password feedback was added; a normal owner password-change flow is not available in the existing backend, and backend behavior was not changed.
- Item 7: next-order affordance/selection is partial; full GCash/COD/pickup flow verification is not complete.
- Items 11–12 (shop hours/closed-order policy and grouped notifications) are implemented and verified in the Batch B section above. Items 8–10 and 14 remain outside Batch B; stock reasons/large-change archive and product image upload/replace/remove are implemented and tested.
- Item 13: show/hide controls and login-link contrast were updated; full keyboard/screen-reader and page-leave checks are not done.
- Item 15: the required 360/390/412/768/1024/1440 matrix, actual 150%/200% zoom screenshots, and valid Lighthouse navigation audits are not done.
- `TEST_REPORT.md`, `API.md`, and `OWNER_GUIDE.md` were updated to distinguish implemented behavior from incomplete scope; documentation does not replace the missing implementation and validation.

All mutating backend suites in this report used the isolated database `aquanova_test_20261114_074204_c39ae8`. The configured `aquanova` database was not used for test mutations.

## Status by area

| Area | Status | Evidence and remaining gap |
|---|---|---|
| (b) Authentication and roles | PASS (isolated local test) | Registration and email verification passed 3 consecutive times through the local SMTP catcher (9 assertions each). Login behavior was not changed. |
| (c) Catalog and cart | PASS (isolated live API) | Playwright uses the real PHP API and isolated database; the customer cart survives refresh. |
| (d) Orders and checkout | PASS (isolated live API) | The final 18-test browser suite covers GCash, COD, pickup cash, cancellation/stock handling, and closed-order policy behavior. |
| (e) GCash proof payment | PASS (isolated live API) | Live browser flow covers rejection with reason, duplicate-reference rejection, re-upload, approval, stock deducted once, next-order selection, Ready, and Completed. |
| (f) Owner Orders inbox | PASS (isolated live API) | Real-data browser flows cover the order tabs, actions, and automatic next-order selection. Responsive rendering passes at tested widths. |
| (g) Inventory | PASS (isolated API) | Stock changes require reasons, changes of 50 units or more require confirmation and write an archive, and randomized stock-to-log invariant passed. Owner Playwright coverage uploads, replaces, and removes a product image. |
| (h) Reports | PASS (isolated live API) | Reports rendered in Playwright from live test orders and were checked against the database-backed API response. Backend report formulas pass the dedicated suite. |
| (i) Settings | PASS (local API coverage) | Field validation, PATCH compatibility, payment availability, audit records, delivery-fee snapshots, verified QR upload, and authorized QR reads pass. Hosting-specific upload behavior remains unverified. |
| (j) Notifications | PASS (isolated live API) | The browser flow covers grouped notifications, read-then-delete, unread-delete prevention, deduplication, and the unread message badge. |
| (k) Auto-cancel | PASS (isolated integration coverage) | Expiry rules, reminder timing, repeat runs, parallel reminder runs, order history, audit, and customer notification pass. The production scheduled task is not configured. |
| Readability/design/responsive release checks | PARTIAL | The live-data screenshot matrix covers five customer views at 1440, 1024, 768, and 390 CSS px, plus Orders, Inventory, Reports, and Settings at 1440, 1024, and 768 CSS px. Responsive overflow checks pass. Actual owner-page browser zoom could not be verified: the native Chrome window remained blank after test-owner sign-in. Historical before-change screenshots are unavailable. |

## Test output

| Validation | Result |
|---|---|
| `php tests\fulfillment_wording_test.php` | PASS — 40 assertions. |
| `php tests\commerce_schema_test.php` | PASS — `Commerce schema tests passed (69 assertions).` |
| `php tests\commerce_auto_cancel_test.php` | PASS — `Commerce auto-cancel tests passed (25 assertions).` |
| `php tests\commerce_reports_test.php` | PASS — `Commerce reports tests passed (36 assertions).` |
| `php -d extension=gd tests\commerce_api_security_test.php` | PASS — `Commerce API security tests passed (167 assertions).` Ran against both isolated loopback API test routers. |
| `php tests\auth_registration_verification_test.php` | PASS — 9 assertions through the local SMTP catcher. |
| `npm run build` | PASS — both root and webapp Vite production builds completed. |
| `npm run test:e2e` | PASS — 18/18 Playwright tests passed (2.4 min) against the isolated database. |
| `php -l` on changed PHP files and PHP test/router files | PASS — no syntax errors. |
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

The browser suite passed without document-level horizontal overflow at owner widths 1440, 1024, 768, 960, 720, 683, and 512 CSS px, customer widths 1440, 1024, 768, and 390 CSS px, and workspace-header controls at 320 CSS px. Narrow viewports are **not actual browser zoom tests**. A native Chrome check with a temporary isolated owner still showed a blank page, so actual 150%/200% checks and zoom screenshots remain unverified. The temporary owner, products, QR, and helper files were removed; a database check confirmed zero `e2e-*` users/products and zero temporary QR files.

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
