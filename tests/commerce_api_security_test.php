<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/database/connection.php';

if (PHP_SAPI !== 'cli' || !database_is_local() || !extension_loaded('curl')) {
    fwrite(STDERR, "API security tests require local CLI, PDO MySQL, and cURL.\n");
    exit(1);
}

$config = require dirname(__DIR__) . '/private/auth.php';
$baseUrl = rtrim(getenv('AQUATICA_TEST_BASE_URL') ?: 'http://127.0.0.1/AquaNova', '/');
$pdo = database_connection();
$tag = bin2hex(random_bytes(5));
$password = bin2hex(random_bytes(18));
$cookieFiles = [];
$temporaryFiles = [];
$uploadedPaths = [];
$userIds = [];
$orderIds = [];
$proofIds = [];
$createdProductIds = [];
$settingsBefore = [];
$originalQrPath = null;
$originalQrBackup = null;
$lowStockNotificationIdsBefore = [];
$productId = 0;
$oldStock = null;
$oldThreshold = null;
$stockTestNote = '';
$assertions = 0;

$assert = static function (bool $condition, string $message) use (&$assertions): void {
    $assertions++;
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

final class ApiTestClient
{
    public string $cookieFile;
    public string $csrfToken = '';
    public string $password;
    public string $email;
    public string $baseUrl;
    public string $sessionCookieHeader = '';

    public function __construct(string $baseUrl, string $email, string $password, array &$cookieFiles)
    {
        $this->baseUrl = $baseUrl;
        $this->email = $email;
        $this->password = $password;
        $this->cookieFile = tempnam(sys_get_temp_dir(), 'aquatica-cookie-');
        if ($this->cookieFile === false) {
            throw new RuntimeException('Could not create an API test cookie jar.');
        }
        $cookieFiles[] = $this->cookieFile;
    }

    public function request(
        string $method,
        string $path,
        array|string|null $data = null,
        bool $withCsrf = true,
        ?string $idempotencyKey = null
    ): array
    {
        $headers = ['Accept: application/json'];
        if ($method !== 'GET') {
            $headers[] = 'Idempotency-Key: ' . ($idempotencyKey ?? bin2hex(random_bytes(16)));
        }
        $responseHeaders = [];
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_COOKIEFILE => $this->cookieFile,
            CURLOPT_COOKIEJAR => $this->cookieFile,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HEADERFUNCTION => static function ($handle, string $line) use (&$responseHeaders): int {
                $length = strlen($line);
                $separator = strpos($line, ':');
                if ($separator !== false) {
                    $name = strtolower(trim(substr($line, 0, $separator)));
                    $responseHeaders[$name][] = trim(substr($line, $separator + 1));
                }
                return $length;
            },
        ];
        if (is_array($data)) {
            if ($withCsrf && $this->csrfToken !== '') {
                $headers[] = 'X-CSRF-Token: ' . $this->csrfToken;
            }
            if ($method === 'GET') {
                $path .= (str_contains($path, '?') ? '&' : '?') . http_build_query($data);
            } elseif (count(array_filter($data, static fn(mixed $value): bool => $value instanceof CURLFile)) > 0) {
                $options[CURLOPT_POSTFIELDS] = $data;
            } else {
                $headers[] = 'Content-Type: application/json';
                $options[CURLOPT_POSTFIELDS] = json_encode($data, JSON_THROW_ON_ERROR);
            }
            $options[CURLOPT_HTTPHEADER] = $headers;
        } elseif ($withCsrf && $this->csrfToken !== '') {
            $headers[] = 'X-CSRF-Token: ' . $this->csrfToken;
            $options[CURLOPT_HTTPHEADER] = $headers;
        }

        $handle = curl_init($this->baseUrl . $path);
        curl_setopt_array($handle, $options);
        $body = curl_exec($handle);
        if ($body === false) {
            $message = curl_error($handle);
            curl_close($handle);
            throw new RuntimeException('API request failed: ' . $message);
        }
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $contentType = (string) curl_getinfo($handle, CURLINFO_CONTENT_TYPE);
        curl_close($handle);
        $json = json_decode((string) $body, true);
        return [
            'status' => $status,
            'body' => (string) $body,
            'json' => is_array($json) ? $json : null,
            'contentType' => $contentType,
            'headers' => $responseHeaders,
        ];
    }

    public function login(): void
    {
        $csrf = $this->request('GET', '/api/auth/csrf.php', null, false);
        $this->csrfToken = (string) ($csrf['json']['csrfToken'] ?? '');
        if ($csrf['status'] !== 200 || $this->csrfToken === '') {
            throw new RuntimeException('Could not obtain an initial CSRF token.');
        }
        $login = $this->request('POST', '/api/auth/login.php', [
            'email' => $this->email,
            'password' => $this->password,
        ]);
        if ($login['status'] !== 200) {
            throw new RuntimeException('Could not sign in the API test account: ' . $login['body']);
        }
        $this->sessionCookieHeader = implode('; ', $login['headers']['set-cookie'] ?? []);
        $csrf = $this->request('GET', '/api/auth/csrf.php', null, false);
        $this->csrfToken = (string) ($csrf['json']['csrfToken'] ?? '');
        if ($this->csrfToken === '') {
            throw new RuntimeException('Could not obtain the authenticated CSRF token.');
        }
    }

    public function asyncHandle(string $path, array $data, ?string $idempotencyKey = null, bool $multipart = false): CurlHandle
    {
        $handle = curl_init($this->baseUrl . $path);
        $headers = [
            'Accept: application/json',
            'X-CSRF-Token: ' . $this->csrfToken,
            'Idempotency-Key: ' . ($idempotencyKey ?? bin2hex(random_bytes(16))),
        ];
        if (!$multipart) {
            $headers[] = 'Content-Type: application/json';
            $postFields = json_encode($data, JSON_THROW_ON_ERROR);
        } else {
            $postFields = $data;
        }
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $postFields,
            CURLOPT_COOKIEFILE => $this->cookieFile,
            CURLOPT_COOKIEJAR => $this->cookieFile,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 30,
        ]);
        return $handle;
    }
}

$createUser = static function (string $role, string $suffix) use ($pdo, $tag, $password, $config, &$userIds, $baseUrl, &$cookieFiles): ApiTestClient {
    $email = "api-{$tag}-{$suffix}@example.test";
    $statement = $pdo->prepare(
        'INSERT INTO users (name, email, phone, password_hash, role, email_verified_at, must_change_password)
         VALUES (:name, :email, :phone, :hash, :role, UTC_TIMESTAMP(), 0)'
    );
    $statement->execute([
        'name' => 'API Test ' . $suffix,
        'email' => $email,
        'phone' => '5550000',
        'hash' => password_hash($password, PASSWORD_ARGON2ID, $config['argon2']),
        'role' => $role,
    ]);
    $userIds[] = (int) $pdo->lastInsertId();
    $client = new ApiTestClient($baseUrl, $email, $password, $cookieFiles);
    $client->login();
    return $client;
};

$createOrder = static function (int $userId, int $productId, string $suffix, string $payment, string $paymentStatus, string $orderStatus = 'pending') use (
    $pdo,
    $tag,
    &$orderIds
): int {
    $number = 'T' . strtoupper($tag) . $suffix;
    $legacyMethod = $payment === 'gcash' ? 'GCash' : 'Cash';
    $legacyFulfillment = $payment === 'cod' ? 'Local delivery' : 'Pickup at shop';
    $legacyPaymentStatus = $paymentStatus === 'under_review' ? 'Proof submitted' : 'Awaiting proof';
    $insert = $pdo->prepare(
        'INSERT INTO orders
         (order_number, user_id, customer_name, customer_email, phone, delivery_method, delivery_address,
          payment_method, subtotal, total, status, payment_status, order_no, fulfillment, payment_method_v2,
          order_status, payment_status_v2, delivery_fee, delivery_address_snapshot)
         VALUES
         (:number, :user_id, :name, :email, :phone, :delivery_method, :address,
          :payment_method, 10, 10, :legacy_status, :legacy_payment, :order_no, :fulfillment, :method,
          :status, :payment_status, 0, :snapshot)'
    );
    $user = $pdo->prepare('SELECT name, email FROM users WHERE id = :id');
    $user->execute(['id' => $userId]);
    $customer = $user->fetch(PDO::FETCH_ASSOC);
    $fulfillment = $payment === 'cod' ? 'delivery' : 'pickup';
    $insert->execute([
        'number' => $number, 'user_id' => $userId, 'name' => $customer['name'], 'email' => $customer['email'],
        'phone' => '5550000', 'delivery_method' => $legacyFulfillment,
        'address' => $fulfillment === 'delivery' ? 'Test address' : 'Pickup at shop',
        'payment_method' => $legacyMethod, 'legacy_status' => 'Pending', 'legacy_payment' => $legacyPaymentStatus,
        'order_no' => $number, 'fulfillment' => $fulfillment, 'method' => $payment,
        'status' => $orderStatus, 'payment_status' => $paymentStatus,
        'snapshot' => json_encode(['line1' => 'Test address']),
    ]);
    $orderId = (int) $pdo->lastInsertId();
    $product = $pdo->prepare('SELECT name, price FROM products WHERE id = :id');
    $product->execute(['id' => $productId]);
    $row = $product->fetch(PDO::FETCH_ASSOC);
    $item = $pdo->prepare(
        'INSERT INTO order_items
         (order_id, product_id, product_name, unit_price, quantity, line_total, name_snapshot, price_snapshot, qty)
         VALUES (:order_id, :product_id, :name, 10, 1, 10, :snapshot, 10, 1)'
    );
    $item->execute(['order_id' => $orderId, 'product_id' => $productId, 'name' => $row['name'], 'snapshot' => $row['name']]);
    $orderIds[] = $orderId;
    return $orderId;
};

