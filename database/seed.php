<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/connection.php';

if (!database_is_local()) {
    fwrite(STDERR, "The development seed is disabled outside a local environment.\n");
    exit(1);
}

function seed_slug(string $value): string
{
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?? '';
    return trim($value, '-');
}

function seed_category_slug(PDO $pdo, string $name): string
{
    $base = seed_slug($name);
    $base = $base !== '' ? $base : 'category';
    $find = $pdo->prepare('SELECT name FROM categories WHERE slug = :slug LIMIT 1');
    $find->execute(['slug' => $base]);
    $existingName = $find->fetchColumn();
    return $existingName !== false && $existingName !== $name
        ? $base . '-' . substr(hash('sha256', $name), 0, 8)
        : $base;
}

function seed_password(int $length = 24): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    $password = '';
    for ($index = 0; $index < $length; $index++) {
        $password .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return $password;
}

$sampleProducts = [
    ['Fancy Guppy', 'Freshwater fish', 'Colorful guppies for a peaceful community aquarium.', 150, 14],
    ['Corydoras Catfish', 'Freshwater fish', 'A friendly bottom-dwelling fish for a suitable group aquarium.', 220, 8],
    ['Molly Fish', 'Freshwater fish', 'Active livebearers for a well-maintained community tank.', 120, 12],
    ['Tropical Fish Flakes', 'Food & care', 'Everyday flake food for a variety of tropical fish.', 180, 20],
    ['Betta Pellets', 'Food & care', 'A convenient daily pellet food for betta fish.', 130, 15],
    ['Sponge Filter', 'Equipment', 'Gentle biological filtration for small aquariums and fry tanks.', 450, 8],
    ['LED Aquarium Light', 'Equipment', 'A low-profile light for everyday aquarium viewing.', 1250, 5],
    ['Digital Thermometer', 'Equipment', 'A simple digital thermometer for monitoring tank temperature.', 180, 12],
    ['Natural River Pebbles', 'Substrate & decor', 'Washed decorative pebbles for freshwater aquascapes.', 250, 10],
    ['Java Fern', 'Plants & decor', 'A hardy aquatic plant suitable for attaching to aquarium decor.', 180, 7],
    ['Anubias Nana', 'Plants & decor', 'A compact, slow-growing aquatic plant for planted tanks.', 240, 6],
    ['Red Betta', 'Freshwater fish', 'A colorful betta for a suitable, peaceful aquarium.', 320, 5],
    ['Spark Guppy', 'Freshwater fish', 'A lively guppy for a compatible community aquarium.', 180, 8],
    ['Oranda Goldfish', 'Freshwater fish', 'A fancy goldfish that needs a spacious, well-filtered tank.', 450, 4],
    ['30-Gallon Aquarium', 'Aquariums', 'A glass aquarium for a home freshwater setup.', 6800, 4],
    ['60-Gallon Aquarium', 'Aquariums', 'A larger aquarium for a carefully planned fish community.', 12700, 3],
    ['Starter Filter Kit', 'Equipment', 'A basic filter kit for maintaining aquarium water quality.', 960, 8],
    ['Aquarium Heater', 'Equipment', 'An adjustable heater for suitable tropical aquariums.', 650, 6],
    ['Aquarium Net', 'Tools & maintenance', 'A small net for routine aquarium care.', 120, 10],
    ['Water Conditioner', 'Food & care', 'A water conditioner for aquarium setup and maintenance.', 220, 10],
];

