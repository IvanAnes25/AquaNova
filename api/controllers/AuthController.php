<?php

declare(strict_types=1);

require_once __DIR__ . '/../services/Mailer.php';

final class AuthController
{
    private const MAX_CODE_ATTEMPTS = 5;
    private const MAX_RESENDS_PER_HOUR = 3;
    private const LOGIN_LIMIT = 5;
    private const LOGIN_WINDOW_MINUTES = 15;
    private const PASSWORD_CHANGE_LIMIT = 5;
    private const PASSWORD_CHANGE_LOCK_MINUTES = 15;

    private static function normalizedEmail(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $email = mb_strtolower(trim($value), 'UTF-8');
        if (strlen($email) > 190 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return null;
        }

        return $email;
    }

    private static function validPassword(mixed $value): bool
    {
        return is_string($value)
            && strlen($value) >= 8
            && strlen($value) <= 1024;
    }

    private static function verificationCode(): string
    {
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    private static function hashCode(string $code): string
    {
        return hash_hmac('sha256', $code, self::settingKey());
    }

    private static function settingKey(): string
    {
        global $authConfig;
        return (string) $authConfig['app_key'];
    }

    private static function loginIdentityHashes(string $email): array
    {
        return [
            ['email', hash_hmac('sha256', $email, self::settingKey())],
            ['address', hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), self::settingKey())],
        ];
    }

    private static function loginIsBlocked(array $identities): bool
    {
        $statement = auth_db()->prepare(
            'SELECT 1 FROM login_attempts
             WHERE scope = :scope AND identity_hash = :identity_hash
               AND blocked_until > UTC_TIMESTAMP() LIMIT 1'
        );

        foreach ($identities as [$scope, $hash]) {
            $statement->execute(['scope' => $scope, 'identity_hash' => $hash]);
            if ($statement->fetchColumn()) {
                return true;
            }
        }

        return false;
    }

    private static function recordFailedLogin(array $identities): bool
    {
        $db = auth_db();
        $blocked = false;
        $db->beginTransaction();

        try {
            foreach ($identities as [$scope, $hash]) {
                $insert = $db->prepare(
                    'INSERT INTO login_attempts
                        (scope, identity_hash, failed_attempts, window_started_at)
                     VALUES (:scope, :identity_hash, 0, UTC_TIMESTAMP())
                     ON DUPLICATE KEY UPDATE updated_at = UTC_TIMESTAMP()'
                );
                $insert->execute(['scope' => $scope, 'identity_hash' => $hash]);

                $select = $db->prepare(
                    'SELECT failed_attempts, window_started_at, blocked_until
                     FROM login_attempts WHERE scope = :scope AND identity_hash = :identity_hash
                     FOR UPDATE'
                );
                $select->execute(['scope' => $scope, 'identity_hash' => $hash]);
                $row = $select->fetch();
                $windowExpired = strtotime($row['window_started_at'] . ' UTC')
                    <= time() - self::LOGIN_WINDOW_MINUTES * 60;
                $attempts = $windowExpired ? 1 : (int) $row['failed_attempts'] + 1;
                $update = $db->prepare(
                    'UPDATE login_attempts
                     SET failed_attempts = :attempts,
                         window_started_at = IF(:reset_window = 1, UTC_TIMESTAMP(), window_started_at),
                         blocked_until = IF(:is_blocked = 1,
                             DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), NULL)
                     WHERE scope = :scope AND identity_hash = :identity_hash'
                );
                $update->execute([
                    'attempts' => $attempts,
                    'reset_window' => $windowExpired ? 1 : 0,
                    'is_blocked' => $attempts >= self::LOGIN_LIMIT ? 1 : 0,
                    'scope' => $scope,
                    'identity_hash' => $hash,
                ]);
                $blocked = $blocked || $attempts >= self::LOGIN_LIMIT;
            }

            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }

        $db->prepare(
            'DELETE FROM login_attempts WHERE updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)'
        )->execute();

        return $blocked;
    }

    public function csrf(): never
    {
        require_method('GET');
        json_response(['csrfToken' => csrf_token()]);
    }

    public function pending(): never
    {
        require_method('GET');
        if (empty($_SESSION['pending_registration_email'])) {
            json_response(['message' => 'No sign-up is waiting for verification.'], 404);
        }

        $find = auth_db()->prepare(
            'SELECT GREATEST(0, 60 - TIMESTAMPDIFF(SECOND, last_sent_at, UTC_TIMESTAMP()))
             FROM pending_registrations
             WHERE email = :email AND code_expires_at > UTC_TIMESTAMP() LIMIT 1'
        );
        $find->execute(['email' => $_SESSION['pending_registration_email']]);
        $seconds = $find->fetchColumn();
        if ($seconds === false) {
            unset($_SESSION['pending_registration_email']);
            json_response(['message' => 'The code expired or sign-up was not found. Please register again.'], 410);
        }

        json_response([
            'email' => $_SESSION['pending_registration_email'],
            'resendAfterSeconds' => (int) $seconds,
        ]);
    }

    public function register(): never
    {
        // Save only an Argon2id password hash while the email is pending verification.
        require_method('POST');
        require_csrf();
        $data = request_json();
        $name = trim(is_string($data['name'] ?? null) ? $data['name'] : '');
        $email = self::normalizedEmail($data['email'] ?? null);
        $phone = trim(is_string($data['phone'] ?? null) ? $data['phone'] : '');
        $password = $data['password'] ?? null;

        if ($name === '' || mb_strlen($name) > 120 || $email === null
            || $phone === '' || mb_strlen($phone) > 40
            || !self::validPassword($password)
            || !is_string($data['confirmPassword'] ?? null)
            || !hash_equals($password, $data['confirmPassword'])) {
            json_response([
                'message' => 'Check your name, email, phone number, and password. Passwords must match and be at least 8 characters.',
            ], 422);
        }

        $db = auth_db();
        $existing = $db->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $existing->execute(['email' => $email]);
        if ($existing->fetchColumn()) {
            json_response(['message' => 'email account already exist and used'], 409);
        }

        $pending = $db->prepare('SELECT id FROM pending_registrations WHERE email = :email LIMIT 1');
        $pending->execute(['email' => $email]);
        if ($pending->fetchColumn()) {
            $_SESSION['pending_registration_email'] = $email;
            json_response([
                'message' => 'A verification is already pending for this email. Continue verification or resend the code.',
                'pending' => true,
            ], 409);
        }

        $code = self::verificationCode();
        $db->beginTransaction();
        try {
            $insert = $db->prepare(
                'INSERT INTO pending_registrations
                    (name, email, phone, password_hash, code_hash, code_expires_at,
                     last_sent_at, resend_window_started_at)
                 VALUES
                    (:name, :email, :phone, :password_hash, :code_hash,
                     DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE),
                     UTC_TIMESTAMP(), UTC_TIMESTAMP())'
            );
            $insert->execute([
                'name' => $name,
                'email' => $email,
                'phone' => $phone,
                'password_hash' => hash_password($password),
                'code_hash' => self::hashCode($code),
            ]);

            Mailer::sendVerification($email, $name, $code);
            $db->commit();
        } catch (PDOException $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if ($exception->getCode() === '23000') {
                json_response(['message' => 'email account already exist and used'], 409);
            }
            throw $exception;
        } catch (MailDeliveryException $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            json_response(['message' => 'We could not send the verification email. Please try again.'], 503);
        }

        $_SESSION['pending_registration_email'] = $email;
        audit_auth_event('code sent', $email);
        json_response(['message' => 'A verification code was sent to your email.', 'email' => $email], 201);
    }

    public function verify(): never
    {
        // The account row is created only after the email code is verified.
        require_method('POST');
        require_csrf();
        $email = $_SESSION['pending_registration_email'] ?? '';
        $code = request_json()['code'] ?? null;
        if (!is_string($email) || $email === '') {
            json_response(['message' => 'Start sign-up again to request a verification code.'], 409);
        }
        if (!is_string($code) || !preg_match('/^\d{6}$/', $code)) {
            json_response(['message' => 'Incorrect code'], 422);
        }

        $db = auth_db();
        $db->beginTransaction();
        try {
            $select = $db->prepare(
                'SELECT id, name, email, phone, password_hash, code_hash, wrong_attempts
                 FROM pending_registrations
                 WHERE email = :email AND code_expires_at > UTC_TIMESTAMP()
                 FOR UPDATE'
            );
            $select->execute(['email' => $email]);
            $pending = $select->fetch();

            if (!$pending) {
                $db->commit();
                unset($_SESSION['pending_registration_email']);
                json_response(['message' => 'The code expired or sign-up was not found. Please register again.'], 410);
            }

            if (!hash_equals($pending['code_hash'], self::hashCode($code))) {
                $attempts = (int) $pending['wrong_attempts'] + 1;
                if ($attempts >= self::MAX_CODE_ATTEMPTS) {
                    $delete = $db->prepare('DELETE FROM pending_registrations WHERE id = :id');
                    $delete->execute(['id' => $pending['id']]);
                } else {
                    $update = $db->prepare(
                        'UPDATE pending_registrations SET wrong_attempts = :attempts WHERE id = :id'
                    );
                    $update->execute(['attempts' => $attempts, 'id' => $pending['id']]);
                }
                $db->commit();
                audit_auth_event('code failed', $email);
                if ($attempts >= self::MAX_CODE_ATTEMPTS) {
                    unset($_SESSION['pending_registration_email']);
                    json_response(['message' => 'Incorrect code. Sign-up must be restarted after five incorrect attempts.'], 429);
                }
                json_response(['message' => 'Incorrect code'], 422);
            }

            $insert = $db->prepare(
                "INSERT INTO users (name, email, phone, password_hash, role)
                 VALUES (:name, :email, :phone, :password_hash, 'customer')"
            );
            $insert->execute([
                'name' => $pending['name'],
                'email' => $pending['email'],
                'phone' => $pending['phone'],
                'password_hash' => $pending['password_hash'],
            ]);
            $delete = $db->prepare('DELETE FROM pending_registrations WHERE id = :id');
            $delete->execute(['id' => $pending['id']]);
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }

        unset($_SESSION['pending_registration_email']);
        audit_auth_event('account created', $email);
        json_response(['message' => 'Your account is verified. Please log in.']);
    }

    public function resend(): never
    {
        // Replace the previous code only after the cooldown and hourly limit checks pass.
        require_method('POST');
        require_csrf();
        $email = $_SESSION['pending_registration_email'] ?? '';
        if (!is_string($email) || $email === '') {
            json_response(['message' => 'Start sign-up again to request a verification code.'], 409);
        }

        $db = auth_db();
        $db->beginTransaction();
        try {
            $select = $db->prepare(
                'SELECT id, name, resend_count, resend_window_started_at, last_sent_at
                 FROM pending_registrations
                 WHERE email = :email AND code_expires_at > UTC_TIMESTAMP()
                 FOR UPDATE'
            );
            $select->execute(['email' => $email]);
            $pending = $select->fetch();
            if (!$pending) {
                $db->commit();
                unset($_SESSION['pending_registration_email']);
                json_response(['message' => 'The code expired or sign-up was not found. Please register again.'], 410);
            }

            $now = time();
            $lastSent = strtotime($pending['last_sent_at'] . ' UTC');
            if ($now - $lastSent < 60) {
                $wait = 60 - ($now - $lastSent);
                $db->rollBack();
                json_response(['message' => "Please wait {$wait} seconds before requesting another code."], 429);
            }

            $windowStarted = strtotime($pending['resend_window_started_at'] . ' UTC');
            $windowExpired = $now - $windowStarted >= 3600;
            $resends = $windowExpired ? 0 : (int) $pending['resend_count'];
            if ($resends >= self::MAX_RESENDS_PER_HOUR) {
                $db->rollBack();
                json_response(['message' => 'You have reached the resend limit. Try again after one hour.'], 429);
            }

            $code = self::verificationCode();
            $update = $db->prepare(
                'UPDATE pending_registrations
                 SET code_hash = :code_hash,
                     code_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE),
                     last_sent_at = UTC_TIMESTAMP(),
                     resend_count = :resend_count,
                     resend_window_started_at = IF(:reset_window = 1, UTC_TIMESTAMP(), resend_window_started_at)
                 WHERE id = :id'
            );
            $update->execute([
                'code_hash' => self::hashCode($code),
                'resend_count' => $resends + 1,
                'reset_window' => $windowExpired ? 1 : 0,
                'id' => $pending['id'],
            ]);

            Mailer::sendVerification($email, $pending['name'], $code);
            $db->commit();
        } catch (MailDeliveryException $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            json_response(['message' => 'We could not send a new verification email. Please try again.'], 503);
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }

        audit_auth_event('code sent', $email);
        json_response(['message' => 'A new verification code was sent. The previous code no longer works.']);
    }

    public function login(): never
    {
        // Check a dummy Argon2id hash for unknown emails to keep failures similar.
        require_method('POST');
        require_csrf();
        $data = request_json();
        $email = self::normalizedEmail($data['email'] ?? null) ?? '';
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        $passwordForCheck = strlen($password) <= 1024 ? $password : '';
        $identities = self::loginIdentityHashes($email);

        if (self::loginIsBlocked($identities)) {
            audit_auth_event('login failure', $email);
            json_response(['message' => 'Too many failed attempts. Login is blocked for 15 minutes.'], 429);
        }

        $user = null;
        if ($email !== '') {
            $find = auth_db()->prepare(
                'SELECT id, name, email, password_hash, role, session_version, must_change_password
                 FROM users WHERE email = :email LIMIT 1'
            );
            $find->execute(['email' => $email]);
            $user = $find->fetch() ?: null;
        }

        global $authConfig;
        $hash = $user['password_hash'] ?? $authConfig['dummy_password_hash'];
        $passwordMatches = password_verify($passwordForCheck, $hash);

        if (!$user || !$passwordMatches) {
            audit_auth_event('login failure', $email);
            if (self::recordFailedLogin($identities)) {
                json_response(['message' => 'Too many failed attempts. Login is blocked for 15 minutes.'], 429);
            }
            json_response(['message' => 'Incorrect email or password'], 401);
        }

        if (password_needs_rehash($user['password_hash'], PASSWORD_ARGON2ID, argon_options())) {
            $rehash = auth_db()->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
            $rehash->execute(['hash' => hash_password($password), 'id' => $user['id']]);
        }

        $removeAttempts = auth_db()->prepare(
            'DELETE FROM login_attempts WHERE (scope = :email_scope AND identity_hash = :email_hash)
                OR (scope = :address_scope AND identity_hash = :address_hash)'
        );
        $removeAttempts->execute([
            'email_scope' => $identities[0][0],
            'email_hash' => $identities[0][1],
            'address_scope' => $identities[1][0],
            'address_hash' => $identities[1][1],
        ]);

        session_regenerate_id(true);
        $_SESSION = [
            'user_id' => (int) $user['id'],
            'session_version' => (int) $user['session_version'],
            'must_change_password' => (bool) $user['must_change_password'],
            'last_activity' => time(),
            'csrf_token' => bin2hex(random_bytes(32)),
        ];
        audit_auth_event('login success', $user['email']);
        json_response([
            'message' => 'You are logged in.',
            'role' => auth_role_for_app($user['role']),
            'mustChangePassword' => (bool) $user['must_change_password'],
            'csrfToken' => $_SESSION['csrf_token'],
        ]);
    }

    public function session(): never
    {
        require_method('GET');
        $user = current_auth_user();
        json_response(['user' => $user ? [
            'id' => (int) $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => auth_role_for_app($user['role']),
            'mustChangePassword' => (bool) ($_SESSION['must_change_password'] ?? false),
        ] : null]);
    }

    public function customerPage(): never
    {
        require_method('GET');
        $user = require_auth_role('customer');
        json_response(['user' => ['name' => $user['name'], 'role' => $user['role']]]);
    }

    public function ownerPage(): never
    {
        require_method('GET');
        $user = require_auth_role('owner');
        if (!empty($_SESSION['must_change_password'])) {
            json_response(['message' => 'Change your temporary password before accessing owner features.'], 403);
        }
        json_response(['user' => ['name' => $user['name'], 'role' => $user['role']]]);
    }

    public function changePassword(): never
    {
        require_method('POST');
        require_csrf();
        $user = current_auth_user();
        if ($user === null) {
            json_response(['message' => 'Please log in to continue.'], 401);
        }

        $data = request_json();
        $currentPassword = is_string($data['currentPassword'] ?? null) ? $data['currentPassword'] : '';
        $password = $data['password'] ?? null;
        if (!self::validPassword($password)
            || !is_string($data['confirmPassword'] ?? null)
            || !hash_equals($password, $data['confirmPassword'])) {
            json_response(['message' => 'Enter a matching password of at least 8 characters.'], 422);
        }

        $db = auth_db();
        $db->beginTransaction();
        try {
            $find = $db->prepare(
                'SELECT password_hash, failed_attempts, locked_until
                 FROM users WHERE id = :id LIMIT 1 FOR UPDATE'
            );
            $find->execute(['id' => $user['id']]);
            $account = $find->fetch();
            if (!$account || !is_string($account['password_hash'])) {
                $db->rollBack();
                json_response(['message' => 'Please log in to continue.'], 401);
            }

            $lockedUntil = $account['locked_until'];
            if (is_string($lockedUntil) && strtotime($lockedUntil . ' UTC') > time()) {
                $db->rollBack();
                json_response([
                    'message' => 'Too many incorrect current-password attempts. Try again in '
                        . self::PASSWORD_CHANGE_LOCK_MINUTES . ' minutes.',
                ], 429);
            }

            $passwordHash = $account['password_hash'];
            if (!password_verify($currentPassword, $passwordHash)) {
                // This per-user lock does not use or alter login_attempts.
                $windowExpired = is_string($lockedUntil) && strtotime($lockedUntil . ' UTC') <= time();
                $attempts = $windowExpired
                    ? 1
                    : min(255, (int) $account['failed_attempts'] + 1);
                $blocked = $attempts >= self::PASSWORD_CHANGE_LIMIT;
                $recordFailure = $db->prepare(
                    'UPDATE users
                     SET failed_attempts = :attempts,
                         locked_until = IF(:blocked = 1,
                             DATE_ADD(UTC_TIMESTAMP(), INTERVAL ' . self::PASSWORD_CHANGE_LOCK_MINUTES . ' MINUTE), NULL)
                     WHERE id = :id'
                );
                $recordFailure->execute([
                    'attempts' => $attempts,
                    'blocked' => $blocked ? 1 : 0,
                    'id' => $user['id'],
                ]);
                $db->commit();
                if ($blocked) {
                    json_response([
                        'message' => 'Too many incorrect current-password attempts. Try again in '
                            . self::PASSWORD_CHANGE_LOCK_MINUTES . ' minutes.',
                    ], 429);
                }
                json_response(['message' => 'The current password is incorrect.'], 422);
            }

            if (password_verify($password, $passwordHash)) {
                $db->rollBack();
                json_response(['message' => 'Choose a password different from your current password.'], 422);
            }

            $update = $db->prepare(
                'UPDATE users
                 SET password_hash = :password_hash, must_change_password = 0,
                     session_version = session_version + 1, failed_attempts = 0, locked_until = NULL
                 WHERE id = :id'
            );
            $update->execute(['password_hash' => hash_password($password), 'id' => $user['id']]);
            $version = $db->prepare('SELECT session_version FROM users WHERE id = :id');
            $version->execute(['id' => $user['id']]);
            $newSessionVersion = (int) $version->fetchColumn();

            $audit = $db->prepare(
                'INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip)
                 VALUES (:user_id, :action, :entity, :entity_id, :details, :ip)'
            );
            $audit->execute([
                'user_id' => $user['id'],
                'action' => 'account.password_changed',
                'entity' => 'user',
                'entity_id' => (string) $user['id'],
                'details' => json_encode(['role' => $user['role']], JSON_THROW_ON_ERROR),
                'ip' => filter_var($_SERVER['REMOTE_ADDR'] ?? null, FILTER_VALIDATE_IP) ?: null,
            ]);
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }

        $_SESSION['session_version'] = $newSessionVersion;
        $_SESSION['must_change_password'] = false;
        $_SESSION['last_activity'] = time();
        session_regenerate_id(true);
        json_response(['message' => 'Your password has been changed.']);
    }

    public function logout(): never
    {
        require_method('POST');
        require_csrf();
        destroy_auth_session();
        json_response(['message' => 'You are logged out.']);
    }

    public function forgotPassword(): never
    {
        require_method('POST');
        require_csrf();
        $email = self::normalizedEmail(request_json()['email'] ?? null);
        if ($email !== null) {
            $find = auth_db()->prepare('SELECT id, name FROM users WHERE email = :email LIMIT 1');
            $find->execute(['email' => $email]);
            $user = $find->fetch();

            if ($user) {
                $existing = auth_db()->prepare(
                    'SELECT created_at FROM password_resets WHERE user_id = :user_id LIMIT 1'
                );
                $existing->execute(['user_id' => $user['id']]);
                $createdAt = $existing->fetchColumn();
                if (!$createdAt || strtotime($createdAt . ' UTC') <= time() - 60) {
                    $token = bin2hex(random_bytes(32));
                    $db = auth_db();
                    $db->beginTransaction();
                    try {
                        $delete = $db->prepare('DELETE FROM password_resets WHERE user_id = :user_id');
                        $delete->execute(['user_id' => $user['id']]);
                        $insert = $db->prepare(
                            'INSERT INTO password_resets (user_id, token_hash, expires_at)
                             VALUES (:user_id, :token_hash, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))'
                        );
                        $insert->execute([
                            'user_id' => $user['id'],
                            'token_hash' => hash('sha256', $token),
                        ]);
                        global $authConfig;
                        $url = rtrim($authConfig['app_url'], '/') . '/reset-password#' . $token;
                        Mailer::sendPasswordReset($email, $user['name'], $url);
                        $db->commit();
                    } catch (MailDeliveryException $exception) {
                        if ($db->inTransaction()) {
                            $db->rollBack();
                        }
                    } catch (Throwable $exception) {
                        if ($db->inTransaction()) {
                            $db->rollBack();
                        }
                        throw $exception;
                    }
                }
            }
        }

        json_response([
            'message' => 'If an account matches that email, a password reset link will be sent.',
        ]);
    }

    public function resetPassword(): never
    {
        // Reset links are single-use; changing a password invalidates old sessions.
        require_method('POST');
        require_csrf();
        $data = request_json();
        $token = $data['token'] ?? null;
        $password = $data['password'] ?? null;
        if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)
            || !self::validPassword($password)
            || !is_string($data['confirmPassword'] ?? null)
            || !hash_equals($password, $data['confirmPassword'])) {
            json_response(['message' => 'Enter a valid reset link and matching password of at least 8 characters.'], 422);
        }

        $db = auth_db();
        $db->beginTransaction();
        try {
            $find = $db->prepare(
                'SELECT id, user_id FROM password_resets
                 WHERE token_hash = :token_hash AND expires_at > UTC_TIMESTAMP()
                 LIMIT 1 FOR UPDATE'
            );
            $find->execute(['token_hash' => hash('sha256', $token)]);
            $reset = $find->fetch();
            if (!$reset) {
                $db->rollBack();
                json_response(['message' => 'This reset link has expired or was already used. Request a new one.'], 410);
            }

            $update = $db->prepare(
                'UPDATE users SET password_hash = :password_hash, session_version = session_version + 1
                 WHERE id = :id'
            );
            $update->execute([
                'password_hash' => hash_password($password),
                'id' => $reset['user_id'],
            ]);
            $delete = $db->prepare('DELETE FROM password_resets WHERE id = :id');
            $delete->execute(['id' => $reset['id']]);
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }

        json_response(['message' => 'Your password was changed. You can now log in.']);
    }
}
