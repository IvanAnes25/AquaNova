<?php

declare(strict_types=1);

return [
    'name' => '20261120_stock_reason_image_archive',
    'up' => static function (PDO $pdo): void {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS stock_change_archives (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                movement_id BIGINT UNSIGNED NULL,
                product_id INT UNSIGNED NOT NULL,
                actor_user_id INT UNSIGNED NOT NULL,
                change_qty INT NOT NULL,
                stock_before INT NOT NULL,
                stock_after INT NOT NULL,
                reason VARCHAR(500) NOT NULL,
                note VARCHAR(500) NOT NULL DEFAULT '',
                confirmed_large_change TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY stock_change_archive_product_idx (product_id),
                KEY stock_change_archive_actor_idx (actor_user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    },
    'down' => static function (PDO $pdo): void {
        $pdo->exec('DROP TABLE IF EXISTS stock_change_archives');
    },
];
