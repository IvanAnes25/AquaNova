<?php

declare(strict_types=1);

function database_load_env(string $file): void
{
    if (!is_file($file)) {
        return;
    }

    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }

        [$name, $value] = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);
        if ($name !== '' && getenv($name) === false) {
            if (strlen($value) >= 2 && $value[0] === $value[-1] && ($value[0] === '"' || $value[0] === "'")) {
                $value = substr($value, 1, -1);
            }
            putenv($name . '=' . $value);
        }
    }
}

function database_connection(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    database_load_env(dirname(__DIR__) . '/.env');

    $host = getenv('DB_HOST');
    $port = getenv('DB_PORT');
    $name = getenv('DB_NAME');
    $username = getenv('DB_USER');
    $password = getenv('DB_PASSWORD');

    if ($host === false || $port === false || $name === false || $username === false || $password === false) {
        $authConfigFile = dirname(__DIR__) . '/private/auth.php';
        if (!is_file($authConfigFile)) {
            throw new RuntimeException('Database configuration is missing. Configure .env first.');
        }
        $authConfig = require $authConfigFile;
        $database = $authConfig['database'] ?? [];
        $host = $host === false ? ($database['host'] ?? '') : $host;
        $port = $port === false ? (string) ($database['port'] ?? 3306) : $port;
        $name = $name === false ? ($database['name'] ?? '') : $name;
        $username = $username === false ? ($database['username'] ?? '') : $username;
        $password = $password === false ? ($database['password'] ?? '') : $password;
    }

    if (!is_string($host) || $host === '' || !is_string($name) || $name === ''
        || !is_string($username) || $username === '') {
        throw new RuntimeException('Database configuration is incomplete.');
    }

    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, (int) ($port ?: 3306), $name),
        $username,
        is_string($password) ? $password : '',
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    $pdo->exec("SET time_zone = '+00:00'");

    return $pdo;
}

function database_is_local(): bool
{
    database_load_env(dirname(__DIR__) . '/.env');
    if (getenv('APP_ENV') !== false) {
        return getenv('APP_ENV') === 'local';
    }

    $authConfigFile = dirname(__DIR__) . '/private/auth.php';
    if (!is_file($authConfigFile)) {
        return true;
    }
    $authConfig = require $authConfigFile;
    return ($authConfig['environment'] ?? 'local') === 'local';
}
