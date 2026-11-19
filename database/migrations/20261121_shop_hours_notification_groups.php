<?php

declare(strict_types=1);

$columnExists = static function (PDO $pdo, string $table, string $column): bool {
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column'
    );
    $statement->execute(['table' => $table, 'column' => $column]);
    return (int) $statement->fetchColumn() > 0;
};

$indexExists = static function (PDO $pdo, string $table, string $index): bool {
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = :table AND index_name = :index'
    );
    $statement->execute(['table' => $table, 'index' => $index]);
    return (int) $statement->fetchColumn() > 0;
};

return [
    'name' => '20261121_shop_hours_notification_groups',
    'up' => static function (PDO $pdo) use ($columnExists, $indexExists): void {
        if (!$columnExists($pdo, 'notifications', 'deleted_at')) {
            $pdo->exec('ALTER TABLE notifications ADD COLUMN deleted_at DATETIME NULL AFTER read_at');
        }
        if (!$indexExists($pdo, 'notifications', 'notifications_user_deleted_idx')) {
            $pdo->exec(
                'ALTER TABLE notifications ADD KEY notifications_user_deleted_idx (user_id, deleted_at, created_at)'
            );
        }
        if (!$columnExists($pdo, 'orders', 'shop_closed_at_order')) {
            $pdo->exec(
                'ALTER TABLE orders ADD COLUMN shop_closed_at_order TINYINT(1) NOT NULL DEFAULT 0 AFTER stock_deducted'
            );
        }
        if (!$columnExists($pdo, 'orders', 'shop_closed_message_snapshot')) {
            $pdo->exec(
                'ALTER TABLE orders ADD COLUMN shop_closed_message_snapshot VARCHAR(500) NULL AFTER shop_closed_at_order'
            );
        }
    },
    'down' => static function (PDO $pdo) use ($columnExists, $indexExists): void {
        if ($indexExists($pdo, 'notifications', 'notifications_user_deleted_idx')) {
            $pdo->exec('ALTER TABLE notifications DROP INDEX notifications_user_deleted_idx');
        }
        if ($columnExists($pdo, 'notifications', 'deleted_at')) {
            $pdo->exec('ALTER TABLE notifications DROP COLUMN deleted_at');
        }
        if ($columnExists($pdo, 'orders', 'shop_closed_message_snapshot')) {
            $pdo->exec('ALTER TABLE orders DROP COLUMN shop_closed_message_snapshot');
        }
        if ($columnExists($pdo, 'orders', 'shop_closed_at_order')) {
            $pdo->exec('ALTER TABLE orders DROP COLUMN shop_closed_at_order');
        }
    },
];
