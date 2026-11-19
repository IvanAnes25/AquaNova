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
    $migrationFiles = glob(dirname(__DIR__) . '/database/migrations/[0-9]*_*.php') ?: [];
    sort($migrationFiles, SORT_STRING);
    $migrations = [];
    foreach ($migrationFiles as $migrationFile) {
        if (preg_match('/^\d{8}_[a-z0-9_]+\.php$/', basename($migrationFile)) !== 1) {
            continue;
        }
        $migration = require $migrationFile;
        if (!is_array($migration) || !isset($migration['name'], $migration['up'], $migration['down'])
            || !is_callable($migration['up']) || !is_callable($migration['down'])) {
            throw new RuntimeException('Invalid migration definition: ' . basename($migrationFile));
        }
        $migrations[] = $migration;
    }
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS schema_migrations (
            migration VARCHAR(120) NOT NULL PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $find = $pdo->prepare('SELECT COUNT(*) FROM schema_migrations WHERE migration = :migration');
    $record = $pdo->prepare('INSERT INTO schema_migrations (migration) VALUES (:migration)');
    $remove = $pdo->prepare('DELETE FROM schema_migrations WHERE migration = :migration');
    if ($direction === 'up') {
        foreach ($migrations as $migration) {
            $find->execute(['migration' => $migration['name']]);
            if ((int) $find->fetchColumn() > 0) {
                fwrite(STDOUT, "Migration {$migration['name']} is already applied.\n");
                continue;
            }
            $migration['up']($pdo);
            $record->execute(['migration' => $migration['name']]);
            fwrite(STDOUT, "Migration {$migration['name']} up completed.\n");
        }
    } else {
        foreach (array_reverse($migrations) as $migration) {
            $find->execute(['migration' => $migration['name']]);
            if ((int) $find->fetchColumn() === 0) {
                continue;
            }
            $migration['down']($pdo);
            $remove->execute(['migration' => $migration['name']]);
            fwrite(STDOUT, "Migration {$migration['name']} down completed.\n");
            break;
        }
    }
} catch (Throwable $exception) {
    fwrite(STDERR, "Migration failed: {$exception->getMessage()}\n");
    exit(1);
}
