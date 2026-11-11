<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/database/connection.php';

$direction = $argv[1] ?? '';
if (!in_array($direction, ['up', 'down'], true)) {
    fwrite(STDERR, "Usage: php scripts/migrate.php up|down\n");
    exit(2);
}

try {
    $pdo = database_connection();
    $migration = require dirname(__DIR__) . '/database/migrations/20261111_commerce.php';
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS schema_migrations (
            migration VARCHAR(120) NOT NULL PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $find = $pdo->prepare('SELECT COUNT(*) FROM schema_migrations WHERE migration = :migration');
    $find->execute(['migration' => $migration['name']]);
    $isApplied = (int) $find->fetchColumn() > 0;

    if ($direction === 'up' && $isApplied) {
        fwrite(STDOUT, "Migration {$migration['name']} is already applied.\n");
        exit(0);
    }
    if ($direction === 'down' && !$isApplied) {
        fwrite(STDOUT, "Migration {$migration['name']} is not applied.\n");
        exit(0);
    }

    $migration[$direction]($pdo);
    if ($direction === 'up') {
        $record = $pdo->prepare('INSERT INTO schema_migrations (migration) VALUES (:migration)');
        $record->execute(['migration' => $migration['name']]);
    } else {
        $remove = $pdo->prepare('DELETE FROM schema_migrations WHERE migration = :migration');
        $remove->execute(['migration' => $migration['name']]);
    }

    fwrite(STDOUT, "Migration {$migration['name']} {$direction} completed.\n");
} catch (Throwable $exception) {
    fwrite(STDERR, "Migration failed: {$exception->getMessage()}\n");
    exit(1);
}