try {
    $pdo = database_connection();
    $migration = $pdo->prepare('SELECT COUNT(*) FROM schema_migrations WHERE migration = :migration');
    $migration->execute(['migration' => '20261111_commerce']);
    if ((int) $migration->fetchColumn() !== 1) {
        throw new RuntimeException('Run `php scripts/migrate.php up` before seeding.');
    }

    $pdo->beginTransaction();
    $categories = $pdo->query('SELECT DISTINCT category FROM products')->fetchAll(PDO::FETCH_COLUMN);
    $upsertCategory = $pdo->prepare(
        'INSERT INTO categories (name, slug) VALUES (:name, :slug)
         ON DUPLICATE KEY UPDATE name = VALUES(name)'
    );
    foreach ($categories as $category) {
        $slug = seed_category_slug($pdo, (string) $category);
        $upsertCategory->execute(['name' => $category, 'slug' => $slug]);
    }

    $findCategory = $pdo->prepare('SELECT id FROM categories WHERE name = :name LIMIT 1');
    $updateProducts = $pdo->prepare(
        'UPDATE products SET category_id = COALESCE(category_id, :category_id),
             slug = COALESCE(NULLIF(slug, \'\'), :slug),
             low_stock_threshold = COALESCE(low_stock_threshold, 5),
             image_path = COALESCE(image_path, image_url)
         WHERE id = :id'
    );
    $products = $pdo->query('SELECT id, name, category, slug, image_url FROM products ORDER BY id')->fetchAll();
    $usedSlugs = [];
    foreach ($products as $product) {
        $findCategory->execute(['name' => $product['category']]);
        $categoryId = $findCategory->fetchColumn();
        $base = seed_slug((string) $product['name']);
        $slug = $base !== '' ? $base : 'product';
        if (isset($usedSlugs[$slug])) {
            $slug .= '-' . (int) $product['id'];
        }
        $usedSlugs[$slug] = true;
        $updateProducts->execute([
            'category_id' => $categoryId,
            'slug' => $slug,
            'id' => $product['id'],
        ]);
    }

    $findBySlug = $pdo->prepare('SELECT id FROM products WHERE slug = :slug LIMIT 1');
    $insertProduct = $pdo->prepare(
        'INSERT INTO products
            (name, category, short_description, description, price, stock, image_url, featured, is_active,
             category_id, slug, low_stock_threshold, image_path)
         VALUES
            (:name, :category, :short_description, :description, :price, :stock, NULL, 0, 1,
             :category_id, :slug, 5, NULL)'
    );
    foreach ($sampleProducts as [$name, $category, $description, $price, $stock]) {
        $slug = seed_slug($name);
        $findBySlug->execute(['slug' => $slug]);
        if ($findBySlug->fetchColumn()) {
            continue;
        }
        $findCategory->execute(['name' => $category]);
        $categoryId = $findCategory->fetchColumn();
        if (!$categoryId) {
            $upsertCategory->execute(['name' => $category, 'slug' => seed_category_slug($pdo, $category)]);
            $findCategory->execute(['name' => $category]);
            $categoryId = $findCategory->fetchColumn();
        }
        $insertProduct->execute([
            'name' => $name,
            'category' => $category,
            'short_description' => $description,
            'description' => $description,
            'price' => $price,
            'stock' => $stock,
            'category_id' => $categoryId,
            'slug' => $slug,
        ]);
    }

    $pdo->commit();

    $stockRows = $pdo->query(
        'SELECT p.id, p.name, p.stock,
                COALESCE(SUM(m.quantity_change), 0) AS logged_stock
         FROM products p
         LEFT JOIN stock_movements m ON m.product_id = p.id
         GROUP BY p.id, p.name, p.stock
         HAVING logged_stock <> p.stock'
    )->fetchAll();
    $addOpeningMovement = $pdo->prepare(
        "INSERT INTO stock_movements
            (product_id, product_name, movement_type, quantity_change, stock_before, stock_after,
             note, actor_user_id, change_qty, type, reason, order_id, user_id)
         VALUES
            (:product_id, :product_name, 'Initial', :quantity_change, :stock_before, :stock_after,
             :note, NULL, :change_qty, 'adjustment', :reason, NULL, NULL)"
    );
    foreach ($stockRows as $row) {
        $delta = (int) $row['stock'] - (int) $row['logged_stock'];
        $addOpeningMovement->execute([
            'product_id' => $row['id'],
            'product_name' => $row['name'],
            'quantity_change' => $delta,
            'stock_before' => max(0, (int) $row['logged_stock']),
            'stock_after' => (int) $row['stock'],
            'note' => 'Opening stock balance',
            'change_qty' => $delta,
            'reason' => 'Opening stock balance',
        ]);
    }

    $passwordOptions = ['memory_cost' => 32768, 'time_cost' => 3, 'threads' => 1];
    $authConfigFile = dirname(__DIR__) . '/private/auth.php';
    if (is_file($authConfigFile)) {
        $authConfig = require $authConfigFile;
        if (isset($authConfig['argon2']) && is_array($authConfig['argon2'])) {
            $passwordOptions = $authConfig['argon2'];
        }
    }
    if (!defined('PASSWORD_ARGON2ID')) {
        throw new RuntimeException('This PHP installation does not support Argon2id.');
    }

    $testEmails = ['dev.customer1@example.test', 'dev.customer2@example.test'];
    $findUser = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $insertUser = $pdo->prepare(
        "INSERT INTO users (name, email, phone, password_hash, role, email_verified_at)
         VALUES (:name, :email, '', :password_hash, 'customer', UTC_TIMESTAMP())"
    );
    foreach ($testEmails as $index => $email) {
        $findUser->execute(['email' => $email]);
        if ($findUser->fetchColumn()) {
            fwrite(STDOUT, "Existing development customer kept: $email\n");
            continue;
        }
        $password = seed_password();
        $hash = password_hash($password, PASSWORD_ARGON2ID, $passwordOptions);
        if (!is_string($hash)) {
            throw new RuntimeException('Could not hash a development customer password.');
        }
        $insertUser->execute([
            'name' => 'DEV TEST CUSTOMER ' . ($index + 1),
            'email' => $email,
            'password_hash' => $hash,
        ]);
        fwrite(STDOUT, "Development customer created: $email\nTemporary password (shown once): $password\n");
        unset($password, $hash);
    }

    $productCount = (int) $pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();
    fwrite(STDOUT, "Seed complete. Catalog products: $productCount\n");
} catch (Throwable $exception) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "Seed failed: {$exception->getMessage()}\n");
    exit(1);
}
