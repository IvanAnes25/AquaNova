<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/database/connection.php';

if (PHP_SAPI !== 'cli' || getenv('APP_ENV') !== 'local') {
    fwrite(STDERR, "Real browser fixtures require local CLI mode.\n");
    exit(1);
}

$testDatabase = getenv('AQUATICA_TEST_DB_NAME');
$configuredDatabase = getenv('DB_NAME');
if (!is_string($testDatabase)
    || !preg_match('/^aquanova_test_[a-z0-9_]+$/', $testDatabase)
    || $configuredDatabase !== $testDatabase) {
    fwrite(STDERR, "Refusing to use a database other than the explicit aquanova_test_* database.\n");
    exit(1);
}

$pdo = database_connection();
if ((string) $pdo->query('SELECT DATABASE()')->fetchColumn() !== $testDatabase) {
    fwrite(STDERR, "The connected database does not match AQUATICA_TEST_DB_NAME.\n");
    exit(1);
}

$config = require dirname(__DIR__, 2) . '/private/auth.php';
$emit = static function (array $value): never {
    echo json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    exit(0);
};
$json = static function (string $encoded): array {
    $value = json_decode($encoded, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($value)) {
        throw new RuntimeException('Invalid fixture payload.');
    }
    return $value;
};
$action = $argv[1] ?? '';

if ($action === 'setup') {
    $tag = bin2hex(random_bytes(6));
    $password = bin2hex(random_bytes(12));
    $users = [];
    foreach (['owner', 'customer', 'secondCustomer'] as $key) {
        $role = $key === 'owner' ? 'owner' : 'customer';
        $email = "e2e-{$tag}-{$key}@example.test";
        $insert = $pdo->prepare(
            'INSERT INTO users (name, email, phone, password_hash, role, email_verified_at, must_change_password)
             VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), 0)'
        );
        $insert->execute([
            'E2E ' . $key,
            $email,
            '5550100',
            password_hash($password, PASSWORD_ARGON2ID, $config['argon2']),
            $role,
        ]);
        $users[$key] = ['id' => (int) $pdo->lastInsertId(), 'email' => $email, 'password' => $password, 'role' => $role];
    }

    $category = $pdo->query('SELECT id, name FROM categories ORDER BY id LIMIT 1')->fetch(PDO::FETCH_ASSOC);
    if (!$category) {
        throw new RuntimeException('The isolated database must have a product category.');
    }
    $products = [];
    foreach ([
        ['main', 'E2E Aquarium Supply ' . $tag, 20],
        ['short', 'E2E Short Stock ' . $tag, 1],
        ['xss', '<img src=x onerror=alert(1)> ' . $tag, 2],
    ] as [$key, $name, $stock]) {
        $slug = 'e2e-' . $tag . '-' . $key;
        $insert = $pdo->prepare(
            'INSERT INTO products
                (name, category, short_description, description, price, stock, image_url, featured, is_active,
                 category_id, slug, low_stock_threshold, image_path)
             VALUES (?, ?, ?, ?, 12.50, ?, \'\', 1, 1, ?, ?, 2, NULL)'
        );
        $insert->execute([$name, $category['name'], 'Browser test item', 'Isolated Playwright fixture.', $stock, $category['id'], $slug]);
        $products[$key] = ['id' => (int) $pdo->lastInsertId(), 'name' => $name, 'initialStock' => $stock, 'slug' => $slug];
    }

    $settingKeys = ['gcash_enabled', 'gcash_name', 'gcash_number', 'gcash_qr_path', 'cod_enabled',
        'cash_pickup_enabled', 'delivery_fee', 'shop_name', 'shop_address'];
    $settings = [];
    $findSetting = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = ?');
    foreach ($settingKeys as $key) {
        $findSetting->execute([$key]);
        $settings[$key] = $findSetting->fetchColumn();
    }
    $qrRelative = 'private/uploads/e2e-gcash-' . $tag . '.png';
    $qrAbsolute = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $qrRelative);
    if (!is_dir(dirname($qrAbsolute)) && !mkdir(dirname($qrAbsolute), 0750, true) && !is_dir(dirname($qrAbsolute))) {
        throw new RuntimeException('Could not create the isolated QR fixture directory.');
    }
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==', true);
    if (!is_string($png) || file_put_contents($qrAbsolute, $png) === false) {
        throw new RuntimeException('Could not write the isolated QR fixture image.');
    }
    $writeSetting = $pdo->prepare(
        'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
    );
    foreach ([
        'gcash_enabled' => '1',
        'gcash_name' => 'Aquatica Test',
        'gcash_number' => '09123456789',
        'gcash_qr_path' => $qrRelative,
        'cod_enabled' => '1',
        'cash_pickup_enabled' => '1',
        'delivery_fee' => '50.00',
        'shop_name' => 'Aquatica Test Shop',
        'shop_address' => 'Test pickup address',
    ] as $key => $value) {
        $writeSetting->execute([$key, $value]);
    }

    $date = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
    $emit([
        'tag' => $tag,
        'password' => $password,
        'users' => $users,
        'products' => $products,
        'settings' => $settings,
        'qrRelative' => $qrRelative,
        'reportDate' => $date,
        'database' => $testDatabase,
    ]);
}

