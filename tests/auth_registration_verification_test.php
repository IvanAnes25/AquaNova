<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/database/connection.php';

if (PHP_SAPI !== 'cli' || !extension_loaded('curl')) {
    fwrite(STDERR, "Registration verification test requires local CLI and cURL.\n");
    exit(1);
}

$config = require dirname(__DIR__) . '/private/auth.php';
$baseUrl = rtrim(getenv('AQUATICA_TEST_BASE_URL') ?: 'http://127.0.0.1:8091/AquaNova', '/');
$port = 2526;
$pdo = database_connection();
$databaseName = (string) $pdo->query('SELECT DATABASE()')->fetchColumn();
if (($config['environment'] ?? '') !== 'local' || !preg_match('/^aquanova_test_[a-z0-9_]+$/', $databaseName)) {
    fwrite(STDERR, "Registration verification tests require an isolated local aquanova_test_* database.\n");
    exit(1);
}

$tag = bin2hex(random_bytes(6));
$email = 'registration-' . $tag . '@example.test';
$password = bin2hex(random_bytes(12));
$captureFile = tempnam(sys_get_temp_dir(), 'aquatica-smtp-');
$cookieFile = tempnam(sys_get_temp_dir(), 'aquatica-registration-cookie-');
if ($captureFile === false || $cookieFile === false) {
    throw new RuntimeException('Could not create temporary registration test files.');
}

final class RegistrationTestClient
{
    public string $csrfToken = '';

    public function __construct(private string $baseUrl, private string $cookieFile)
    {
    }

    public function request(string $method, string $path, ?array $data = null): array
    {
        $headers = ['Accept: application/json'];
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_COOKIEFILE => $this->cookieFile,
            CURLOPT_COOKIEJAR => $this->cookieFile,
            CURLOPT_TIMEOUT => 30,
        ];
        if ($data !== null) {
            $headers[] = 'Content-Type: application/json';
            $headers[] = 'X-CSRF-Token: ' . $this->csrfToken;
            $options[CURLOPT_POSTFIELDS] = json_encode($data, JSON_THROW_ON_ERROR);
        }
        $options[CURLOPT_HTTPHEADER] = $headers;
        $handle = curl_init($this->baseUrl . $path);
        curl_setopt_array($handle, $options);
        $body = curl_exec($handle);
        if ($body === false) {
            $message = curl_error($handle);
            curl_close($handle);
            throw new RuntimeException('Registration API request failed: ' . $message);
        }
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);
        $json = json_decode((string) $body, true);
        return ['status' => $status, 'body' => (string) $body, 'json' => is_array($json) ? $json : null];
    }
}

$process = null;
$assertions = 0;
$failed = false;
$assert = static function (bool $condition, string $message) use (&$assertions): void {
    $assertions++;
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

try {
    $command = '"' . PHP_BINARY . '" "' . __DIR__ . '/smtp_test_catcher.php" '
        . $port . ' "' . $captureFile . '"';
    $process = proc_open($command, [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $pipes);
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start the localhost SMTP catcher.');
    }
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);

    $ready = false;
    for ($attempt = 0; $attempt < 50; $attempt++) {
        $socket = @stream_socket_client('tcp://127.0.0.1:' . $port, $socketError, $socketMessage, 0.1);
        if (is_resource($socket)) {
            fclose($socket);
            $ready = true;
            break;
        }
        usleep(100000);
    }
    $assert($ready, 'Local SMTP catcher must accept connections before registration.');

    $client = new RegistrationTestClient($baseUrl, $cookieFile);
    $csrf = $client->request('GET', '/api/auth/csrf.php');
    $client->csrfToken = (string) ($csrf['json']['csrfToken'] ?? '');
    $assert($csrf['status'] === 200 && $client->csrfToken !== '', 'Registration must obtain an initial CSRF token.');

    $registered = $client->request('POST', '/api/auth/register.php', [
        'name' => 'Verified Test Customer',
        'email' => $email,
        'phone' => '5550000',
        'password' => $password,
        'confirmPassword' => $password,
        'role' => 'owner',
    ]);
    $assert($registered['status'] === 201, 'Registration must send a verification email through the SMTP catcher: ' . $registered['body']);
    $pending = $client->request('GET', '/api/auth/pending.php');
    $assert($pending['status'] === 200 && ($pending['json']['email'] ?? '') === $email, 'Registration must hold the account pending until verification.');

    $capturedMessage = (string) file_get_contents($captureFile);
    $decodedMessage = quoted_printable_decode($capturedMessage);
    if (!preg_match('/(?:verification code is\s*=?|<strong>=?)(\d{6})/i', $decodedMessage, $codeMatch)) {
        throw new RuntimeException('SMTP catcher did not capture a six-digit verification code.');
    }
    $verified = $client->request('POST', '/api/auth/verify.php', ['code' => $codeMatch[1]]);
    $assert($verified['status'] === 200, 'The captured email verification code must verify the account: ' . $verified['body']);

    $findUser = $pdo->prepare('SELECT id, role FROM users WHERE email = :email');
    $findUser->execute(['email' => $email]);
    $user = $findUser->fetch(PDO::FETCH_ASSOC);
    $assert(is_array($user) && $user['role'] === 'customer', 'Email verification must create a customer even when registration submits role=owner.');
    $pendingCount = $pdo->prepare('SELECT COUNT(*) FROM pending_registrations WHERE email = :email');
    $pendingCount->execute(['email' => $email]);
    $assert((int) $pendingCount->fetchColumn() === 0, 'Successful verification must remove the pending registration.');
    $login = $client->request('POST', '/api/auth/login.php', ['email' => $email, 'password' => $password]);
    $assert($login['status'] === 200, 'The verified customer account must be able to sign in.');
    fwrite(STDOUT, "Registration and email verification passed (SMTP catcher, code verification, customer-only role; {$assertions} assertions).\n");
} catch (Throwable $exception) {
    $failed = true;
    fwrite(STDERR, "Registration and email verification failed after {$assertions} assertions: {$exception->getMessage()}\n");
} finally {
    $pdo->prepare('DELETE FROM pending_registrations WHERE email = :email')->execute(['email' => $email]);
    $pdo->prepare('DELETE FROM users WHERE email = :email')->execute(['email' => $email]);
    if (is_resource($process)) {
        proc_terminate($process);
        proc_close($process);
    }
    foreach ([$captureFile, $cookieFile] as $file) {
        if (is_string($file) && is_file($file)) {
            unlink($file);
        }
    }
}

if ($failed) {
    exit(1);
}
