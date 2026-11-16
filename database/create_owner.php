<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$config = require dirname(__DIR__) . '/private/runtime_auth_config.php';
if (!defined('PASSWORD_ARGON2ID')) {
    fwrite(STDERR, "This PHP installation does not support Argon2id.\n");
    exit(1);
}

$readLine = static function (string $prompt): string {
    fwrite(STDOUT, $prompt);
    return trim((string) fgets(STDIN));
};

$name = $readLine('Owner name: ');
$email = mb_strtolower($readLine('Owner email: '), 'UTF-8');
// Read the password from a hidden terminal prompt/environment variable, never source code.
$password = getenv('AQUANOVA_OWNER_PASSWORD');
putenv('AQUANOVA_OWNER_PASSWORD');

if ($name === '' || mb_strlen($name) > 120 || filter_var($email, FILTER_VALIDATE_EMAIL) === false
    || !is_string($password) || strlen($password) < 8 || strlen($password) > 1024) {
    fwrite(STDERR, "Provide a valid name, email, and an 8-1024 byte password using AQUANOVA_OWNER_PASSWORD.\n");
    exit(1);
}

try {
    $database = $config['database'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $database['host'],
        $database['port'],
        $database['name']
    );
    $pdo = new PDO($dsn, $database['username'], $database['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    $lock = $pdo->prepare('SELECT GET_LOCK(:name, 10)');
    $lock->execute(['name' => 'aquanova_first_owner']);
    if ((int) $lock->fetchColumn() !== 1) {
        throw new RuntimeException('Owner setup is already running.');
    }

    $owners = $pdo->prepare("SELECT COUNT(*) FROM users WHERE role = 'owner'");
    $owners->execute();
    if ((int) $owners->fetchColumn() > 0) {
        throw new RuntimeException('An owner account already exists.');
    }

    $hash = password_hash($password, PASSWORD_ARGON2ID, $config['argon2']);
    $password = '';
    $insert = $pdo->prepare(
        "INSERT INTO users (name, email, phone, password_hash, role, must_change_password)
         VALUES (:name, :email, '', :password_hash, 'owner', 1)"
    );
    $insert->execute(['name' => $name, 'email' => $email, 'password_hash' => $hash]);
    $pdo->prepare('SELECT RELEASE_LOCK(:name)')->execute(['name' => 'aquanova_first_owner']);
    fwrite(STDOUT, "Owner account created. Keep the password in your password manager.\n");
} catch (Throwable $exception) {
    $password = '';
    fwrite(STDERR, "Owner account could not be created. Check the setup and try again.\n");
    exit(1);
}
