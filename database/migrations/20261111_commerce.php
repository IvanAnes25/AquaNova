<?php

declare(strict_types=1);

function commerce_column_exists(PDO $pdo, string $table, string $column): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name'
    );
    $statement->execute(['table_name' => $table, 'column_name' => $column]);
    return (int) $statement->fetchColumn() > 0;
}

function commerce_index_exists(PDO $pdo, string $table, string $index): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND INDEX_NAME = :index_name'
    );
    $statement->execute(['table_name' => $table, 'index_name' => $index]);
    return (int) $statement->fetchColumn() > 0;
}

function commerce_constraint_exists(PDO $pdo, string $table, string $constraint): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND CONSTRAINT_NAME = :constraint_name'
    );
    $statement->execute(['table_name' => $table, 'constraint_name' => $constraint]);
    return (int) $statement->fetchColumn() > 0;
}

function commerce_add_column(PDO $pdo, string $table, string $column, string $definition): void
{
    if (!commerce_column_exists($pdo, $table, $column)) {
        $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
    }
}

function commerce_add_index(PDO $pdo, string $table, string $index, string $columns, bool $unique = false): void
{
    if (!commerce_index_exists($pdo, $table, $index)) {
        $kind = $unique ? 'UNIQUE INDEX' : 'INDEX';
        $pdo->exec("ALTER TABLE `$table` ADD $kind `$index` ($columns)");
    }
}

function commerce_add_check(PDO $pdo, string $table, string $constraint, string $expression): void
{
    if (!commerce_constraint_exists($pdo, $table, $constraint)) {
        $pdo->exec("ALTER TABLE `$table` ADD CONSTRAINT `$constraint` CHECK ($expression)");
    }
}

function commerce_remove_check(PDO $pdo, string $table, string $constraint): void
{
    if (commerce_constraint_exists($pdo, $table, $constraint)) {
        $pdo->exec("ALTER TABLE `$table` DROP CONSTRAINT `$constraint`");
    }
}

function commerce_add_foreign_key(PDO $pdo, string $table, string $constraint, string $definition): void
{
    if (!commerce_constraint_exists($pdo, $table, $constraint)) {
        $pdo->exec("ALTER TABLE `$table` ADD CONSTRAINT `$constraint` $definition");
    }
}

function commerce_remove_column(PDO $pdo, string $table, string $column): void
{
    if (commerce_column_exists($pdo, $table, $column)) {
        $pdo->exec("ALTER TABLE `$table` DROP COLUMN `$column`");
    }
}

function commerce_remove_index(PDO $pdo, string $table, string $index): void
{
    if (commerce_index_exists($pdo, $table, $index)) {
        $pdo->exec("ALTER TABLE `$table` DROP INDEX `$index`");
    }
}

function commerce_remove_constraint(PDO $pdo, string $table, string $constraint): void
{
    if (commerce_constraint_exists($pdo, $table, $constraint)) {
        $pdo->exec("ALTER TABLE `$table` DROP FOREIGN KEY `$constraint`");
    }
}

function commerce_table_exists(PDO $pdo, string $table): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name'
    );
    $statement->execute(['table_name' => $table]);
    return (int) $statement->fetchColumn() > 0;
}

function commerce_slug(string $value): string
{
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?? '';
    return trim($value, '-');
}

function commerce_category_slug(PDO $pdo, string $name): string
{
    $base = commerce_slug($name);
    $base = $base !== '' ? $base : 'category';
    $find = $pdo->prepare('SELECT name FROM categories WHERE slug = :slug LIMIT 1');
    $find->execute(['slug' => $base]);
    $existingName = $find->fetchColumn();
    return $existingName !== false && $existingName !== $name
        ? $base . '-' . substr(hash('sha256', $name), 0, 8)
        : $base;
}

