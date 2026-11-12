# Aquatica API

All routes are same-origin PHP endpoints. JSON requests use `Content-Type: application/json`; state-changing requests require the session's CSRF token in `X-CSRF-Token`. Image uploads use multipart form data. IDs shown below are examples, not real records.

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
| GET | `/api/v1/owner/dashboard` | Owner |
| GET | `/api/v1/owner/orders` | Owner |
| GET | `/api/v1/owner/orders/{id}` | Owner |
| POST | `/api/v1/owner/orders/{id}/actions` | Owner |
| GET, POST | `/api/v1/owner/products` | Owner |
| PATCH | `/api/v1/owner/products/{id}` | Owner |
| GET | `/api/v1/owner/inventory` | Owner |
| POST | `/api/v1/owner/inventory/movements` | Owner |
| GET | `/api/v1/owner/customers` | Owner |
| GET | `/api/v1/owner/reports` | Owner |
| GET | `/api/v1/owner/reports.csv` | Owner |
| GET, PUT | `/api/v1/owner/settings` | Owner |
| GET, POST | `/api/v1/owner/settings/gcash-qr` | Owner |

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
```

```json
{"fulfillment":"pickup","paymentMethod":"cash_pickup","name":"Sample Customer","phone":"09170000000","address":"","notes":""}
```

Successful requests return JSON; errors use a 4xx/5xx status and a `message`. Exact response schemas should be treated as provisional until the API workflow and contract tests are added and pass.