$failed = false;
try {
    $category = $pdo->query('SELECT id FROM categories ORDER BY id LIMIT 1')->fetchColumn();
    if (!$category) {
        throw new RuntimeException('A seeded product category is required for API tests.');
    }
    $product = $pdo->prepare('SELECT id, stock, low_stock_threshold FROM products WHERE category_id = :category ORDER BY id LIMIT 1');
    $product->execute(['category' => $category]);
    $selectedProduct = $product->fetch(PDO::FETCH_ASSOC);
    if (!$selectedProduct) {
        throw new RuntimeException('A seeded product is required for API tests.');
    }
    $productId = (int) $selectedProduct['id'];
    $oldStock = (int) $selectedProduct['stock'];
    $oldThreshold = (int) $selectedProduct['low_stock_threshold'];
    $stockTestNote = 'API test threshold ' . $tag;
    $existingLowStock = $pdo->prepare(
        "SELECT id FROM notifications WHERE title = 'Low stock' AND body LIKE :product"
    );
    $existingLowStock->execute(['product' => '%(#' . $productId . ')%']);
    $lowStockNotificationIdsBefore = array_map('intval', $existingLowStock->fetchAll(PDO::FETCH_COLUMN));

    $customer = $createUser('customer', 'customer');
    $otherCustomer = $createUser('customer', 'other');
    $ownerA = $createUser('owner', 'owner-a');
    $ownerB = $createUser('owner', 'owner-b');

    $customerSettings = $customer->request('GET', '/api/v1/owner/settings');
    $assert($customerSettings['status'] === 403, 'Customers must not read owner settings.');
    $ownerSettings = $ownerA->request('GET', '/api/v1/owner/settings');
    $assert($ownerSettings['status'] === 200 && is_array($ownerSettings['json']['settings'] ?? null), 'Owner settings must be readable by owners.');
    $categoryName = $pdo->prepare('SELECT name FROM categories WHERE id = :id');
    $categoryName->execute(['id' => $category]);
    $productPayload = [
        'name' => 'Idempotent product ' . $tag,
        'category' => (string) $categoryName->fetchColumn(),
        'price' => 10,
        'stock' => 0,
        'description' => 'Idempotency test product.',
    ];
    $missingIdempotencyKey = $ownerA->request(
        'POST',
        '/api/v1/owner/products',
        $productPayload,
        true,
        ''
    );
    $assert($missingIdempotencyKey['status'] === 428, 'Product creation must reject a missing idempotency key.');
    $idempotencyKey = bin2hex(random_bytes(16));
    $productOne = $ownerA->asyncHandle('/api/v1/owner/products', $productPayload, $idempotencyKey);
    $productTwo = $ownerA->asyncHandle('/api/v1/owner/products', $productPayload, $idempotencyKey);
    $multi = curl_multi_init();
    curl_multi_add_handle($multi, $productOne);
    curl_multi_add_handle($multi, $productTwo);
    do {
        $multiStatus = curl_multi_exec($multi, $running);
        if ($running) {
            curl_multi_select($multi, 1.0);
        }
    } while ($running && $multiStatus === CURLM_OK);
    $productStatuses = [
        (int) curl_getinfo($productOne, CURLINFO_RESPONSE_CODE),
        (int) curl_getinfo($productTwo, CURLINFO_RESPONSE_CODE),
    ];
    sort($productStatuses);
    foreach ([$productOne, $productTwo] as $handle) {
        curl_multi_remove_handle($multi, $handle);
        curl_close($handle);
    }
    curl_multi_close($multi);
    $createdProduct = $pdo->prepare('SELECT id FROM products WHERE name = :name');
    $createdProduct->execute(['name' => $productPayload['name']]);
    $createdProductResult = array_map('intval', $createdProduct->fetchAll(PDO::FETCH_COLUMN));
    array_push($createdProductIds, ...$createdProductResult);
    $assert(
        ($productStatuses === [201, 201] || $productStatuses === [201, 409])
            && count($createdProductResult) === 1,
        'Concurrent duplicate product creates must replay or conflict and produce exactly one product.'
    );
    $setting = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = :key');
    foreach (['cod_enabled', 'delivery_fee', 'gcash_qr_path'] as $settingKey) {
        $setting->execute(['key' => $settingKey]);
        $settingsBefore[$settingKey] = $setting->fetchColumn();
    }
    $invalidSetting = $ownerA->request('PATCH', '/api/v1/owner/settings', ['unsupported' => true]);
    $assert($invalidSetting['status'] === 422, 'Owner settings must reject unsupported fields.');
    foreach ([
        ['shopPhone' => 'not a phone'],
        ['gcashNumber' => '123'],
        ['deliveryFee' => -1],
        ['gcashEnabled' => 'false'],
        ['autoCancelHours' => 721],
    ] as $invalidValues) {
        $invalidSettingsResponse = $ownerA->request('PATCH', '/api/v1/owner/settings', $invalidValues);
        $assert($invalidSettingsResponse['status'] === 422, 'Owner settings must reject invalid field values.');
    }
    $disableCod = $ownerA->request('PATCH', '/api/v1/owner/settings', ['codEnabled' => false]);
    $publicSettings = new ApiTestClient($baseUrl, '', '', $cookieFiles);
    $publicSettingsResult = $publicSettings->request('GET', '/api/v1/settings/public', null, false);
    $assert($disableCod['status'] === 200 && ($publicSettingsResult['json']['codEnabled'] ?? true) === false, 'PATCH settings must update public checkout availability.');
    $disabledCodOrder = $customer->request('POST', '/api/v1/orders', [
        'fulfillment' => 'delivery', 'paymentMethod' => 'cod', 'name' => 'Test', 'phone' => '5550000', 'address' => 'Test address',
    ]);
    $assert($disabledCodOrder['status'] === 409, 'Checkout must reject a payment method disabled in owner settings.');
    $enableCod = $ownerA->request('PATCH', '/api/v1/owner/settings', ['codEnabled' => true]);
    $assert($enableCod['status'] === 200, 'Owner settings must continue accepting enabled payment options.');
    $settingsAudit = $pdo->prepare("SELECT COUNT(*) FROM audit_log WHERE user_id = :user_id AND action = 'settings.updated'");
    $settingsAudit->execute(['user_id' => $userIds[2]]);
    $assert((int) $settingsAudit->fetchColumn() === 2, 'Owner settings updates must be audited.');

    $anonymous = new ApiTestClient($baseUrl, '', '', $cookieFiles);
    $anonymousResult = $anonymous->request('GET', '/api/v1/owner/orders', null, false);
    $assert($anonymousResult['status'] === 401, 'Logged-out owner list request must return 401.');
    $anonymousReports = $anonymous->request('GET', '/api/v1/owner/reports', null, false);
    $anonymousCsv = $anonymous->request('GET', '/api/v1/owner/reports.csv', null, false);
    $assert($anonymousReports['status'] === 401 && $anonymousCsv['status'] === 401, 'Logged-out report JSON and CSV requests must return 401.');

    $customerOwnerRoute = $customer->request('GET', '/api/v1/owner/orders');
    $assert($customerOwnerRoute['status'] === 403, 'Customer owner list request must return 403.');
    $customerReports = $customer->request('GET', '/api/v1/owner/reports');
    $customerCsv = $customer->request('GET', '/api/v1/owner/reports.csv');
    $assert($customerReports['status'] === 403 && $customerCsv['status'] === 403, 'Customer report JSON and CSV requests must return 403.');
    $ownerReports = $ownerA->request('GET', '/api/v1/owner/reports?period=month');
    $ownerCsv = $ownerA->request('GET', '/api/v1/owner/reports.csv?period=month');
    $assert($ownerReports['status'] === 200 && is_array($ownerReports['json']['kpis'] ?? null), 'Owner report JSON endpoint must return report data.');
    $assert($ownerCsv['status'] === 200 && str_contains($ownerCsv['contentType'], 'text/csv'), 'Owner report CSV endpoint must return CSV.');

    $otherOrder = $createOrder($userIds[1], $productId, 'OWN', 'gcash', 'unpaid');
    $otherOrderResult = $customer->request('GET', '/api/v1/orders/' . $otherOrder);
    $assert($otherOrderResult['status'] === 404, 'Customer must not read another customer order.');
    $customerList = $customer->request('GET', '/api/v1/orders');
    $assert($customerList['status'] === 200 && count($customerList['json']['orders'] ?? []) === 0, 'Customer order list must exclude other customers.');

    $catalogFirst = $customer->request('GET', '/api/v1/catalog/products', ['page' => 1, 'pageSize' => 1]);
    $catalogSecond = $customer->request('GET', '/api/v1/catalog/products', ['page' => 2, 'pageSize' => 1]);
    $perPageResult = $customer->request('GET', '/api/v1/catalog/products', ['page' => 1, 'per_page' => 1]);
    $assert($catalogFirst['status'] === 200 && count($catalogFirst['json']['products'] ?? []) === 1, 'Catalog first page should contain one product.');
    $assert(($catalogFirst['json']['pagination']['pages'] ?? 0) > 1, 'Catalog pagination should report more than one page.');
    $assert(($perPageResult['json']['pagination']['per_page'] ?? null) === 1, 'Collection endpoints must accept and return per_page.');
    $assert(($catalogFirst['json']['products'][0]['productId'] ?? null) !== ($catalogSecond['json']['products'][0]['productId'] ?? null), 'Catalog pages should not repeat a product.');
    $invalidPage = $customer->request('GET', '/api/v1/catalog/products', ['page' => 0, 'pageSize' => 1]);
    $assert($invalidPage['status'] === 422, 'Invalid pagination must be rejected.');
    $invalidPageSize = $customer->request('GET', '/api/v1/catalog/products', ['page' => 1, 'pageSize' => 101]);
    $assert($invalidPageSize['status'] === 422, 'Page sizes above the configured limit must be rejected.');
    $overflowPage = $customer->request('GET', '/api/v1/catalog/products', ['page' => PHP_INT_MAX, 'pageSize' => 100]);
    $assert($overflowPage['status'] === 422, 'Pagination offsets that could overflow must be rejected.');
    $categoriesPage = $customer->request('GET', '/api/v1/catalog/categories', ['pageSize' => 1]);
    $cartPage = $customer->request('GET', '/api/v1/cart', ['pageSize' => 1]);
    $customerOrdersPage = $customer->request('GET', '/api/v1/orders', ['pageSize' => 1]);
    $ownerProductsPage = $ownerA->request('GET', '/api/v1/owner/products', ['pageSize' => 1]);
    $inventoryPage = $ownerA->request('GET', '/api/v1/owner/inventory', [
        'productsPageSize' => 1, 'movementsPageSize' => 1,
    ]);
    $ownerCustomersPage = $ownerA->request('GET', '/api/v1/owner/customers', ['pageSize' => 1]);
    $notificationsPage = $customer->request('GET', '/api/v1/notifications', ['pageSize' => 1]);
    $assert(
        isset($categoriesPage['json']['pagination'], $cartPage['json']['pagination'], $customerOrdersPage['json']['pagination'],
            $ownerProductsPage['json']['pagination'], $inventoryPage['json']['productsPagination'],
            $inventoryPage['json']['movementsPagination'], $ownerCustomersPage['json']['pagination'],
            $notificationsPage['json']['pagination']),
        'Every collection response must include pagination metadata.'
    );
    $ownerOrdersFirst = $ownerA->request('GET', '/api/v1/owner/orders', ['page' => 1, 'pageSize' => 1]);
    $assert($ownerOrdersFirst['status'] === 200 && ($ownerOrdersFirst['json']['pagination']['pageSize'] ?? null) === 1, 'Owner orders endpoint must expose bounded pagination.');
    $foreignNotification = $pdo->prepare(
        'INSERT INTO notifications (user_id, title, body) VALUES (:user_id, :title, :body)'
    );
    $foreignNotification->execute(['user_id' => $userIds[1], 'title' => 'Private', 'body' => 'Private notification']);
    $foreignNotificationId = (int) $pdo->lastInsertId();
    $markForeignNotification = $customer->request('PATCH', '/api/v1/notifications/' . $foreignNotificationId . '/read');
    $notificationReadAt = $pdo->prepare('SELECT read_at FROM notifications WHERE id = :id');
    $notificationReadAt->execute(['id' => $foreignNotificationId]);
    $assert(
        $markForeignNotification['status'] === 404 && $notificationReadAt->fetchColumn() === null,
        'Customers must not read or mark another customer\'s notification as read.'
    );

    $sqlInjection = $customer->request('GET', '/api/v1/catalog/products', ['q' => "' OR 1=1 --", 'pageSize' => 100]);
    $assert($sqlInjection['status'] === 200 && count($sqlInjection['json']['products'] ?? []) === 0, 'SQL-looking search input must be treated as data.');

    $missingCsrf = $ownerA->request('POST', '/api/v1/owner/orders/' . $otherOrder . '/actions', [
        'action' => 'cancel', 'reason' => 'missing token test',
    ], false);
    $assert($missingCsrf['status'] === 403, 'State-changing API requests must reject missing CSRF tokens.');

    $illegalJump = $ownerA->request('POST', '/api/v1/owner/orders/' . $otherOrder . '/actions', [
        'action' => 'complete',
    ]);
    $assert($illegalJump['status'] === 409, 'A Pending order must not jump directly to Completed.');

    $pdo->prepare('UPDATE products SET stock = 1 WHERE id = :id')->execute(['id' => $productId]);
    $pdo->prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (:user_id, :product_id, 2)')
        ->execute(['user_id' => $userIds[0], 'product_id' => $productId]);
    $shortStockPayload = [
        'fulfillment' => 'pickup', 'paymentMethod' => 'cash_pickup', 'name' => 'Test', 'phone' => '5550000',
    ];
    $shortStockKey = bin2hex(random_bytes(16));
    $shortStock = $customer->request('POST', '/api/v1/orders', $shortStockPayload, true, $shortStockKey);
    $shortStockReplay = $customer->request('POST', '/api/v1/orders', $shortStockPayload, true, $shortStockKey);
    $assert(
        $shortStock['status'] === 409
            && $shortStockReplay['status'] === 409
            && $shortStockReplay['body'] === $shortStock['body']
            && ($shortStockReplay['headers']['idempotent-replay'][0] ?? '') === 'true',
        'A definitive 4xx short-stock result must be replayed by the same key; first='
            . $shortStock['status'] . ' replay=' . $shortStockReplay['status']
            . ' body=' . $shortStockReplay['body']
            . ' replay-header=' . ($shortStockReplay['headers']['idempotent-replay'][0] ?? 'missing')
    );
    $pdo->prepare('DELETE FROM cart_items WHERE user_id = :user_id')->execute(['user_id' => $userIds[0]]);
    $wrongCombination = $customer->request('POST', '/api/v1/orders', [
        'fulfillment' => 'pickup', 'paymentMethod' => 'cod', 'name' => 'Test', 'phone' => '5550000',
    ]);
    $assert($wrongCombination['status'] === 422, 'Pickup cannot use delivery COD.');
    $wrongDeliveryCombination = $customer->request('POST', '/api/v1/orders', [
        'fulfillment' => 'delivery', 'paymentMethod' => 'cash_pickup', 'name' => 'Test',
        'phone' => '5550000', 'address' => 'Test address',
    ]);
    $assert($wrongDeliveryCombination['status'] === 422, 'Delivery cannot use cash-at-shop payment.');
    $pdo->prepare(
        "INSERT INTO settings (setting_key, setting_value)
         VALUES ('delivery_fee', '-1')
         ON DUPLICATE KEY UPDATE setting_value = '-1'"
    )->execute();
    $pdo->prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (:user_id, :product_id, 1)')
        ->execute(['user_id' => $userIds[0], 'product_id' => $productId]);
    $serverErrorKey = bin2hex(random_bytes(16));
    $serverErrorPayload = [
        'fulfillment' => 'delivery', 'paymentMethod' => 'cod', 'name' => 'Test',
        'phone' => '5550000', 'address' => 'Test address',
    ];
    $serverErrorFirst = $customer->request('POST', '/api/v1/orders', $serverErrorPayload, true, $serverErrorKey);
    $serverErrorReplay = $customer->request('POST', '/api/v1/orders', $serverErrorPayload, true, $serverErrorKey);
    $serverErrorRow = $pdo->prepare(
        'SELECT COUNT(*) FROM idempotency_requests
         WHERE user_id = :user_id AND request_hash = :request_hash'
    );
    $serverErrorRow->execute([
        'user_id' => $userIds[0],
        'request_hash' => hash('sha256', $serverErrorKey),
    ]);
    $pdo->prepare(
        "INSERT INTO settings (setting_key, setting_value)
         VALUES ('delivery_fee', '0')
         ON DUPLICATE KEY UPDATE setting_value = '0'"
    )->execute();
    $pdo->prepare('DELETE FROM cart_items WHERE user_id = :user_id')->execute(['user_id' => $userIds[0]]);
    $assert(
        $serverErrorFirst['status'] === 500
            && $serverErrorReplay['status'] === 500
            && (int) $serverErrorRow->fetchColumn() === 0,
        'A 5xx result must release the key so the retry runs again and the key row is removed; first='
            . $serverErrorFirst['status'] . ' replay=' . $serverErrorReplay['status']
            . ' row=' . (int) $serverErrorRow->fetchColumn()
            . ' firstBody=' . $serverErrorFirst['body']
            . ' replayBody=' . $serverErrorReplay['body']
    );

    $raceOne = $createOrder($userIds[0], $productId, 'R1', 'gcash', 'under_review');
    $raceTwo = $createOrder($userIds[1], $productId, 'R2', 'gcash', 'under_review');
    foreach ([[$raceOne, 'RACEA'], [$raceTwo, 'RACEB']] as [$raceOrder, $reference]) {
        $proof = $pdo->prepare(
            "INSERT INTO payment_proofs (order_id, reference_no, image_path, amount, status)
             VALUES (:order_id, :reference, 'private/uploads/payment-proofs/test-fixture.jpg', 10, 'under_review')"
        );
        $proof->execute(['order_id' => $raceOrder, 'reference' => $tag . $reference]);
        $proofIds[] = (int) $pdo->lastInsertId();
    }

    $firstHandle = $ownerA->asyncHandle('/api/v1/owner/orders/' . $raceOne . '/actions', ['action' => 'approve_proof']);
    $secondHandle = $ownerB->asyncHandle('/api/v1/owner/orders/' . $raceTwo . '/actions', ['action' => 'approve_proof']);
    $multi = curl_multi_init();
    curl_multi_add_handle($multi, $firstHandle);
    curl_multi_add_handle($multi, $secondHandle);
    do {
        $multiStatus = curl_multi_exec($multi, $running);
        if ($running) {
            curl_multi_select($multi, 1.0);
        }
    } while ($running && $multiStatus === CURLM_OK);
    $raceResults = [
        ['status' => (int) curl_getinfo($firstHandle, CURLINFO_RESPONSE_CODE), 'body' => json_decode((string) curl_multi_getcontent($firstHandle), true)],
        ['status' => (int) curl_getinfo($secondHandle, CURLINFO_RESPONSE_CODE), 'body' => json_decode((string) curl_multi_getcontent($secondHandle), true)],
    ];
    curl_multi_remove_handle($multi, $firstHandle);
    curl_multi_remove_handle($multi, $secondHandle);
    curl_close($firstHandle);
    curl_close($secondHandle);
    curl_multi_close($multi);
    $raceStatuses = array_column($raceResults, 'status');
    sort($raceStatuses);
    $assert(
        $raceStatuses === [200, 409],
        'Concurrent approvals competing for the last item must yield exactly one success and one conflict; got '
            . json_encode($raceResults, JSON_UNESCAPED_SLASHES)
    );
    $stock = $pdo->prepare('SELECT stock FROM products WHERE id = :id');
    $stock->execute(['id' => $productId]);
    $assert((int) $stock->fetchColumn() === 0, 'Concurrent approvals must deduct the last unit only once.');
    $sales = $pdo->prepare("SELECT COUNT(*) FROM stock_movements WHERE order_id IN (:first, :second) AND type = 'sale'");
    $sales->execute(['first' => $raceOne, 'second' => $raceTwo]);
    $assert((int) $sales->fetchColumn() === 1, 'Concurrent approvals must write exactly one sale stock movement.');

    $alreadyApproved = $raceResults[0]['status'] === 200 ? $raceOne : $raceTwo;
    $approveTwice = $ownerA->request('POST', '/api/v1/owner/orders/' . $alreadyApproved . '/actions', ['action' => 'approve_proof']);
    $assert($approveTwice['status'] === 409, 'Approving the same proof twice must be rejected.');

    $pdo->prepare('UPDATE products SET low_stock_threshold = 5 WHERE id = :id')->execute(['id' => $productId]);
    $lowStockCount = static function (int $ownerId) use ($pdo, $productId): int {
        $count = $pdo->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = :user_id AND title = 'Low stock' AND body LIKE :product");
        $count->execute(['user_id' => $ownerId, 'product' => '%(#' . $productId . ')%']);
        return (int) $count->fetchColumn();
    };
    $lowStockBeforeA = $lowStockCount($userIds[2]);
    $lowStockBeforeB = $lowStockCount($userIds[3]);
    $restock = $ownerA->request('POST', '/api/v1/owner/inventory/movements', [
        'productId' => $productId, 'quantity' => 6, 'type' => 'restock', 'reason' => $stockTestNote,
    ]);
    $firstThresholdCrossing = $ownerA->request('POST', '/api/v1/owner/inventory/movements', [
        'productId' => $productId, 'quantity' => -1, 'type' => 'adjustment', 'reason' => $stockTestNote,
    ]);
    $belowThresholdAgain = $ownerA->request('POST', '/api/v1/owner/inventory/movements', [
        'productId' => $productId, 'quantity' => -1, 'type' => 'adjustment', 'reason' => $stockTestNote,
    ]);
    $assert(
        $restock['status'] === 200 && $firstThresholdCrossing['status'] === 200 && $belowThresholdAgain['status'] === 200,
        'Stock movements around the low-stock threshold must succeed.'
    );
    $assert(
        $lowStockCount($userIds[2]) - $lowStockBeforeA === 1
            && $lowStockCount($userIds[3]) - $lowStockBeforeB === 1,
        'Crossing the low-stock threshold must notify each owner once, not repeatedly while below it.'
    );
    $resetThreshold = $ownerA->request('POST', '/api/v1/owner/inventory/movements', [
        'productId' => $productId, 'quantity' => 2, 'type' => 'restock', 'reason' => $stockTestNote,
    ]);
    $crossThresholdAgain = $ownerA->request('POST', '/api/v1/owner/inventory/movements', [
        'productId' => $productId, 'quantity' => -1, 'type' => 'adjustment', 'reason' => $stockTestNote,
    ]);
    $assert(
        $resetThreshold['status'] === 200 && $crossThresholdAgain['status'] === 200
            && $lowStockCount($userIds[2]) - $lowStockBeforeA === 2
            && $lowStockCount($userIds[3]) - $lowStockBeforeB === 2,
        'Restocking above the threshold must reset the next low-stock alert crossing.'
    );

    $missingReason = $ownerA->request('POST', '/api/v1/owner/inventory/movements', [
        'productId' => $productId, 'quantity' => 1, 'type' => 'restock', 'reason' => '',
    ]);
    $assert($missingReason['status'] === 422, 'Every stock change must require a reason.');
    $largeWithoutConfirmation = $ownerA->request('POST', '/api/v1/owner/inventory/movements', [
        'productId' => $productId, 'quantity' => 50, 'type' => 'restock', 'reason' => 'Bulk supplier delivery',
    ]);
    $assert($largeWithoutConfirmation['status'] === 422,
        'Large stock changes of 50 units or more must require confirmation.');
    $archiveBefore = $pdo->prepare(
        'SELECT COUNT(*) FROM stock_change_archives WHERE product_id = :product_id'
    );
    $archiveBefore->execute(['product_id' => $productId]);
    $archiveBeforeCount = (int) $archiveBefore->fetchColumn();
    $largeConfirmed = $ownerA->request('POST', '/api/v1/owner/inventory/movements', [
        'productId' => $productId, 'quantity' => 50, 'type' => 'restock',
        'reason' => 'Bulk supplier delivery', 'confirmedLargeChange' => true,
    ]);
    $archiveCount = $pdo->prepare(
        'SELECT COUNT(*) FROM stock_change_archives WHERE product_id = :product_id'
    );
    $archiveCount->execute(['product_id' => $productId]);
    $assert(
        $largeConfirmed['status'] === 200
            && (int) $archiveCount->fetchColumn() === $archiveBeforeCount + 1,
        'Confirmed large stock changes must write both a movement and archive record; status='
            . $largeConfirmed['status'] . ' body=' . $largeConfirmed['body']
            . ' archive=' . (int) $archiveCount->fetchColumn()
    );

    $pdo->prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (:user_id, :product_id, 1)')
        ->execute(['user_id' => $userIds[0], 'product_id' => $productId]);
    $placedOrder = $customer->request('POST', '/api/v1/orders', [
        'fulfillment' => 'pickup', 'paymentMethod' => 'cash_pickup', 'name' => 'Test', 'phone' => '5550000',
    ]);
    $assert($placedOrder['status'] === 201, 'A valid cash pickup order should be created.');
    $placedOrderId = (int) ($placedOrder['json']['order']['databaseId'] ?? 0);
    if ($placedOrderId > 0) {
        $orderIds[] = $placedOrderId;
    }
    $idempotentCartKey = bin2hex(random_bytes(16));
    $idempotentOrderPayload = [
        'fulfillment' => 'pickup',
        'paymentMethod' => 'cash_pickup',
        'name' => 'Idempotent test',
        'phone' => '5550000',
    ];
    $pdo->prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (:user_id, :product_id, 1)')
        ->execute(['user_id' => $userIds[0], 'product_id' => $productId]);
    $ordersBeforeReplay = (int) $pdo->query("SELECT COUNT(*) FROM orders WHERE user_id = {$userIds[0]}")->fetchColumn();
    $idempotentFirst = $customer->request('POST', '/api/v1/orders', $idempotentOrderPayload, true, $idempotentCartKey);
    $idempotentReplay = $customer->request('POST', '/api/v1/orders', $idempotentOrderPayload, true, $idempotentCartKey);
    $ordersAfterReplay = (int) $pdo->query("SELECT COUNT(*) FROM orders WHERE user_id = {$userIds[0]}")->fetchColumn();
    $idempotentOrderId = (int) ($idempotentFirst['json']['order']['databaseId'] ?? 0);
    if ($idempotentOrderId > 0) {
        $orderIds[] = $idempotentOrderId;
    }
    $assert(
        $idempotentFirst['status'] === 201
            && $idempotentReplay['status'] === $idempotentFirst['status']
            && $idempotentReplay['body'] === $idempotentFirst['body']
            && ($idempotentReplay['headers']['idempotent-replay'][0] ?? '') === 'true'
            && $ordersAfterReplay === $ordersBeforeReplay + 1,
        'The same key and payload must replay the identical order response and create one order.'
    );
    $differentPayload = $customer->request('POST', '/api/v1/orders', [
        ...$idempotentOrderPayload,
        'name' => 'Different payload',
    ], true, $idempotentCartKey);
    $assert($differentPayload['status'] === 422
        && str_contains((string) ($differentPayload['json']['message'] ?? ''), 'different request payload'),
        'A reused key with a different payload must return 422.');

    $pdo->prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (:user_id, :product_id, 1)')
        ->execute(['user_id' => $userIds[1], 'product_id' => $productId]);
    $pdo->prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (:user_id, :product_id, 1)')
        ->execute(['user_id' => $userIds[0], 'product_id' => $productId]);
    $crossUserKey = bin2hex(random_bytes(16));
    $crossStockBefore = (int) $pdo->query(
        'SELECT stock FROM products WHERE id = ' . (int) $productId
    )->fetchColumn();
    $pdo->prepare('UPDATE products SET stock = 100 WHERE id = :id')->execute(['id' => $productId]);
    $crossUserFirst = $customer->request('POST', '/api/v1/orders', $idempotentOrderPayload, true, $crossUserKey);
    $crossUserSecond = $otherCustomer->request('POST', '/api/v1/orders', $idempotentOrderPayload, true, $crossUserKey);
    $assert($crossUserFirst['status'] === 201 && $crossUserSecond['status'] === 201,
        'One user key must not replay another user response; first='
            . $crossUserFirst['status'] . ' second=' . $crossUserSecond['status']
            . ' bodies=' . $crossUserFirst['body'] . ' / ' . $crossUserSecond['body']);
    foreach ([$crossUserFirst, $crossUserSecond] as $crossUserResponse) {
        $crossUserOrderId = (int) ($crossUserResponse['json']['order']['databaseId'] ?? 0);
        if ($crossUserOrderId > 0) $orderIds[] = $crossUserOrderId;
    }
    $pdo->prepare('UPDATE products SET stock = :stock WHERE id = :id')
        ->execute(['stock' => $crossStockBefore, 'id' => $productId]);

    $pdo->prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (:user_id, :product_id, 1)')
        ->execute(['user_id' => $userIds[0], 'product_id' => $productId]);
    $parallelKey = bin2hex(random_bytes(16));
    $parallelOrdersBefore = (int) $pdo->query("SELECT COUNT(*) FROM orders WHERE user_id = {$userIds[0]}")->fetchColumn();
    $parallelOne = $customer->asyncHandle('/api/v1/orders', $idempotentOrderPayload, $parallelKey);
    $parallelTwo = $customer->asyncHandle('/api/v1/orders', $idempotentOrderPayload, $parallelKey);
    $multi = curl_multi_init();
    curl_multi_add_handle($multi, $parallelOne);
    curl_multi_add_handle($multi, $parallelTwo);
    do {
        $multiStatus = curl_multi_exec($multi, $running);
        if ($running) curl_multi_select($multi, 1.0);
    } while ($running && $multiStatus === CURLM_OK);
    $parallelStatuses = [
        (int) curl_getinfo($parallelOne, CURLINFO_RESPONSE_CODE),
        (int) curl_getinfo($parallelTwo, CURLINFO_RESPONSE_CODE),
    ];
    sort($parallelStatuses);
    curl_multi_remove_handle($multi, $parallelOne);
    curl_multi_remove_handle($multi, $parallelTwo);
    curl_close($parallelOne);
    curl_close($parallelTwo);
    curl_multi_close($multi);
    $parallelOrdersAfter = (int) $pdo->query("SELECT COUNT(*) FROM orders WHERE user_id = {$userIds[0]}")->fetchColumn();
    $assert(
        ($parallelStatuses === [201, 201] || $parallelStatuses === [201, 409])
            && $parallelOrdersAfter === $parallelOrdersBefore + 1,
        'Parallel identical order requests must create exactly one order.'
    );

    $notificationCount = $pdo->prepare(
        "SELECT COUNT(*) FROM notifications
         WHERE order_id = :order_id AND title = 'New order'
         AND user_id IN (:owner_a, :owner_b)"
    );
    $notificationCount->execute([
        'order_id' => $idempotentOrderId,
        'owner_a' => $userIds[2],
        'owner_b' => $userIds[3],
    ]);
    $newOrderNotificationCount = (int) $notificationCount->fetchColumn();
    $assert($newOrderNotificationCount === 2,
        'The replayed order response must not create duplicate New order notifications for the two owners; count='
            . $newOrderNotificationCount . ' order=' . $idempotentOrderId);
    $confirmKey = bin2hex(random_bytes(16));
    $confirmFirst = $ownerA->request(
        'POST',
        '/api/v1/owner/orders/' . $idempotentOrderId . '/actions',
        ['action' => 'confirm_cash'],
        true,
        $confirmKey
    );
    $confirmReplay = $ownerA->request(
        'POST',
        '/api/v1/owner/orders/' . $idempotentOrderId . '/actions',
        ['action' => 'confirm_cash'],
        true,
        $confirmKey
    );
    $saleCount = $pdo->prepare("SELECT COUNT(*) FROM stock_movements WHERE order_id = :order_id AND type = 'sale'");
    $saleCount->execute(['order_id' => $idempotentOrderId]);
    $assert(
        $confirmFirst['status'] === 200
            && $confirmReplay['status'] === 200
            && $confirmReplay['body'] === $confirmFirst['body']
            && (int) $saleCount->fetchColumn() === 1,
        'Repeating an owner order action must replay once and create exactly one stock movement.'
    );
    $ownerOrderNotifications = $pdo->prepare(
        "SELECT COUNT(*) FROM notifications WHERE order_id = :order_id AND title = 'New order' AND user_id IN (:first, :second)"
    );
    $ownerOrderNotifications->execute(['order_id' => $placedOrderId, 'first' => $userIds[2], 'second' => $userIds[3]]);
    $assert($placedOrderId > 0 && (int) $ownerOrderNotifications->fetchColumn() === 2, 'Placing an order must notify every owner once.');
    $confirmCashOrder = $ownerA->request('POST', '/api/v1/owner/orders/' . $placedOrderId . '/actions', ['action' => 'confirm_cash']);
    $assert($confirmCashOrder['status'] === 200, 'A newly placed cash order can be confirmed.');

    $pdo->prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (:user_id, :product_id, 1)')
        ->execute(['user_id' => $userIds[0], 'product_id' => $productId]);
    $parallelActionOrder = $customer->request('POST', '/api/v1/orders', [
        'fulfillment' => 'pickup', 'paymentMethod' => 'cash_pickup', 'name' => 'Parallel Action', 'phone' => '5550000',
    ]);
    $parallelActionOrderId = (int) ($parallelActionOrder['json']['order']['databaseId'] ?? 0);
    if ($parallelActionOrderId > 0) {
        $orderIds[] = $parallelActionOrderId;
    }
    $parallelActionKey = bin2hex(random_bytes(16));
    $parallelActionPayload = ['action' => 'confirm_cash'];
    $pActionOne = $ownerA->asyncHandle('/api/v1/owner/orders/' . $parallelActionOrderId . '/actions', $parallelActionPayload, $parallelActionKey);
    $pActionTwo = $ownerA->asyncHandle('/api/v1/owner/orders/' . $parallelActionOrderId . '/actions', $parallelActionPayload, $parallelActionKey);
    $multiAction = curl_multi_init();
    curl_multi_add_handle($multiAction, $pActionOne);
    curl_multi_add_handle($multiAction, $pActionTwo);
    do {
        $mStatus = curl_multi_exec($multiAction, $running);
        if ($running) curl_multi_select($multiAction, 1.0);
    } while ($running && $mStatus === CURLM_OK);
    $parallelActionStatuses = [
        (int) curl_getinfo($pActionOne, CURLINFO_RESPONSE_CODE),
        (int) curl_getinfo($pActionTwo, CURLINFO_RESPONSE_CODE),
    ];
    sort($parallelActionStatuses);
    curl_multi_remove_handle($multiAction, $pActionOne);
    curl_multi_remove_handle($multiAction, $pActionTwo);
    curl_close($pActionOne);
    curl_close($pActionTwo);
    curl_multi_close($multiAction);
    $parallelSaleCount = $pdo->prepare("SELECT COUNT(*) FROM stock_movements WHERE order_id = :order_id AND type = 'sale'");
    $parallelSaleCount->execute(['order_id' => $parallelActionOrderId]);
    $assert(
        ($parallelActionStatuses === [200, 200] || $parallelActionStatuses === [200, 409])
            && (int) $parallelSaleCount->fetchColumn() === 1,
        'Parallel identical payment action requests must create exactly one stock movement.'
    );

    $parallelStockKey = bin2hex(random_bytes(16));
    $parallelStockPayload = [
        'productId' => $productId,
        'quantity' => 4,
        'type' => 'restock',
        'reason' => 'Parallel restock test',
    ];
    $stockBefore = (int) $pdo->query("SELECT stock FROM products WHERE id = {$productId}")->fetchColumn();
    $movementsBefore = (int) $pdo->query("SELECT COUNT(*) FROM stock_movements WHERE product_id = {$productId}")->fetchColumn();
    $pStockOne = $ownerA->asyncHandle('/api/v1/owner/inventory/movements', $parallelStockPayload, $parallelStockKey);
    $pStockTwo = $ownerA->asyncHandle('/api/v1/owner/inventory/movements', $parallelStockPayload, $parallelStockKey);
    $multiStock = curl_multi_init();
    curl_multi_add_handle($multiStock, $pStockOne);
    curl_multi_add_handle($multiStock, $pStockTwo);
    do {
        $mStatus = curl_multi_exec($multiStock, $running);
        if ($running) curl_multi_select($multiStock, 1.0);
    } while ($running && $mStatus === CURLM_OK);
    $parallelStockStatuses = [
        (int) curl_getinfo($pStockOne, CURLINFO_RESPONSE_CODE),
        (int) curl_getinfo($pStockTwo, CURLINFO_RESPONSE_CODE),
    ];
    sort($parallelStockStatuses);
    curl_multi_remove_handle($multiStock, $pStockOne);
    curl_multi_remove_handle($multiStock, $pStockTwo);
    curl_close($pStockOne);
    curl_close($pStockTwo);
    curl_multi_close($multiStock);
    $stockAfter = (int) $pdo->query("SELECT stock FROM products WHERE id = {$productId}")->fetchColumn();
    $movementsAfter = (int) $pdo->query("SELECT COUNT(*) FROM stock_movements WHERE product_id = {$productId}")->fetchColumn();
    $assert(
        ($parallelStockStatuses === [200, 200] || $parallelStockStatuses === [200, 409])
            && $movementsAfter === $movementsBefore + 1
            && $stockAfter === $stockBefore + 4,
        'Parallel identical stock change requests must create exactly one movement and update stock once.'
    );

    $setDeliveryFee = $ownerA->request('PATCH', '/api/v1/owner/settings', ['deliveryFee' => 12.5]);
    $pdo->prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (:user_id, :product_id, 1)')
        ->execute(['user_id' => $userIds[0], 'product_id' => $productId]);
    $deliveryOrder = $customer->request('POST', '/api/v1/orders', [
        'fulfillment' => 'delivery', 'paymentMethod' => 'cod', 'name' => 'Test', 'phone' => '5550000', 'address' => 'Test address',
    ]);
    $deliveryOrderId = (int) ($deliveryOrder['json']['order']['databaseId'] ?? 0);
    if ($deliveryOrderId > 0) {
        $orderIds[] = $deliveryOrderId;
    }
    $deliverySnapshot = $pdo->prepare('SELECT subtotal, delivery_fee, total FROM orders WHERE id = :id');
    $deliverySnapshot->execute(['id' => $deliveryOrderId]);
    $deliverySnapshotRow = $deliverySnapshot->fetch(PDO::FETCH_ASSOC);
    $assert(
        $setDeliveryFee['status'] === 200 && $deliveryOrder['status'] === 201
            && is_array($deliverySnapshotRow)
            && number_format((float) $deliverySnapshotRow['delivery_fee'], 2, '.', '') === '12.50'
            && number_format((float) $deliverySnapshotRow['total'] - (float) $deliverySnapshotRow['subtotal'], 2, '.', '') === '12.50',
        'Delivery orders must snapshot the configured fee in their stored total.'
    );
    $cancelDeliveryOrder = $customer->request('POST', '/api/v1/orders/' . $deliveryOrderId . '/cancel', ['reason' => 'API test cleanup']);
    $assert($cancelDeliveryOrder['status'] === 200, 'A pending delivery order can be cancelled by its customer.');

    $seed = random_int(1000, 9999999);
    mt_srand($seed);
    $startingStock = 15;
    $pdo->prepare('UPDATE products SET stock = :stock WHERE id = :id')->execute(['stock' => $startingStock, 'id' => $productId]);
    $movementBaseline = $pdo->prepare('SELECT COALESCE(MAX(id), 0) FROM stock_movements WHERE product_id = :id');
    $movementBaseline->execute(['id' => $productId]);
    $movementStartId = (int) $movementBaseline->fetchColumn();
    $assertStockInvariant = static function (string $operation) use ($pdo, $productId, $movementStartId, $startingStock, $assert): void {
        $stockQuery = $pdo->prepare('SELECT stock FROM products WHERE id = :id');
        $stockQuery->execute(['id' => $productId]);
        $actualStock = (int) $stockQuery->fetchColumn();
        $movementQuery = $pdo->prepare('SELECT COALESCE(SUM(change_qty), 0) FROM stock_movements WHERE product_id = :id AND id > :start_id');
        $movementQuery->execute(['id' => $productId, 'start_id' => $movementStartId]);
        $movementTotal = (int) $movementQuery->fetchColumn();
        $assert($actualStock >= 0, 'Randomized stock invariant must never permit negative stock after ' . $operation . '.');
        $assert(
            $actualStock === $startingStock + $movementTotal,
            'Stock must equal the starting stock plus logged changes after ' . $operation . '.'
        );
    };
    $randomQuantity = mt_rand(1, 3);
    $pdo->prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (:user_id, :product_id, :qty)')
        ->execute(['user_id' => $userIds[0], 'product_id' => $productId, 'qty' => $randomQuantity]);
    $randomCashCheckout = $customer->request('POST', '/api/v1/orders', [
        'fulfillment' => 'pickup', 'paymentMethod' => 'cash_pickup', 'name' => 'Test', 'phone' => '5550000',
    ]);
    $randomCashOrderId = (int) ($randomCashCheckout['json']['order']['databaseId'] ?? 0);
    if ($randomCashOrderId > 0) {
        $orderIds[] = $randomCashOrderId;
    }
    $assert($randomCashCheckout['status'] === 201 && $randomCashOrderId > 0, 'Randomized stock invariant must create its cash checkout order.');
    $assertStockInvariant('checkout');
    $cashConfirmed = $ownerA->request('POST', '/api/v1/owner/orders/' . $randomCashOrderId . '/actions', ['action' => 'confirm_cash']);
    $assert($cashConfirmed['status'] === 200, 'Randomized stock invariant must confirm cash orders.');
    $assertStockInvariant('cash confirmation');

    $randomGcashOrderId = $createOrder($userIds[0], $productId, 'STOCKGC', 'gcash', 'under_review');
    $randomProof = $pdo->prepare(
        "INSERT INTO payment_proofs (order_id, reference_no, image_path, amount, status)
         VALUES (:order_id, :reference, 'private/uploads/payment-proofs/test-fixture.jpg', 10, 'under_review')"
    );
    $randomProof->execute(['order_id' => $randomGcashOrderId, 'reference' => $tag . 'STOCKGC']);
    $proofIds[] = (int) $pdo->lastInsertId();
    $gcashApproved = $ownerA->request('POST', '/api/v1/owner/orders/' . $randomGcashOrderId . '/actions', ['action' => 'approve_proof']);
    $assert($gcashApproved['status'] === 200, 'Randomized stock invariant must approve GCash proof.');
    $assertStockInvariant('GCash approval');
    $gcashCancelled = $ownerA->request('POST', '/api/v1/owner/orders/' . $randomGcashOrderId . '/actions', [
        'action' => 'cancel', 'reason' => 'Random invariant cancellation',
    ]);
    $assert($gcashCancelled['status'] === 200, 'Owner cancellation after stock deduction must succeed.');
    $assertStockInvariant('owner cancellation and stock return');
    $cashCancelled = $ownerA->request('POST', '/api/v1/owner/orders/' . $randomCashOrderId . '/actions', [
        'action' => 'cancel', 'reason' => 'Random invariant cash cancellation',
    ]);
    $assert($cashCancelled['status'] === 200, 'Confirmed cash order cancellation must succeed.');
    $assertStockInvariant('cash cancellation and stock return');

    $restockAmount = mt_rand(2, 5);
    $randomRestock = $ownerA->request('POST', '/api/v1/owner/inventory/movements', [
        'productId' => $productId, 'quantity' => $restockAmount, 'type' => 'restock',
        'reason' => $stockTestNote, 'note' => 'randomized restock ' . $seed,
    ]);
    $assert($randomRestock['status'] === 200, 'Randomized stock invariant restock must succeed.');
    $assertStockInvariant('restock');
    $adjustmentAmount = mt_rand(1, min(3, $startingStock + $restockAmount - 1));
    $randomAdjustment = $ownerA->request('POST', '/api/v1/owner/inventory/movements', [
        'productId' => $productId, 'quantity' => -$adjustmentAmount, 'type' => 'adjustment',
        'reason' => $stockTestNote, 'note' => 'randomized adjustment ' . $seed,
    ]);
    $assert($randomAdjustment['status'] === 200, 'Randomized stock invariant adjustment must succeed.');
    $assertStockInvariant('adjustment');
    $overAdjustment = $ownerA->request('POST', '/api/v1/owner/inventory/movements', [
        'productId' => $productId, 'quantity' => -100000, 'type' => 'adjustment',
        'reason' => $stockTestNote, 'note' => 'must not go negative', 'confirmedLargeChange' => true,
    ]);
    $assert($overAdjustment['status'] === 409, 'Stock invariant must reject an adjustment that would go below zero.');
    $assertStockInvariant('rejected below-zero adjustment');

    $pendingCancelQuantity = mt_rand(1, min(2, (int) $randomAdjustment['json']['stock']));
    $pdo->prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (:user_id, :product_id, :qty)')
        ->execute(['user_id' => $userIds[0], 'product_id' => $productId, 'qty' => $pendingCancelQuantity]);
    $pendingCheckout = $customer->request('POST', '/api/v1/orders', [
        'fulfillment' => 'pickup', 'paymentMethod' => 'cash_pickup', 'name' => 'Test', 'phone' => '5550000',
    ]);
    $pendingCancelId = (int) ($pendingCheckout['json']['order']['databaseId'] ?? 0);
    if ($pendingCancelId > 0) {
        $orderIds[] = $pendingCancelId;
    }
    $assert($pendingCheckout['status'] === 201 && $pendingCancelId > 0, 'Invariant customer-cancel fixture must be placed successfully.');
    $customerCancelled = $customer->request('POST', '/api/v1/orders/' . $pendingCancelId . '/cancel', ['reason' => 'Pending cancellation invariant']);
    $assert($customerCancelled['status'] === 200, 'Customer cancellation while Pending must succeed.');
    $assertStockInvariant('customer cancellation before deduction');

    for ($iteration = 1; $iteration <= 8; $iteration++) {
        $stockQuery = $pdo->prepare('SELECT stock FROM products WHERE id = :id');
        $stockQuery->execute(['id' => $productId]);
        $before = (int) $stockQuery->fetchColumn();
        $isRestock = (bool) mt_rand(0, 1);
        $quantity = $isRestock ? mt_rand(1, 4) : -mt_rand(1, min(3, max(1, $before - 1)));
        $movement = $ownerA->request('POST', '/api/v1/owner/inventory/movements', [
            'productId' => $productId, 'quantity' => $quantity, 'type' => $isRestock ? 'restock' : 'adjustment',
            'reason' => $stockTestNote, 'note' => 'random operation ' . $seed . '-' . $iteration,
        ]);
        $assert($movement['status'] === 200, 'Randomized stock movement ' . $iteration . ' must succeed (seed ' . $seed . ').');
        $assertStockInvariant('random operation ' . $iteration . ' (seed ' . $seed . ')');
    }
    fwrite(STDOUT, "Randomized stock-to-log invariant test passed (checkout, GCash approval, cash confirmation, cancellation, restock, adjustment; seed {$seed}).\n");

    $fakeUploadOrder = $createOrder($userIds[0], $productId, 'UP', 'gcash', 'unpaid');
    $fakeFile = tempnam(sys_get_temp_dir(), 'aquatica-fake-image-');
    $temporaryFiles[] = $fakeFile;
    file_put_contents($fakeFile, '<?php echo "not an image";');
    $fakeUpload = $customer->request('POST', '/api/v1/orders/' . $fakeUploadOrder . '/payment-proof', [
        'reference' => strtoupper(substr($tag, 0, 8)) . 'FAKE',
        'proof' => new CURLFile($fakeFile, 'image/jpeg', 'fake.jpg'),
    ]);
    $assert(
        $fakeUpload['status'] === 422,
        'A PHP payload renamed to JPG must be rejected by MIME validation; got '
            . $fakeUpload['status'] . ': ' . $fakeUpload['body']
    );
    file_put_contents($fakeFile, 'This is not an image.');
    $wrongTypeUpload = $customer->request('POST', '/api/v1/orders/' . $fakeUploadOrder . '/payment-proof', [
        'reference' => strtoupper(substr($tag, 0, 8)) . 'TYPE',
        'proof' => new CURLFile($fakeFile, 'text/plain', 'proof.txt'),
    ]);
    $assert($wrongTypeUpload['status'] === 422, 'A non-image content type must be rejected.');
    file_put_contents($fakeFile, str_repeat('A', 2 * 1024 * 1024 + 1));
    $oversizeUpload = $customer->request('POST', '/api/v1/orders/' . $fakeUploadOrder . '/payment-proof', [
        'reference' => strtoupper(substr($tag, 0, 8)) . 'BIGG',
        'proof' => new CURLFile($fakeFile, 'image/jpeg', 'oversize.jpg'),
    ]);
    $assert($oversizeUpload['status'] === 422, 'An upload larger than 2 MB must be rejected.');
    unlink($fakeFile);

    $validImageFile = tempnam(sys_get_temp_dir(), 'aquatica-valid-image-');
    $temporaryFiles[] = $validImageFile;
    $image = imagecreatetruecolor(2, 2);
    if ($image === false || !imagepng($image, $validImageFile)) {
        throw new RuntimeException('Could not generate the known-good PNG upload fixture.');
    }
    imagedestroy($image);
    $appendedPhpOrder = $createOrder($userIds[0], $productId, 'APPEND', 'gcash', 'unpaid');
    file_put_contents($validImageFile, '<?php echo "blocked";', FILE_APPEND);
    $appendedPhp = $customer->request('POST', '/api/v1/orders/' . $appendedPhpOrder . '/payment-proof', [
        'reference' => strtoupper(substr($tag, 0, 8)) . 'PHP1',
        'proof' => new CURLFile($validImageFile, 'image/png', 'image.png'),
    ]);
    $assert(
        $appendedPhp['status'] === 422,
        'A valid image with appended PHP code must be rejected; got '
            . $appendedPhp['status'] . ': ' . $appendedPhp['body']
    );
    file_put_contents($validImageFile, '');
    $image = imagecreatetruecolor(2, 2);
    if ($image === false || !imagepng($image, $validImageFile)) {
        throw new RuntimeException('Could not regenerate the known-good PNG upload fixture.');
    }
    imagedestroy($image);
    if (is_string($settingsBefore['gcash_qr_path'] ?? null) && $settingsBefore['gcash_qr_path'] !== '') {
        $originalQrPath = $settingsBefore['gcash_qr_path'];
        $originalQrFile = dirname(__DIR__) . '/' . $originalQrPath;
        if (is_file($originalQrFile)) {
            $originalQrBackup = tempnam(sys_get_temp_dir(), 'aquatica-old-qr-');
            if ($originalQrBackup === false || !copy($originalQrFile, $originalQrBackup)) {
                throw new RuntimeException('Could not preserve the pre-existing QR upload fixture.');
            }
            $temporaryFiles[] = $originalQrBackup;
        }
    }
    $qrUpload = $ownerA->request('POST', '/api/v1/owner/settings/gcash-qr', [
        'qr' => new CURLFile($validImageFile, 'image/png', 'qr.png'),
    ]);
    $assert($qrUpload['status'] === 200, 'Owners must be able to upload a valid GCash QR image.');
    $newQrPath = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'gcash_qr_path'")->fetchColumn();
    $uploadedPaths[] = (string) $newQrPath;
    $ownerQr = $ownerA->request('GET', '/api/v1/owner/settings/gcash-qr');
    $customerQr = $customer->request('GET', '/api/v1/settings/gcash-qr');
    $assert(
        $ownerQr['status'] === 200 && str_contains($ownerQr['contentType'], 'image/png')
            && $customerQr['status'] === 200 && str_contains($customerQr['contentType'], 'image/png'),
        'The verified QR image must be readable by authorized owner and customer sessions.'
    );
    $qrAudit = $pdo->prepare("SELECT COUNT(*) FROM audit_log WHERE user_id = :user_id AND action = 'settings.gcash_qr_updated'");
    $qrAudit->execute(['user_id' => $userIds[2]]);
    $assert((int) $qrAudit->fetchColumn() === 1, 'GCash QR uploads must be audited.');
    $validUploadOrder = $createOrder($userIds[0], $productId, 'GOOD', 'gcash', 'unpaid');
    $validUpload = $customer->request('POST', '/api/v1/orders/' . $validUploadOrder . '/payment-proof', [
        'reference' => strtoupper(substr($tag, 0, 8)) . 'GOOD',
        'proof' => new CURLFile($validImageFile, 'image/png', 'image.png'),
    ]);
    $assert($validUpload['status'] === 201, 'A valid PNG image within the size limit must be accepted.');
    $ownerProofNotifications = $pdo->prepare(
        "SELECT COUNT(*) FROM notifications WHERE order_id = :order_id AND title = 'GCash proof submitted' AND user_id IN (:first, :second)"
    );
    $ownerProofNotifications->execute(['order_id' => $validUploadOrder, 'first' => $userIds[2], 'second' => $userIds[3]]);
    $assert((int) $ownerProofNotifications->fetchColumn() === 2, 'Submitting GCash proof must notify every owner once.');
    $pathStatement = $pdo->prepare('SELECT image_path FROM payment_proofs WHERE order_id = :id');
    $pathStatement->execute(['id' => $validUploadOrder]);
    $uploadedPaths[] = (string) $pathStatement->fetchColumn();

    $parallelProofOrder = $createOrder($userIds[0], $productId, 'PARPROOF', 'gcash', 'unpaid');
    $parallelProofKey = bin2hex(random_bytes(16));
    $parallelProofData = [
        'reference' => strtoupper(substr($tag, 0, 8)) . 'PPRF',
        'proof' => new CURLFile($validImageFile, 'image/png', 'proof.png'),
    ];
    $proofsBefore = (int) $pdo->query("SELECT COUNT(*) FROM payment_proofs WHERE order_id = {$parallelProofOrder}")->fetchColumn();
    $pProofOne = $customer->asyncHandle('/api/v1/orders/' . $parallelProofOrder . '/payment-proof', $parallelProofData, $parallelProofKey, true);
    $pProofTwo = $customer->asyncHandle('/api/v1/orders/' . $parallelProofOrder . '/payment-proof', $parallelProofData, $parallelProofKey, true);
    $multiProof = curl_multi_init();
    curl_multi_add_handle($multiProof, $pProofOne);
    curl_multi_add_handle($multiProof, $pProofTwo);
    do {
        $mStatus = curl_multi_exec($multiProof, $running);
        if ($running) curl_multi_select($multiProof, 1.0);
    } while ($running && $mStatus === CURLM_OK);
    $parallelProofStatuses = [
        (int) curl_getinfo($pProofOne, CURLINFO_RESPONSE_CODE),
        (int) curl_getinfo($pProofTwo, CURLINFO_RESPONSE_CODE),
    ];
    sort($parallelProofStatuses);
    curl_multi_remove_handle($multiProof, $pProofOne);
    curl_multi_remove_handle($multiProof, $pProofTwo);
    curl_close($pProofOne);
    curl_close($pProofTwo);
    curl_multi_close($multiProof);
    $proofsAfter = (int) $pdo->query("SELECT COUNT(*) FROM payment_proofs WHERE order_id = {$parallelProofOrder}")->fetchColumn();
    $parallelProofPathStmt = $pdo->prepare('SELECT image_path FROM payment_proofs WHERE order_id = :order_id');
    $parallelProofPathStmt->execute(['order_id' => $parallelProofOrder]);
    $uploadedPaths[] = (string) $parallelProofPathStmt->fetchColumn();
    $assert(
        ($parallelProofStatuses === [201, 201] || $parallelProofStatuses === [201, 409])
            && $proofsAfter === $proofsBefore + 1,
        'Parallel identical proof upload requests must create exactly one payment proof record.'
    );
    $gifUploadFile = tempnam(sys_get_temp_dir(), 'aquatica-valid-gif-');
    $temporaryFiles[] = $gifUploadFile;
    $gif = imagecreatetruecolor(2, 2);
    if ($gif === false || !imagegif($gif, $gifUploadFile)) {
        throw new RuntimeException('Could not generate the known-good GIF upload fixture.');
    }
    imagedestroy($gif);
    $gifUploadOrder = $createOrder($userIds[0], $productId, 'GIF', 'gcash', 'unpaid');
    $gifUpload = $customer->request('POST', '/api/v1/orders/' . $gifUploadOrder . '/payment-proof', [
        'reference' => strtoupper(substr($tag, 0, 8)) . 'GIF1',
        'proof' => new CURLFile($gifUploadFile, 'image/gif', 'image.gif'),
    ]);
    $assert($gifUpload['status'] === 201, 'A valid GIF image within the size limit must be accepted.');
    $gifPathStatement = $pdo->prepare('SELECT image_path FROM payment_proofs WHERE order_id = :id');
    $gifPathStatement->execute(['id' => $gifUploadOrder]);
    $gifImagePath = (string) $gifPathStatement->fetchColumn();
    $uploadedPaths[] = $gifImagePath;
    $gifProofImage = $customer->request('GET', '/api/v1/orders/' . $gifUploadOrder . '/payment-proof/image');
    $assert(
        $gifProofImage['status'] === 200 && str_contains($gifProofImage['contentType'], 'image/png')
            && str_ends_with($gifImagePath, '.png'),
        'A supported non-PNG/JPG image must be normalized to a safe PNG for display.'
    );

    $productImageCustomer = $customer->request('POST', '/api/v1/owner/products/' . $productId . '/image', [
        'image' => new CURLFile($validImageFile, 'image/png', 'customer.png'),
    ]);
    $assert($productImageCustomer['status'] === 403,
        'Customers must not upload product images.');
    $productImageUpload = $ownerA->request('POST', '/api/v1/owner/products/' . $productId . '/image', [
        'image' => new CURLFile($validImageFile, 'image/png', 'product.png'),
    ]);
    $assert($productImageUpload['status'] === 201,
        'Owners must be able to upload a valid product image.');
    $productImageRow = $pdo->prepare('SELECT image_path FROM products WHERE id = :id');
    $productImageRow->execute(['id' => $productId]);
    $firstProductImage = (string) $productImageRow->fetchColumn();
    $uploadedPaths[] = $firstProductImage;
    $productImageReplace = $ownerA->request('POST', '/api/v1/owner/products/' . $productId . '/image', [
        'image' => new CURLFile($validImageFile, 'image/png', 'product-replacement.png'),
    ]);
    $assert($productImageReplace['status'] === 201,
        'Owners must be able to replace a product image.');
    $productImageRow->execute(['id' => $productId]);
    $secondProductImage = (string) $productImageRow->fetchColumn();
    $uploadedPaths[] = $secondProductImage;
    $assert($secondProductImage !== '' && $secondProductImage !== $firstProductImage
        && !is_file(dirname(__DIR__) . '/' . $firstProductImage),
        'Replacing a product image must change the reference and delete the old file.');
    $phpNamedImage = tempnam(sys_get_temp_dir(), 'aquatica-product-php-');
    $temporaryFiles[] = $phpNamedImage;
    file_put_contents($phpNamedImage, '<?php echo "blocked";');
    $renamedPhpImage = $ownerA->request('POST', '/api/v1/owner/products/' . $productId . '/image', [
        'image' => new CURLFile($phpNamedImage, 'image/jpeg', 'payload.jpg'),
    ]);
    $assert($renamedPhpImage['status'] === 422,
        'PHP payloads renamed as JPG must be rejected for product images.');
    $appendedImage = tempnam(sys_get_temp_dir(), 'aquatica-product-appended-');
    $temporaryFiles[] = $appendedImage;
    copy($validImageFile, $appendedImage);
    file_put_contents($appendedImage, '<?php echo "blocked";', FILE_APPEND);
    $appendedProductImage = $ownerA->request('POST', '/api/v1/owner/products/' . $productId . '/image', [
        'image' => new CURLFile($appendedImage, 'image/png', 'appended.png'),
    ]);
    $assert($appendedProductImage['status'] === 422,
        'Appended payloads must be rejected for product images.');
    $wrongTypeProductImage = $ownerA->request('POST', '/api/v1/owner/products/' . $productId . '/image', [
        'image' => new CURLFile($phpNamedImage, 'text/plain', 'image.txt'),
    ]);
    $assert($wrongTypeProductImage['status'] === 422,
        'Wrong content types must be rejected for product images.');
    $oversizeProductImage = tempnam(sys_get_temp_dir(), 'aquatica-product-large-');
    $temporaryFiles[] = $oversizeProductImage;
    file_put_contents($oversizeProductImage, str_repeat('A', 2 * 1024 * 1024 + 1));
    $oversizeProductUpload = $ownerA->request('POST', '/api/v1/owner/products/' . $productId . '/image', [
        'image' => new CURLFile($oversizeProductImage, 'image/png', 'oversize.png'),
    ]);
    $assert($oversizeProductUpload['status'] === 422,
        'Product images over 2 MB must be rejected.');
    $productImageRemove = $ownerA->request('DELETE', '/api/v1/owner/products/' . $productId . '/image');
    $assert($productImageRemove['status'] === 200,
        'Owners must be able to remove a product image.');
    $productImageRow->execute(['id' => $productId]);
    $removedProductImage = $productImageRow->fetchColumn();
    $assert(
        $removedProductImage === null
            && !is_file(dirname(__DIR__) . '/' . $secondProductImage),
        'Removing a product image must clear the database reference and delete the file.');
    if ($secondProductImage !== '') {
        $uploadedPaths[] = $secondProductImage;
    }
    $duplicateReferenceOrder = $createOrder($userIds[1], $productId, 'DUPREF', 'gcash', 'unpaid');
    $duplicateReference = $otherCustomer->request('POST', '/api/v1/orders/' . $duplicateReferenceOrder . '/payment-proof', [
        'reference' => strtoupper(substr($tag, 0, 8)) . 'GOOD',
        'proof' => new CURLFile($validImageFile, 'image/png', 'image.png'),
    ]);
    $assert($duplicateReference['status'] === 409, 'A GCash reference number must not be reusable.');

    $cookieResponse = $customer->request('GET', '/api/auth/session.php');
    $assert($cookieResponse['status'] === 200, 'A valid session should remain authenticated.');
    $sessionCookie = $customer->sessionCookieHeader;
    $assert(str_contains($sessionCookie, 'HttpOnly') && str_contains($sessionCookie, 'SameSite=Strict'), 'Session cookie must be HttpOnly and SameSite=Strict.');
    $pdo->prepare('UPDATE users SET session_version = session_version + 1 WHERE id = :id')->execute(['id' => $userIds[1]]);
    $revokedSession = $otherCustomer->request('GET', '/api/auth/session.php');
    $assert(($revokedSession['json']['user'] ?? null) === null, 'A stale session version must be invalidated.');
    $logout = $customer->request('POST', '/api/auth/logout.php', []);
    $assert($logout['status'] === 200, 'Logout should complete successfully.');
    $loggedOut = $customer->request('GET', '/api/auth/session.php', null, false);
    $assert(($loggedOut['json']['user'] ?? null) === null, 'Logout must invalidate the previous session.');

    $rateEmail = "rate-{$tag}@example.test";
    $rateBaseUrl = str_replace('127.0.0.1', '127.0.0.2', $baseUrl);
    for ($attempt = 1; $attempt <= 5; $attempt++) {
        $rateClient = new ApiTestClient($rateBaseUrl, $rateEmail, 'invalid-password', $cookieFiles);
        $rateCsrf = $rateClient->request('GET', '/api/auth/csrf.php', null, false);
        $rateClient->csrfToken = (string) ($rateCsrf['json']['csrfToken'] ?? '');
        $rateResult = $rateClient->request('POST', '/api/auth/login.php', ['email' => $rateEmail, 'password' => 'wrong']);
        $expected = $attempt === 5 ? 429 : 401;
        $assert($rateResult['status'] === $expected, 'Login rate limit response mismatch on attempt ' . $attempt . '.');
    }

    fwrite(STDOUT, "Named security cases passed: two-owner last-item approval race; approve-twice rejection; PHP renamed .jpg; oversize upload; wrong content type; appended PHP image payload; SQL injection search; CSRF rejection.\n");
    fwrite(STDOUT, "Commerce API security tests passed ({$assertions} assertions).\n");
} catch (Throwable $exception) {
    $failed = true;
    fwrite(STDERR, "Commerce API security tests failed after {$assertions} assertions: {$exception->getMessage()}\n");
} finally {
    foreach ($settingsBefore as $key => $value) {
        if ($value === false) {
            $pdo->prepare('DELETE FROM settings WHERE setting_key = :key')->execute(['key' => $key]);
        } else {
            $pdo->prepare(
                'INSERT INTO settings (setting_key, setting_value) VALUES (:key, :value)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
            )->execute(['key' => $key, 'value' => $value]);
        }
    }
    if ($originalQrPath !== null && $originalQrBackup !== null && is_file($originalQrBackup)) {
        $originalQrAbsolute = dirname(__DIR__) . '/' . $originalQrPath;
        if (!is_dir(dirname($originalQrAbsolute))) {
            mkdir(dirname($originalQrAbsolute), 0700, true);
        }
        copy($originalQrBackup, $originalQrAbsolute);
    }
    if ($productId && $oldStock !== null) {
        $pdo->prepare('UPDATE products SET stock = :stock, low_stock_threshold = :threshold WHERE id = :id')
            ->execute(['stock' => $oldStock, 'threshold' => $oldThreshold, 'id' => $productId]);
    }
    if ($productId) {
        $bulkMovementIds = $pdo->prepare(
            'SELECT movement_id FROM stock_change_archives WHERE product_id = :product_id'
        );
        $bulkMovementIds->execute(['product_id' => $productId]);
        $bulkIds = array_map('intval', $bulkMovementIds->fetchAll(PDO::FETCH_COLUMN));
        if ($bulkIds) {
            $placeholders = implode(',', array_fill(0, count($bulkIds), '?'));
            $pdo->prepare("DELETE FROM stock_change_archives WHERE movement_id IN ($placeholders)")
                ->execute($bulkIds);
            $pdo->prepare("DELETE FROM stock_movements WHERE id IN ($placeholders)")
                ->execute($bulkIds);
        }
    }
    if ($productId && $stockTestNote !== '') {
        $pdo->prepare('DELETE FROM stock_movements WHERE product_id = :id AND note LIKE :note')
            ->execute(['id' => $productId, 'note' => $stockTestNote . '%']);
        $existingIds = array_fill_keys($lowStockNotificationIdsBefore, true);
        $newLowStock = $pdo->prepare(
            "SELECT id FROM notifications WHERE title = 'Low stock' AND body LIKE :product"
        );
        $newLowStock->execute(['product' => '%(#' . $productId . ')%']);
        $deleteNotification = $pdo->prepare('DELETE FROM notifications WHERE id = :id');
        foreach ($newLowStock->fetchAll(PDO::FETCH_COLUMN) as $notificationId) {
            if (!isset($existingIds[(int) $notificationId])) {
                $deleteNotification->execute(['id' => $notificationId]);
            }
        }
    }
    foreach ($userIds as $cleanupUserId) {
        $cleanupOrders = $pdo->prepare('SELECT id FROM orders WHERE user_id = :id');
        $cleanupOrders->execute(['id' => $cleanupUserId]);
        foreach ($cleanupOrders->fetchAll(PDO::FETCH_COLUMN) as $cleanupOrderId) {
            $orderIds[] = (int) $cleanupOrderId;
        }
    }
    $orderIds = array_values(array_unique(array_map('intval', $orderIds)));
    foreach ($orderIds as $orderId) {
        $pdo->prepare('DELETE FROM notifications WHERE order_id = :id')->execute(['id' => $orderId]);
        $pdo->prepare('DELETE FROM audit_log WHERE entity = "order" AND entity_id = :id')->execute(['id' => (string) $orderId]);
        $pdo->prepare('DELETE FROM stock_movements WHERE order_id = :id')->execute(['id' => $orderId]);
        $pdo->prepare('DELETE FROM order_status_history WHERE order_id = :id')->execute(['id' => $orderId]);
        $pdo->prepare('DELETE FROM payment_proofs WHERE order_id = :id')->execute(['id' => $orderId]);
        $pdo->prepare('DELETE FROM order_items WHERE order_id = :id')->execute(['id' => $orderId]);
        $pdo->prepare('DELETE FROM orders WHERE id = :id')->execute(['id' => $orderId]);
    }
    foreach ($createdProductIds as $createdProductId) {
        $pdo->prepare('DELETE FROM audit_log WHERE entity = "product" AND entity_id = :id')->execute([
            'id' => (string) $createdProductId,
        ]);
        $pdo->prepare('DELETE FROM products WHERE id = :id')->execute(['id' => $createdProductId]);
    }
    foreach ($userIds as $userId) {
        $pdo->prepare('DELETE FROM cart_items WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('DELETE FROM notifications WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('DELETE FROM audit_log WHERE user_id = :id')->execute(['id' => $userId]);
        $pdo->prepare('DELETE FROM login_attempts WHERE identity_hash = :email_hash')->execute([
            'email_hash' => hash_hmac('sha256', "api-{$tag}-" . ['customer', 'other', 'owner-a', 'owner-b'][array_search($userId, $userIds, true)] . '@example.test', $config['app_key']),
        ]);
        $pdo->prepare('DELETE FROM users WHERE id = :id')->execute(['id' => $userId]);
    }
    $pdo->prepare('DELETE FROM login_attempts WHERE identity_hash = :email_hash')->execute([
        'email_hash' => hash_hmac('sha256', "rate-{$tag}@example.test", $config['app_key']),
    ]);
    $pdo->prepare('DELETE FROM login_attempts WHERE scope = "address" AND identity_hash = :address_hash')->execute([
        'address_hash' => hash_hmac('sha256', '127.0.0.1', $config['app_key']),
    ]);
    foreach ($cookieFiles as $cookieFile) {
        if (is_file($cookieFile)) {
            unlink($cookieFile);
        }
    }
    foreach ($temporaryFiles as $temporaryFile) {
        if (is_file($temporaryFile)) {
            unlink($temporaryFile);
        }
    }
    foreach ($uploadedPaths as $uploadedPath) {
        $absolutePath = dirname(__DIR__) . '/' . $uploadedPath;
        if (is_file($absolutePath)) {
            unlink($absolutePath);
        }
    }
}

if ($failed) {
    exit(1);
}
