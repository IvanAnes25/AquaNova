<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/database/connection.php';

$pdo = null;

try {
    $pdo = database_connection();
    $setting = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = :key LIMIT 1');
    $setting->execute(['key' => 'auto_cancel_hours']);
    $rawHours = $setting->fetchColumn();

    if ($rawHours === false || $rawHours === null || $rawHours === '') {
        fwrite(STDOUT, "Auto-cancel is disabled; set a duration in owner Settings to enable it.\n");
        exit(0);
    }

    $hours = filter_var($rawHours, FILTER_VALIDATE_INT);
    if ($hours === false || $hours < 1 || $hours > 720) {
        throw new RuntimeException('Auto-cancel hours must be an integer from 1 to 720.');
    }

    $cutoff = gmdate('Y-m-d H:i:s', time() - ($hours * 3600));
    $pdo->beginTransaction();
    $candidates = $pdo->prepare(
        "SELECT o.id, o.user_id, o.order_no, o.payment_status_v2, o.created_at,
                latest_proof.reviewed_at AS last_rejected_at
         FROM orders o
         LEFT JOIN payment_proofs latest_proof
           ON latest_proof.id = (
               SELECT MAX(p.id) FROM payment_proofs p WHERE p.order_id = o.id
           )
         WHERE o.order_status = 'pending'
           AND o.stock_deducted = 0
           AND (
               (o.payment_status_v2 = 'unpaid' AND o.created_at <= :unpaid_cutoff)
               OR (
                   o.payment_status_v2 = 'rejected'
                   AND latest_proof.status = 'rejected'
                   AND latest_proof.reviewed_at IS NOT NULL
                   AND latest_proof.reviewed_at <= :rejected_cutoff
               )
           )
         ORDER BY o.id
         FOR UPDATE"
    );
    $candidates->execute(['unpaid_cutoff' => $cutoff, 'rejected_cutoff' => $cutoff]);

    $cancelled = 0;
    $update = $pdo->prepare(
        "UPDATE orders
         SET status = 'Cancelled', order_status = 'cancelled',
             cancelled_by = NULL, cancel_reason = :reason, updated_at = UTC_TIMESTAMP()
         WHERE id = :id AND order_status = 'pending'
           AND payment_status_v2 = :payment_status AND stock_deducted = 0"
    );
    $history = $pdo->prepare(
        'INSERT INTO order_status_history (order_id, from_status, to_status, by_user_id, note)
         VALUES (:order_id, :from_status, :to_status, NULL, :note)'
    );
    $notification = $pdo->prepare(
        'INSERT INTO notifications (user_id, order_id, title, body)
         VALUES (:user_id, :order_id, :title, :body)'
    );
    $audit = $pdo->prepare(
        'INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip)
         VALUES (NULL, :action, :entity, :entity_id, :details, NULL)'
    );

    foreach ($candidates->fetchAll() as $order) {
        $basis = $order['payment_status_v2'] === 'rejected' ? 'last_rejected_at' : 'created_at';
        $expiredAt = $basis === 'last_rejected_at' ? $order['last_rejected_at'] : $order['created_at'];
        $reason = sprintf('Automatically cancelled after %d hours without payment completion.', $hours);
        $update->execute([
            'reason' => $reason,
            'id' => $order['id'],
            'payment_status' => $order['payment_status_v2'],
        ]);
        if ($update->rowCount() !== 1) {
            throw new RuntimeException('An expired order changed while it was being processed.');
        }

        $history->execute([
            'order_id' => $order['id'],
            'from_status' => 'pending',
            'to_status' => 'cancelled',
            'note' => $reason,
        ]);
        $notification->execute([
            'user_id' => $order['user_id'],
            'order_id' => $order['id'],
            'title' => 'Order automatically cancelled',
            'body' => 'Your order ' . $order['order_no'] . ' was cancelled because payment was not completed in time.',
        ]);
        $audit->execute([
            'action' => 'order.auto_cancelled',
            'entity' => 'order',
            'entity_id' => (string) $order['id'],
            'details' => json_encode([
                'payment_status' => $order['payment_status_v2'],
                'age_basis' => $basis,
                'expired_at' => $expiredAt,
                'auto_cancel_hours' => $hours,
            ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        ]);
        $cancelled++;
    }

    $pdo->commit();
    fwrite(STDOUT, sprintf("Cancelled %d expired Pending order(s); cutoff %s UTC.\n", $cancelled, $cutoff));
} catch (Throwable $exception) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "Auto-cancel failed: {$exception->getMessage()}\n");
    exit(1);
}
