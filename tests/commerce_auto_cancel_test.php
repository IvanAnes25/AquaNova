<?php

declare(strict_types=1);

require_once __DIR__ . '/isolated_test_database.php';

$assertions = 0;
$assert = static function (bool $condition, string $message) use (&$assertions): void {
    $assertions++;
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

$pdo = isolated_test_database_connection();
$tag = bin2hex(random_bytes(5));
$email = 'auto-cancel-' . $tag . '@example.test';
$userId = 0;
$orderIds = [];
$previousSetting = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = :key');
$previousSetting->execute(['key' => 'auto_cancel_hours']);
$previousHours = $previousSetting->fetchColumn();
$hadPreviousHours = $previousHours !== false;

$runJob = static function () use ($assert): array {
    $script = dirname(__DIR__) . '/scripts/cancel_expired_orders.php';
    $command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($script);
    $pipes = [];
    $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, dirname(__DIR__));
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start the auto-cancel command.');
    }
    fclose($pipes[0]);
    $output = stream_get_contents($pipes[1]);
    $errors = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);
    $assert($exitCode === 0, 'Auto-cancel command exits successfully: ' . trim((string) $errors));
    return ['output' => (string) $output, 'errors' => (string) $errors];
};
$runJobsConcurrently = static function () use ($assert): array {
    $script = dirname(__DIR__) . '/scripts/cancel_expired_orders.php';
    $command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($script);
    $jobs = [];
    for ($index = 0; $index < 2; $index++) {
        $pipes = [];
        $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, dirname(__DIR__));
        if (!is_resource($process)) {
            throw new RuntimeException('Could not start concurrent auto-cancel command.');
        }
        fclose($pipes[0]);
        $jobs[] = ['process' => $process, 'pipes' => $pipes];
    }

    $results = [];
    foreach ($jobs as $job) {
        $output = stream_get_contents($job['pipes'][1]);
        $errors = stream_get_contents($job['pipes'][2]);
        fclose($job['pipes'][1]);
        fclose($job['pipes'][2]);
        $exitCode = proc_close($job['process']);
        $assert($exitCode === 0, 'Concurrent auto-cancel command exits successfully: ' . trim((string) $errors));
        $results[] = ['output' => (string) $output, 'errors' => (string) $errors];
    }
    return $results;
};

