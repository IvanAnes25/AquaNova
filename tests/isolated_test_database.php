<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/database/connection.php';

function isolated_test_database_connection(): PDO
{
    $databaseName = getenv('AQUATICA_TEST_DB_NAME');
    if (PHP_SAPI !== 'cli' || !database_is_local()
        || !is_string($databaseName)
        || !preg_match('/^aquanova_test_[a-z0-9_]+$/', $databaseName)
        || getenv('DB_NAME') !== $databaseName) {
        fwrite(STDERR, "Tests require matching local DB_NAME and AQUATICA_TEST_DB_NAME values beginning with aquanova_test_.\n");
        exit(1);
    }

    $pdo = database_connection();
    if ((string) $pdo->query('SELECT DATABASE()')->fetchColumn() !== $databaseName) {
        fwrite(STDERR, "The connected database does not match the isolated test database.\n");
        exit(1);
    }
    return $pdo;
}

function verify_isolated_api_test_router(string $baseUrl, string $databaseName): void
{
    $parts = parse_url($baseUrl);
    if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'http'
        || !in_array(strtolower((string) ($parts['host'] ?? '')), ['127.0.0.1', 'localhost', '::1'], true)) {
        fwrite(STDERR, "API tests require an explicit loopback AQUATICA_TEST_BASE_URL.\n");
        exit(1);
    }

    $handle = curl_init(rtrim($baseUrl, '/') . '/api/test/smtp-config');
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    $body = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    $router = is_string($body) ? json_decode($body, true) : null;
    if ($status !== 200 || !is_array($router)
        || ($router['databaseConfigured'] ?? false) !== true
        || ($router['isolatedDatabase'] ?? null) !== $databaseName) {
        fwrite(STDERR, "The API test router is not configured for the isolated test database.\n");
        exit(1);
    }
}
