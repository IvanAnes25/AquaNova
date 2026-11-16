<?php

declare(strict_types=1);

$configFile = __DIR__ . '/auth.php';
if (is_file($configFile)) {
    return require $configFile;
}

$example = require __DIR__ . '/auth.example.php';
$environment = static function (string $name, string $fallback = ''): string {
    $value = getenv($name);
    return $value === false ? $fallback : $value;
};
$railwayDomain = $environment('RAILWAY_PUBLIC_DOMAIN');
$appUrl = $environment('APP_URL', $railwayDomain === '' ? '' : 'https://' . $railwayDomain);
$trustProxyHttps = filter_var(
    $environment('TRUST_PROXY_HTTPS'),
    FILTER_VALIDATE_BOOLEAN
);

$example['environment'] = $environment('APP_ENV', 'production');
$example['app_url'] = $appUrl;
$example['app_key'] = $environment('APP_KEY');
$example['trust_proxy_https'] = $trustProxyHttps;
$example['database'] = [
    'host' => $environment('DB_HOST'),
    'port' => (int) $environment('DB_PORT', '3306'),
    'name' => $environment('DB_NAME'),
    'username' => $environment('DB_USER'),
    'password' => $environment('DB_PASSWORD'),
];
$example['mail'] = [
    'host' => $environment('SMTP_HOST'),
    'port' => (int) $environment('SMTP_PORT', '587'),
    'username' => $environment('SMTP_USERNAME'),
    'password' => $environment('SMTP_PASSWORD'),
    'encryption' => $environment('SMTP_ENCRYPTION', 'tls'),
    'from_email' => $environment('SMTP_FROM_EMAIL'),
    'from_name' => $environment('SMTP_FROM_NAME', 'Nasugbu Aquatica'),
];

return $example;