function commerce_backfill_products(PDO $pdo): void
{
    $products = $pdo->query(
        'SELECT id, name, category, image_url FROM products ORDER BY id'
    )->fetchAll();
    $categories = [];
    foreach ($products as $product) {
        $name = trim((string) $product['category']);
        if ($name !== '') {
            $categories[$name] = true;
        }
    }

    $insertCategory = $pdo->prepare(
        'INSERT INTO categories (name, slug) VALUES (:name, :slug)
         ON DUPLICATE KEY UPDATE name = VALUES(name)'
    );
    foreach ($categories as $name => $_) {
        $slug = commerce_category_slug($pdo, $name);
        $insertCategory->execute(['name' => $name, 'slug' => $slug]);
    }

    $findCategory = $pdo->prepare('SELECT id FROM categories WHERE name = :name LIMIT 1');
    $updateProduct = $pdo->prepare(
        'UPDATE products SET category_id = COALESCE(category_id, :category_id),
             slug = COALESCE(NULLIF(slug, \'\'), :slug),
             image_path = COALESCE(image_path, image_url)
         WHERE id = :id'
    );
    $existingSlugs = [];
    foreach ($products as $product) {
        $findCategory->execute(['name' => $product['category']]);
        $categoryId = $findCategory->fetchColumn();
        $baseSlug = commerce_slug((string) $product['name']);
        $slug = $baseSlug !== '' ? $baseSlug : 'product';
        if (isset($existingSlugs[$slug])) {
            $slug .= '-' . (int) $product['id'];
        }
        $existingSlugs[$slug] = true;
        $updateProduct->execute([
            'category_id' => $categoryId ?: null,
            'slug' => $slug,
            'id' => $product['id'],
        ]);
    }
}

function commerce_backfill_legacy_orders(PDO $pdo): void
{
    $orders = $pdo->query(
        'SELECT id, order_number, delivery_method, payment_method, status, payment_status
         FROM orders ORDER BY id'
    )->fetchAll();
    $update = $pdo->prepare(
        'UPDATE orders SET order_no = :order_no, fulfillment = :fulfillment,
             order_status = :order_status, payment_method_v2 = :payment_method,
             payment_status_v2 = :payment_status
         WHERE id = :id AND (order_no IS NULL OR fulfillment IS NULL OR order_status IS NULL)'
    );

    $statusMap = [
        'Pending' => 'pending',
        'Confirmed' => 'preparing',
        'Processing' => 'preparing',
        'Ready for pickup' => 'ready',
        'Out for delivery' => 'preparing',
        'Completed' => 'completed',
        'Cancelled' => 'cancelled',
    ];
    foreach ($orders as $order) {
        $legacyMethod = (string) $order['payment_method'];
        $fulfillment = $order['delivery_method'] === 'Local delivery' ? 'delivery' : 'pickup';
        $paymentMethod = match ($legacyMethod) {
            'GCash' => 'gcash',
            'Cash' => $fulfillment === 'delivery' ? 'cod' : 'cash_pickup',
            default => null,
        };
        $paymentStatus = match ((string) $order['payment_status']) {
            'Awaiting proof', 'Not required' => 'unpaid',
            'Proof submitted' => 'under_review',
            'Verified' => 'paid',
            'Rejected' => 'rejected',
            default => null,
        };
        if ($paymentStatus === 'unpaid' && $order['status'] === 'Completed') {
            $paymentStatus = 'paid';
        }
        $update->execute([
            'order_no' => $order['order_number'],
            'fulfillment' => $fulfillment,
            'order_status' => $statusMap[$order['status']] ?? 'pending',
            'payment_method' => $paymentMethod,
            'payment_status' => $paymentStatus,
            'id' => $order['id'],
        ]);
    }
}

function commerce_backfill_order_items(PDO $pdo): void
{
    $pdo->exec(
        'UPDATE order_items SET name_snapshot = product_name,
             price_snapshot = unit_price, qty = quantity
         WHERE name_snapshot IS NULL OR price_snapshot IS NULL OR qty IS NULL'
    );
}

function commerce_backfill_movements(PDO $pdo): void
{
    $pdo->exec(
        "UPDATE stock_movements SET change_qty = quantity_change,
             type = CASE movement_type
                 WHEN 'Restock' THEN 'restock'
                 WHEN 'Order' THEN 'sale'
                 WHEN 'Cancellation' THEN 'cancellation'
                 ELSE 'adjustment'
             END,
             reason = COALESCE(NULLIF(note, ''), movement_type)
         WHERE change_qty IS NULL OR type IS NULL OR reason IS NULL"
    );
}

function commerce_run_sql_file(PDO $pdo, string $path): void
{
    $contents = file_get_contents($path);
    if ($contents === false) {
        throw new RuntimeException('Commerce table definitions could not be read.');
    }

    foreach (explode(';', $contents) as $statement) {
        $statement = trim($statement);
        if ($statement !== '') {
            $pdo->exec($statement);
        }
    }
}

function commerce_up(PDO $pdo): void
{
    foreach (['users', 'products', 'orders', 'order_items', 'stock_movements', 'settings'] as $requiredTable) {
        if (!commerce_table_exists($pdo, $requiredTable)) {
            throw new RuntimeException("Required legacy table `$requiredTable` is missing. Import the existing auth and commerce schemas first.");
        }
    }

    commerce_run_sql_file($pdo, __DIR__ . '/20261111_commerce.up.sql');

    commerce_add_column($pdo, 'users', 'email_verified_at', 'DATETIME NULL');
    commerce_add_column($pdo, 'users', 'must_change_password', 'TINYINT(1) NOT NULL DEFAULT 0');
    commerce_add_column($pdo, 'users', 'failed_attempts', 'TINYINT UNSIGNED NOT NULL DEFAULT 0');
    commerce_add_column($pdo, 'users', 'locked_until', 'DATETIME NULL');

    commerce_add_column($pdo, 'products', 'category_id', 'INT UNSIGNED NULL');
    commerce_add_column($pdo, 'products', 'slug', 'VARCHAR(180) NULL');
    commerce_add_column($pdo, 'products', 'low_stock_threshold', 'INT UNSIGNED NOT NULL DEFAULT 5');
    commerce_add_column($pdo, 'products', 'image_path', 'VARCHAR(500) NULL');

    commerce_backfill_products($pdo);
    $pdo->exec('ALTER TABLE products MODIFY COLUMN category_id INT UNSIGNED NOT NULL');
    $pdo->exec('ALTER TABLE products MODIFY COLUMN slug VARCHAR(180) NOT NULL');
    commerce_add_index($pdo, 'products', 'products_slug_unique', 'slug', true);
    commerce_add_index($pdo, 'products', 'products_category_id_idx', 'category_id');
    commerce_add_foreign_key(
        $pdo,
        'products',
        'products_category_fk',
        'FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT'
    );
    commerce_add_check($pdo, 'products', 'products_stock_nonnegative', 'stock >= 0');

    commerce_add_column($pdo, 'orders', 'order_no', 'VARCHAR(32) NULL');
    commerce_add_column($pdo, 'orders', 'fulfillment', "ENUM('delivery','pickup') NULL");
    commerce_add_column($pdo, 'orders', 'payment_method_v2', "ENUM('gcash','cod','cash_pickup') NULL");
    commerce_add_column($pdo, 'orders', 'order_status', "ENUM('pending','preparing','ready','completed','cancelled') NULL");
    commerce_add_column($pdo, 'orders', 'payment_status_v2', "ENUM('unpaid','under_review','paid','rejected') NULL");
    commerce_add_column($pdo, 'orders', 'delivery_fee', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
    commerce_add_column($pdo, 'orders', 'delivery_address_snapshot', 'JSON NULL');
    commerce_add_column($pdo, 'orders', 'delivery_by', "ENUM('lalamove','owner') NULL");
    commerce_add_column($pdo, 'orders', 'stock_deducted', 'TINYINT(1) NOT NULL DEFAULT 0');
    commerce_add_column($pdo, 'orders', 'cancelled_by', 'INT UNSIGNED NULL');
    commerce_add_column($pdo, 'orders', 'cancel_reason', 'VARCHAR(500) NULL');
    commerce_backfill_legacy_orders($pdo);
    $pdo->exec("ALTER TABLE orders MODIFY COLUMN order_no VARCHAR(32) NOT NULL");
    $pdo->exec("ALTER TABLE orders MODIFY COLUMN fulfillment ENUM('delivery','pickup') NOT NULL");
    $pdo->exec("ALTER TABLE orders MODIFY COLUMN order_status ENUM('pending','preparing','ready','completed','cancelled') NOT NULL");
    commerce_add_index($pdo, 'orders', 'orders_order_no_unique', 'order_no', true);
    commerce_add_index($pdo, 'orders', 'orders_workflow_idx', 'order_status, payment_status_v2, created_at');
    commerce_add_foreign_key(
        $pdo,
        'orders',
        'orders_cancelled_by_fk',
        'FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL'
    );

    commerce_add_column($pdo, 'order_items', 'name_snapshot', 'VARCHAR(160) NULL');
    commerce_add_column($pdo, 'order_items', 'price_snapshot', 'DECIMAL(10,2) NULL');
    commerce_add_column($pdo, 'order_items', 'qty', 'INT UNSIGNED NULL');
    commerce_backfill_order_items($pdo);
    $pdo->exec('ALTER TABLE order_items MODIFY COLUMN name_snapshot VARCHAR(160) NOT NULL');
    $pdo->exec('ALTER TABLE order_items MODIFY COLUMN price_snapshot DECIMAL(10,2) NOT NULL');
    $pdo->exec('ALTER TABLE order_items MODIFY COLUMN qty INT UNSIGNED NOT NULL');

    commerce_add_column($pdo, 'stock_movements', 'change_qty', 'INT NULL');
    commerce_add_column($pdo, 'stock_movements', 'type', "ENUM('sale','restock','adjustment','cancellation') NULL");
    commerce_add_column($pdo, 'stock_movements', 'reason', 'VARCHAR(500) NULL');
    commerce_add_column($pdo, 'stock_movements', 'order_id', 'BIGINT UNSIGNED NULL');
    commerce_add_column($pdo, 'stock_movements', 'user_id', 'INT UNSIGNED NULL');
    commerce_backfill_movements($pdo);
    $pdo->exec('ALTER TABLE stock_movements MODIFY COLUMN change_qty INT NOT NULL');
    $pdo->exec("ALTER TABLE stock_movements MODIFY COLUMN type ENUM('sale','restock','adjustment','cancellation') NOT NULL");
    $pdo->exec('ALTER TABLE stock_movements MODIFY COLUMN reason VARCHAR(500) NOT NULL');
    commerce_add_index($pdo, 'stock_movements', 'stock_movements_order_idx', 'order_id');
    commerce_add_foreign_key(
        $pdo,
        'stock_movements',
        'stock_movements_order_fk',
        'FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT'
    );
    commerce_add_foreign_key(
        $pdo,
        'stock_movements',
        'stock_movements_user_fk',
        'FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL'
    );
}

function commerce_down(PDO $pdo): void
{
    $protectedTables = ['addresses', 'cart_items', 'payment_proofs', 'notifications', 'audit_log', 'order_status_history'];
    foreach ($protectedTables as $table) {
        if (commerce_table_exists($pdo, $table) && (int) $pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn() > 0) {
            throw new RuntimeException("Rollback stopped: `$table` contains data. Export it before rolling back.");
        }
    }

    $categories = $pdo->query('SELECT name FROM categories ORDER BY name')->fetchAll(PDO::FETCH_COLUMN);
    $productCategories = $pdo->query('SELECT DISTINCT category FROM products ORDER BY category')->fetchAll(PDO::FETCH_COLUMN);
    if ($categories !== $productCategories) {
        throw new RuntimeException('Rollback stopped: categories contain data not represented by legacy product categories.');
    }

    $usersWithNewData = (int) $pdo->query(
        'SELECT COUNT(*) FROM users
         WHERE email_verified_at IS NOT NULL OR must_change_password <> 0
            OR failed_attempts <> 0 OR locked_until IS NOT NULL'
    )->fetchColumn();
    if ($usersWithNewData > 0) {
        throw new RuntimeException('Rollback stopped: newly added user fields contain data.');
    }

    commerce_remove_constraint($pdo, 'products', 'products_category_fk');
    commerce_remove_check($pdo, 'products', 'products_stock_nonnegative');
    commerce_remove_index($pdo, 'products', 'products_category_id_idx');
    commerce_remove_index($pdo, 'products', 'products_slug_unique');
    commerce_remove_constraint($pdo, 'orders', 'orders_cancelled_by_fk');
    commerce_remove_index($pdo, 'orders', 'orders_order_no_unique');
    commerce_remove_index($pdo, 'orders', 'orders_workflow_idx');
    commerce_remove_constraint($pdo, 'stock_movements', 'stock_movements_order_fk');
    commerce_remove_constraint($pdo, 'stock_movements', 'stock_movements_user_fk');
    commerce_remove_index($pdo, 'stock_movements', 'stock_movements_order_idx');

    foreach ([
        ['users', 'email_verified_at'], ['users', 'must_change_password'], ['users', 'failed_attempts'], ['users', 'locked_until'],
        ['products', 'category_id'], ['products', 'slug'], ['products', 'low_stock_threshold'], ['products', 'image_path'],
        ['orders', 'order_no'], ['orders', 'fulfillment'], ['orders', 'payment_method_v2'], ['orders', 'order_status'],
        ['orders', 'payment_status_v2'], ['orders', 'delivery_fee'], ['orders', 'delivery_address_snapshot'],
        ['orders', 'delivery_by'], ['orders', 'stock_deducted'], ['orders', 'cancelled_by'], ['orders', 'cancel_reason'],
        ['order_items', 'name_snapshot'], ['order_items', 'price_snapshot'], ['order_items', 'qty'],
        ['stock_movements', 'change_qty'], ['stock_movements', 'type'], ['stock_movements', 'reason'],
        ['stock_movements', 'order_id'], ['stock_movements', 'user_id'],
    ] as [$table, $column]) {
        commerce_remove_column($pdo, $table, $column);
    }

    foreach (['order_status_history', 'payment_proofs', 'cart_items', 'addresses', 'notifications', 'audit_log', 'categories'] as $table) {
        if (commerce_table_exists($pdo, $table)) {
            $pdo->exec("DROP TABLE `$table`");
        }
    }
}

return [
    'name' => '20261111_commerce',
    'up' => 'commerce_up',
    'down' => 'commerce_down',
];
