<?php

declare(strict_types=1);

return [
    'name' => '20261118_idempotency_requests',
    'up' => static function (PDO $pdo): void {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS idempotency_requests (
                user_id INT UNSIGNED NOT NULL,
                scope VARCHAR(80) NOT NULL,
                request_hash CHAR(64) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                PRIMARY KEY (user_id, scope, request_hash),
                KEY idempotency_expiry_idx (expires_at),
                CONSTRAINT idempotency_requests_user_fk
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    },
    'down' => static function (PDO $pdo): void {
        $rows = (int) $pdo->query('SELECT COUNT(*) FROM idempotency_requests')->fetchColumn();
        if ($rows > 0) {
            throw new RuntimeException('Rollback stopped: idempotency records are still within the retention window.');
        }
        $pdo->exec('DROP TABLE idempotency_requests');
    },
];
