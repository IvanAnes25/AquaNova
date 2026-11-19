<?php

declare(strict_types=1);

require_once __DIR__ . '/isolated_test_database.php';

$assertions = 0;
$assert = static function (bool $condition, string $message) use (&$assertions): void {
    $assertions++;
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

try {
    $pdo = isolated_test_database_connection();
    $migration = $pdo->prepare('SELECT COUNT(*) FROM schema_migrations WHERE migration = :migration');
    $migration->execute(['migration' => '20261111_commerce']);
    $assert((int) $migration->fetchColumn() === 1, 'Commerce migration is not recorded as applied.');
    $migrationDefinition = require dirname(__DIR__) . '/database/migrations/20261111_commerce.php';
    $migrationDefinition['up']($pdo);
    $migration->execute(['migration' => '20261111_commerce']);
    $assert((int) $migration->fetchColumn() === 1, 'Re-running the migration changed its applied state.');
    $idempotencyMigration = require dirname(__DIR__) . '/database/migrations/20261118_idempotency_requests.php';
    $idempotencyMigration['up']($pdo);
    $migration->execute(['migration' => '20261118_idempotency_requests']);
    $assert((int) $migration->fetchColumn() === 1, 'Idempotency migration is not recorded as applied.');
    $idempotencyReplayMigration = require dirname(__DIR__) . '/database/migrations/20261119_idempotency_replay.php';
    $idempotencyReplayMigration['up']($pdo);
    $migration->execute(['migration' => '20261119_idempotency_replay']);
    $assert((int) $migration->fetchColumn() === 1, 'Idempotency replay migration is not recorded as applied.');
    $stockImageMigration = require dirname(__DIR__) . '/database/migrations/20261120_stock_reason_image_archive.php';
    $stockImageMigration['up']($pdo);
    $migration->execute(['migration' => '20261120_stock_reason_image_archive']);
    $assert((int) $migration->fetchColumn() === 1, 'Stock reason and product image migration is not recorded as applied.');

    $requiredTables = [
        'categories', 'addresses', 'cart_items', 'payment_proofs', 'notifications', 'idempotency_requests', 'stock_change_archives',
        'audit_log', 'order_status_history',
    ];
    foreach ($requiredTables as $table) {
        $check = $pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND ENGINE = :engine'
        );
        $check->execute(['table_name' => $table, 'engine' => 'InnoDB']);
        $assert((int) $check->fetchColumn() === 1, "Missing InnoDB table: $table.");
    }

    $requiredColumns = [
        'users' => ['email_verified_at', 'must_change_password', 'failed_attempts', 'locked_until'],
        'products' => ['category_id', 'slug', 'low_stock_threshold', 'image_path'],
        'orders' => [
            'order_no', 'fulfillment', 'payment_method_v2', 'order_status', 'payment_status_v2',
            'delivery_fee', 'delivery_address_snapshot', 'delivery_by', 'stock_deducted',
            'cancelled_by', 'cancel_reason',
        ],
        'order_items' => ['name_snapshot', 'price_snapshot', 'qty'],
        'stock_movements' => ['change_qty', 'type', 'reason', 'order_id', 'user_id'],
        'idempotency_requests' => [
            'user_id', 'scope', 'endpoint', 'request_hash', 'payload_hash',
            'response_status', 'response_body', 'state', 'expires_at', 'completed_at',
        ],
    ];
    foreach ($requiredColumns as $table => $columns) {
        foreach ($columns as $column) {
            $check = $pdo->prepare(
                'SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name'
            );
            $check->execute(['table_name' => $table, 'column_name' => $column]);
            $assert((int) $check->fetchColumn() === 1, "Missing column: $table.$column.");
        }
    }

    $productCount = (int) $pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();
    $assert($productCount >= 20, 'Seed catalog should contain at least 20 products.');
    $invalidProducts = (int) $pdo->query(
        'SELECT COUNT(*) FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE c.id IS NULL OR p.slug = \'\''
    )->fetchColumn();
    $assert($invalidProducts === 0, 'Every product must have a category and slug.');
    $duplicateSlugs = (int) $pdo->query(
        'SELECT COUNT(*) FROM (
            SELECT slug FROM products GROUP BY slug HAVING COUNT(*) > 1
         ) duplicate_slugs'
    )->fetchColumn();
    $assert($duplicateSlugs === 0, 'Product slugs must be unique.');

    $unbalancedStock = (int) $pdo->query(
        'SELECT COUNT(*) FROM (
            SELECT p.id
            FROM products p
            LEFT JOIN stock_movements m ON m.product_id = p.id
            GROUP BY p.id, p.stock
            HAVING COALESCE(SUM(m.quantity_change), 0) <> p.stock
         ) unbalanced'
    )->fetchColumn();
    $assert($unbalancedStock === 0, 'Stock movement totals do not match product stock.');

    $testCustomers = $pdo->query(
        "SELECT email, role, must_change_password, password_hash
         FROM users WHERE email IN (
            'dev.customer1@example.test', 'dev.customer2@example.test'
         ) ORDER BY email"
    )->fetchAll();
    $assert(count($testCustomers) === 2, 'Expected exactly two development test customers.');
    foreach ($testCustomers as $customer) {
        $assert($customer['role'] === 'customer', 'A development test account must not have owner role.');
        $assert((int) $customer['must_change_password'] === 0, 'Development test customer has unexpected password state.');
        $assert(str_starts_with($customer['password_hash'], '$argon2id$'), 'Development customer password is not Argon2id hashed.');
    }

    $referenceIndex = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name
           AND INDEX_NAME = :index_name AND NON_UNIQUE = 0'
    );
    $referenceIndex->execute(['table_name' => 'payment_proofs', 'index_name' => 'payment_proofs_reference_unique']);
    $assert((int) $referenceIndex->fetchColumn() === 1, 'Payment reference number must be unique.');

    $legacyRows = (int) $pdo->query(
        'SELECT COUNT(*) FROM products
         WHERE category IS NULL OR name IS NULL OR stock IS NULL OR price IS NULL'
    )->fetchColumn();
    $assert($legacyRows === 0, 'Legacy product fields were not preserved.');

    fwrite(STDOUT, "Commerce schema tests passed ($assertions assertions).\n");
} catch (Throwable $exception) {
    fwrite(STDERR, "Commerce schema tests failed after $assertions assertions: {$exception->getMessage()}\n");
    exit(1);
}
