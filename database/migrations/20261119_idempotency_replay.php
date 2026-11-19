<?php

declare(strict_types=1);

return [
    'name' => '20261119_idempotency_replay',
    'up' => static function (PDO $pdo): void {
        $columns = $pdo->query(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'idempotency_requests'"
        )->fetchAll(PDO::FETCH_COLUMN);
        $existing = array_flip(array_map('strval', $columns));
        $alter = [];
        if (!isset($existing['endpoint'])) {
            $alter[] = 'ADD COLUMN endpoint VARCHAR(255) NOT NULL DEFAULT \'\' AFTER scope';
        }
        if (!isset($existing['payload_hash'])) {
            $alter[] = 'ADD COLUMN payload_hash CHAR(64) NOT NULL DEFAULT \'\' AFTER request_hash';
        }
        if (!isset($existing['response_status'])) {
            $alter[] = 'ADD COLUMN response_status SMALLINT UNSIGNED NULL AFTER payload_hash';
        }
        if (!isset($existing['response_body'])) {
            $alter[] = 'ADD COLUMN response_body LONGTEXT NULL AFTER response_status';
        }
        if (!isset($existing['state'])) {
            $alter[] = 'ADD COLUMN state VARCHAR(20) NOT NULL DEFAULT \'in_progress\' AFTER response_body';
        }
        if (!isset($existing['completed_at'])) {
            $alter[] = 'ADD COLUMN completed_at DATETIME NULL AFTER state';
        }
        if ($alter !== []) {
            $pdo->exec('ALTER TABLE idempotency_requests ' . implode(', ', $alter));
        }
        $stateIndex = $pdo->query(
            "SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'idempotency_requests'
             AND INDEX_NAME = 'idempotency_state_idx'"
        )->fetchColumn();
        if ((int) $stateIndex === 0) {
            $pdo->exec('ALTER TABLE idempotency_requests ADD INDEX idempotency_state_idx (state, expires_at)');
        }
        $pdo->exec(
            'UPDATE idempotency_requests
             SET expires_at = DATE_ADD(created_at, INTERVAL 24 HOUR),
                 state = CASE WHEN response_status IS NULL THEN \'in_progress\' ELSE \'completed\' END'
        );
    },
    'down' => static function (PDO $pdo): void {
        $pdo->exec(
            "ALTER TABLE idempotency_requests
                DROP COLUMN endpoint,
                DROP COLUMN payload_hash,
                DROP COLUMN response_status,
                DROP COLUMN response_body,
                DROP COLUMN state,
                DROP COLUMN completed_at,
                DROP INDEX idempotency_state_idx"
        );
    },
];
