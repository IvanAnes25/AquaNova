<?php
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid request body.']);
    exit;
}

$customer = $data['customer'] ?? [];
$items = $data['items'] ?? [];

if (empty($customer['name']) || empty($customer['phone']) || empty($customer['email']) || empty($customer['address'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Please complete the checkout form.']);
    exit;
}

if (!is_array($items) || count($items) === 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Cart is empty.']);
    exit;
}

$total = 0;
foreach ($items as $item) {
    if (!isset($item['qty'], $item['price'])) {
        continue;
    }
    $total += (float) $item['price'] * (int) $item['qty'];
}

$orderId = 'AQ-' . date('YmdHis');

echo json_encode([
    'success' => true,
    'order_id' => $orderId,
    'message' => 'Order placed successfully. The shop will contact you soon.',
    'total' => $total,
    'items_count' => count($items),
], JSON_PRETTY_PRINT);
