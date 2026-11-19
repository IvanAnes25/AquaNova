# Prompt: finish the remaining items of the Improvements Prompt (no machine learning yet)

Context: you reported NOT DONE with these items remaining: 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15. The first check with my professors is on December 1, so I need the system COMPLETE and demo-ready by November 27 (feature freeze). Everything that already passes must keep passing.

The full item descriptions are in `Aquatica_Improvements_Prompt.md`. That file is still the specification; this prompt only sets the order, answers the DECISION questions, narrows what counts as "done", and defines the acceptance checks.

## Rules (same as before)
- Do not change login, registration or password-reset behaviour.
- Never weaken, skip or delete a failing test. All existing suites must still pass. Add tests for everything new.
- Use only the isolated test database. Back up before any migration. Migrations are re-runnable. Never delete real data.
- Keep the dark Figma look. No new libraries without asking me.
- Every claim needs the command you ran and its real output. If you did not run it, write "not done".
- Do not touch anything outside the listed items.
- Do not start machine learning. It comes after this.

## My answers to your DECISION questions (do not ask again)
- Item 7 (owner Orders): use your recommended behaviour. After a successful step, show the NEXT step of the same order; after the final step (completed, cancelled, proof rejected) open the next order; show "All caught up" when none. Keep a visible "Next order" button. Merge "Confirm" and "Start preparing" ONLY if they do the same thing for the owner; list what you merged.
- Item 8: use the default large-change threshold (20 units or 50% of current stock, whichever is smaller), editable in Settings. Do NOT re-ask the owner's password; skip that.
- Item 9: single image per product is enough. SKIP the optional gallery. Mark it "skipped by decision" and do not count it as a blocker.
- Item 11: "Accept orders when closed" is ON by default (customers can order, with a notice that it will be processed when the shop opens). The owner can turn it off, which blocks checkout with a clear message and keeps the cart.
- Item 14: use the recommended walk-in flow.
- Item 15: you cannot run native 150%/200% browser zoom or authenticated Lighthouse. Do this instead: Playwright at 360, 390, 412, 768, 1024 and 1440 widths with no horizontal overflow, plus a CSS-zoom/large-text check; run Lighthouse only on public pages (Home, Shop, Login). Write in TEST_REPORT.md "owner Orders/Reports Lighthouse and native zoom: to be done manually by the team". That part is NOT a blocker for DONE.

## Order of work
Work in these batches. Before each batch show a short plan and the files you will change, then wait for my OK. After each batch run ALL suites, give totals, and give a 3-line status. Then commit-ready summary (files changed, database changes).

### Batch A: items 2, 3, 13 (the problems everyone sees)
Acceptance checks (each needs a test or a command output):
1. Every action button listed in item 2 shows a spinner, is disabled during the request, and ignores a second click. Playwright double-click test for each of: add to cart, place order, upload proof, approve, reject, confirm, ready, complete, cancel, save, restock, adjust, create product, mark read, delete. One result each.
2. Failed or slow requests show an error message with a Retry button.
3. Skeleton or loading state on lists and route changes; no flash of the login page while the session is being checked.
4. Server idempotency: the same create request sent twice in parallel makes one record (order, product, proof, stock change, payment action). API test for each.
5. Login, Back, logout, Back flow works as in item 3; Back never goes to login while logged in; no private page shown after logout (no-store). Deep link plus Back goes to a sensible parent. In-app Back buttons exist on all pages listed in item 3.
6. Password eye on every password field: label changes (Show/Hide password), keyboard operable, announced to screen readers, hidden again when the page is left. Forgot-password link and other login/register links have at least 4.5:1 contrast with a visible focus ring; show the measured values.

### Batch B: items 11, 12
Acceptance checks:
1. Settings: Open/Closed switch, hours per weekday (Asia/Manila), optional message, "Accept orders when closed" setting. The customer site shows "We're open · closes at ..." or "We're closed · opens ..." computed on the server. Tests for hours, time zone, closed message and both closed-order policies.
2. Notifications grouped by order (order number, current status, unread count, timeline inside). Notifications without an order go in "Other". Opening a group marks it read; single read and "Mark all as read" work.
3. Delete only after read. Server returns 409 for unread, uses soft delete, and users can delete only their own. Unread badge counts messages, not groups. Pagination. No duplicate notifications on repeated actions.
4. Tests: grouping, read then delete, unread delete rejected, cross-user delete blocked, badge counts, no duplicates.

### Batch C: item 14 (walk-in sale)
Acceptance checks:
1. Owner "New walk-in sale" screen: product search with image and stock, quantities, Cash or GCash (GCash needs a unique reference number, no screenshot), optional customer name or phone, confirm.
2. Saved as an order with fulfillment `walk_in`, completed immediately, payment paid, stock deducted in one transaction with a stock log entry (type sale, order number). Short stock is refused. Double submit creates one sale.
3. In-system printable receipt. Walk-in appears in Orders (Completed) and Reports as its own slice and in revenue. No customer notification.
4. Tests: stock, log, report numbers, GCash reference uniqueness, double submit, customers get 403. Extend the stock invariant test.

### Batch D: acceptance matrix for items 5, 6, 7, 8, 10
Do not assume. Prove each point with a test or output:
1. Item 5: sold-out label ("! Sold out", red, AA contrast) in Shop, product details, cart, owner Products, Inventory and dashboard. Shop sorts in-stock first across pages, search and category filters. Sold-out cannot be added to cart. Inventory sorts by stock ascending by default.
2. Item 6: owner password change (first login AND normal change in Account; if the normal change does not exist, tell me, do not build it silently): red inline errors, strength checklist, focus on first error, screen reader announcements.
3. Item 7: full GCash, COD and pickup-cash flows end to end with the auto-next behaviour. Show the Playwright output.
4. Item 8: reason required, note required for Other and large changes, threshold in Settings, "! Large change" flag, archive filters (product, type, reason, date range, large only), CSV export with formula-injection protection, per-product history. Extend the invariant test (log equals stock, never negative).
5. Item 10: Products and Inventory show stock, status label and image thumbnail; search and pagination work with images and sold-out rows.

### Batch E: items 1 and 9 leftovers
1. Item 1: search ALL places that produce text (notifications, order pages, packing slip, emails, report labels). Report exactly which renderers exist. If a packing slip or email template does not exist, say "does not exist" and drop it from scope. For existing notifications: write the migration, run it against a test database that contains wrong-wording pickup notifications, and show real before/after counts (not 0 to 0).
2. Item 9: confirm thumbnail and larger image are produced, the upload folder cannot execute scripts (show the .htaccess or config), replace and remove delete old files, a PHP file renamed to .jpg is rejected. Playwright: add a product with an image and see it in the Shop.

## Final steps
- Update `TEST_REPORT.md`, `API.md`, `OWNER_GUIDE.md`.
- List every database change (columns, tables, migrations) so I can run them on my real database after a backup.
- Remove temporary users, servers and files.
- Final line: "ALL ITEMS DONE" only if every item except the ones I explicitly excluded above passes. Otherwise "NOT DONE" with the exact list.
- Items excluded from DONE (do not count as blockers): gallery (item 9), owner-page Lighthouse and native zoom (item 15), production SMTP/HTTPS/host backup (deployment).