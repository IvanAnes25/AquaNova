<?php

declare(strict_types=1);

return [
    'name' => '20261117_pickup_notification_wording',
    'up' => static function (PDO $pdo): void {
        $count = static function () use ($pdo): int {
            $statement = $pdo->query(
                "SELECT COUNT(*)
                 FROM notifications n
                 JOIN orders o ON o.id = n.order_id
                 WHERE o.fulfillment = 'pickup'
                   AND n.title = 'Order ready'
                   AND n.body = 'Your order is ready for delivery or pickup.'"
            );
            return (int) $statement->fetchColumn();
        };

        $before = $count();
        $pdo->beginTransaction();
        try {
            $pdo->exec(
                "UPDATE notifications n
                 JOIN orders o ON o.id = n.order_id
                 SET n.body = 'Your order is ready for pickup.'
                 WHERE o.fulfillment = 'pickup'
                   AND n.title = 'Order ready'
                   AND n.body = 'Your order is ready for delivery or pickup.'"
            );
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }

        $after = $count();
        fwrite(STDOUT, "Pickup wording notifications before: $before; after: $after.\n");
    },
    'down' => static function (PDO $pdo): void {
    },
];
