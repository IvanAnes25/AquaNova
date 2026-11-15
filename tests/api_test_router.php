<?php

declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$config = require $projectRoot . '/private/auth.php';
$databaseName = getenv('AQUATICA_TEST_DB_NAME');
$configuredDatabaseName = getenv('DB_NAME');
if (($config['environment'] ?? '') !== 'local'
    || !is_string($databaseName)
    || !preg_match('/^aquanova_test_[a-z0-9_]+$/', $databaseName)
    || $configuredDatabaseName !== $databaseName) {
    http_response_code(503);
    echo 'The API test router requires a local, isolated aquanova_test_* database.';
    return true;
}

$projectPath = '/' . basename($projectRoot);
$apiPath = $projectPath . '/api/v1';
$requestPath = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
if ($requestPath === $apiPath || str_starts_with($requestPath, $apiPath . '/')) {
    $route = trim(substr($requestPath, strlen($apiPath)), '/');
    if (str_contains($route, '..') || str_contains($route, '\\')) {
        http_response_code(404);
        return true;
    }
    $_GET['path'] = $route;
    require $projectRoot . '/api/v1/index.php';
    return true;
}

$authPath = $projectPath . '/api/auth/';
$authFiles = [
    'csrf.php',
    'session.php',
    'login.php',
    'logout.php',
    'customer-page.php',
    'owner-page.php',
    'register.php',
    'verify.php',
    'resend.php',
    'pending.php',
    'forgot-password.php',
    'reset-password.php',
];
if (str_starts_with($requestPath, $authPath)) {
    $authFile = substr($requestPath, strlen($authPath));
    if (!in_array($authFile, $authFiles, true)) {
        http_response_code(404);
        return true;
    }
    require $projectRoot . '/api/auth/' . $authFile;
    return true;
}

$webappPath = $projectPath . '/webapp';
if ($requestPath === $webappPath || str_starts_with($requestPath, $webappPath . '/')) {
    $publicRoot = realpath($projectRoot . '/public/webapp');
    $relativePath = ltrim(substr($requestPath, strlen($webappPath)), '/');
    if ($relativePath === '' || str_ends_with($requestPath, '/')) {
        $relativePath = 'index.html';
    }
    if (str_contains($relativePath, '..') || str_contains($relativePath, '\\') || $publicRoot === false) {
        http_response_code(404);
        return true;
    }

    $file = realpath($publicRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath));
    if ($file === false || !str_starts_with($file, $publicRoot . DIRECTORY_SEPARATOR) || !is_file($file)) {
        http_response_code(404);
        return true;
    }

    $contentTypes = [
        'css' => 'text/css; charset=utf-8',
        'html' => 'text/html; charset=utf-8',
        'js' => 'text/javascript; charset=utf-8',
        'png' => 'image/png',
        'svg' => 'image/svg+xml',
        'webp' => 'image/webp',
        'woff2' => 'font/woff2',
    ];
    $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    header('Content-Type: ' . ($contentTypes[$extension] ?? 'application/octet-stream'));
    readfile($file);
    return true;
}

return false;
