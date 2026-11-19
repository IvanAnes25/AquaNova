# Aquatica API

All routes are same-origin PHP endpoints. JSON requests use `Content-Type: application/json`; state-changing requests require the session's CSRF token in `X-CSRF-Token`. Authenticated API responses use `Cache-Control: no-store, private`. Image uploads use multipart form data. IDs shown below are examples, not real records.

## Authentication routes

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/auth/csrf.php` | Public | Obtain a CSRF token |
| POST | `/api/auth/register.php` | Public | Begin customer registration; sends verification email |
| GET | `/api/auth/pending.php` | Pending registrant | Read current verification state |
| POST | `/api/auth/verify.php` | Pending registrant | Verify code and create customer account |
| POST | `/api/auth/resend.php` | Pending registrant | Resend verification code |
| POST | `/api/auth/login.php` | Public | Start a session |
| GET | `/api/auth/session.php` | Public/session | Read current session user |
| POST | `/api/auth/logout.php` | Signed-in user | Destroy session |
| GET | `/api/auth/customer-page.php` | Customer | Validate customer workspace access |
| GET | `/api/auth/owner-page.php` | Owner | Validate owner workspace access |
| POST | `/api/auth/forgot-password.php` | Public | Request reset email |
| POST | `/api/auth/reset-password.php` | Public with reset token | Change password |

## Commerce routes

| Method | Path | Who |
|---|---|---|
| GET | `/api/v1/catalog/products` | Public |
| GET | `/api/v1/catalog/categories` | Public |
| GET | `/api/v1/settings/public` | Public |
| GET | `/api/v1/settings/gcash-qr` | Signed-in user |
| GET | `/api/v1/cart` | Customer |
| POST | `/api/v1/cart/items` | Customer |
| PATCH, DELETE | `/api/v1/cart/items/{productId}` | Customer |
| GET, POST | `/api/v1/orders` | Customer |
| GET | `/api/v1/orders/{id}` | Owning customer |
| POST | `/api/v1/orders/{id}/cancel` | Owning customer |
| POST | `/api/v1/orders/{id}/payment-proof` | Owning customer |
| GET | `/api/v1/orders/{id}/payment-proof/image` | Owning customer or owner |
| GET, PATCH | `/api/v1/account/profile` | Customer |
| POST | `/api/v1/account/password` | Signed-in initial owner |
| GET | `/api/v1/notifications` | Signed-in user |
| GET | `/api/v1/notifications/unread-count` | Signed-in user |
| PATCH | `/api/v1/notifications/{id}/read` | Owning user |
| POST | `/api/v1/notifications/read-all` | Signed-in user |
| PATCH, DELETE | `/api/v1/notifications/group/read` | Signed-in user |
| DELETE | `/api/v1/notifications/{id}` | Owning user; read notifications only |
| DELETE | `/api/v1/notifications/read` | Signed-in user; read notifications only |
| GET | `/api/v1/owner/dashboard` | Owner |
| GET | `/api/v1/owner/orders` | Owner |
| GET | `/api/v1/owner/orders/{id}` | Owner |
| POST | `/api/v1/owner/orders/{id}/actions` | Owner |
| GET, POST | `/api/v1/owner/products` | Owner |
| PATCH | `/api/v1/owner/products/{id}` | Owner |
| GET | `/api/v1/catalog/products/{idOrSlug}/image` | Public |
| GET, POST, DELETE | `/api/v1/owner/products/{idOrSlug}/image` | Owner |
| GET | `/api/v1/owner/inventory` | Owner |
| POST | `/api/v1/owner/inventory/movements` | Owner |
| GET | `/api/v1/owner/customers` | Owner |
| GET | `/api/v1/owner/reports` | Owner |
| GET | `/api/v1/owner/reports.csv` | Owner |
| GET, PATCH, PUT | `/api/v1/owner/settings` | Owner |
| GET, POST | `/api/v1/owner/settings/gcash-qr` | Owner |

### List pagination

Collection endpoints accept `page` (1-based) and `per_page` (1–100, default 50); `pageSize` remains a compatibility alias. List responses include a `pagination` object with `page`, `pageSize`, `per_page`, `total`, and `pages`. This applies to catalog products/categories, cart items, customer orders, owner orders/products/customers, and notifications. Inventory accepts independent `productsPage`/`productsPerPage` and `movementsPage`/`movementsPerPage` parameters (the existing `*PageSize` aliases remain supported) and returns `productsPagination` and `movementsPagination`.

Example:

```http
GET /api/v1/owner/orders?status=needs-action&page=2&per_page=25
```

```json
{
  "orders": [],
  "counts": { "pending": 0, "preparing": 0, "ready": 0, "completed": 0, "cancelled": 0 },
  "pagination": { "page": 2, "pageSize": 25, "per_page": 25, "total": 0, "pages": 0 }
}
```

### Shop status and notifications

`GET /api/v1/settings/public` returns the configured `shopHours`, `acceptOrdersWhenClosed`, `shopClosedMessage`, and `shopStatus`. `shopStatus` includes `isOpen`, `statusLine`, `timezone` (`Asia/Manila`), `today`, the active override, and the next opening/closing timestamp when scheduled. The PHP API computes this status using Asia/Manila time; clients should display the returned status rather than calculate it from their local clock. The owner settings endpoint accepts `shopHours` (each weekday is closed or has `open` and `close` in `HH:MM`) and `shopOpenOverride` (`scheduled`, `open`, or `closed`). Closing must be after opening.

Notification lists omit soft-deleted messages and include order metadata for grouping; messages without an order belong to “Other.” Unread counts count messages, not groups. Group read/delete requests accept `{"orderId": 123}`; use `{"orderId": null}` for “Other.” Deletion is soft and only applies to read messages. Single-message read uses `PATCH /notifications/{id}/read`; group read uses `PATCH /notifications/group/read`; “Mark all as read” uses `POST /notifications/read-all`. Delete a read group with `DELETE /notifications/group/read`, or all read messages with `DELETE /notifications/read`.

Owner settings accepts partial `PATCH` updates for shop details, `deliveryFee`, `gcashEnabled`, `codEnabled`, `cashPickupEnabled`, `autoCancelHours`, `shopHours`, `shopOpenOverride`, `shopClosedMessage`, and `acceptOrdersWhenClosed`; `PUT` remains supported for compatibility. Disabled payment methods and closed ordering (when the shop is closed and the policy is off) are rejected by checkout even if a customer bypasses the UI.

## Example requests

Begin registration:

```http
POST /api/auth/register.php
Content-Type: application/json
X-CSRF-Token: <session-token>
```

```json
{"name":"Sample Customer","email":"customer@example.test","phone":"09170000000","password":"example-passphrase","confirmPassword":"example-passphrase"}
```

Successful registration returns `201` with a message and email address; verification is still required.

Create an order from the server-side cart:

```http
POST /api/v1/orders
Content-Type: application/json
X-CSRF-Token: <session-token>
Idempotency-Key: <unique-key-for-this-order-attempt>
```

```json
{"fulfillment":"pickup","paymentMethod":"cash_pickup","name":"Sample Customer","phone":"09170000000","address":"","notes":""}
```

Successful requests return JSON; errors use a 4xx/5xx status and a `message`. The commerce workflow, pagination, and report access contracts have local integration coverage; production deployment behavior remains unverified.

### Idempotency and fulfillment wording

The following writes require an `Idempotency-Key` header: order creation, customer order cancellation, payment-proof submission, owner order actions, product creation, stock movement, product-image upload, and product-image removal. Keys must be 16–128 ASCII letters, digits, `.`, `_`, `:`, or `-` and are scoped to the signed-in user.

The key, endpoint, and canonical request payload are stored for up to 24 hours. A completed same-payload replay returns the original status code and body without repeating side effects and includes `Idempotent-Replay: true`. A different payload or endpoint returns `422`. A request already in progress returns `409` with `Retry-After: 1`. Definitive 4xx responses are stored so they can be replayed; 5xx responses remove the key and allow the retry to run again. The browser keeps keys for network errors and timeouts, clears them after success or definitive 4xx results, and releases its submission lock in `finally`.

Stock movements require a non-empty reason. Changes of 50 units or more require `confirmedLargeChange: true` and are copied to `stock_change_archives`. Product images accept verified JPEG, PNG, or WebP uploads up to 2 MB, replace and remove the private stored file, and are served only through the catalog/owner image routes.

Order-ready and completion messages are fulfillment-specific. Delivery orders use delivery/handoff language; pickup orders use “Ready for pickup,” “Picked up,” or “Handed over and paid” and omit delivery address/fee data. No packing-slip or order-email renderer is currently exposed by this API.
