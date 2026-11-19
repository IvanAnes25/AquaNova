<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api/v1/CommerceController.php';

$assertions = 0;
$assert = static function (bool $condition, string $message) use (&$assertions): void {
    $assertions++;
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

$statusLabel = new ReflectionMethod(CommerceController::class, 'orderStatusLabel');
$statusLabel->setAccessible(true);
$readyBody = new ReflectionMethod(CommerceController::class, 'readyNotificationBody');
$readyBody->setAccessible(true);
$completedBody = new ReflectionMethod(CommerceController::class, 'completionNotificationBody');
$completedBody->setAccessible(true);

$paymentMethods = [
    ['delivery', 'gcash'],
    ['delivery', 'cod'],
    ['pickup', 'gcash'],
    ['pickup', 'cash_pickup'],
];
$forbiddenPickupWording = '/\b(delivery|rider|lalamove|address)\b|delivery fee/i';

foreach ($paymentMethods as [$fulfillment, $payment]) {
    foreach (['pending', 'preparing', 'ready', 'completed', 'cancelled'] as $status) {
        $label = $statusLabel->invoke(null, $fulfillment, $payment, $status);
        $assert($label !== '', "$fulfillment/$payment/$status must have a status label.");
        if ($fulfillment === 'pickup') {
            $assert(
                preg_match($forbiddenPickupWording, $label) !== 1,
                "$fulfillment/$payment/$status label contains delivery-only wording."
            );
        }
    }

    $ready = $readyBody->invoke(null, $fulfillment);
    $completed = $completedBody->invoke(null, $fulfillment, $payment);
    if ($fulfillment === 'pickup') {
        $assert(str_contains(strtolower($ready), 'pickup'), "$payment ready notification must say pickup.");
        $assert(
            preg_match($forbiddenPickupWording, $ready . ' ' . $completed) !== 1,
            "$payment pickup notification contains delivery-only wording."
        );
    } else {
        $assert(str_contains(strtolower($ready), 'delivery'), "$payment ready notification must say delivery.");
    }
}

$assert(
    $statusLabel->invoke(null, 'pickup', 'cash_pickup', 'ready') === 'Ready for pickup',
    'Pickup ready label must be explicit.'
);
$assert(
    $statusLabel->invoke(null, 'pickup', 'cash_pickup', 'completed') === 'Handed over and paid',
    'Pickup cash completion label must describe the handoff.'
);
$assert(
    $statusLabel->invoke(null, 'delivery', 'cod', 'ready') === 'Out for delivery',
    'Delivery ready label must be explicit.'
);
$assert(
    $statusLabel->invoke(null, 'delivery', 'cod', 'completed') === 'Delivered and paid',
    'Delivery COD completion label must describe delivery and payment.'
);

fwrite(STDOUT, "Fulfillment wording tests passed ($assertions assertions).\n");
