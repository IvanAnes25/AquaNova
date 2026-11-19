<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/controllers/AuthController.php';
require_once __DIR__ . '/CommerceController.php';

$path = trim((string) ($_GET['path'] ?? ''), '/');
$segments = $path === '' ? [] : explode('/', $path);
$controller = new CommerceController();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($segments === ['catalog', 'products'] && $method === 'GET') {
        $controller->catalog();
    } elseif ($segments === ['catalog', 'categories'] && $method === 'GET') {
        $controller->categories();
    } elseif (count($segments) === 4 && $segments[0] === 'catalog' && $segments[1] === 'products'
        && $segments[3] === 'image' && $method === 'GET') {
        $controller->productImage($segments[2]);
    } elseif ($segments === ['settings', 'public'] && $method === 'GET') {
        $controller->publicSettings();
    } elseif ($segments === ['settings', 'gcash-qr'] && $method === 'GET') {
        $controller->publicGcashQr();
    } elseif ($segments === ['cart'] && $method === 'GET') {
        $controller->cart();
    } elseif ($segments === ['cart', 'items'] && $method === 'POST') {
        $controller->addCartItem();
    } elseif (count($segments) === 3 && $segments[0] === 'cart' && $segments[1] === 'items') {
        $controller->changeCartItem($segments[2], $method);
    } elseif ($segments === ['orders'] && $method === 'GET') {
        $controller->customerOrders();
    } elseif ($segments === ['orders'] && $method === 'POST') {
        $controller->createOrder();
    } elseif (count($segments) === 2 && $segments[0] === 'orders' && ctype_digit($segments[1]) && $method === 'GET') {
        $controller->customerOrder((int) $segments[1]);
    } elseif (count($segments) === 3 && $segments[0] === 'orders' && ctype_digit($segments[1])
        && $segments[2] === 'cancel' && $method === 'POST') {
        $controller->cancelCustomerOrder((int) $segments[1]);
    } elseif (count($segments) === 3 && $segments[0] === 'orders' && ctype_digit($segments[1])
        && $segments[2] === 'payment-proof' && $method === 'POST') {
        $controller->submitPaymentProof((int) $segments[1]);
    } elseif (count($segments) === 4 && $segments[0] === 'orders' && ctype_digit($segments[1])
        && $segments[2] === 'payment-proof' && $segments[3] === 'image' && $method === 'GET') {
        $controller->paymentProofImage((int) $segments[1]);
    } elseif ($segments === ['account', 'password'] && $method === 'POST') {
        (new AuthController())->changePassword();
    } elseif ($segments === ['account', 'profile'] && $method === 'GET') {
        $controller->customerProfile();
    } elseif ($segments === ['account', 'profile'] && $method === 'PATCH') {
        $controller->updateCustomerProfile();
    } elseif ($segments === ['notifications'] && $method === 'GET') {
        $controller->notifications();
    } elseif (count($segments) === 3 && $segments[0] === 'notifications' && $segments[2] === 'read'
        && ctype_digit($segments[1]) && $method === 'PATCH') {
        $controller->markNotificationRead((int) $segments[1]);
    } elseif ($segments === ['notifications', 'read-all'] && $method === 'POST') {
        $controller->markAllNotificationsRead();
    } elseif ($segments === ['notifications', 'unread-count'] && $method === 'GET') {
        $controller->unreadNotificationCount();
    } elseif ($segments === ['owner', 'orders'] && $method === 'GET') {
        $controller->ownerOrders();
    } elseif (count($segments) === 3 && $segments[0] === 'owner' && $segments[1] === 'orders'
        && ctype_digit($segments[2]) && $method === 'GET') {
        $controller->ownerOrder((int) $segments[2]);
    } elseif (count($segments) === 4 && $segments[0] === 'owner' && $segments[1] === 'orders'
        && ctype_digit($segments[2]) && $segments[3] === 'actions' && $method === 'POST') {
        $controller->ownerOrderAction((int) $segments[2]);
    } elseif ($segments === ['owner', 'products'] && $method === 'GET') {
        $controller->ownerProducts();
    } elseif ($segments === ['owner', 'products'] && $method === 'POST') {
        $controller->createProduct();
    } elseif (count($segments) === 3 && $segments[0] === 'owner' && $segments[1] === 'products'
        && ctype_digit($segments[2]) && $method === 'PATCH') {
        $controller->updateProduct((int) $segments[2]);
    } elseif (count($segments) === 4 && $segments[0] === 'owner' && $segments[1] === 'products'
        && $segments[3] === 'image'
        && in_array($method, ['GET', 'POST', 'DELETE'], true)) {
        if ($method === 'GET') {
            $controller->productImage($segments[2]);
        } elseif ($method === 'DELETE') {
            $controller->removeProductImage($segments[2]);
        } else {
            $controller->uploadProductImage($segments[2]);
        }
    } elseif ($segments === ['owner', 'inventory'] && $method === 'GET') {
        $controller->inventory();
    } elseif ($segments === ['owner', 'inventory', 'movements'] && $method === 'POST') {
        $controller->moveStock();
    } elseif ($segments === ['owner', 'customers'] && $method === 'GET') {
        $controller->customers();
    } elseif ($segments === ['owner', 'reports'] && $method === 'GET') {
        $controller->reports();
    } elseif ($segments === ['owner', 'reports.csv'] && $method === 'GET') {
        $controller->downloadReport();
    } elseif ($segments === ['owner', 'settings'] && $method === 'GET') {
        $controller->ownerSettings();
    } elseif ($segments === ['owner', 'settings'] && in_array($method, ['PATCH', 'PUT'], true)) {
        $controller->updateOwnerSettings();
    } elseif ($segments === ['owner', 'settings', 'gcash-qr'] && $method === 'POST') {
        $controller->uploadGcashQr();
    } elseif ($segments === ['owner', 'dashboard'] && $method === 'GET') {
        $controller->dashboard();
    } elseif ($segments === ['owner', 'settings', 'gcash-qr'] && $method === 'GET') {
        $controller->ownerGcashQr();
    } else {
        json_response(['message' => 'API route not found.'], 404);
    }
} catch (Throwable $exception) {
    error_log('Aquatica API error: ' . $exception->getMessage());
    json_response(['message' => 'The server could not complete the request. Please try again.'], 500);
}