try {
    $insertUser = $pdo->prepare(
        "INSERT INTO users (name, email, phone, password_hash, role, must_change_password, email_verified_at)
         VALUES ('Auto-cancel test', :email, '5550000', :password_hash, 'customer', 0, UTC_TIMESTAMP())"
    );
    $insertUser->execute([
        'email' => $email,
        'password_hash' => password_hash(bin2hex(random_bytes(16)), PASSWORD_ARGON2ID),
    ]);
    $userId = (int) $pdo->lastInsertId();

    $createOrder = static function (
        string $suffix,
        string $paymentStatus,
        bool $oldOrder,
        ?string $proofStatus,
        bool $oldRejection
    ) use ($pdo, $userId, $tag, &$orderIds): int {
        $orderNo = 'AT-' . $tag . '-' . $suffix;
        $legacyPaymentStatus = match ($paymentStatus) {
            'unpaid' => 'Awaiting proof',
            'under_review' => 'Proof submitted',
            'rejected' => 'Rejected',
        };
        $insert = $pdo->prepare(
            'INSERT INTO orders
             (order_number, user_id, customer_name, customer_email, phone, delivery_method,
              delivery_address, payment_method, subtotal, total, status, payment_status,
              order_no, fulfillment, payment_method_v2, order_status, payment_status_v2,
              delivery_fee, delivery_address_snapshot)
             VALUES
             (:order_number, :user_id, :name, :email, :phone, :delivery_method,
              :address, :payment_method, 1, 1, :legacy_status, :legacy_payment_status,
              :order_no, :fulfillment, :payment_method_v2, :status, :payment_status_v2,
              0, :snapshot)'
        );
        $insert->execute([
            'order_number' => $orderNo,
            'user_id' => $userId,
            'name' => 'Auto-cancel test',
            'email' => 'auto-cancel@example.test',
            'phone' => '5550000',
            'delivery_method' => 'Local delivery',
            'address' => 'Test address',
            'payment_method' => 'GCash',
            'legacy_status' => 'Pending',
            'legacy_payment_status' => $legacyPaymentStatus,
            'order_no' => $orderNo,
            'fulfillment' => 'delivery',
            'payment_method_v2' => 'gcash',
            'status' => 'pending',
            'payment_status_v2' => $paymentStatus,
            'snapshot' => '{"line1":"Test address"}',
        ]);
        $orderId = (int) $pdo->lastInsertId();
        $orderIds[] = $orderId;
        if ($oldOrder) {
            $pdo->prepare(
                'UPDATE orders SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 4 HOUR) WHERE id = :id'
            )->execute(['id' => $orderId]);
        }

        if ($proofStatus !== null) {
            $proof = $pdo->prepare(
                'INSERT INTO payment_proofs
                 (order_id, reference_no, image_path, amount, status, reject_reason, reviewed_at)
                 VALUES (:order_id, :reference, :path, 1, :status, :reason, :reviewed_at)'
            );
            $proof->execute([
                'order_id' => $orderId,
                'reference' => 'T' . $tag . substr(hash('sha256', $suffix), 0, 8),
                'path' => 'private/uploads/test-expiry.png',
                'status' => $proofStatus,
                'reason' => $proofStatus === 'rejected' ? 'Test rejection' : null,
                'reviewed_at' => $proofStatus !== 'rejected'
                    ? null
                    : gmdate('Y-m-d H:i:s', time() - ($oldRejection ? 4 * 3600 : 0)),
            ]);
            if ($proofStatus === 'under_review') {
                $pdo->prepare(
                    'UPDATE payment_proofs SET submitted_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 4 HOUR)
                     WHERE order_id = :order_id'
                )->execute(['order_id' => $orderId]);
            }
        }

        return $orderId;
    };

    $staleUnpaid = $createOrder('stale-unpaid', 'unpaid', true, null, false);
    $freshUnpaid = $createOrder('fresh-unpaid', 'unpaid', false, null, false);
    $staleRejected = $createOrder('stale-rejected', 'rejected', false, 'rejected', true);
    $recentlyRejected = $createOrder('recent-rejection', 'rejected', true, 'rejected', false);
    $staleUnderReview = $createOrder('under-review', 'under_review', true, 'under_review', false);

    $pdo->prepare('DELETE FROM settings WHERE setting_key = :key')->execute(['key' => 'auto_cancel_hours']);
    $disabledRun = $runJob();
    $assert(str_contains($disabledRun['output'], 'disabled'), 'Auto-cancel stays disabled when no hours are configured.');

    $statuses = $pdo->prepare('SELECT order_status FROM orders WHERE id = :id');
    foreach ($orderIds as $orderId) {
        $statuses->execute(['id' => $orderId]);
        $assert($statuses->fetchColumn() === 'pending', 'Disabled job leaves Pending orders untouched.');
    }

    $pdo->prepare(
        'INSERT INTO settings (setting_key, setting_value) VALUES (:key, :value)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
    )->execute(['key' => 'auto_cancel_hours', 'value' => '2']);
    $run = $runJob();
    $assert(str_contains($run['output'], 'Cancelled 2'), 'Job cancels exactly the two expired eligible orders.');

    $expectedStatuses = [
        $staleUnpaid => 'cancelled',
        $freshUnpaid => 'pending',
        $staleRejected => 'cancelled',
        $recentlyRejected => 'pending',
        $staleUnderReview => 'pending',
    ];
    foreach ($expectedStatuses as $orderId => $expectedStatus) {
        $statuses->execute(['id' => $orderId]);
        $assert($statuses->fetchColumn() === $expectedStatus, "Order $orderId has expected status $expectedStatus.");
    }

    $effects = $pdo->prepare(
        "SELECT
            (SELECT COUNT(*) FROM order_status_history WHERE order_id IN (?, ?) AND from_status = 'pending' AND to_status = 'cancelled') AS history_count,
            (SELECT COUNT(*) FROM notifications WHERE order_id IN (?, ?) AND title = 'Order automatically cancelled') AS notification_count,
            (SELECT COUNT(*) FROM audit_log WHERE entity = 'order' AND action = 'order.auto_cancelled' AND entity_id IN (?, ?)) AS audit_count"
    );
    $effects->execute([$staleUnpaid, $staleRejected, $staleUnpaid, $staleRejected, (string) $staleUnpaid, (string) $staleRejected]);
    $counts = $effects->fetch();
    $assert((int) $counts['history_count'] === 2, 'Each automatic cancellation is recorded in order history.');
    $assert((int) $counts['notification_count'] === 2, 'Each customer is notified of automatic cancellation.');
    $assert((int) $counts['audit_count'] === 2, 'Each automatic cancellation is audited.');

    $secondRun = $runJob();
    $assert(str_contains($secondRun['output'], 'Cancelled 0'), 'Repeated job runs do not cancel the same order twice.');

    $reminderOrder = $createOrder('reminder', 'unpaid', true, null, false);
    $pdo->prepare(
        'UPDATE orders SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 21 HOUR) WHERE id = :id'
    )->execute(['id' => $reminderOrder]);
    $pdo->prepare(
        'INSERT INTO settings (setting_key, setting_value) VALUES (:key, :value)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
    )->execute(['key' => 'auto_cancel_hours', 'value' => '24']);
    $reminderRuns = $runJobsConcurrently();
    $reminderOutput = implode("\n", array_column($reminderRuns, 'output'));
    $assert(
        substr_count($reminderOutput, 'Sent 1 payment reminder(s).') === 1
            && substr_count($reminderOutput, 'Sent 0 payment reminder(s).') === 1,
        'Concurrent auto-cancel runs send exactly one reminder for an order 20-24 hours old.'
    );
    $reminderCount = $pdo->prepare(
        "SELECT COUNT(*) FROM notifications WHERE order_id = :id AND title = 'Payment reminder'"
    );
    $reminderCount->execute(['id' => $reminderOrder]);
    $assert((int) $reminderCount->fetchColumn() === 1, 'A payment reminder is recorded once per order.');
    $reminderRepeat = $runJob();
    $assert(str_contains($reminderRepeat['output'], 'Sent 0 payment reminder(s).'), 'Repeated job runs do not repeat a sent reminder.');

    fwrite(STDOUT, "Commerce auto-cancel tests passed ($assertions assertions).\n");
} catch (Throwable $exception) {
    fwrite(STDERR, "Commerce auto-cancel tests failed after $assertions assertions: {$exception->getMessage()}\n");
    $exit = 1;
} finally {
    if ($orderIds) {
        $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
        $pdo->prepare("DELETE FROM notifications WHERE order_id IN ($placeholders)")->execute($orderIds);
        $pdo->prepare("DELETE FROM audit_log WHERE action = 'order.auto_cancelled' AND entity_id IN ($placeholders)")
            ->execute(array_map('strval', $orderIds));
        $pdo->prepare("DELETE FROM order_status_history WHERE order_id IN ($placeholders)")->execute($orderIds);
        $pdo->prepare("DELETE FROM payment_proofs WHERE order_id IN ($placeholders)")->execute($orderIds);
        $pdo->prepare("DELETE FROM order_items WHERE order_id IN ($placeholders)")->execute($orderIds);
        $pdo->prepare("DELETE FROM stock_movements WHERE order_id IN ($placeholders)")->execute($orderIds);
        $pdo->prepare("DELETE FROM orders WHERE id IN ($placeholders)")->execute($orderIds);
    }
    if ($userId > 0) {
        $pdo->prepare('DELETE FROM audit_log WHERE user_id = :user_id')->execute(['user_id' => $userId]);
        $pdo->prepare('DELETE FROM notifications WHERE user_id = :user_id')->execute(['user_id' => $userId]);
        $pdo->prepare('DELETE FROM users WHERE id = :user_id')->execute(['user_id' => $userId]);
    }
    if ($hadPreviousHours) {
        $pdo->prepare(
            'INSERT INTO settings (setting_key, setting_value) VALUES (:key, :value)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
        )->execute(['key' => 'auto_cancel_hours', 'value' => $previousHours]);
    } else {
        $pdo->prepare('DELETE FROM settings WHERE setting_key = :key')->execute(['key' => 'auto_cancel_hours']);
    }
}

if (isset($exit) && $exit !== 0) {
    exit($exit);
}
