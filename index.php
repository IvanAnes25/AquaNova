<?php
$authConfig = require __DIR__ . '/private/runtime_auth_config.php';
$https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
    || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443
    || (!empty($authConfig['trust_proxy_https'])
        && ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
if (($authConfig['environment'] ?? 'local') === 'production' && !$https) {
    $host = preg_replace('/[^a-zA-Z0-9.\-:]/', '', $_SERVER['HTTP_HOST'] ?? '');
    header('Location: https://' . $host . ($_SERVER['REQUEST_URI'] ?? '/'), true, 308);
    exit;
}

$https = !empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off';
header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");

$frontend = __DIR__ . '/public/index.html';

if (!is_file($frontend)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Frontend build not found. Run npm install and npm run build.\n";
    exit;
}

readfile($frontend);