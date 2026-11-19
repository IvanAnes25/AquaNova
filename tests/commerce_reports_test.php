<?php

declare(strict_types=1);

require_once __DIR__ . '/isolated_test_database.php';

$pdo = isolated_test_database_connection();

require_once dirname(__DIR__) . '/api/bootstrap.php';
require_once dirname(__DIR__) . '/api/v1/CommerceController.php';

$assertions = 0;
$assert = static function (bool $condition, string $message) use (&$assertions): void {
    $assertions++;
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

$tag = strtoupper(bin2hex(random_bytes(4)));
$userId = 0;
$orderIds = [];
$proofIds = [];
$assertDecimal = static function (string $expected, mixed $actual, string $message) use ($assert): void {
    $assert(number_format((float) $actual, 2, '.', '') === $expected, $message . ': expected ' . $expected . ', got ' . (string) $actual);
};
$toUtc = static function (string $manilaDateTime): string {
    return (new DateTimeImmutable($manilaDateTime, new DateTimeZone('Asia/Manila')))
        ->setTimezone(new DateTimeZone('UTC'))
        ->format('Y-m-d H:i:s');
};
$controller = new CommerceController();
$failed = false;
$periodMethod = new ReflectionMethod(CommerceController::class, 'reportPeriod');
$dataMethod = new ReflectionMethod(CommerceController::class, 'reportData');
$changeMethod = new ReflectionMethod(CommerceController::class, 'reportChange');
$csvRowsMethod = new ReflectionMethod(CommerceController::class, 'reportCsvRows');
$csvCellMethod = new ReflectionMethod(CommerceController::class, 'reportCsvCell');

$loadReport = static function (string $type, string $date) use (&$periodMethod, &$dataMethod, $controller): array {
    $_GET = ['period' => $type, 'date' => $date];
    return $dataMethod->invoke($controller, $periodMethod->invoke($controller));
};

try {
    foreach (['order_items', 'payment_proofs', 'order_status_history'] as $table) {
        $pdo->exec(
            "DELETE FROM $table
             WHERE order_id IN (
                 SELECT id FROM orders WHERE customer_email = 'reports-fixture@example.test'
             )"
        );
    }
    $pdo->exec("DELETE FROM orders WHERE customer_email = 'reports-fixture@example.test'");
    $customer = $pdo->query("SELECT id FROM users WHERE role = 'customer' ORDER BY id LIMIT 1")->fetchColumn();
    if (!$customer) {
        throw new RuntimeException('A local customer is required by the report fixture.');
    }
    $userId = (int) $customer;
    $products = $pdo->query(
        'SELECT product.id, product.name, product.category
         FROM products product
         WHERE product.id IN (
             SELECT MIN(id) FROM products GROUP BY category_id
         )
         ORDER BY product.id LIMIT 2'
    )->fetchAll();
    if (count($products) !== 2) {
        throw new RuntimeException('Two seeded products are required by the report fixture.');
    }
    $baselineYearRevenue = $loadReport('year', '2026-03-15')['kpis']['revenue']['current'];

    $createOrder = static function (
        string $suffix,
        string $manilaCreated,
        string $status,
        string $paymentMethod,
        string $paymentStatus,
        string $fulfillment,
        string $total
    ) use ($pdo, $tag, $userId, $toUtc, &$orderIds): int {
        $number = 'R' . $tag . $suffix;
        $statement = $pdo->prepare(
            'INSERT INTO orders
             (order_number, user_id, customer_name, customer_email, phone, delivery_method,
              delivery_address, payment_method, subtotal, total, status, payment_status,
              order_no, fulfillment, payment_method_v2, order_status, payment_status_v2,
              delivery_fee, delivery_address_snapshot, created_at)
             VALUES
             (:order_number, :user_id, :name, :email, :phone, :delivery_method,
              :address, :payment_method, :subtotal, :total, :legacy_status, :legacy_payment_status,
              :order_no, :fulfillment, :method_v2, :status, :payment_status_v2,
              0, :snapshot, :created_at)'
        );
        $legacyStatus = match ($status) {
            'completed' => 'Completed',
            'cancelled' => 'Cancelled',
            'preparing' => 'Processing',
            'ready' => 'Ready for pickup',
            default => 'Pending',
        };
        $legacyPayment = match ($paymentStatus) {
            'paid' => 'Verified',
            'under_review' => 'Proof submitted',
            'rejected' => 'Rejected',
            default => 'Awaiting proof',
        };
        $statement->execute([
            'order_number' => $number,
            'order_no' => $number,
            'user_id' => $userId,
            'name' => 'Reports fixture',
            'email' => 'reports-fixture@example.test',
            'phone' => '5550000',
            'delivery_method' => $fulfillment === 'pickup' ? 'Pickup at shop' : 'Local delivery',
            'address' => 'Reports test address',
            'payment_method' => match ($paymentMethod) {
                'gcash' => 'GCash',
                'cod' => 'Cash',
                default => 'Cash',
            },
            'subtotal' => $total,
            'total' => $total,
            'legacy_status' => $legacyStatus,
            'legacy_payment_status' => $legacyPayment,
            'fulfillment' => $fulfillment,
            'method_v2' => $paymentMethod,
            'status' => $status,
            'payment_status_v2' => $paymentStatus,
            'snapshot' => '{"line1":"Reports test address"}',
            'created_at' => $toUtc($manilaCreated),
        ]);
        $id = (int) $pdo->lastInsertId();
        $orderIds[] = $id;
        return $id;
    };

    $addItem = static function (int $orderId, array $product, int $qty, string $total) use ($pdo): void {
        $price = number_format((float) $total / $qty, 2, '.', '');
        $pdo->prepare(
            'INSERT INTO order_items
             (order_id, product_id, product_name, unit_price, quantity, line_total,
              name_snapshot, price_snapshot, qty)
             VALUES (:order_id, :product_id, :product_name, :unit_price, :quantity, :total,
                     :name_snapshot, :price_snapshot, :qty)'
        )->execute([
            'order_id' => $orderId,
            'product_id' => $product['id'],
            'product_name' => $product['name'],
            'unit_price' => $price,
            'price_snapshot' => $price,
            'qty' => $qty,
            'quantity' => $qty,
            'name_snapshot' => $product['name'],
            'total' => $total,
        ]);
    };

    $addProof = static function (
        int $orderId,
        string $suffix,
        string $status,
        string $submitted,
        string $reviewed
    ) use ($pdo, $tag, $toUtc, &$proofIds): void {
        $statement = $pdo->prepare(
            'INSERT INTO payment_proofs
             (order_id, reference_no, image_path, amount, status, reject_reason, submitted_at, reviewed_at)
             VALUES (:order_id, :reference, :path, 1, :status, :reason, :submitted_at, :reviewed_at)'
        );
        $statement->execute([
            'order_id' => $orderId,
            'reference' => 'R' . $tag . $suffix,
            'path' => 'private/uploads/report-test.png',
            'status' => $status,
            'reason' => $status === 'rejected' ? 'Test rejection' : null,
            'submitted_at' => $toUtc($submitted),
            'reviewed_at' => $toUtc($reviewed),
        ]);
        $proofIds[] = (int) $pdo->lastInsertId();
    };

    $addCompletion = static function (int $orderId, string $manilaDateTime) use ($pdo, $toUtc): void {
        $pdo->prepare(
            "INSERT INTO order_status_history (order_id, from_status, to_status, note, created_at)
             VALUES (:order_id, 'ready', 'completed', 'Reports test', :created_at)"
        )->execute(['order_id' => $orderId, 'created_at' => $toUtc($manilaDateTime)]);
    };

    $pdo->beginTransaction();
    $first = $createOrder('A', '2026-03-01 00:30:00', 'completed', 'gcash', 'paid', 'delivery', '100.00');
    $cash = $createOrder('B', '2026-03-15 10:00:00', 'completed', 'cash_pickup', 'paid', 'pickup', '50.00');
    $cod = $createOrder('C', '2026-03-31 23:59:00', 'completed', 'cod', 'paid', 'delivery', '200.00');
    $cancelledPaid = $createOrder('D', '2026-03-08 12:00:00', 'cancelled', 'cod', 'paid', 'delivery', '888.00');
    $pending = $createOrder('E', '2026-03-12 12:00:00', 'pending', 'gcash', 'rejected', 'delivery', '70.00');
    $multipleProofs = $createOrder('F', '2026-03-15 12:00:00', 'completed', 'gcash', 'paid', 'pickup', '300.00');
    $beforeBoundary = $createOrder('G', '2026-02-28 23:59:00', 'pending', 'cod', 'unpaid', 'pickup', '999.00');

    $addItem($first, $products[0], 2, '100.00');
    $addItem($cash, $products[1], 1, '50.00');
    $addItem($cod, $products[1], 1, '200.00');
    $addItem($multipleProofs, $products[0], 3, '300.00');

    $addCompletion($cash, '2026-03-15 11:00:00');
    $addCompletion($cod, '2026-03-31 23:59:00');
    $addCompletion($multipleProofs, '2026-03-15 13:00:00');
    $addProof($first, 'A', 'approved', '2026-03-01 00:00:00', '2026-03-01 01:00:00');
    $addProof($pending, 'B', 'rejected', '2026-03-12 09:00:00', '2026-03-12 09:20:00');
    $addProof($multipleProofs, 'C', 'rejected', '2026-03-15 09:00:00', '2026-03-15 09:10:00');
    $addProof($multipleProofs, 'D', 'approved', '2026-03-15 09:30:00', '2026-03-15 09:40:00');
    $pdo->commit();

    $month = $loadReport('month', '2026-03-15');
    $assert($month['period']['start'] === '2026-03-01' && $month['period']['end'] === '2026-03-31', 'Month uses Manila calendar boundaries.');
    $assertDecimal('650.00', $month['kpis']['revenue']['current'], 'Revenue excludes unpaid and cancelled orders, and attributes paid events');
    $assert($month['kpis']['paidOrders']['count'] === 4, 'Paid order count excludes cancelled and out-of-period orders.');
    $assert($month['kpis']['orders'] === ['placed' => 6, 'cancelled' => 1], 'Created-at order and cancellation counts use period boundaries.');
    $assertDecimal('162.50', $month['kpis']['averageOrder']['current'], 'Average order uses paid-order count.');
    $assertDecimal('16.67', $month['kpis']['cancellationRate']['percent'], 'Cancellation rate uses all orders placed.');
    $assert($month['kpis']['revenue']['changePercent'] === null, 'Previous-period zero revenue returns no percentage.');
    $assert($changeMethod->invoke($controller, '50.00', '100.00') === '-50.00', 'Previous-period change uses decimal arithmetic.');
    $assert(count($month['dailySeries']) === 31, 'Month daily series has every date, including zero days.');
    $daily = array_column($month['dailySeries'], 'revenue', 'date');
    $assertDecimal('100.00', $daily['2026-03-01'], 'Manila midnight order maps to the correct report day.');
    $assertDecimal('350.00', $daily['2026-03-15'], 'Same-day approved GCash and cash revenue is grouped.');
    $assertDecimal('200.00', $daily['2026-03-31'], 'Last day of month is included.');
    $assertDecimal('0.00', $daily['2026-03-02'], 'No-sale days are zero-filled.');
    $assert($month['paymentMethods'] === [
        ['method' => 'gcash', 'label' => 'GCash', 'count' => 2, 'percent' => '50.00'],
        ['method' => 'cod', 'label' => 'COD', 'count' => 1, 'percent' => '25.00'],
        ['method' => 'cash_pickup', 'label' => 'Cash at the shop', 'count' => 1, 'percent' => '25.00'],
    ], 'Payment method shares include all methods and exclude cancelled orders.');
    $assert($month['ordersByStatus'] === [
        ['status' => 'completed', 'count' => 4],
        ['status' => 'preparing', 'count' => 0],
        ['status' => 'pending', 'count' => 1],
        ['status' => 'cancelled', 'count' => 1],
        ['status' => 'ready', 'count' => 0],
    ], 'Status counts include all orders created in the period.');
    $assertDecimal('400.00', $month['salesByCategory'][0]['revenue'], 'Category revenue uses paid item snapshots.');
    $assert($month['salesByCategory'][0]['category'] === $products[0]['category'], 'Category labels use the current product category.');
    $assert($month['topProducts'][0]['units'] === 5 && $month['topProducts'][0]['revenue'] === '400.00', 'Top products sort by paid line revenue.');
    $assert($month['deliveryVsPickup']['delivery'] === 3 && $month['deliveryVsPickup']['pickup'] === 2, 'Fulfillment excludes cancelled orders.');
    $assert($month['paymentReview']['approved'] === 2 && $month['paymentReview']['rejected'] === 2, 'Payment review counts reviewed GCash proofs.');
    $assert($month['paymentReview']['averageReviewSeconds'] === 1500, 'Average proof review time is submitted-to-reviewed.');
    $assertDecimal('50.00', $month['paymentReview']['firstUploadApprovalRate'], 'First-upload approval rate uses approved orders with one proof.');

    $csvRows = $csvRowsMethod->invoke($controller, $month);
    $csvRevenue = array_values(array_filter($csvRows, static fn(array $row): bool => $row[0] === 'Summary' && $row[1] === 'Revenue'))[0];
    $csvOrders = array_values(array_filter($csvRows, static fn(array $row): bool => $row[0] === 'Summary' && $row[1] === 'Orders placed'))[0];
    $csvReviewTime = array_values(array_filter($csvRows, static fn(array $row): bool => $row[0] === 'Payment review' && $row[1] === 'Average review time'))[0];
    $assert($csvRevenue[2] === $month['kpis']['revenue']['current'], 'CSV summary revenue matches the JSON report.');
    $assert((int) $csvOrders[2] === $month['kpis']['orders']['placed'], 'CSV order total matches the JSON report.');
    $assert($csvReviewTime[2] === '25 min', 'CSV review duration matches the page display.');

    $week = $loadReport('week', '2026-03-15');
    $assert($week['period']['start'] === '2026-03-09' && $week['period']['end'] === '2026-03-15', 'Week starts Monday and ends Sunday in Manila.');
    $assertDecimal('350.00', $week['kpis']['revenue']['current'], 'Weekly total selects the same report events within its dates.');
    $year = $loadReport('year', '2026-03-15');
    $assert($year['period']['start'] === '2026-01-01' && count($year['dailySeries']) === 12, 'Year view uses monthly buckets.');
    $yearFixtureRevenue = number_format(
        (float) $year['kpis']['revenue']['current'] - (float) $baselineYearRevenue,
        2,
        '.',
        ''
    );
    $assertDecimal('650.00', $yearFixtureRevenue, 'Year and month totals agree for the fixture.');

    $empty = $loadReport('month', '2027-01-10');
    $assert($empty['kpis']['orders'] === ['placed' => 0, 'cancelled' => 0], 'Empty month returns zero order counts.');
    $assertDecimal('0.00', $empty['kpis']['revenue']['current'], 'Empty month returns zero revenue.');
    $assert(count(array_filter($empty['insights'], static fn($insight): bool => $insight !== null)) === 0, 'Empty month has no insights.');
    $assert($csvCellMethod->invoke($controller, '=2+2') === "'=2+2", 'CSV formula cells are neutralized.');
    $assert($csvCellMethod->invoke($controller, '+SUM(A1:A2)') === "'+SUM(A1:A2)", 'CSV cells beginning with plus are neutralized.');
    $assert($csvCellMethod->invoke($controller, '-1+2') === "'-1+2", 'CSV cells beginning with minus are neutralized.');
    $assert($csvCellMethod->invoke($controller, '@SUM(A1:A2)') === "'@SUM(A1:A2)", 'CSV cells beginning with at-sign are neutralized.');

    fwrite(STDOUT, "Commerce reports tests passed ($assertions assertions).\n");
} catch (Throwable $exception) {
    fwrite(STDERR, "Commerce reports tests failed after $assertions assertions: {$exception->getMessage()}\n{$exception->getTraceAsString()}\n");
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $failed = true;
} finally {
    if ($orderIds) {
        $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
        foreach (['order_items', 'payment_proofs', 'order_status_history'] as $table) {
            $delete = $pdo->prepare("DELETE FROM $table WHERE order_id IN ($placeholders)");
            $delete->execute($orderIds);
        }
        $deleteOrders = $pdo->prepare("DELETE FROM orders WHERE id IN ($placeholders)");
        $deleteOrders->execute($orderIds);
    }
}
if ($failed) {
    exit(1);
}
