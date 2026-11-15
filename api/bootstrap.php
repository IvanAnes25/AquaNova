<?php

declare(strict_types=1);

$configFile = dirname(__DIR__) . '/private/auth.php';
// Keep database and SMTP credentials out of the public frontend build.
if (!is_file($configFile)) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['message' => 'Authentication is not configured yet.']);
    exit;
}

$authConfig = require $configFile;
$testDatabase = getenv('AQUATICA_TEST_DB_NAME');
if ($testDatabase !== false && ($authConfig['environment'] ?? '') === 'local') {
    if (!preg_match('/^aquanova_test_[a-z0-9_]+$/', $testDatabase)) {
        json_response(['message' => 'The isolated API test database name is invalid.'], 503);
    }
    $authConfig['database']['name'] = $testDatabase;

    $testMailHost = getenv('AQUATICA_TEST_MAIL_HOST');
    $testMailPort = getenv('AQUATICA_TEST_MAIL_PORT');
    if ($testMailHost !== false || $testMailPort !== false) {
        $port = filter_var($testMailPort, FILTER_VALIDATE_INT);
        if ($testMailHost !== '127.0.0.1' || $port === false || $port < 1 || $port > 65535) {
            json_response(['message' => 'The test mail catcher must use loopback and a valid port.'], 503);
        }
        $authConfig['mail'] = [
            'host' => $testMailHost,
            'port' => $port,
            'username' => 'aquatica-test',
            'password' => 'aquatica-test',
            'encryption' => '',
            'from_email' => 'no-reply@example.test',
            'from_name' => 'Aquatica test',
        ];
    }
}
date_default_timezone_set('UTC');
ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'self'");

function json_response(array $body, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

function is_https_request(): bool
{
    global $authConfig;

    if ((!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
        return true;
    }

    return !empty($authConfig['trust_proxy_https'])
        && ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

if (($authConfig['environment'] ?? 'local') === 'production' && !is_https_request()) {
    if (str_contains($_SERVER['REQUEST_URI'] ?? '', '/api/')) {
        json_response(['message' => 'A secure connection is required.'], 400);
    }

    $host = preg_replace('/[^a-zA-Z0-9.\-:]/', '', $_SERVER['HTTP_HOST'] ?? '');
    header('Location: https://' . $host . ($_SERVER['REQUEST_URI'] ?? '/'), true, 308);
    exit;
}

if (!defined('PASSWORD_ARGON2ID')) {
    json_response(['message' => 'This server does not support Argon2id password hashing.'], 503);
}

$argonOptions = $authConfig['argon2'] ?? [];
if (($argonOptions['memory_cost'] ?? 0) < 32768
    || ($argonOptions['time_cost'] ?? 0) < 3
    || ($argonOptions['threads'] ?? 0) < 1) {
    json_response(['message' => 'Password hashing settings are invalid.'], 503);
}

if (!preg_match('/^[a-f0-9]{64,}$/', (string) ($authConfig['app_key'] ?? ''))) {
    json_response(['message' => 'The application secret is missing or invalid. Generate a random secret and update private/auth.php.'], 503);
}

if (!str_starts_with((string) ($authConfig['dummy_password_hash'] ?? ''), '$argon2id$')) {
    json_response(['message' => 'The dummy password hash is missing or invalid. Restore it from private/auth.example.php.'], 503);
}

$secureCookie = is_https_request();
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.use_trans_sid', '0');
ini_set('session.gc_maxlifetime', '1800');
session_name('aquanova_session');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $secureCookie,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

function auth_db(): PDO
{
    global $authConfig;
    static $pdo = null;

    if ($pdo === null) {
        $database = $authConfig['database'];
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $database['host'],
            $database['port'],
            $database['name']
        );
        // Use native prepared statements for every application query.
        $pdo = new PDO($dsn, $database['username'], $database['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $timeZone = $pdo->prepare("SET time_zone = '+00:00'");
        $timeZone->execute();

        $expiredPending = $pdo->prepare(
            'DELETE FROM pending_registrations WHERE code_expires_at <= UTC_TIMESTAMP()'
        );
        $expiredPending->execute();
        $expiredResets = $pdo->prepare(
            'DELETE FROM password_resets WHERE expires_at <= UTC_TIMESTAMP()'
        );
        $expiredResets->execute();
    }

    return $pdo;
}

function argon_options(): array
{
    global $authConfig;
    return $authConfig['argon2'];
}

function hash_password(string $password): string
{
    $hash = password_hash($password, PASSWORD_ARGON2ID, argon_options());
    if ($hash === false) {
        throw new RuntimeException('Password hashing failed.');
    }
    return $hash;
}

function request_json(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw === false ? '' : $raw, true);

    if (!is_array($data)) {
        json_response(['message' => 'Please submit a valid form.'], 400);
    }

    return $data;
}

function require_method(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        json_response(['message' => 'This request method is not allowed.'], 405);
    }
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function require_csrf(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $expected = $_SESSION['csrf_token'] ?? '';
    if (!is_string($sent) || !is_string($expected) || $expected === '' || !hash_equals($expected, $sent)) {
        json_response(['message' => 'Your form expired. Refresh the page and try again.'], 403);
    }
}

function destroy_auth_session(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $parameters = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $parameters['path'],
            'domain' => $parameters['domain'],
            'secure' => $parameters['secure'],
            'httponly' => $parameters['httponly'],
            'samesite' => $parameters['samesite'] ?? 'Strict',
        ]);
    }
    session_destroy();
}

function audit_auth_event(string $event, string $email): void
{
    error_log(json_encode([
        'event' => $event,
        'time' => gmdate('c'),
        'email' => $email,
    ], JSON_UNESCAPED_SLASHES));
}

function auth_role_for_app(string $databaseRole): string
{
    return $databaseRole === 'admin' ? 'owner' : $databaseRole;
}

function current_auth_user(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }

    if (time() - (int) ($_SESSION['last_activity'] ?? 0) > 1800) {
        destroy_auth_session();
        return null;
    }

    // Load the role from MySQL on every protected request instead of trusting the browser.
    $statement = auth_db()->prepare(
        'SELECT id, name, email, phone, role, session_version, must_change_password
         FROM users WHERE id = :id LIMIT 1'
    );
    $statement->execute(['id' => $_SESSION['user_id']]);
    $user = $statement->fetch();

    if (!$user || (int) $user['session_version'] !== (int) ($_SESSION['session_version'] ?? -1)) {
        destroy_auth_session();
        return null;
    }

    $user['role'] = auth_role_for_app($user['role']);
    $_SESSION['must_change_password'] = (bool) $user['must_change_password'];
    $_SESSION['last_activity'] = time();
    return $user;
}

function require_auth_role(string $role): array
{
    $user = current_auth_user();
    if ($user === null) {
        json_response(['message' => 'Please log in to continue.'], 401);
    }

    if ($user['role'] !== $role) {
        json_response(['message' => 'You do not have permission to view this page.'], 403);
    }

    return $user;
}