if ($action === 'adjust-stock') {
    $fixture = $json($argv[2] ?? '');
    $productId = (int) ($argv[3] ?? 0);
    $delta = (int) ($argv[4] ?? 0);
    $productIds = array_map(static fn(array $product): int => (int) $product['id'], $fixture['products'] ?? []);
    if (!in_array($productId, $productIds, true) || $delta === 0) {
        throw new RuntimeException('Invalid isolated stock adjustment.');
    }
    $pdo->beginTransaction();
    try {
        $lock = $pdo->prepare('SELECT name, stock FROM products WHERE id = ? FOR UPDATE');
        $lock->execute([$productId]);
        $product = $lock->fetch(PDO::FETCH_ASSOC);
        $before = (int) ($product['stock'] ?? -1);
        $after = $before + $delta;
        if ($before < 0 || $after < 0) {
            throw new RuntimeException('Stock adjustment would produce a negative balance.');
        }
        $pdo->prepare('UPDATE products SET stock = ? WHERE id = ?')->execute([$after, $productId]);
        $ownerId = (int) $fixture['users']['owner']['id'];
        $pdo->prepare(
            "INSERT INTO stock_movements
             (product_id, product_name, movement_type, quantity_change, stock_before, stock_after, note,
              actor_user_id, change_qty, type, reason, order_id, user_id)
             VALUES (?, ?, 'Adjustment', ?, ?, ?, 'E2E short-stock setup', ?, ?, 'adjustment', 'E2E setup', NULL, ?)"
        )->execute([$productId, $product['name'], $delta, $before, $after, $ownerId, $delta, $ownerId]);
        $pdo->commit();
        $emit(['stock' => $after]);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}

if ($action === 'inspect') {
    $fixture = $json($argv[2] ?? '');
    $customerIds = [(int) $fixture['users']['customer']['id'], (int) $fixture['users']['secondCustomer']['id']];
    $userIds = [...$customerIds, (int) $fixture['users']['owner']['id']];
    $orderQuery = $pdo->prepare(
        'SELECT id, order_no, fulfillment, payment_method_v2 AS payment_method, order_status, payment_status_v2 AS payment_status,
                total, stock_deducted, cancel_reason, user_id
         FROM orders WHERE user_id IN (?, ?) ORDER BY created_at, id'
    );
    $orderQuery->execute($customerIds);
    $orders = $orderQuery->fetchAll(PDO::FETCH_ASSOC);
    $orderIds = array_map(static fn(array $order): int => (int) $order['id'], $orders);
    $proofs = [];
    $notifications = [];
    $movements = [];
    if ($orderIds) {
        $marks = implode(',', array_fill(0, count($orderIds), '?'));
        $proofQuery = $pdo->prepare(
            "SELECT order_id, reference_no, status, reject_reason FROM payment_proofs WHERE order_id IN ($marks) ORDER BY id"
        );
        $proofQuery->execute($orderIds);
        $proofs = $proofQuery->fetchAll(PDO::FETCH_ASSOC);
        $notificationQuery = $pdo->prepare(
            "SELECT user_id, order_id, title, body, read_at FROM notifications WHERE order_id IN ($marks) ORDER BY id"
        );
        $notificationQuery->execute($orderIds);
        $notifications = $notificationQuery->fetchAll(PDO::FETCH_ASSOC);
        $movementQuery = $pdo->prepare(
            "SELECT order_id, product_id, change_qty, type, reason FROM stock_movements WHERE order_id IN ($marks) ORDER BY id"
        );
        $movementQuery->execute($orderIds);
        $movements = $movementQuery->fetchAll(PDO::FETCH_ASSOC);
    }
    $stocks = [];
    foreach ($fixture['products'] as $key => $product) {
        $stock = $pdo->prepare('SELECT stock FROM products WHERE id = ?');
        $stock->execute([(int) $product['id']]);
        $sum = $pdo->prepare('SELECT COALESCE(SUM(change_qty), 0) FROM stock_movements WHERE product_id = ?');
        $sum->execute([(int) $product['id']]);
        $stocks[$key] = ['stock' => (int) $stock->fetchColumn(), 'movementSum' => (int) $sum->fetchColumn()];
    }
    $emit(['orders' => $orders, 'proofs' => $proofs, 'notifications' => $notifications, 'movements' => $movements, 'stocks' => $stocks]);
}

if ($action === 'cleanup') {
    $fixture = $json($argv[2] ?? '');
    if (($fixture['database'] ?? '') !== $testDatabase) {
        throw new RuntimeException('Cleanup payload does not match the isolated database.');
    }
    $customerIds = [(int) $fixture['users']['customer']['id'], (int) $fixture['users']['secondCustomer']['id']];
    $allUserIds = [...$customerIds, (int) $fixture['users']['owner']['id']];
    $orderQuery = $pdo->prepare('SELECT id FROM orders WHERE user_id IN (?, ?)');
    $orderQuery->execute($customerIds);
    $orderIds = array_map('intval', $orderQuery->fetchAll(PDO::FETCH_COLUMN));
    $proofPaths = [];
    if ($orderIds) {
        $marks = implode(',', array_fill(0, count($orderIds), '?'));
        $proofQuery = $pdo->prepare("SELECT image_path FROM payment_proofs WHERE order_id IN ($marks)");
        $proofQuery->execute($orderIds);
        $proofPaths = $proofQuery->fetchAll(PDO::FETCH_COLUMN);
    }
    $pdo->beginTransaction();
    try {
        if ($orderIds) {
            $marks = implode(',', array_fill(0, count($orderIds), '?'));
            foreach (['payment_proofs', 'order_status_history', 'notifications'] as $table) {
                $pdo->prepare("DELETE FROM `$table` WHERE order_id IN ($marks)")->execute($orderIds);
            }
            $pdo->prepare("DELETE FROM audit_log WHERE entity = 'order' AND entity_id IN ($marks)")->execute($orderIds);
            $pdo->prepare("DELETE FROM stock_movements WHERE order_id IN ($marks)")->execute($orderIds);
            $pdo->prepare("DELETE FROM order_items WHERE order_id IN ($marks)")->execute($orderIds);
            $pdo->prepare("DELETE FROM orders WHERE id IN ($marks)")->execute($orderIds);
        }
        $marks = implode(',', array_fill(0, count($allUserIds), '?'));
        $pdo->prepare("DELETE FROM cart_items WHERE user_id IN ($marks)")->execute($allUserIds);
        $pdo->prepare("DELETE FROM notifications WHERE user_id IN ($marks)")->execute($allUserIds);
        $pdo->prepare("DELETE FROM audit_log WHERE user_id IN ($marks)")->execute($allUserIds);
        foreach ($fixture['products'] as $product) {
            $pdo->prepare('DELETE FROM stock_movements WHERE product_id = ?')->execute([(int) $product['id']]);
            $pdo->prepare('DELETE FROM products WHERE id = ? AND slug = ?')->execute([(int) $product['id'], $product['slug']]);
        }
        foreach ($fixture['users'] as $user) {
            $pdo->prepare('DELETE FROM users WHERE id = ? AND email = ? AND role = ?')
                ->execute([(int) $user['id'], $user['email'], $user['role']]);
        }
        $restoreSetting = $pdo->prepare('UPDATE settings SET setting_value = ? WHERE setting_key = ?');
        $removeSetting = $pdo->prepare('DELETE FROM settings WHERE setting_key = ?');
        foreach ($fixture['settings'] as $key => $value) {
            if ($value === false) {
                $removeSetting->execute([$key]);
            } else {
                $restoreSetting->execute([$value, $key]);
            }
        }
        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
    foreach ($proofPaths as $relativePath) {
        if (is_string($relativePath) && str_starts_with($relativePath, 'private/uploads/payment-proofs/')) {
            $path = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
            if (is_file($path) && !unlink($path)) {
                throw new RuntimeException('Could not remove a generated proof image.');
            }
        }
    }
    $qr = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, (string) $fixture['qrRelative']);
    if (is_file($qr) && !unlink($qr)) {
        throw new RuntimeException('Could not remove the temporary QR image.');
    }
    $emit(['cleaned' => true]);
}

fwrite(STDERR, "Expected setup, adjust-stock, inspect, or cleanup.\n");
exit(2);
