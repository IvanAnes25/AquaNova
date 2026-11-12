# Test report — 2026-11-12

## Closeout status

**NOT READY.** The environment cannot currently run database-backed tests. XAMPP MariaDB reports missing/corrupt system tablespaces and `mysql.servers`/`mysql.plugin`; no database repair was attempted. The closeout checklist's behavioral, security, and end-to-end items are therefore not proven.

## Commands run and outputs

| Command/check | Result |
|---|---|
| `npm run build` | PASS: both Vite builds completed successfully (`✓ built in 4.96s`, `✓ built in 3.55s`). |
| PHP syntax loop (`php -l` on project PHP files excluding vendor/node_modules) | PASS: `PHP syntax OK: 33 files`. |
| `php tests\commerce_schema_test.php` | FAIL/blocked before assertions: `Commerce schema tests failed after 0 assertions: SQLSTATE[HY000] [2006] MySQL server has gone away`. Earlier attempt: connection refused on 127.0.0.1. |
| `php tests\commerce_auto_cancel_test.php` | NOT RUN: database unavailable. |
| `php tests\commerce_reports_test.php` | NOT RUN: database unavailable. |
| Backend API workflow suite | NOT PRESENT / NOT RUN. |
| Browser Playwright suite | NOT PRESENT / NOT RUN; Playwright is not a dev dependency. |
| `npm run build` generated source map/console scan | PASS: no `sourceMappingURL` or `console.log/debug/info` source matches found. |
| Local HTTP protected-path probe | PASS: `/.env`, `/.env.example`, `/tests/commerce_schema_test.php`, `/scripts/migrate.php`, `/logs/`, `/database/schema.sql`, `/private/auth.php` returned 403 after the `.htaccess` change. |
| Local HTTP response headers | PASS over HTTP for CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy. HSTS/HTTPS behavior NOT VERIFIED over TLS. |
| Login/register browser navigation | PASS: both pages rendered and links navigated locally; no credentials or account creation submitted. |
| Public home at 1440, 1024, 768, and 390 CSS px | PASS: Playwright measured `scrollWidth === clientWidth` at every viewport. |
| Public catalog failure state | PASS: when both catalog API requests abort after 8 seconds, the page displays the accessible “Shop temporarily unavailable” alert instead of showing the empty-catalog state. Underlying API is currently unhealthy. |
| `.user.ini` direct access | PASS: `/.user.ini` returns HTTP 403. |
| Production-equivalent deployment / fresh install | NOT RUN. |

## Bugs fixed during this closeout

- Added deny rules for `.env`, tests, scripts, logs, and `.wrangler`; before the fix, `/.env` and `/logs/` returned HTTP 200.
- Added `.user.ini` upload/session limits and blocked direct web access to that settings file.
- Added Permissions-Policy and HTTPS-only HSTS header directives; HTTPS behavior still needs a TLS-host test.
- Raised small landing-page text to the 12px minimum.
- Removed unused hardcoded customer/order/product/inventory demo fixtures and an unused local-storage loader from the webapp.
- Replaced the landing page's sample product listing with the live public catalog API, and routed the legacy products endpoint to the same database-backed catalog.
- Replaced per-order item/proof lookups in customer and owner order lists with batched queries to avoid N+1 database calls (syntax-checked; database behavior remains untested).
- Corrected `webapp/README.md`, which incorrectly described the API-backed workspace as demo data.

## Security checks

| Check | How tested | Result | Fix |
|---|---|---|---|
| Secret/source path exposure | Local HTTP requests to `.env`, database, tests, scripts, logs, private | 403 after change | Added `.htaccess` deny rules |
| Response security headers | `Invoke-WebRequest` against local HTTP | CSP, nosniff, frame denial, referrer, permissions present; HSTS requires HTTPS verification | Added Permissions-Policy and HTTPS-gated HSTS |
| Auth access control, ownership, CSRF, uploads, rate limits, SQLi/XSS, sessions | No functioning test database; no Playwright suite | NOT TESTED | Add and run dedicated suites |
| Error detail leakage | Not induced | NOT TESTED | Verify in backend integration tests |
| Database integrity/concurrency | Not run; local MariaDB system tables are damaged | NOT TESTED | Repair/rebuild only after a verified backup |

## Outstanding release blockers

- Restore a healthy MySQL/MariaDB service after a verified backup; then run existing schema, auto-cancel, and reports tests.
- Add and pass backend API/security/workflow tests and Playwright E2E tests.
- Add pagination to every list API and verify owner/customer list query counts against a healthy database.
- Complete owner order/reports/design/accessibility/responsive requirements and capture requested screenshots, contrast measurements, and Lighthouse scores.
- Provide PHP API hosting for deployment: current Vercel configuration only specifies a static build/output directory.
- Verify HTTPS headers, actual session cookie attributes, external SMTP, upload behavior, fresh install, backup/restore, scheduled task, and deployment.
- The new API/deployment/owner documents are initial guidance; their examples/contracts need verification against a live, healthy deployment.
