<?php

declare(strict_types=1);

final class CommerceController
{
    private function db(): PDO
    {
        return auth_db();
    }

    private function pagination(string $prefix = ''): array
    {
        $pageKey = $prefix === '' ? 'page' : $prefix . 'Page';
        $sizeKey = $prefix === '' ? 'pageSize' : $prefix . 'PageSize';
        $perPageKey = $prefix === '' ? 'per_page' : $prefix . 'PerPage';
        $page = filter_var($_GET[$pageKey] ?? 1, FILTER_VALIDATE_INT);
        $pageSize = filter_var($_GET[$perPageKey] ?? $_GET[$sizeKey] ?? 50, FILTER_VALIDATE_INT);
        if ($page === false || $page < 1 || $pageSize === false || $pageSize < 1 || $pageSize > 100
            || $page > intdiv(PHP_INT_MAX, $pageSize)) {
            json_response(['message' => 'Page must be positive and per_page (or pageSize) must be between 1 and 100.'], 422);
        }
        return ['page' => $page, 'pageSize' => $pageSize, 'offset' => ($page - 1) * $pageSize];
    }

    private function paginatedQuery(string $sql, string $countSql, array $params = [], string $prefix = ''): array
    {
        $pagination = $this->pagination($prefix);
        $count = $this->db()->prepare($countSql);
        $count->execute($params);
        $total = (int) $count->fetchColumn();

        $statement = $this->db()->prepare($sql . ' LIMIT :page_size OFFSET :page_offset');
        foreach ($params as $key => $value) {
            $statement->bindValue(':' . $key, $value);
        }
        $statement->bindValue(':page_size', $pagination['pageSize'], PDO::PARAM_INT);
        $statement->bindValue(':page_offset', $pagination['offset'], PDO::PARAM_INT);
        $statement->execute();

        return [
            'rows' => $statement->fetchAll(),
            'pagination' => [
                'page' => $pagination['page'],
                'pageSize' => $pagination['pageSize'],
                'per_page' => $pagination['pageSize'],
                'total' => $total,
                'pages' => (int) ceil($total / $pagination['pageSize']),
            ],
        ];
    }

    private function customer(): array
    {
        return require_auth_role('customer');
    }

    private function owner(): array
    {
        $user = require_auth_role('owner');
        if (!empty($_SESSION['must_change_password'])) {
            json_response(['message' => 'Change your temporary password before accessing owner features.'], 403);
        }
        return $user;
    }

    private function body(): array
    {
        require_csrf();
        return request_json();
    }

    private function canonicalPayloadHash(array $payload): string
    {
        $normalize = static function (mixed $value) use (&$normalize): mixed {
            if (is_array($value)) {
                $keys = array_keys($value);
                sort($keys, SORT_STRING);
                $normalized = [];
                foreach ($keys as $key) {
                    $normalized[$key] = $normalize($value[$key]);
                }
                return $normalized;
            }
            return $value;
        };
        $canonical = json_encode($normalize($payload), JSON_UNESCAPED_SLASHES);
        return hash('sha256', $canonical === false ? '' : $canonical);
    }

    private function replayIdempotencyResponse(int $status, string $body): never
    {
        header('Idempotent-Replay: true');
        http_response_code($status);
        echo $body;
        exit;
    }

    private function claimIdempotency(array $user, string $scope, array $payload): void
    {
        $key = (string) ($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '');
        if (!preg_match('/^[A-Za-z0-9._:-]{16,128}$/', $key)) {
            json_response(['message' => 'A valid Idempotency-Key header is required for this action.'], 428);
        }

        $db = $this->db();
        $db->exec('DELETE FROM idempotency_requests WHERE expires_at <= UTC_TIMESTAMP()');
        $keyHash = hash('sha256', $key);
        $payloadHash = $this->canonicalPayloadHash($payload);
        $endpoint = ($_SERVER['REQUEST_METHOD'] ?? 'POST') . ' ' . (($path = $_SERVER['SCRIPT_NAME'] ?? '') !== '' ? $path : '')
            . '/' . trim((string) ($_GET['path'] ?? ''), '/');
        $existingBeforeInsert = $db->prepare(
            'SELECT scope, endpoint, payload_hash, response_status, response_body, state
             FROM idempotency_requests
             WHERE user_id = :user_id AND request_hash = :request_hash
             ORDER BY created_at DESC LIMIT 1'
        );
        $existingBeforeInsert->execute(['user_id' => $user['id'], 'request_hash' => $keyHash]);
        $existingRecord = $existingBeforeInsert->fetch();
        if ($existingRecord) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if ($existingRecord['endpoint'] !== $endpoint) {
                json_response([
                    'message' => 'This Idempotency-Key was already used for a different endpoint.',
                ], 422);
            }
            if ($existingRecord['payload_hash'] !== $payloadHash) {
                json_response([
                    'message' => 'This Idempotency-Key was already used for a different request payload.',
                ], 422);
            }
            if ($existingRecord['state'] === 'in_progress') {
                header('Retry-After: 1');
                json_response(['message' => 'This request is already in progress. Please retry shortly.'], 409);
            }
            if ($existingRecord['state'] === 'completed'
                && $existingRecord['response_status'] !== null
                && $existingRecord['response_body'] !== null) {
                $this->replayIdempotencyResponse(
                    (int) $existingRecord['response_status'],
                    (string) $existingRecord['response_body']
                );
            }
            json_response(['message' => 'This request has not completed. Please retry shortly.'], 409);
        }
        try {
            $statement = $db->prepare(
                'INSERT INTO idempotency_requests
                 (user_id, scope, endpoint, request_hash, payload_hash, expires_at, state)
                 VALUES
                 (:user_id, :scope, :endpoint, :request_hash, :payload_hash,
                  DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR), \'in_progress\')'
            );
            $statement->execute([
                'user_id' => $user['id'],
                'scope' => $scope,
                'endpoint' => $endpoint,
                'request_hash' => $keyHash,
                'payload_hash' => $payloadHash,
            ]);
        } catch (PDOException $exception) {
            if ($exception->getCode() !== '23000') {
                throw $exception;
            }
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            $existing = $db->prepare(
                'SELECT endpoint, payload_hash, response_status, response_body, state
                 FROM idempotency_requests
                 WHERE user_id = :user_id AND scope = :scope AND request_hash = :request_hash
                 LIMIT 1'
            );
            $existing->execute(['user_id' => $user['id'], 'scope' => $scope, 'request_hash' => $keyHash]);
            $record = $existing->fetch();
            if (!$record) {
                json_response(['message' => 'This request could not be replayed. Please retry.'], 409);
            }
            if ($record['payload_hash'] !== $payloadHash) {
                json_response([
                    'message' => 'This Idempotency-Key was already used for a different request payload.',
                ], 422);
            }
            if ($record['endpoint'] !== $endpoint) {
                json_response([
                    'message' => 'This Idempotency-Key was already used for a different endpoint.',
                ], 422);
            }
            if ($record['state'] === 'in_progress') {
                header('Retry-After: 1');
                json_response(['message' => 'This request is already in progress. Please retry shortly.'], 409);
            }
            if ($record['state'] === 'completed' && $record['response_status'] !== null && $record['response_body'] !== null) {
                $this->replayIdempotencyResponse((int) $record['response_status'], (string) $record['response_body']);
            }
            json_response(['message' => 'This request has not completed. Please retry shortly.'], 409);
        }
        $GLOBALS['idempotency_response_context'] = [
            'db' => $db,
            'user_id' => (int) $user['id'],
            'scope' => $scope,
            'key_hash' => $keyHash,
            'endpoint' => $endpoint,
            'payload_hash' => $payloadHash,
        ];
    }

    private function settings(): array
    {
        $rows = $this->db()->query('SELECT setting_key, setting_value FROM settings')->fetchAll();
        $settings = [];
        foreach ($rows as $row) {
            $settings[$row['setting_key']] = $row['setting_value'];
        }
        return $settings;
    }

    private function setting(string $key, string $default = ''): string
    {
        return (string) ($this->settings()[$key] ?? $default);
    }

    private function putSetting(string $key, string $value): void
    {
        $statement = $this->db()->prepare(
            'INSERT INTO settings (setting_key, setting_value) VALUES (:key, :value)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP'
        );
        $statement->execute(['key' => $key, 'value' => $value]);
    }

    private function productSelect(): string
    {
        return 'SELECT p.id, p.name, p.category, p.short_description, p.description, p.price, p.stock,
                       p.image_path, p.image_url, p.featured, p.is_active, p.slug,
                       COALESCE(c.name, p.category) AS category_name
                FROM products p LEFT JOIN categories c ON c.id = p.category_id';
    }

    private function productRow(array $row): array
    {
        return [
            'id' => (string) $row['slug'],
            'productId' => (int) $row['id'],
            'name' => $row['name'],
            'category' => $row['category_name'],
            'price' => (float) $row['price'],
            'stock' => (int) $row['stock'],
            'size' => 'Standard',
            'image' => $row['image_path']
                ? '/api/v1/catalog/products/' . (int) $row['id'] . '/image'
                : $row['image_url'],
            'description' => $row['description'] ?: $row['short_description'],
            'shortDescription' => $row['short_description'],
            'featured' => (bool) $row['featured'],
        ];
    }

    private function productId(string|int $value): int
    {
        $sql = ctype_digit((string) $value)
            ? 'SELECT id FROM products WHERE id = :value LIMIT 1'
            : 'SELECT id FROM products WHERE slug = :value LIMIT 1';
        $statement = $this->db()->prepare($sql);
        $statement->execute(['value' => $value]);
        $id = $statement->fetchColumn();
        if (!$id) {
            json_response(['message' => 'The selected product is no longer available.'], 404);
        }
        return (int) $id;
    }

    private function orderItems(int $orderId): array
    {
        $statement = $this->db()->prepare(
            'SELECT oi.product_id, oi.name_snapshot, oi.price_snapshot, oi.qty
             FROM order_items oi WHERE oi.order_id = :id ORDER BY oi.id'
        );
        $statement->execute(['id' => $orderId]);
        return array_map(static fn(array $item): array => [
            'productId' => (string) ($item['product_id'] ?? ''),
            'name' => $item['name_snapshot'],
            'price' => (float) $item['price_snapshot'],
            'quantity' => (int) $item['qty'],
        ], $statement->fetchAll());
    }

    private function orderRow(array $row): array
    {
        return $this->orderRowData(
            $row,
            $this->orderItems((int) $row['id']),
            $this->latestProof((int) $row['id'])
        );
    }

    private function orderRows(array $rows): array
    {
        if ($rows === []) {
            return [];
        }

        $ids = array_map(static fn(array $row): int => (int) $row['id'], $rows);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));

        $itemsStatement = $this->db()->prepare(
            "SELECT order_id, product_id, name_snapshot, price_snapshot, qty
             FROM order_items WHERE order_id IN ($placeholders) ORDER BY order_id, id"
        );
        $itemsStatement->execute($ids);
        $itemsByOrder = [];
        foreach ($itemsStatement->fetchAll() as $item) {
            $itemsByOrder[(int) $item['order_id']][] = [
                'productId' => (string) ($item['product_id'] ?? ''),
                'name' => $item['name_snapshot'],
                'price' => (float) $item['price_snapshot'],
                'quantity' => (int) $item['qty'],
            ];
        }

        $proofStatement = $this->db()->prepare(
            "SELECT proof.order_id, proof.id, proof.reference_no, proof.image_path,
                    proof.reject_reason, proof.status
             FROM payment_proofs proof
             JOIN (
                 SELECT order_id, MAX(id) AS id
                 FROM payment_proofs WHERE order_id IN ($placeholders)
                 GROUP BY order_id
             ) latest ON latest.id = proof.id"
        );
        $proofStatement->execute($ids);
        $proofsByOrder = [];
        foreach ($proofStatement->fetchAll() as $proof) {
            $proofsByOrder[(int) $proof['order_id']] = $proof;
        }

        return array_map(
            fn(array $row): array => $this->orderRowData(
                $row,
                $itemsByOrder[(int) $row['id']] ?? [],
                $proofsByOrder[(int) $row['id']] ?? null
            ),
            $rows
        );
    }

    private function orderRowData(array $row, array $items, ?array $proof): array
    {
        $address = json_decode((string) ($row['delivery_address_snapshot'] ?? ''), true);
        $method = match ($row['payment_method_v2']) {
            'gcash' => 'GCash',
            'cod' => 'Cash on delivery',
            'cash_pickup' => 'Cash at the shop',
            default => 'Cash',
        };
        $fulfillment = $row['fulfillment'] === 'delivery' ? 'Delivery' : 'Pickup';
        $status = ucfirst((string) $row['order_status']);
        $statusLabel = self::orderStatusLabel(
            (string) $row['fulfillment'],
            (string) $row['payment_method_v2'],
            (string) $row['order_status']
        );
        $paymentStatus = match ($row['payment_status_v2']) {
            'under_review' => 'Under review',
            'paid' => 'Paid',
            'rejected' => 'Rejected',
            default => 'Unpaid',
        };
        return [
            'id' => $row['order_no'],
            'databaseId' => (int) $row['id'],
            'customer' => $row['customer_name'],
            'email' => $row['customer_email'],
            'phone' => $row['phone'],
            'items' => $items,
            'subtotal' => (float) $row['subtotal'],
            'deliveryFee' => (float) $row['delivery_fee'],
            'total' => (float) $row['total'],
            'delivery' => $fulfillment,
            'address' => $fulfillment === 'Delivery'
                ? (is_array($address) ? ($address['line1'] ?? '') : ($row['delivery_address'] ?? ''))
                : null,
            'pickupLocation' => $fulfillment === 'Pickup'
                ? (is_array($address) ? ($address['line1'] ?? 'Pickup at shop') : 'Pickup at shop')
                : null,
            'addressDetails' => $fulfillment === 'Delivery' && is_array($address) ? $address : null,
            'method' => $method,
            'status' => $status,
            'statusLabel' => $statusLabel,
            'paymentStatus' => $paymentStatus,
            'date' => $row['created_at'],
            'createdAt' => strtotime((string) $row['created_at']) * 1000,
            'reference' => $proof['reference_no'] ?? '',
            'proofName' => $proof ? basename((string) $proof['image_path']) : '',
            'proofImageUrl' => $proof ? '/api/v1/orders/' . (int) $row['id'] . '/payment-proof/image' : null,
            'proofReason' => $proof['reject_reason'] ?? '',
            'proofId' => $proof ? (int) $proof['id'] : null,
            'stockDeducted' => (bool) $row['stock_deducted'],
            'deliveryBy' => $row['delivery_by'],
            'cancelReason' => $row['cancel_reason'],
        ];
    }

    private static function orderStatusLabel(string $fulfillment, string $payment, string $status): string
    {
        return match ($status) {
            'ready' => $fulfillment === 'pickup' ? 'Ready for pickup' : 'Out for delivery',
            'completed' => match ([$fulfillment, $payment]) {
                ['pickup', 'cash_pickup'] => 'Handed over and paid',
                ['pickup', 'gcash'] => 'Picked up',
                ['delivery', 'cod'] => 'Delivered and paid',
                ['delivery', 'gcash'] => 'Delivered',
                default => 'Completed',
            },
            default => ucfirst($status),
        };
    }

    private static function readyNotificationBody(string $fulfillment): string
    {
        return $fulfillment === 'pickup'
            ? 'Your order is ready for pickup.'
            : 'Your order is out for delivery.';
    }

    private static function completionNotificationBody(string $fulfillment, string $payment): string
    {
        return match ([$fulfillment, $payment]) {
            ['pickup', 'cash_pickup'] => 'Your order was handed over and paid at the shop.',
            ['pickup', 'gcash'] => 'Your order was picked up.',
            ['delivery', 'cod'] => 'Your order was delivered and paid.',
            ['delivery', 'gcash'] => 'Your order was delivered and your GCash payment is confirmed.',
            default => 'Your order has been completed.',
        };
    }

    private function latestProof(int $orderId): ?array
    {
        $statement = $this->db()->prepare(
            'SELECT id, reference_no, image_path, reject_reason, status
             FROM payment_proofs WHERE order_id = :id ORDER BY id DESC LIMIT 1'
        );
        $statement->execute(['id' => $orderId]);
        return $statement->fetch() ?: null;
    }

    private function orderById(int $id, bool $lock = false): array
    {
        $statement = $this->db()->prepare(
            'SELECT o.*, u.name AS customer_name, u.email AS customer_email
             FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = :id'
             . ($lock ? ' FOR UPDATE' : '')
        );
        $statement->execute(['id' => $id]);
        $order = $statement->fetch();
        if (!$order) {
            json_response(['message' => 'Order not found.'], 404);
        }
        return $order;
    }

    private function audit(int $userId, string $action, string $entity, string|int $entityId, array $details = []): void
    {
        $statement = $this->db()->prepare(
            'INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip)
             VALUES (:user_id, :action, :entity, :entity_id, :details, :ip)'
        );
        $statement->execute([
            'user_id' => $userId,
            'action' => $action,
            'entity' => $entity,
            'entity_id' => (string) $entityId,
            'details' => $details ? json_encode($details, JSON_UNESCAPED_SLASHES) : null,
            'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    }

    private function notify(int $userId, ?int $orderId, string $title, string $body): void
    {
        $statement = $this->db()->prepare(
            'INSERT INTO notifications (user_id, order_id, title, body)
             VALUES (:user_id, :order_id, :title, :body)'
        );
        $statement->execute(['user_id' => $userId, 'order_id' => $orderId, 'title' => $title, 'body' => $body]);
    }

    private function notifyOwners(?int $orderId, string $title, string $body): void
    {
        $owners = $this->db()->query("SELECT id FROM users WHERE role = 'owner'")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($owners as $ownerId) {
            $this->notify((int) $ownerId, $orderId, $title, $body);
        }
    }

    private function notifyLowStock(int $productId, string $name, int $before, int $after, int $threshold): void
    {
        if ($before > $threshold && $after <= $threshold) {
            $this->notifyOwners(
                null,
                'Low stock',
                sprintf('%s (#%d) has reached the low-stock threshold (%d remaining).', $name, $productId, $after)
            );
        }
    }

    private function storeVerifiedImage(array $file, string $relativeDirectory, string $prefix): string
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK
            || !isset($file['tmp_name']) || !is_string($file['tmp_name'])
            || !is_file($file['tmp_name'])) {
            json_response(['message' => 'Choose a valid raster image.'], 422);
        }
        $size = filesize($file['tmp_name']);
        if ($size === false || $size < 1 || $size > 2 * 1024 * 1024) {
            json_response(['message' => 'Choose an image no larger than 2 MB.'], 422);
        }
        $mime = null;
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo !== false) {
            $mime = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);
        }
        $imageInfo = @getimagesize($file['tmp_name']);
        $imageMime = is_array($imageInfo) ? ($imageInfo['mime'] ?? null) : null;
        if (!is_string($imageMime) || !str_starts_with($imageMime, 'image/')
            || ($mime !== null && $imageMime !== $mime)
            || (int) ($imageInfo[0] ?? 0) < 1 || (int) ($imageInfo[1] ?? 0) < 1
            || (int) $imageInfo[0] > 10000 || (int) $imageInfo[1] > 10000
            || (int) $imageInfo[0] * (int) $imageInfo[1] > 25000000) {
            json_response(['message' => 'Choose a valid raster image supported by this server.'], 422);
        }
        $contents = file_get_contents($file['tmp_name']);
        $validEnd = match ($imageMime) {
            'image/png' => str_ends_with((string) $contents, "\x00\x00\x00\x00IEND\xAE\x42\x60\x82"),
            'image/jpeg' => str_ends_with((string) $contents, "\xFF\xD9"),
            'image/webp' => str_starts_with((string) $contents, 'RIFF') && substr((string) $contents, 8, 4) === 'WEBP',
            default => true,
        };
        if (!is_string($contents) || !$validEnd || stripos($contents, '<?php') !== false
            || stripos($contents, '<?=') !== false) {
            json_response(['message' => 'The image is incomplete or contains unsupported data.'], 422);
        }

        if (!function_exists('imagecreatefromstring') || !function_exists('imagepng') || !function_exists('imagejpeg')) {
            json_response(['message' => 'Image processing is not configured. Enable PHP GD and restart the web server.'], 503);
        }

        $image = @imagecreatefromstring($contents);
        if ($image === false) {
            json_response(['message' => 'The image file could not be decoded.'], 422);
        }

        $directory = dirname(__DIR__, 2) . '/' . $relativeDirectory;
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            imagedestroy($image);
            throw new RuntimeException('Image storage could not be created.');
        }
        $temporaryPath = tempnam($directory, '.image-');
        if ($temporaryPath === false) {
            imagedestroy($image);
            throw new RuntimeException('Image processing could not be started.');
        }

        $extension = match ($imageMime) {
            'image/jpeg' => 'jpg',
            'image/webp' => 'webp',
            default => 'png',
        };
        if ($extension === 'png') {
            imagesavealpha($image, true);
            $encoded = imagepng($image, $temporaryPath, 6);
        } elseif ($extension === 'jpg') {
            $encoded = imagejpeg($image, $temporaryPath, 88);
        } else {
            $encoded = function_exists('imagewebp') ? imagewebp($image, $temporaryPath, 88) : false;
        }
        imagedestroy($image);
        $encodedSize = $encoded ? filesize($temporaryPath) : false;
        if (!$encoded || $encodedSize === false || $encodedSize < 1 || $encodedSize > 2 * 1024 * 1024) {
            unlink($temporaryPath);
            json_response(['message' => 'The processed image exceeds the 2 MB limit.'], 422);
        }

        $filename = $prefix . bin2hex(random_bytes(24)) . '.' . $extension;
        $destination = $directory . '/' . $filename;
        if (!rename($temporaryPath, $destination)) {
            unlink($temporaryPath);
            throw new RuntimeException('Image could not be stored.');
        }
        return $relativeDirectory . '/' . $filename;
    }

    private function statusHistory(int $orderId, ?string $from, string $to, ?int $userId, ?string $note = null): void
    {
        $statement = $this->db()->prepare(
            'INSERT INTO order_status_history (order_id, from_status, to_status, by_user_id, note)
             VALUES (:order_id, :from_status, :to_status, :user_id, :note)'
        );
        $statement->execute([
            'order_id' => $orderId,
            'from_status' => $from,
            'to_status' => $to,
            'user_id' => $userId,
            'note' => $note,
        ]);
    }

    public function catalog(): never
    {
        $query = trim((string) ($_GET['q'] ?? ''));
        $category = trim((string) ($_GET['category'] ?? ''));
        $where = ' WHERE p.is_active = 1';
        $params = [];
        if ($query !== '') {
            $where .= ' AND (p.name LIKE :name_query OR p.description LIKE :description_query OR p.short_description LIKE :short_query OR c.name LIKE :category_query)';
            $wildcard = '%' . $query . '%';
            $params['name_query'] = $wildcard;
            $params['description_query'] = $wildcard;
            $params['short_query'] = $wildcard;
            $params['category_query'] = $wildcard;
        }
        if ($category !== '' && strtolower($category) !== 'all items') {
            $where .= ' AND (c.slug = :category_slug OR c.name = :category_name)';
            $params['category_slug'] = $category;
            $params['category_name'] = $category;
        }
        $result = $this->paginatedQuery(
            $this->productSelect() . $where . ' ORDER BY (p.stock = 0), p.featured DESC, p.name',
            'SELECT COUNT(*) FROM products p LEFT JOIN categories c ON c.id = p.category_id' . $where,
            $params
        );
        json_response([
            'products' => array_map(fn(array $row): array => $this->productRow($row), $result['rows']),
            'pagination' => $result['pagination'],
        ]);
    }

    public function categories(): never
    {
        $result = $this->paginatedQuery(
            'SELECT DISTINCT c.id, c.name, c.slug FROM categories c
             JOIN products p ON p.category_id = c.id WHERE p.is_active = 1 ORDER BY c.name',
            'SELECT COUNT(DISTINCT c.id) FROM categories c
             JOIN products p ON p.category_id = c.id WHERE p.is_active = 1'
        );
        json_response(['categories' => $result['rows'], 'pagination' => $result['pagination']]);
    }

    public function publicSettings(): never
    {
        $settings = $this->settings();
        json_response([
            'deliveryFee' => (float) ($settings['delivery_fee'] ?? 0),
            'gcashReady' => ($settings['gcash_enabled'] ?? '1') === '1'
                && !empty($settings['gcash_name']) && !empty($settings['gcash_number']) && !empty($settings['gcash_qr_path']),
            'gcashEnabled' => ($settings['gcash_enabled'] ?? '1') === '1',
            'codEnabled' => ($settings['cod_enabled'] ?? '1') === '1',
            'cashPickupEnabled' => ($settings['cash_pickup_enabled'] ?? '1') === '1',
            'shopName' => $settings['shop_name'] ?? 'Aquatica Nasugbu',
            'shopAddress' => $settings['shop_address'] ?? 'Nasugbu, Batangas',
            'gcashName' => $settings['gcash_name'] ?? '',
            'gcashNumber' => $settings['gcash_number'] ?? '',
            'gcashQrUrl' => !empty($settings['gcash_qr_path']) ? '/api/v1/settings/gcash-qr' : null,
        ]);
    }

    public function cart(): never
    {
        $user = $this->customer();
        $result = $this->paginatedQuery(
            'SELECT p.id, p.name, p.category, p.short_description, p.description, p.price, p.stock,
                    p.image_path, p.image_url, p.featured, p.is_active, p.slug,
                    COALESCE(c.name, p.category) AS category_name, ci.qty
             FROM products p LEFT JOIN categories c ON c.id = p.category_id
             JOIN cart_items ci ON ci.product_id = p.id
             WHERE ci.user_id = :user_id AND p.is_active = 1 ORDER BY ci.id',
            'SELECT COUNT(*) FROM cart_items ci JOIN products p ON p.id = ci.product_id
             WHERE ci.user_id = :user_id AND p.is_active = 1',
            ['user_id' => $user['id']]
        );
        $items = array_map(function (array $row): array {
            return $this->productRow($row) + ['quantity' => (int) $row['qty']];
        }, $result['rows']);
        json_response(['items' => $items, 'pagination' => $result['pagination']]);
    }

    public function addCartItem(): never
    {
        $user = $this->customer();
        $data = $this->body();
        $id = $this->productId($data['productId'] ?? '');
        $quantity = filter_var($data['quantity'] ?? null, FILTER_VALIDATE_INT);
        if ($quantity === false || $quantity < 1 || $quantity > 99) {
            json_response(['message' => 'Choose a quantity between 1 and 99.'], 422);
        }
        $db = $this->db();
        $db->beginTransaction();
        $product = $db->prepare('SELECT stock, is_active FROM products WHERE id = :id FOR UPDATE');
        $product->execute(['id' => $id]);
        $row = $product->fetch();
        $existing = $db->prepare('SELECT qty FROM cart_items WHERE user_id = :user_id AND product_id = :product_id FOR UPDATE');
        $existing->execute(['user_id' => $user['id'], 'product_id' => $id]);
        $current = (int) ($existing->fetchColumn() ?: 0);
        if (!$row || !(bool) $row['is_active'] || $current + $quantity > (int) $row['stock']) {
            $db->rollBack();
            json_response(['message' => 'There is not enough stock for that quantity.'], 409);
        }
        $upsert = $db->prepare(
            'INSERT INTO cart_items (user_id, product_id, qty) VALUES (:user_id, :product_id, :qty)
             ON DUPLICATE KEY UPDATE qty = VALUES(qty), updated_at = CURRENT_TIMESTAMP'
        );
        $upsert->execute(['user_id' => $user['id'], 'product_id' => $id, 'qty' => $current + $quantity]);
        $db->commit();
        json_response(['message' => 'Added to cart.'], 201);
    }

    public function changeCartItem(string $product, string $method): never
    {
        $user = $this->customer();
        if (!in_array($method, ['PATCH', 'DELETE'], true)) {
            header('Allow: PATCH, DELETE');
            json_response(['message' => 'This request method is not allowed.'], 405);
        }
        if ($method === 'DELETE') {
            require_csrf();
            $delete = $this->db()->prepare('DELETE FROM cart_items WHERE user_id = :user_id AND product_id = :product_id');
            $delete->execute(['user_id' => $user['id'], 'product_id' => $this->productId($product)]);
            json_response(['message' => 'Removed from cart.']);
        }
        $data = $this->body();
        $quantity = filter_var($data['quantity'] ?? null, FILTER_VALIDATE_INT);
        if ($quantity === false || $quantity < 0 || $quantity > 99) {
            json_response(['message' => 'Quantity must be a whole number from 0 to 99.'], 422);
        }
        $id = $this->productId($product);
        if ($quantity === 0) {
            $statement = $this->db()->prepare('DELETE FROM cart_items WHERE user_id = :user_id AND product_id = :product_id');
            $statement->execute(['user_id' => $user['id'], 'product_id' => $id]);
        } else {
            $statement = $this->db()->prepare(
                'UPDATE cart_items ci JOIN products p ON p.id = ci.product_id
                 SET ci.qty = :qty WHERE ci.user_id = :user_id AND ci.product_id = :product_id
                   AND p.is_active = 1 AND p.stock >= :stock_qty'
            );
            $statement->execute(['qty' => $quantity, 'user_id' => $user['id'], 'product_id' => $id, 'stock_qty' => $quantity]);
            if ($statement->rowCount() === 0) {
                json_response(['message' => 'That quantity is unavailable or the cart item no longer exists.'], 409);
            }
        }
        json_response(['message' => 'Cart updated.']);
    }

    public function customerOrders(): never
    {
        $user = $this->customer();
        $result = $this->paginatedQuery(
            'SELECT o.*, u.name AS customer_name, u.email AS customer_email
             FROM orders o JOIN users u ON u.id = o.user_id WHERE o.user_id = :id ORDER BY o.created_at DESC',
            'SELECT COUNT(*) FROM orders WHERE user_id = :id',
            ['id' => $user['id']]
        );
        json_response([
            'orders' => $this->orderRows($result['rows']),
            'pagination' => $result['pagination'],
        ]);
    }

    public function createOrder(): never
    {
        $user = $this->customer();
        $data = $this->body();
        $fulfillment = $data['fulfillment'] ?? '';
        $payment = $data['paymentMethod'] ?? '';
        if (!in_array($fulfillment, ['delivery', 'pickup'], true)
            || !in_array($payment, ['gcash', 'cod', 'cash_pickup'], true)
            || ($fulfillment === 'delivery' && $payment === 'cash_pickup')
            || ($fulfillment === 'pickup' && $payment === 'cod')) {
            json_response(['message' => 'Choose a payment method available for the selected fulfillment method.'], 422);
        }
        $shopSettings = $this->settings();
        $paymentEnabled = match ($payment) {
            'gcash' => ($shopSettings['gcash_enabled'] ?? '1') === '1',
            'cod' => ($shopSettings['cod_enabled'] ?? '1') === '1',
            'cash_pickup' => ($shopSettings['cash_pickup_enabled'] ?? '1') === '1',
        };
        if (!$paymentEnabled) {
            json_response(['message' => 'This payment method is currently unavailable. Choose another option.'], 409);
        }
        if ($payment === 'gcash' && (empty($shopSettings['gcash_name']) || empty($shopSettings['gcash_number']) || empty($shopSettings['gcash_qr_path']))) {
            json_response(['message' => 'GCash payment is not available until the shop configures its recipient and QR code.'], 409);
        }
        $name = trim((string) ($data['name'] ?? $user['name']));
        $phone = trim((string) ($data['phone'] ?? ''));
        $line1 = trim((string) ($data['address'] ?? ''));
        $notes = trim((string) ($data['notes'] ?? ''));
        if ($name === '' || strlen($name) > 120 || $phone === '' || strlen($phone) > 40
            || ($fulfillment === 'delivery' && ($line1 === '' || strlen($line1) > 255))
            || strlen($notes) > 500) {
            json_response(['message' => 'Enter valid contact and delivery details.'], 422);
        }

        $db = $this->db();
        $db->beginTransaction();
        $this->claimIdempotency($user, 'order.create', $data);
        $cart = $db->prepare(
            'SELECT p.id, p.name, p.price, p.stock, p.is_active, ci.qty
             FROM cart_items ci JOIN products p ON p.id = ci.product_id
             WHERE ci.user_id = :user_id ORDER BY p.id FOR UPDATE'
        );
        $cart->execute(['user_id' => $user['id']]);
        $items = $cart->fetchAll();
        if (!$items) {
            $db->rollBack();
            json_response(['message' => 'Your cart is empty.'], 409);
        }
        $subtotal = 0.0;
        foreach ($items as $item) {
            if (!(bool) $item['is_active'] || (int) $item['stock'] < (int) $item['qty']) {
                $db->rollBack();
                json_response(['message' => $item['name'] . ' does not have enough stock.'], 409);
            }
            $subtotal += (float) $item['price'] * (int) $item['qty'];
        }
        $fee = $fulfillment === 'delivery' ? (float) ($this->settings()['delivery_fee'] ?? 0) : 0.0;
        if ($fee < 0) {
            $db->rollBack();
            throw new RuntimeException('Configured delivery fee cannot be negative.');
        }
        $total = $subtotal + $fee;
        $orderNo = 'AQ-' . gmdate('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
        $legacyDelivery = $fulfillment === 'delivery' ? 'Local delivery' : 'Pickup at shop';
        $legacyPayment = $payment === 'gcash' ? 'GCash' : 'Cash';
        $legacyPaymentStatus = $payment === 'gcash' ? 'Awaiting proof' : 'Not required';
        $address = $fulfillment === 'delivery'
            ? ['line1' => $line1, 'barangay' => trim((string) ($data['barangay'] ?? '')), 'city' => trim((string) ($data['city'] ?? 'Nasugbu')), 'province' => trim((string) ($data['province'] ?? 'Batangas')), 'notes' => $notes]
            : ['line1' => $this->setting('shop_address', 'Pickup at shop')];
        $insert = $db->prepare(
            'INSERT INTO orders
             (order_number, user_id, customer_name, customer_email, phone, delivery_method, delivery_address,
              payment_method, subtotal, total, notes, status, payment_status, order_no, fulfillment,
              payment_method_v2, order_status, payment_status_v2, delivery_fee, delivery_address_snapshot)
             VALUES
             (:order_number, :user_id, :name, :email, :phone, :delivery_method, :delivery_address,
              :payment_method, :subtotal, :total, :notes, :legacy_status, :legacy_payment_status, :order_no,
              :fulfillment, :payment_method_v2, :status, :payment_status_v2, :delivery_fee, :snapshot)'
        );
        $insert->execute([
            'order_number' => $orderNo,
            'user_id' => $user['id'],
            'name' => $name,
            'email' => $user['email'],
            'phone' => $phone,
            'delivery_method' => $legacyDelivery,
            'delivery_address' => $fulfillment === 'delivery' ? $line1 : $address['line1'],
            'payment_method' => $legacyPayment,
            'subtotal' => $subtotal,
            'total' => $total,
            'notes' => $notes,
            'legacy_status' => 'Pending',
            'legacy_payment_status' => $legacyPaymentStatus,
            'order_no' => $orderNo,
            'fulfillment' => $fulfillment,
            'payment_method_v2' => $payment,
            'status' => 'pending',
            'payment_status_v2' => 'unpaid',
            'delivery_fee' => $fee,
            'snapshot' => json_encode($address, JSON_UNESCAPED_SLASHES),
        ]);
        $orderId = (int) $db->lastInsertId();
        $itemInsert = $db->prepare(
            'INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total,
                                      name_snapshot, price_snapshot, qty)
             VALUES (:order_id, :product_id, :name, :price, :qty, :line_total, :snapshot_name, :snapshot_price, :snapshot_qty)'
        );
        foreach ($items as $item) {
            $itemInsert->execute([
                'order_id' => $orderId, 'product_id' => $item['id'], 'name' => $item['name'],
                'price' => $item['price'], 'qty' => $item['qty'],
                'snapshot_name' => $item['name'], 'snapshot_price' => $item['price'], 'snapshot_qty' => $item['qty'],
                'line_total' => (float) $item['price'] * (int) $item['qty'],
            ]);
        }
        $deleteCart = $db->prepare('DELETE FROM cart_items WHERE user_id = :user_id');
        $deleteCart->execute(['user_id' => $user['id']]);
        $this->statusHistory($orderId, null, 'pending', (int) $user['id'], 'Order placed');
        $this->notify((int) $user['id'], $orderId, 'Order placed', 'Your order ' . $orderNo . ' has been placed.');
        $this->notifyOwners($orderId, 'New order', 'Order ' . $orderNo . ' needs action.');
        $this->audit((int) $user['id'], 'order.created', 'order', $orderId, ['order_no' => $orderNo]);
        $db->commit();
        $order = $this->orderById($orderId);
        json_response(['message' => 'Order placed.', 'order' => $this->orderRow($order)], 201);
    }

    public function customerOrder(int $id): never
    {
        $user = $this->customer();
        $order = $this->orderById($id);
        if ((int) $order['user_id'] !== (int) $user['id']) {
            json_response(['message' => 'Order not found.'], 404);
        }
        json_response(['order' => $this->orderRow($order)]);
    }

    public function cancelCustomerOrder(int $id): never
    {
        $user = $this->customer();
        $data = $this->body();
        $reason = trim((string) ($data['reason'] ?? 'Cancelled by customer'));
        $db = $this->db();
        $db->beginTransaction();
        $this->claimIdempotency($user, 'order.cancel.' . $id, $data);
        $order = $this->orderById($id, true);
        if ((int) $order['user_id'] !== (int) $user['id'] || $order['order_status'] !== 'pending') {
            $db->rollBack();
            json_response(['message' => 'You can cancel an order only while it is pending.'], 409);
        }
        $this->changeOrderStatus($order, 'cancelled', (int) $user['id'], $reason);
        $db->prepare(
            "UPDATE orders SET status = 'Cancelled', cancelled_by = :user_id, cancel_reason = :reason,
             payment_status_v2 = CASE WHEN payment_status_v2 = 'under_review' THEN 'rejected' ELSE payment_status_v2 END
             WHERE id = :id"
        )->execute(['user_id' => $user['id'], 'reason' => $reason, 'id' => $id]);
        if ($order['payment_status_v2'] === 'under_review') {
            $db->prepare(
                "UPDATE payment_proofs SET status = 'rejected', reject_reason = 'Order cancelled by customer', reviewed_at = UTC_TIMESTAMP()
                 WHERE order_id = :id AND status = 'under_review'"
            )->execute(['id' => $id]);
        }
        $this->notify((int) $user['id'], $id, 'Order cancelled', 'Your order ' . $order['order_no'] . ' was cancelled.');
        $this->notifyOwners($id, 'Order cancelled', 'Customer cancelled order ' . $order['order_no'] . '.');
        $this->audit((int) $user['id'], 'order.cancelled', 'order', $id, ['reason' => $reason]);
        $db->commit();
        json_response(['message' => 'Order cancelled.']);
    }

    private function changeOrderStatus(array $order, string $status, int $actor, ?string $note = null): void
    {
        $db = $this->db();
        $orderId = (int) $order['id'];
        $fulfillment = $order['fulfillment'];
        $legacy = match ($status) {
            'pending' => 'Pending',
            'preparing' => 'Processing',
            'ready' => $fulfillment === 'pickup' ? 'Ready for pickup' : 'Out for delivery',
            'completed' => 'Completed',
            'cancelled' => 'Cancelled',
        };
        $update = $db->prepare(
            'UPDATE orders SET order_status = :status, status = :legacy_status, updated_at = UTC_TIMESTAMP()
             WHERE id = :id'
        );
        $update->execute(['status' => $status, 'legacy_status' => $legacy, 'id' => $orderId]);
        $this->statusHistory($orderId, (string) $order['order_status'], $status, $actor, $note);
    }

    private function deductOrderStock(array $order, int $actor): void
    {
        $db = $this->db();
        $lines = $db->prepare(        'SELECT product_id, name_snapshot, qty FROM order_items WHERE order_id = :id FOR UPDATE');
        $lines->execute(['id' => $order['id']]);
        $items = $lines->fetchAll();
        $productsById = [];
        foreach ($items as $item) {
            $product = $db->prepare('SELECT name, stock, low_stock_threshold FROM products WHERE id = :id FOR UPDATE');
            $product->execute(['id' => $item['product_id']]);
            $row = $product->fetch();
            if (!$row || (int) $row['stock'] < (int) $item['qty']) {
                throw new DomainException('Not enough stock for ' . ($row['name'] ?? $item['name_snapshot']) . '.');
            }
            $productsById[(int) $item['product_id']] = $row;
        }
        foreach ($items as $item) {
            $product = $productsById[(int) $item['product_id']];
            $stockBefore = (int) $product['stock'];
            $after = $stockBefore - (int) $item['qty'];
            $db->prepare('UPDATE products SET stock = :stock WHERE id = :id')
                ->execute(['stock' => $after, 'id' => $item['product_id']]);
            $this->insertMovement((int) $item['product_id'], (string) $item['name_snapshot'], -(int) $item['qty'], $stockBefore, $after, 'sale', 'Order ' . $order['order_no'], (int) $order['id'], $actor);
            $this->notifyLowStock(
                (int) $item['product_id'],
                (string) $product['name'],
                $stockBefore,
                $after,
                (int) $product['low_stock_threshold']
            );
        }
        $db->prepare('UPDATE orders SET stock_deducted = 1 WHERE id = :id')->execute(['id' => $order['id']]);
    }

    private function restoreOrderStock(array $order, int $actor): void
    {
        $db = $this->db();
        $lines = $db->prepare('SELECT product_id, name_snapshot, qty FROM order_items WHERE order_id = :id FOR UPDATE');
        $lines->execute(['id' => $order['id']]);
        foreach ($lines->fetchAll() as $item) {
            $product = $db->prepare('SELECT stock FROM products WHERE id = :id FOR UPDATE');
            $product->execute(['id' => $item['product_id']]);
            $before = (int) $product->fetchColumn();
            $after = $before + (int) $item['qty'];
            $db->prepare('UPDATE products SET stock = :stock WHERE id = :id')
                ->execute(['stock' => $after, 'id' => $item['product_id']]);
            $this->insertMovement((int) $item['product_id'], (string) $item['name_snapshot'], (int) $item['qty'], $before, $after, 'cancellation', 'Cancelled order ' . $order['order_no'], (int) $order['id'], $actor);
        }
        $db->prepare('UPDATE orders SET stock_deducted = 0 WHERE id = :id')->execute(['id' => $order['id']]);
    }

    private function insertMovement(int $productId, string $name, int $change, int $before, int $after, string $type, string $reason, ?int $orderId, int $actor): int
    {
        $legacyType = match ($type) {
            'sale' => 'Order',
            'restock' => 'Restock',
            'cancellation' => 'Cancellation',
            default => 'Adjustment',
        };
        $statement = $this->db()->prepare(
            'INSERT INTO stock_movements
             (product_id, product_name, movement_type, quantity_change, stock_before, stock_after, note,
              actor_user_id, change_qty, type, reason, order_id, user_id)
             VALUES (:product_id, :name, :legacy_type, :change, :before, :after, :legacy_note,
                     :actor, :canonical_change, :type, :canonical_reason, :order_id, :canonical_actor)'
        );
        $statement->execute([
            'product_id' => $productId, 'name' => $name, 'legacy_type' => $legacyType,
            'change' => $change, 'before' => $before, 'after' => $after,
            'actor' => $actor, 'canonical_actor' => $actor, 'canonical_change' => $change,
            'legacy_note' => $reason, 'canonical_reason' => $reason,
            'type' => $type, 'order_id' => $orderId,
        ]);
        return (int) $this->db()->lastInsertId();
    }

    public function submitPaymentProof(int $id): never
    {
        $user = $this->customer();
        require_csrf();
        $reference = trim((string) ($_POST['reference'] ?? ''));
        if (!preg_match('/^[a-zA-Z0-9]{6,20}$/', $reference)) {
            json_response(['message' => 'Enter a valid GCash reference number (6–20 letters or numbers).'], 422);
        }
        $file = $_FILES['proof'] ?? null;
        if (!is_array($file)) {
            json_response(['message' => 'Choose an image no larger than 2 MB.'], 422);
        }
        $db = $this->db();
        $db->beginTransaction();
        $proofPayload = [
            'reference' => $reference,
            'file_name' => (string) ($file['name'] ?? ''),
            'file_size' => (int) ($file['size'] ?? 0),
            'file_hash' => is_uploaded_file($file['tmp_name'] ?? '')
                ? hash_file('sha256', $file['tmp_name'])
                : hash('sha256', ''),
        ];
        $this->claimIdempotency($user, 'proof.submit.' . $id, $proofPayload);
        $order = $this->orderById($id, true);
        if ((int) $order['user_id'] !== (int) $user['id'] || $order['order_status'] !== 'pending'
            || $order['payment_method_v2'] !== 'gcash' || !in_array($order['payment_status_v2'], ['unpaid', 'rejected'], true)) {
            $db->rollBack();
            json_response(['message' => 'This order is not accepting payment proof right now.'], 409);
        }
        $exists = $db->prepare('SELECT id FROM payment_proofs WHERE reference_no = :reference LIMIT 1');
        $exists->execute(['reference' => $reference]);
        if ($exists->fetchColumn()) {
            $db->rollBack();
            json_response(['message' => 'This GCash reference number has already been used.'], 409);
        }
        $relativePath = $this->storeVerifiedImage($file, 'private/uploads/payment-proofs', '');
        $destination = dirname(__DIR__, 2) . '/' . $relativePath;
        try {
            $insert = $db->prepare(
                "INSERT INTO payment_proofs (order_id, reference_no, image_path, amount, status)
                 VALUES (:order_id, :reference, :path, :amount, 'under_review')"
            );
            $insert->execute([
                'order_id' => $id, 'reference' => $reference, 'path' => $relativePath,
                'amount' => $order['total'],
            ]);
            $db->prepare(
                "UPDATE orders SET payment_status_v2 = 'under_review', payment_status = 'Proof submitted' WHERE id = :id"
            )->execute(['id' => $id]);
            $this->notify((int) $user['id'], $id, 'Payment proof received', 'Your GCash proof is waiting for review.');
            $this->notifyOwners($id, 'GCash proof submitted', 'A GCash proof for order ' . $order['order_no'] . ' needs review.');
            $this->audit((int) $user['id'], 'payment.proof_submitted', 'order', $id);
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if (is_file($destination)) {
                unlink($destination);
            }
            if ($exception instanceof PDOException && $exception->getCode() === '23000') {
                json_response(['message' => 'This GCash reference number has already been used.'], 409);
            }
            throw $exception;
        }
        json_response(['message' => 'Payment proof submitted for review.'], 201);
    }

    public function paymentProofImage(int $id): never
    {
        $user = current_auth_user();
        if ($user === null) {
            json_response(['message' => 'Please log in to continue.'], 401);
        }
        if ($user['role'] === 'owner') {
            $this->owner();
        } elseif ($user['role'] === 'customer') {
            $order = $this->orderById($id);
            if ((int) $order['user_id'] !== (int) $user['id']) {
                json_response(['message' => 'Order not found.'], 404);
            }
        } else {
            json_response(['message' => 'You do not have permission to view this proof.'], 403);
        }
        $proof = $this->latestProof($id);
        if (!$proof) {
            json_response(['message' => 'Payment proof not found.'], 404);
        }
        $path = dirname(__DIR__, 2) . '/' . $proof['image_path'];
        if (!is_file($path)) {
            json_response(['message' => 'Payment proof file is missing.'], 404);
        }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
        if (!in_array($mime, ['image/jpeg', 'image/png'], true)) {
            json_response(['message' => 'Payment proof file is invalid.'], 500);
        }
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: no-store, private');
        readfile($path);
        exit;
    }

    public function publicGcashQr(): never
    {
        if (current_auth_user() === null) {
            json_response(['message' => 'Please log in to continue.'], 401);
        }
        $path = $this->setting('gcash_qr_path');
        if ($path === '') {
            json_response(['message' => 'The shop has not configured a GCash QR code.'], 404);
        }
        $this->sendImage($path);
    }

    public function ownerGcashQr(): never
    {
        $this->owner();
        $path = $this->setting('gcash_qr_path');
        if ($path === '') {
            json_response(['message' => 'No GCash QR code is configured.'], 404);
        }
        $this->sendImage($path);
    }

    private function sendImage(string $relativePath): never
    {
        $path = dirname(__DIR__, 2) . '/' . $relativePath;
        if (!is_file($path)) {
            json_response(['message' => 'The configured image file is missing.'], 404);
        }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            json_response(['message' => 'The configured image file is invalid.'], 500);
        }
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: no-store, private');
        readfile($path);
        exit;
    }

    public function ownerOrders(): never
    {
        $this->owner();
        $tab = (string) ($_GET['status'] ?? 'all');
        $status = match ($tab) {
            'needs-action', 'pending' => 'pending',
            'preparing' => 'preparing',
            'ready' => 'ready',
            'completed' => 'completed',
            'cancelled' => 'cancelled',
            default => null,
        };
        $where = '';
        $params = [];
        if ($status !== null) {
            $where = ' WHERE o.order_status = :status';
            $params['status'] = $status;
        }
        $result = $this->paginatedQuery(
            'SELECT o.*, u.name AS customer_name, u.email AS customer_email
             FROM orders o JOIN users u ON u.id = o.user_id' . $where
                . " ORDER BY CASE WHEN o.order_status = 'pending' THEN 0 ELSE 1 END, o.created_at ASC",
            'SELECT COUNT(*) FROM orders o' . $where,
            $params
        );
        $orders = $this->orderRows($result['rows']);
        $counts = $this->db()->query(
            "SELECT order_status, COUNT(*) AS count FROM orders GROUP BY order_status"
        )->fetchAll();
        $tabCounts = ['pending' => 0, 'preparing' => 0, 'ready' => 0, 'completed' => 0, 'cancelled' => 0];
        foreach ($counts as $row) {
            $tabCounts[$row['order_status']] = (int) $row['count'];
        }
        json_response(['orders' => $orders, 'counts' => $tabCounts, 'pagination' => $result['pagination']]);
    }

    public function ownerOrder(int $id): never
    {
        $this->owner();
        $order = $this->orderById($id);
        $proof = $this->latestProof($id);
        $row = $this->orderRow($order);
        if ($proof) {
            $row['proofImageUrl'] = '/api/v1/orders/' . $id . '/payment-proof/image';
        }
        $history = $this->db()->prepare(
            'SELECT from_status, to_status, note, created_at FROM order_status_history
             WHERE order_id = :id ORDER BY id'
        );
        $history->execute(['id' => $id]);
        json_response(['order' => $row, 'history' => $history->fetchAll()]);
    }

    public function ownerOrderAction(int $id): never
    {
        $owner = $this->owner();
        $data = $this->body();
        $action = (string) ($data['action'] ?? '');
        $db = $this->db();
        $db->beginTransaction();
        $this->claimIdempotency($owner, 'order.action.' . $id, $data);
        $order = $this->orderById($id, true);
        try {
            if ($action === 'approve_proof') {
                if ($order['order_status'] !== 'pending' || $order['payment_method_v2'] !== 'gcash'
                    || $order['payment_status_v2'] !== 'under_review') {
                    throw new DomainException('This GCash proof is no longer awaiting review.');
                }
                $proof = $db->prepare(
                    "SELECT id, reference_no FROM payment_proofs
                     WHERE order_id = :id AND status = 'under_review' ORDER BY id DESC LIMIT 1"
                );
                $proof->execute(['id' => $id]);
                $proofRow = $proof->fetch();
                if (!$proofRow) {
                    throw new DomainException('Payment proof not found.');
                }
                $this->deductOrderStock($order, (int) $owner['id']);
                $db->prepare(
                    "UPDATE payment_proofs SET status = 'approved', reviewed_by = :owner, reviewed_at = UTC_TIMESTAMP()
                     WHERE id = :id"
                )->execute(['owner' => $owner['id'], 'id' => $proofRow['id']]);
                $db->prepare(
                    "UPDATE orders SET payment_status_v2 = 'paid', payment_status = 'Verified' WHERE id = :id"
                )->execute(['id' => $id]);
                $this->changeOrderStatus($order, 'preparing', (int) $owner['id'], 'GCash payment approved');
                $this->notify((int) $order['user_id'], $id, 'Payment approved', 'Your GCash payment was approved and your order is being prepared.');
                $this->audit((int) $owner['id'], 'payment.proof_approved', 'order', $id, ['reference' => $proofRow['reference_no']]);
            } elseif ($action === 'reject_proof') {
                $reason = trim((string) ($data['reason'] ?? ''));
                if ($order['order_status'] !== 'pending' || $order['payment_method_v2'] !== 'gcash'
                    || $order['payment_status_v2'] !== 'under_review' || $reason === '' || strlen($reason) > 100) {
                    throw new DomainException('Choose a pending GCash proof and provide a rejection reason.');
                }
                $proof = $db->prepare(
                    "SELECT id FROM payment_proofs WHERE order_id = :id AND status = 'under_review'
                     ORDER BY id DESC LIMIT 1"
                );
                $proof->execute(['id' => $id]);
                $proofId = $proof->fetchColumn();
                if (!$proofId) {
                    throw new DomainException('Payment proof not found.');
                }
                $db->prepare(
                    "UPDATE payment_proofs SET status = 'rejected', reject_reason = :reason,
                     reviewed_by = :owner, reviewed_at = UTC_TIMESTAMP() WHERE id = :id"
                )->execute(['reason' => $reason, 'owner' => $owner['id'], 'id' => $proofId]);
                $db->prepare(
                    "UPDATE orders SET payment_status_v2 = 'rejected', payment_status = 'Rejected' WHERE id = :id"
                )->execute(['id' => $id]);
                $this->notify((int) $order['user_id'], $id, 'Payment proof needs an update', $reason);
                $this->audit((int) $owner['id'], 'payment.proof_rejected', 'order', $id, ['reason' => $reason]);
            } elseif ($action === 'confirm_cash') {
                if ($order['order_status'] !== 'pending' || $order['payment_method_v2'] === 'gcash'
                    || $order['payment_status_v2'] !== 'unpaid') {
                    throw new DomainException('Only unpaid cash orders can be confirmed.');
                }
                $this->deductOrderStock($order, (int) $owner['id']);
                $this->changeOrderStatus($order, 'preparing', (int) $owner['id'], 'Cash order confirmed');
                $this->notify((int) $order['user_id'], $id, 'Order confirmed', 'Your order is confirmed and being prepared.');
                $this->audit((int) $owner['id'], 'order.confirmed', 'order', $id);
            } elseif ($action === 'mark_ready') {
                if ($order['order_status'] !== 'preparing' || !(bool) $order['stock_deducted']) {
                    throw new DomainException('Only an order being prepared after stock confirmation can be marked ready.');
                }
                if ($order['fulfillment'] === 'delivery') {
                    $provider = (string) ($data['deliveryBy'] ?? '');
                    if (!in_array($provider, ['lalamove', 'owner'], true)) {
                        throw new DomainException('Choose Lalamove or owner delivery for this order.');
                    }
                    $db->prepare('UPDATE orders SET delivery_by = :provider WHERE id = :id')
                        ->execute(['provider' => $provider, 'id' => $id]);
                }
                $this->changeOrderStatus($order, 'ready', (int) $owner['id'], 'Order ready');
                $this->notify(
                    (int) $order['user_id'],
                    $id,
                    'Order ready',
                    self::readyNotificationBody((string) $order['fulfillment'])
                );
                $this->audit((int) $owner['id'], 'order.ready', 'order', $id, ['delivery_by' => $data['deliveryBy'] ?? null]);
            } elseif ($action === 'complete') {
                if ($order['order_status'] !== 'ready' || !(bool) $order['stock_deducted']) {
                    throw new DomainException('Only a ready order can be completed.');
                }
                if ($order['payment_method_v2'] === 'gcash' && $order['payment_status_v2'] !== 'paid') {
                    throw new DomainException('Approve the GCash payment before completing this order.');
                }
                $db->prepare(
                    "UPDATE orders SET payment_status_v2 = 'paid', payment_status = 'Verified' WHERE id = :id"
                )->execute(['id' => $id]);
                $this->changeOrderStatus($order, 'completed', (int) $owner['id'], 'Order handed over and paid');
                $this->notify(
                    (int) $order['user_id'],
                    $id,
                    'Order completed',
                    self::completionNotificationBody(
                        (string) $order['fulfillment'],
                        (string) $order['payment_method_v2']
                    )
                );
                $this->audit((int) $owner['id'], 'order.completed', 'order', $id);
            } elseif ($action === 'cancel') {
                $reason = trim((string) ($data['reason'] ?? ''));
                if (in_array($order['order_status'], ['completed', 'cancelled'], true) || $reason === '' || strlen($reason) > 500) {
                    throw new DomainException('Provide a reason. Completed or already cancelled orders cannot be cancelled.');
                }
                if ((bool) $order['stock_deducted']) {
                    $this->restoreOrderStock($order, (int) $owner['id']);
                }
                $this->changeOrderStatus($order, 'cancelled', (int) $owner['id'], $reason);
                $db->prepare(
                    "UPDATE orders SET cancelled_by = :owner, cancel_reason = :reason,
                     payment_status_v2 = CASE WHEN payment_status_v2 = 'under_review' THEN 'rejected' ELSE payment_status_v2 END,
                     payment_status = CASE WHEN payment_status = 'Proof submitted' THEN 'Rejected' ELSE payment_status END
                     WHERE id = :id"
                )->execute(['owner' => $owner['id'], 'reason' => $reason, 'id' => $id]);
                $db->prepare(
                    "UPDATE payment_proofs SET status = 'rejected', reject_reason = :reason,
                     reviewed_by = :owner, reviewed_at = UTC_TIMESTAMP()
                     WHERE order_id = :id AND status = 'under_review'"
                )->execute(['reason' => $reason, 'owner' => $owner['id'], 'id' => $id]);
                $this->notify((int) $order['user_id'], $id, 'Order cancelled', 'Your order was cancelled: ' . $reason);
                $this->audit((int) $owner['id'], 'order.cancelled', 'order', $id, ['reason' => $reason]);
            } else {
                $db->rollBack();
                json_response(['message' => 'Unsupported order action.'], 422);
            }
            $db->commit();
        } catch (DomainException $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            json_response(['message' => $exception->getMessage()], 409);
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
        json_response(['message' => 'Order updated.', 'order' => $this->orderRow($this->orderById($id))]);
    }

    public function ownerProducts(): never
    {
        $this->owner();
        $query = trim((string) ($_GET['q'] ?? ''));
        $category = trim((string) ($_GET['category'] ?? ''));
        $where = ' WHERE 1 = 1';
        $params = [];
        if ($query !== '') {
            $where .= ' AND (p.name LIKE :name_query OR p.description LIKE :description_query OR p.short_description LIKE :short_query OR c.name LIKE :category_query)';
            $wildcard = '%' . $query . '%';
            $params = ['name_query' => $wildcard, 'description_query' => $wildcard, 'short_query' => $wildcard, 'category_query' => $wildcard];
        }
        if ($category !== '' && strtolower($category) !== 'all items') {
            $where .= ' AND (c.slug = :category_slug OR c.name = :category_name)';
            $params['category_slug'] = $category;
            $params['category_name'] = $category;
        }
        $result = $this->paginatedQuery(
            $this->productSelect() . $where . ' ORDER BY p.name',
            'SELECT COUNT(*) FROM products p LEFT JOIN categories c ON c.id = p.category_id' . $where,
            $params
        );
        json_response([
            'products' => array_map(fn(array $row): array => $this->productRow($row), $result['rows']),
            'pagination' => $result['pagination'],
        ]);
    }

    private function categoryId(string $name): int
    {
        $slug = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $name) ?? '', '-'));
        if ($name === '' || strlen($name) > 100 || $slug === '') {
            json_response(['message' => 'Enter a valid product category.'], 422);
        }
        $insert = $this->db()->prepare(
            'INSERT INTO categories (name, slug) VALUES (:name, :slug)
             ON DUPLICATE KEY UPDATE name = VALUES(name)'
        );
        $insert->execute(['name' => $name, 'slug' => $slug]);
        $find = $this->db()->prepare('SELECT id FROM categories WHERE name = :name LIMIT 1');
        $find->execute(['name' => $name]);
        return (int) $find->fetchColumn();
    }

    public function createProduct(): never
    {
        $owner = $this->owner();
        $data = $this->body();
        $name = trim((string) ($data['name'] ?? ''));
        $category = trim((string) ($data['category'] ?? ''));
        $description = trim((string) ($data['description'] ?? ''));
        $price = filter_var($data['price'] ?? null, FILTER_VALIDATE_FLOAT);
        $stock = filter_var($data['stock'] ?? null, FILTER_VALIDATE_INT);
        if ($name === '' || strlen($name) > 160 || $description === '' || strlen($description) > 5000
            || $price === false || $price <= 0 || $stock === false || $stock < 0 || $stock > 100000
            || $category === '') {
            json_response(['message' => 'Enter a valid name, category, description, price and stock quantity.'], 422);
        }
        $db = $this->db();
        $db->beginTransaction();
        $this->claimIdempotency($owner, 'product.create', $data);
        $categoryId = $this->categoryId($category);
        $base = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $name) ?? '', '-'));
        $slug = ($base !== '' ? $base : 'product') . '-' . bin2hex(random_bytes(3));
        $insert = $db->prepare(
            'INSERT INTO products
             (name, category, short_description, description, price, stock, image_url, featured, is_active,
              category_id, slug, low_stock_threshold, image_path)
             VALUES (:name, :category, :short, :description, :price, 0, NULL, 0, 1, :category_id, :slug, 5, NULL)'
        );
        $insert->execute([
            'name' => $name, 'category' => $category, 'short' => mb_substr($description, 0, 255),
            'description' => $description, 'price' => $price, 'category_id' => $categoryId, 'slug' => $slug,
        ]);
        $id = (int) $db->lastInsertId();
        if ($stock > 0) {
            $db->prepare('UPDATE products SET stock = :stock WHERE id = :id')->execute(['stock' => $stock, 'id' => $id]);
            $this->insertMovement($id, $name, $stock, 0, $stock, 'restock', 'Initial stock', null, (int) $owner['id']);
        }
        $this->audit((int) $owner['id'], 'product.created', 'product', $id);
        $db->commit();
        json_response(['message' => 'Product created.', 'id' => $id, 'slug' => $slug], 201);
    }

    public function updateProduct(int $id): never
    {
        $owner = $this->owner();
        $data = $this->body();
        $fields = [];
        $params = ['id' => $id];
        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            if ($name === '' || strlen($name) > 160) {
                json_response(['message' => 'Product name is invalid.'], 422);
            }
            $fields[] = 'name = :name';
            $params['name'] = $name;
        }
        if (array_key_exists('price', $data)) {
            $price = filter_var($data['price'], FILTER_VALIDATE_FLOAT);
            if ($price === false || $price <= 0) {
                json_response(['message' => 'Price must be greater than zero.'], 422);
            }
            $fields[] = 'price = :price';
            $params['price'] = $price;
        }
        if (array_key_exists('description', $data)) {
            $description = trim((string) $data['description']);
            if (strlen($description) > 5000) {
                json_response(['message' => 'Description is too long.'], 422);
            }
            $fields[] = 'description = :description';
            $params['description'] = $description;
            $fields[] = 'short_description = :short_description';
            $params['short_description'] = mb_substr($description, 0, 255);
        }
        if (array_key_exists('category', $data)) {
            $category = trim((string) $data['category']);
            $fields[] = 'category = :category';
            $params['category'] = $category;
            $fields[] = 'category_id = :category_id';
            $params['category_id'] = $this->categoryId($category);
        }
        if (array_key_exists('active', $data)) {
            $fields[] = 'is_active = :active';
            $params['active'] = $data['active'] ? 1 : 0;
        }
        if (!$fields) {
            json_response(['message' => 'No product changes were provided.'], 422);
        }
        $statement = $this->db()->prepare('UPDATE products SET ' . implode(', ', $fields) . ' WHERE id = :id');
        $statement->execute($params);
        if ($statement->rowCount() === 0) {
            $exists = $this->db()->prepare('SELECT id FROM products WHERE id = :id');
            $exists->execute(['id' => $id]);
            if (!$exists->fetchColumn()) {
                json_response(['message' => 'Product not found.'], 404);
            }
        }
        $this->audit((int) $owner['id'], 'product.updated', 'product', $id, array_keys($data));
        json_response(['message' => 'Product updated.']);
    }

    public function productImage(string|int $value): never
    {
        $id = $this->productId($value);
        $statement = $this->db()->prepare('SELECT image_path FROM products WHERE id = :id');
        $statement->execute(['id' => $id]);
        $path = $statement->fetchColumn();
        if (!is_string($path) || $path === '') {
            json_response(['message' => 'This product has no uploaded image.'], 404);
        }
        $this->sendImage($path);
    }

    public function uploadProductImage(string|int $value): never
    {
        $owner = $this->owner();
        require_csrf();
        $id = $this->productId($value);
        $file = $_FILES['image'] ?? null;
        if (!is_array($file)) {
            json_response(['message' => 'Choose a JPEG, PNG, or WebP image no larger than 2 MB.'], 422);
        }
        $payload = [
            'file_name' => (string) ($file['name'] ?? ''),
            'file_size' => (int) ($file['size'] ?? 0),
            'file_hash' => is_uploaded_file($file['tmp_name'] ?? '')
                ? hash_file('sha256', $file['tmp_name'])
                : hash('sha256', ''),
        ];
        $db = $this->db();
        $db->beginTransaction();
        $this->claimIdempotency($owner, 'product.image.upload.' . $id, $payload);
        $find = $db->prepare('SELECT image_path FROM products WHERE id = :id FOR UPDATE');
        $find->execute(['id' => $id]);
        $existing = $find->fetchColumn();
        if ($existing === false) {
            $db->rollBack();
            json_response(['message' => 'Product not found.'], 404);
        }
        $relativePath = $this->storeVerifiedImage($file, 'private/uploads/products', 'product-');
        $destination = dirname(__DIR__, 2) . '/' . $relativePath;
        try {
            $db->prepare('UPDATE products SET image_path = :path, image_url = NULL WHERE id = :id')
                ->execute(['path' => $relativePath, 'id' => $id]);
            $this->audit((int) $owner['id'], 'product.image_uploaded', 'product', $id);
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if (is_file($destination)) {
                unlink($destination);
            }
            throw $exception;
        }
        if (is_string($existing) && $existing !== '' && str_starts_with($existing, 'private/uploads/products/')
            && $existing !== $relativePath) {
            $oldFile = dirname(__DIR__, 2) . '/' . $existing;
            if (is_file($oldFile)) {
                unlink($oldFile);
            }
        }
        json_response([
            'message' => 'Product image uploaded.',
            'image' => '/api/v1/catalog/products/' . $id . '/image',
        ], 201);
    }

    public function removeProductImage(string|int $value): never
    {
        $owner = $this->owner();
        require_csrf();
        $id = $this->productId($value);
        $data = [];
        $db = $this->db();
        $db->beginTransaction();
        $this->claimIdempotency($owner, 'product.image.remove.' . $id, $data);
        $find = $db->prepare('SELECT image_path FROM products WHERE id = :id FOR UPDATE');
        $find->execute(['id' => $id]);
        $existing = $find->fetchColumn();
        if ($existing === false) {
            $db->rollBack();
            json_response(['message' => 'Product not found.'], 404);
        }
        $db->prepare('UPDATE products SET image_path = NULL WHERE id = :id')
            ->execute(['id' => $id]);
        $this->audit((int) $owner['id'], 'product.image_removed', 'product', $id);
        $db->commit();
        if (is_string($existing) && str_starts_with($existing, 'private/uploads/products/')) {
            $oldFile = dirname(__DIR__, 2) . '/' . $existing;
            if (is_file($oldFile)) {
                unlink($oldFile);
            }
        }
        json_response(['message' => 'Product image removed.']);
    }

    public function inventory(): never
    {
        $this->owner();
        $sort = (string) ($_GET['sort'] ?? 'stock-asc');
        $orderBy = match ($sort) {
            'stock-desc' => 'p.stock DESC, p.name',
            'name' => 'p.name',
            default => 'p.stock ASC, p.name',
        };
        $products = $this->paginatedQuery(
            $this->productSelect() . ' ORDER BY ' . $orderBy,
            'SELECT COUNT(*) FROM products p LEFT JOIN categories c ON c.id = p.category_id',
            [],
            'products'
        );
        $movements = $this->paginatedQuery(
            'SELECT sm.id, sm.product_name, sm.change_qty, sm.reason, sm.created_at, o.order_no
             FROM stock_movements sm LEFT JOIN orders o ON o.id = sm.order_id
             ORDER BY sm.id DESC',
            'SELECT COUNT(*) FROM stock_movements',
            [],
            'movements'
        );
        json_response([
            'products' => array_map(fn(array $row): array => $this->productRow($row), $products['rows']),
            'productsPagination' => $products['pagination'],
            'movements' => array_map(static fn(array $row): array => [
                'id' => (int) $row['id'], 'product' => $row['product_name'], 'change' => (int) $row['change_qty'],
                'reason' => $row['reason'], 'orderId' => $row['order_no'] ?? '', 'date' => $row['created_at'],
            ], $movements['rows']),
            'movementsPagination' => $movements['pagination'],
        ]);
    }

    public function moveStock(): never
    {
        $owner = $this->owner();
        $data = $this->body();
        $id = $this->productId($data['productId'] ?? '');
        $amount = filter_var($data['quantity'] ?? null, FILTER_VALIDATE_INT);
        $type = (string) ($data['type'] ?? 'restock');
        $reason = trim((string) ($data['reason'] ?? ''));
        $note = trim((string) ($data['note'] ?? ''));
        $confirmedLargeChange = (bool) ($data['confirmedLargeChange'] ?? false);
        if ($amount === false || $amount === 0 || abs($amount) > 100000
            || !in_array($type, ['restock', 'adjustment'], true)
            || $reason === '' || strlen($reason) > 500 || strlen($note) > 500) {
            json_response(['message' => 'Enter a valid stock movement and reason.'], 422);
        }
        if (abs($amount) >= 50 && !$confirmedLargeChange) {
            json_response(['message' => 'Large stock changes require confirmation.'], 422);
        }
        $db = $this->db();
        $db->beginTransaction();
        $this->claimIdempotency($owner, 'stock.move', $data);
        $find = $db->prepare('SELECT name, stock, low_stock_threshold FROM products WHERE id = :id FOR UPDATE');
        $find->execute(['id' => $id]);
        $product = $find->fetch();
        if (!$product) {
            $db->rollBack();
            json_response(['message' => 'Product not found.'], 404);
        }
        $after = (int) $product['stock'] + $amount;
        if ($after < 0) {
            $db->rollBack();
            json_response(['message' => 'Stock cannot fall below zero.'], 409);
        }
        $db->prepare('UPDATE products SET stock = :stock WHERE id = :id')->execute(['stock' => $after, 'id' => $id]);
        $movementId = $this->insertMovement($id, $product['name'], $amount, (int) $product['stock'], $after, $type, $reason . ($note !== '' ? ': ' . $note : ''), null, (int) $owner['id']);
        if (abs($amount) >= 50) {
            $archive = $db->prepare(
                'INSERT INTO stock_change_archives
                 (movement_id, product_id, actor_user_id, change_qty, stock_before, stock_after, reason, note, confirmed_large_change)
                 VALUES (:movement_id, :product_id, :actor, :change, :before, :after, :reason, :note, 1)'
            );
            $archive->execute([
                'movement_id' => $movementId,
                'product_id' => $id,
                'actor' => (int) $owner['id'],
                'change' => $amount,
                'before' => (int) $product['stock'],
                'after' => $after,
                'reason' => $reason,
                'note' => $note,
            ]);
        }
        $this->notifyLowStock(
            $id,
            (string) $product['name'],
            (int) $product['stock'],
            $after,
            (int) $product['low_stock_threshold']
        );
        $this->audit((int) $owner['id'], 'inventory.moved', 'product', $id, ['change' => $amount, 'reason' => $reason]);
        $db->commit();
        json_response(['message' => 'Stock updated.', 'stock' => $after]);
    }

    public function customers(): never
    {
        $this->owner();
        $query = trim((string) ($_GET['q'] ?? ''));
        $where = ' WHERE u.role = "customer"';
        $params = [];
        if ($query !== '') {
            $where .= ' AND (u.name LIKE :name_query OR u.email LIKE :email_query OR u.phone LIKE :phone_query)';
            $wildcard = '%' . $query . '%';
            $params['name_query'] = $wildcard;
            $params['email_query'] = $wildcard;
            $params['phone_query'] = $wildcard;
        }
        $sql = 'SELECT u.id, u.name, u.email, u.phone, u.created_at,
                       COUNT(o.id) AS orders_count, COALESCE(SUM(CASE WHEN o.order_status <> "cancelled" THEN o.total ELSE 0 END), 0) AS spend
                FROM users u LEFT JOIN orders o ON o.user_id = u.id'
            . $where . ' GROUP BY u.id ORDER BY u.created_at DESC';
        $result = $this->paginatedQuery(
            $sql,
            'SELECT COUNT(*) FROM users u' . $where,
            $params
        );
        json_response(['customers' => $result['rows'], 'pagination' => $result['pagination']]);
    }

    private function reportPeriod(): array
    {
        $type = (string) ($_GET['period'] ?? 'month');
        if (!in_array($type, ['week', 'month', 'year'], true)) {
            json_response(['message' => 'Choose week, month, or year for the report period.'], 422);
        }

        $timezone = new DateTimeZone('Asia/Manila');
        $date = (string) ($_GET['date'] ?? (new DateTimeImmutable('now', $timezone))->format('Y-m-d'));
        $anchor = DateTimeImmutable::createFromFormat('!Y-m-d', $date, $timezone);
        $dateErrors = DateTimeImmutable::getLastErrors();
        if (!$anchor || ($dateErrors !== false && ($dateErrors['warning_count'] || $dateErrors['error_count']))
            || $anchor->format('Y-m-d') !== $date) {
            json_response(['message' => 'Enter a valid report date in YYYY-MM-DD format.'], 422);
        }

        if ($type === 'week') {
            $start = $anchor->modify('monday this week');
            $endExclusive = $start->modify('+7 days');
            $previousStart = $start->modify('-7 days');
            $label = $start->format('M j') . ' – ' . $endExclusive->modify('-1 day')->format('M j, Y');
            $bucket = 'day';
        } elseif ($type === 'month') {
            $start = $anchor->modify('first day of this month')->setTime(0, 0);
            $endExclusive = $start->modify('+1 month');
            $previousStart = $start->modify('-1 month');
            $label = $start->format('F Y');
            $bucket = 'day';
        } else {
            $start = $anchor->setDate((int) $anchor->format('Y'), 1, 1)->setTime(0, 0);
            $endExclusive = $start->modify('+1 year');
            $previousStart = $start->modify('-1 year');
            $label = $start->format('Y');
            $bucket = 'month';
        }

        $previousEnd = $start;
        $utc = new DateTimeZone('UTC');
        return [
            'type' => $type,
            'start' => $start,
            'endExclusive' => $endExclusive,
            'previousStart' => $previousStart,
            'previousEnd' => $previousEnd,
            'label' => $label,
            'bucket' => $bucket,
            'display' => [
                'start' => $start->format('Y-m-d'),
                'end' => $endExclusive->modify('-1 day')->format('Y-m-d'),
                'previousStart' => $previousStart->format('Y-m-d'),
                'previousEnd' => $previousEnd->modify('-1 day')->format('Y-m-d'),
                'label' => $label,
                'bucket' => $bucket,
            ],
            'utc' => [
                'start' => $start->setTimezone($utc)->format('Y-m-d H:i:s'),
                'end' => $endExclusive->setTimezone($utc)->format('Y-m-d H:i:s'),
                'previousStart' => $previousStart->setTimezone($utc)->format('Y-m-d H:i:s'),
                'previousEnd' => $previousEnd->setTimezone($utc)->format('Y-m-d H:i:s'),
            ],
        ];
    }

    private function paidOrdersSql(): string
    {
        return "SELECT o.id, o.total, o.payment_method_v2, o.fulfillment, o.order_status,
                       CASE WHEN o.payment_method_v2 = 'gcash' THEN (
                           SELECT MAX(proof.reviewed_at)
                           FROM payment_proofs proof
                           WHERE proof.order_id = o.id AND proof.status = 'approved'
                       ) ELSE (
                           SELECT MAX(history.created_at)
                           FROM order_status_history history
                           WHERE history.order_id = o.id AND history.to_status = 'completed'
                       ) END AS paid_at
                FROM orders o
                WHERE o.payment_status_v2 = 'paid' AND o.order_status <> 'cancelled'";
    }

    private function reportQuery(string $sql, array $params = []): array
    {
        $statement = $this->db()->prepare($sql);
        $statement->execute($params);
        return $statement->fetchAll();
    }

    private function reportPercent(string|int $numerator, string|int $denominator): ?string
    {
        $statement = $this->db()->prepare(
            'SELECT CASE WHEN CAST(:denominator AS DECIMAL(24, 6)) = 0 THEN NULL
                         ELSE CAST(
                             CAST(:numerator AS DECIMAL(24, 6))
                             / CAST(:denominator_check AS DECIMAL(24, 6)) * 100
                             AS DECIMAL(12, 2)
                         ) END'
        );
        $statement->execute([
            'numerator' => (string) $numerator,
            'denominator' => (string) $denominator,
            'denominator_check' => (string) $denominator,
        ]);
        $value = $statement->fetchColumn();
        return $value === false || $value === null ? null : (string) $value;
    }

    private function reportChange(string|int $current, string|int $previous): ?string
    {
        $isZero = $this->db()->prepare('SELECT CAST(:previous_value AS DECIMAL(24, 6)) = 0');
        $isZero->execute(['previous_value' => (string) $previous]);
        if ((bool) $isZero->fetchColumn()) {
            return null;
        }
        $statement = $this->db()->prepare(
            'SELECT CAST(
                (CAST(:current_value AS DECIMAL(24, 6)) - CAST(:previous_value AS DECIMAL(24, 6)))
                / CAST(:previous_denominator AS DECIMAL(24, 6)) * 100
                AS DECIMAL(12, 2)
             )'
        );
        $statement->execute([
            'current_value' => (string) $current,
            'previous_value' => (string) $previous,
            'previous_denominator' => (string) $previous,
        ]);
        return (string) $statement->fetchColumn();
    }

    private function reportDecimalCompare(string|int $left, string|int $right): int
    {
        $normalize = static function (string|int $value): array {
            $value = (string) $value;
            $negative = str_starts_with($value, '-');
            $value = ltrim($value, '-+');
            [$whole, $fraction] = array_pad(explode('.', $value, 2), 2, '');
            $whole = ltrim($whole, '0') ?: '0';
            $fraction = rtrim($fraction, '0');
            return [$negative && ($whole !== '0' || $fraction !== '') ? -1 : 1, $whole, $fraction];
        };
        [$leftSign, $leftWhole, $leftFraction] = $normalize($left);
        [$rightSign, $rightWhole, $rightFraction] = $normalize($right);
        if ($leftSign !== $rightSign) {
            return $leftSign <=> $rightSign;
        }

        $wholeComparison = strlen($leftWhole) <=> strlen($rightWhole);
        if ($wholeComparison === 0) {
            $wholeComparison = strcmp($leftWhole, $rightWhole) <=> 0;
        }
        $scale = max(strlen($leftFraction), strlen($rightFraction));
        $fractionComparison = strcmp(
            str_pad($leftFraction, $scale, '0'),
            str_pad($rightFraction, $scale, '0')
        ) <=> 0;
        return ($wholeComparison !== 0 ? $wholeComparison : $fractionComparison) * $leftSign;
    }

    private function reportData(array $period): array
    {
        $utc = $period['utc'];
        $bounds = static fn(string $start, string $end): array => [
            'start_at' => $utc[$start],
            'end_at' => $utc[$end],
        ];

        $orderSummary = $this->reportQuery(
            "SELECT COUNT(*) AS placed,
                    COALESCE(SUM(order_status = 'cancelled'), 0) AS cancelled
             FROM orders WHERE created_at >= :start_at AND created_at < :end_at",
            $bounds('start', 'end')
        )[0];
        $statusRows = $this->reportQuery(
            'SELECT order_status, COUNT(*) AS count
             FROM orders WHERE created_at >= :start_at AND created_at < :end_at
             GROUP BY order_status',
            $bounds('start', 'end')
        );
        $statusCounts = array_fill_keys(['completed', 'preparing', 'pending', 'cancelled', 'ready'], 0);
        foreach ($statusRows as $row) {
            $statusCounts[$row['order_status']] = (int) $row['count'];
        }

        $paidSql = $this->paidOrdersSql();
        $paidMetrics = function (string $start, string $end) use ($paidSql, $utc): array {
            return $this->reportQuery(
                "SELECT CAST(COALESCE(SUM(paid.total), 0) AS DECIMAL(14, 2)) AS revenue,
                        COUNT(*) AS paid_orders,
                        CAST(COALESCE(SUM(paid.total) / NULLIF(COUNT(*), 0), 0) AS DECIMAL(14, 2)) AS average_order
                 FROM ($paidSql) paid
                 WHERE paid.paid_at >= :start_at AND paid.paid_at < :end_at",
                ['start_at' => $utc[$start], 'end_at' => $utc[$end]]
            )[0];
        };
        $currentPaid = $paidMetrics('start', 'end');
        $previousPaid = $paidMetrics('previousStart', 'previousEnd');
        $periodOrders = (int) $orderSummary['placed'];
        $cancelledOrders = (int) $orderSummary['cancelled'];

        $paidInPeriodParams = $bounds('start', 'end');
        $paymentRows = $this->reportQuery(
            "SELECT paid.payment_method_v2, COUNT(*) AS count
             FROM ($paidSql) paid
             WHERE paid.paid_at >= :start_at AND paid.paid_at < :end_at
             GROUP BY paid.payment_method_v2",
            $paidInPeriodParams
        );
        $paymentCounts = ['gcash' => 0, 'cod' => 0, 'cash_pickup' => 0];
        foreach ($paymentRows as $row) {
            if (array_key_exists($row['payment_method_v2'], $paymentCounts)) {
                $paymentCounts[$row['payment_method_v2']] = (int) $row['count'];
            }
        }
        $paymentMethods = [];
        foreach ([
            'gcash' => 'GCash',
            'cod' => 'COD',
            'cash_pickup' => 'Cash at the shop',
        ] as $method => $label) {
            $paymentMethods[] = [
                'method' => $method,
                'label' => $label,
                'count' => $paymentCounts[$method],
                'percent' => $this->reportPercent($paymentCounts[$method], (int) $currentPaid['paid_orders']) ?? '0.00',
            ];
        }

        $dailyRows = $this->reportQuery(
            "SELECT DATE_FORMAT(DATE_ADD(paid.paid_at, INTERVAL 8 HOUR), :bucket_format) AS period_date,
                    CAST(SUM(paid.total) AS DECIMAL(14, 2)) AS revenue
             FROM ($paidSql) paid
             WHERE paid.paid_at >= :start_at AND paid.paid_at < :end_at
             GROUP BY period_date ORDER BY period_date",
            $paidInPeriodParams + ['bucket_format' => $period['type'] === 'year' ? '%Y-%m' : '%Y-%m-%d']
        );
        $dailySeries = [];
        if ($period['type'] === 'year') {
            for ($month = 1; $month <= 12; $month++) {
                $date = sprintf('%s-%02d', $period['start']->format('Y'), $month);
                $dailySeries[$date] = '0.00';
            }
        } else {
            for ($day = $period['start']; $day < $period['endExclusive']; $day = $day->modify('+1 day')) {
                $dailySeries[$day->format('Y-m-d')] = '0.00';
            }
        }
        foreach ($dailyRows as $row) {
            if (array_key_exists($row['period_date'], $dailySeries)) {
                $dailySeries[$row['period_date']] = (string) $row['revenue'];
            }
        }
        $dailySeries = array_map(
            static fn(string $date, string $revenue): array => ['date' => $date, 'revenue' => $revenue],
            array_keys($dailySeries),
            array_values($dailySeries)
        );

        $categoryRows = $this->reportQuery(
            "SELECT COALESCE(category.name, product.category, 'Uncategorized') AS category_name,
                    CAST(SUM(item.line_total) AS DECIMAL(14, 2)) AS revenue
             FROM ($paidSql) paid
             JOIN order_items item ON item.order_id = paid.id
             LEFT JOIN products product ON product.id = item.product_id
             LEFT JOIN categories category ON category.id = product.category_id
             WHERE paid.paid_at >= :start_at AND paid.paid_at < :end_at
             GROUP BY category_name
             ORDER BY revenue DESC, category_name",
            $paidInPeriodParams
        );
        $topProductRows = $this->reportQuery(
            "SELECT item.name_snapshot AS product,
                    CAST(SUM(item.qty) AS UNSIGNED) AS units,
                    CAST(SUM(item.line_total) AS DECIMAL(14, 2)) AS revenue
             FROM ($paidSql) paid
             JOIN order_items item ON item.order_id = paid.id
             WHERE paid.paid_at >= :start_at AND paid.paid_at < :end_at
             GROUP BY item.product_id, item.name_snapshot
             ORDER BY revenue DESC, product
             LIMIT 5",
            $paidInPeriodParams
        );
        $topProducts = array_map(function (array $row) use ($currentPaid): array {
            return [
                'product' => $row['product'],
                'units' => (int) $row['units'],
                'revenue' => (string) $row['revenue'],
                'shareOfSales' => $this->reportPercent($row['revenue'], $currentPaid['revenue']) ?? '0.00',
            ];
        }, $topProductRows);

        $fulfillmentRow = $this->reportQuery(
            "SELECT COALESCE(SUM(fulfillment = 'delivery'), 0) AS delivery,
                    COALESCE(SUM(fulfillment = 'pickup'), 0) AS pickup,
                    COUNT(*) AS total
             FROM orders
             WHERE created_at >= :start_at AND created_at < :end_at
               AND order_status <> 'cancelled'",
            $bounds('start', 'end')
        )[0];

        $reviewRow = $this->reportQuery(
            "SELECT COALESCE(SUM(status = 'approved'), 0) AS approved,
                    COALESCE(SUM(status = 'rejected'), 0) AS rejected,
                    ROUND(AVG(TIMESTAMPDIFF(SECOND, submitted_at, reviewed_at))) AS average_review_seconds
             FROM payment_proofs
             WHERE reviewed_at >= :start_at AND reviewed_at < :end_at
               AND status IN ('approved', 'rejected')",
            $bounds('start', 'end')
        )[0];
        $firstUploadRow = $this->reportQuery(
            "SELECT COUNT(DISTINCT approved.order_id) AS approved_orders,
                    COUNT(DISTINCT CASE WHEN proof_counts.proof_count = 1 THEN approved.order_id END) AS first_upload_approved
             FROM payment_proofs approved
             JOIN (
                 SELECT order_id, COUNT(*) AS proof_count
                 FROM payment_proofs
                 GROUP BY order_id
             ) proof_counts ON proof_counts.order_id = approved.order_id
             WHERE approved.status = 'approved'
               AND approved.reviewed_at >= :start_at AND approved.reviewed_at < :end_at",
            $bounds('start', 'end')
        )[0];
        $averageReviewSeconds = $reviewRow['average_review_seconds'] === null
            ? null
            : (int) $reviewRow['average_review_seconds'];
        $approvedOrderCount = (int) $firstUploadRow['approved_orders'];
        $firstUploadRate = $approvedOrderCount > 0
            ? $this->reportPercent((int) $firstUploadRow['first_upload_approved'], $approvedOrderCount)
            : null;

        $statusList = [];
        foreach (['completed', 'preparing', 'pending', 'cancelled', 'ready'] as $status) {
            $statusList[] = ['status' => $status, 'count' => $statusCounts[$status]];
        }
        $revenueChange = $this->reportChange($currentPaid['revenue'], $previousPaid['revenue']);
        $insights = [
            'revenue' => $revenueChange === null
                ? null
                : sprintf(
                    'Revenue %s %s%% compared with %s.',
                    str_starts_with($revenueChange, '-') ? 'decreased' : 'increased',
                    ltrim($revenueChange, '-'),
                    $period['previousStart']->format('F Y')
                ),
            'dailyRevenue' => null,
            'paymentMethods' => null,
            'ordersByStatus' => null,
            'deliveryVsPickup' => null,
            'paymentReview' => $firstUploadRate === null
                ? null
                : $firstUploadRate . '% of approved orders were approved on the first upload.',
        ];

        $nonZeroDaily = array_values(array_filter(
            $dailySeries,
            fn(array $item): bool => $this->reportDecimalCompare($item['revenue'], '0.00') > 0
        ));
        if ($nonZeroDaily) {
            $peak = $nonZeroDaily[0];
            foreach ($nonZeroDaily as $item) {
                if ($this->reportDecimalCompare($item['revenue'], $peak['revenue']) > 0) {
                    $peak = $item;
                }
            }
            $averageLabel = $period['type'] === 'year' ? 'average month' : 'average day';
            $averageBucket = $this->reportQuery(
                'SELECT CAST(COALESCE(SUM(CAST(:revenue AS DECIMAL(14, 2))) / NULLIF(:bucket_count, 0), 0) AS DECIMAL(14, 2)) AS amount',
                ['revenue' => (string) $currentPaid['revenue'], 'bucket_count' => count($dailySeries)]
            )[0]['amount'];
            $peakLabel = $period['type'] === 'year'
                ? (new DateTimeImmutable($peak['date'] . '-01', new DateTimeZone('Asia/Manila')))->format('M Y')
                : (new DateTimeImmutable($peak['date'], new DateTimeZone('Asia/Manila')))->format('M j');
            $insights['dailyRevenue'] = sprintf(
                'Revenue peaked on %s at ₱%s. The %s was ₱%s.',
                $peakLabel,
                number_format((float) $peak['revenue'], 2),
                $averageLabel,
                number_format((float) $averageBucket, 2)
            );
        }

        $paidOrderCount = (int) $currentPaid['paid_orders'];
        if ($paidOrderCount > 0) {
            $mainMethod = $paymentMethods[0];
            foreach ($paymentMethods as $method) {
                if ($method['count'] > $mainMethod['count']) {
                    $mainMethod = $method;
                }
            }
            if ($mainMethod['count'] > 0) {
                $insights['paymentMethods'] = $mainMethod['label'] . ' is the main payment method.';
            }
        }
        if ($periodOrders > 0) {
            $completedPercent = $this->reportPercent($statusCounts['completed'], $periodOrders) ?? '0.00';
            $insights['ordersByStatus'] = $completedPercent . '% of orders placed in this period are completed.';
        }
        if ((int) $fulfillmentRow['total'] > 0) {
            $deliveryPercent = $this->reportPercent($fulfillmentRow['delivery'], $fulfillmentRow['total']) ?? '0.00';
            $insights['deliveryVsPickup'] = $deliveryPercent . '% of non-cancelled orders are for delivery.';
        }

        return [
            'period' => [
                'type' => $period['type'],
                ...$period['display'],
            ],
            'kpis' => [
                'revenue' => [
                    'current' => (string) $currentPaid['revenue'],
                    'previous' => (string) $previousPaid['revenue'],
                    'changePercent' => $this->reportChange($currentPaid['revenue'], $previousPaid['revenue']),
                ],
                'orders' => ['placed' => $periodOrders, 'cancelled' => $cancelledOrders],
                'paidOrders' => ['count' => $paidOrderCount],
                'averageOrder' => [
                    'current' => (string) $currentPaid['average_order'],
                    'previous' => (string) $previousPaid['average_order'],
                    'changePercent' => $this->reportChange($currentPaid['average_order'], $previousPaid['average_order']),
                ],
                'cancellationRate' => [
                    'cancelled' => $cancelledOrders,
                    'placed' => $periodOrders,
                    'percent' => $this->reportPercent($cancelledOrders, $periodOrders) ?? '0.00',
                ],
            ],
            'dailySeries' => $dailySeries,
            'paymentMethods' => $paymentMethods,
            'ordersByStatus' => $statusList,
            'salesByCategory' => array_map(static fn(array $row): array => [
                'category' => $row['category_name'],
                'revenue' => (string) $row['revenue'],
            ], $categoryRows),
            'deliveryVsPickup' => [
                'delivery' => (int) $fulfillmentRow['delivery'],
                'pickup' => (int) $fulfillmentRow['pickup'],
                'total' => (int) $fulfillmentRow['total'],
                'deliveryPercent' => $this->reportPercent($fulfillmentRow['delivery'], $fulfillmentRow['total']) ?? '0.00',
                'pickupPercent' => $this->reportPercent($fulfillmentRow['pickup'], $fulfillmentRow['total']) ?? '0.00',
            ],
            'topProducts' => $topProducts,
            'paymentReview' => [
                'approved' => (int) $reviewRow['approved'],
                'rejected' => (int) $reviewRow['rejected'],
                'averageReviewSeconds' => $averageReviewSeconds,
                'approvedOrders' => $approvedOrderCount,
                'firstUploadApproved' => (int) $firstUploadRow['first_upload_approved'],
                'firstUploadApprovalRate' => $firstUploadRate,
            ],
            'insights' => $insights,
        ];
    }

    private function reportCsvCell(mixed $value): string
    {
        $cell = (string) $value;
        if ($cell !== '' && in_array($cell[0], ['=', '+', '-', '@'], true)) {
            return "'" . $cell;
        }
        return $cell;
    }

    private function reportCsvRows(array $report): array
    {
        $averageReviewSeconds = $report['paymentReview']['averageReviewSeconds'];
        $reviewMinutes = $averageReviewSeconds === null
            ? null
            : intdiv((int) $averageReviewSeconds + 30, 60);
        $reviewTime = $reviewMinutes === null
            ? ''
            : ($reviewMinutes >= 60
                ? intdiv($reviewMinutes, 60) . ' h ' . ($reviewMinutes % 60) . ' min'
                : $reviewMinutes . ' min');
        $rows = [
            ['Section', 'Metric', 'Value', 'Details'],
            ['Summary', 'Period', $report['period']['label'], $report['period']['start'] . ' to ' . $report['period']['end']],
            ['Summary', 'Revenue', $report['kpis']['revenue']['current'], 'Paid orders only; cancelled orders excluded'],
            ['Summary', 'Previous period revenue', $report['kpis']['revenue']['previous'], $report['kpis']['revenue']['changePercent'] ?? 'No data last period'],
            ['Summary', 'Orders placed', $report['kpis']['orders']['placed'], 'Cancelled: ' . $report['kpis']['orders']['cancelled']],
            ['Summary', 'Paid orders', $report['kpis']['paidOrders']['count'], ''],
            ['Summary', 'Average order', $report['kpis']['averageOrder']['current'], $report['kpis']['averageOrder']['changePercent'] ?? 'No data last period'],
            ['Summary', 'Cancellation rate', $report['kpis']['cancellationRate']['percent'], ''],
        ];
        foreach ($report['dailySeries'] as $row) {
            $rows[] = ['Daily revenue', $row['date'], $row['revenue'], ''];
        }
        foreach ($report['paymentMethods'] as $row) {
            $rows[] = ['Payment methods', $row['label'], $row['count'], $row['percent'] . '%'];
        }
        foreach ($report['ordersByStatus'] as $row) {
            $rows[] = ['Orders by status', $row['status'], $row['count'], ''];
        }
        foreach ($report['salesByCategory'] as $row) {
            $rows[] = ['Sales by category', $row['category'], $row['revenue'], ''];
        }
        foreach ($report['deliveryVsPickup'] as $metric => $value) {
            $rows[] = ['Delivery vs pickup', $metric, $value, ''];
        }
        foreach ($report['topProducts'] as $row) {
            $rows[] = ['Top products', $row['product'], $row['units'], $row['revenue'] . ' / ' . $row['shareOfSales'] . '%'];
        }
        $rows[] = ['Payment review', 'Approved', $report['paymentReview']['approved'], ''];
        $rows[] = ['Payment review', 'Rejected', $report['paymentReview']['rejected'], ''];
        $rows[] = ['Payment review', 'Average review time', $reviewTime, ''];
        $rows[] = [
            'Payment review',
            'Approved on first upload',
            $report['paymentReview']['firstUploadApprovalRate'] === null
                ? ''
                : $report['paymentReview']['firstUploadApprovalRate'] . '%',
            '',
        ];
        return $rows;
    }

    public function reports(): never
    {
        $this->owner();
        $period = $this->reportPeriod();
        json_response($this->reportData($period));
    }

    public function downloadReport(): never
    {
        $this->owner();
        $period = $this->reportPeriod();
        $report = $this->reportData($period);
        $rows = $this->reportCsvRows($report);

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="aquatica-report-' . $period['type'] . '-' . $period['start']->format('Y-m-d') . '.csv"');
        header('Cache-Control: no-store, private');
        $output = fopen('php://output', 'wb');
        if ($output === false) {
            throw new RuntimeException('Report export could not be opened.');
        }
        fwrite($output, "\xEF\xBB\xBF");
        foreach ($rows as $row) {
            fputcsv($output, array_map(fn(mixed $cell): string => $this->reportCsvCell($cell), $row));
        }
        fclose($output);
        exit;
    }

    public function ownerSettings(): never
    {
        $this->owner();
        $settings = $this->settings();
        json_response(['settings' => [
            'shopName' => $settings['shop_name'] ?? 'Aquatica Nasugbu',
            'shopPhone' => $settings['shop_phone'] ?? '',
            'shopAddress' => $settings['shop_address'] ?? '',
            'about' => $settings['shop_about'] ?? '',
            'deliveryFee' => (float) ($settings['delivery_fee'] ?? 0),
            'gcashName' => $settings['gcash_name'] ?? '',
            'gcashNumber' => $settings['gcash_number'] ?? '',
            'gcashEnabled' => ($settings['gcash_enabled'] ?? '1') === '1',
            'codEnabled' => ($settings['cod_enabled'] ?? '1') === '1',
            'cashPickupEnabled' => ($settings['cash_pickup_enabled'] ?? '1') === '1',
            'gcashReady' => ($settings['gcash_enabled'] ?? '1') === '1'
                && !empty($settings['gcash_name']) && !empty($settings['gcash_number']) && !empty($settings['gcash_qr_path']),
            'gcashQrUrl' => !empty($settings['gcash_qr_path']) ? '/api/v1/owner/settings/gcash-qr' : null,
            'autoCancelHours' => isset($settings['auto_cancel_hours']) ? (int) $settings['auto_cancel_hours'] : null,
        ]]);
    }

    public function updateOwnerSettings(): never
    {
        $owner = $this->owner();
        $data = $this->body();
        $fields = [
            'shopName' => ['shop_name', 120],
            'shopPhone' => ['shop_phone', 40],
            'shopAddress' => ['shop_address', 255],
            'about' => ['shop_about', 1000],
            'gcashName' => ['gcash_name', 120],
            'gcashNumber' => ['gcash_number', 13],
        ];
        $flagFields = [
            'gcashEnabled' => 'gcash_enabled',
            'codEnabled' => 'cod_enabled',
            'cashPickupEnabled' => 'cash_pickup_enabled',
        ];
        $allowedFields = array_merge(
            array_keys($fields),
            array_keys($flagFields),
            ['deliveryFee', 'autoCancelHours']
        );
        if (array_diff(array_keys($data), $allowedFields)) {
            json_response(['message' => 'The settings request contains unsupported fields.'], 422);
        }

        $validated = [];
        foreach ($fields as $input => $key) {
            if (array_key_exists($input, $data)) {
                [$settingKey, $maxLength] = $key;
                if (!is_string($data[$input])) {
                    json_response(['message' => 'Settings text fields must be strings.'], 422);
                }
                $value = trim($data[$input]);
                if (strlen($value) > $maxLength || ($input === 'shopName' && $value === '')) {
                    json_response(['message' => $input === 'shopName' ? 'Shop name is required.' : 'A settings value is too long.'], 422);
                }
                if ($input === 'shopPhone' && $value !== ''
                    && !preg_match('/^\+?[0-9][0-9 ()-]{5,23}$/', $value)) {
                    json_response(['message' => 'Enter a valid shop contact number.'], 422);
                }
                if ($input === 'gcashNumber' && $value !== ''
                    && !preg_match('/^(?:09[0-9]{9}|\+639[0-9]{9})$/', $value)) {
                    json_response(['message' => 'Enter a valid Philippine GCash mobile number.'], 422);
                }
                $validated[$settingKey] = $value;
            }
        }
        if (array_key_exists('deliveryFee', $data)) {
            if (!is_string($data['deliveryFee']) && !is_int($data['deliveryFee']) && !is_float($data['deliveryFee'])) {
                json_response(['message' => 'Delivery fee must be a non-negative amount.'], 422);
            }
            $feeValue = trim((string) $data['deliveryFee']);
            if (!preg_match('/^[0-9]{1,6}(?:\.[0-9]{1,2})?$/', $feeValue)
                || (float) $feeValue > 100000) {
                json_response(['message' => 'Delivery fee must be a non-negative amount.'], 422);
            }
            $validated['delivery_fee'] = number_format((float) $feeValue, 2, '.', '');
        }
        foreach ($flagFields as $input => $settingKey) {
            if (array_key_exists($input, $data)) {
                $value = $data[$input];
                if (!is_bool($value) && !(is_int($value) && in_array($value, [0, 1], true))) {
                    json_response(['message' => 'Payment options must be true or false.'], 422);
                }
                $validated[$settingKey] = $value ? '1' : '0';
            }
        }
        $removeAutoCancelSetting = false;
        if (array_key_exists('autoCancelHours', $data)) {
            if ($data['autoCancelHours'] === null || $data['autoCancelHours'] === '') {
                $removeAutoCancelSetting = true;
            } else {
                $hours = filter_var($data['autoCancelHours'], FILTER_VALIDATE_INT);
                if ($hours === false || $hours < 1 || $hours > 720) {
                    json_response(['message' => 'Auto-cancel hours must be between 1 and 720.'], 422);
                }
                $validated['auto_cancel_hours'] = (string) $hours;
            }
        }
        if (!$data) {
            json_response(['message' => 'Provide at least one setting to update.'], 422);
        }

        $db = $this->db();
        $db->beginTransaction();
        try {
            foreach ($validated as $key => $value) {
                $this->putSetting($key, $value);
            }
            if ($removeAutoCancelSetting) {
                $db->prepare('DELETE FROM settings WHERE setting_key = :key')
                    ->execute(['key' => 'auto_cancel_hours']);
            }
            $this->audit((int) $owner['id'], 'settings.updated', 'shop_settings', '1', array_keys($data));
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
        json_response(['message' => 'Shop settings saved.']);
    }

    public function uploadGcashQr(): never
    {
        $owner = $this->owner();
        require_csrf();
        $file = $_FILES['qr'] ?? null;
        if (!is_array($file)) {
            json_response(['message' => 'Choose an image no larger than 2 MB.'], 422);
        }
        $relativePath = $this->storeVerifiedImage($file, 'private/uploads/shop', 'gcash-');
        $destination = dirname(__DIR__, 2) . '/' . $relativePath;
        $oldPath = $this->setting('gcash_qr_path');
        $db = $this->db();
        $db->beginTransaction();
        try {
            $this->putSetting('gcash_qr_path', $relativePath);
            $this->audit((int) $owner['id'], 'settings.gcash_qr_updated', 'shop_settings', '1');
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if (is_file($destination)) {
                unlink($destination);
            }
            throw $exception;
        }
        if ($oldPath !== '' && str_starts_with($oldPath, 'private/uploads/shop/')) {
            $oldFile = dirname(__DIR__, 2) . '/' . $oldPath;
            if ($oldPath !== $relativePath && is_file($oldFile)) {
                unlink($oldFile);
            }
        }
        json_response(['message' => 'GCash QR image saved.']);
    }

    public function dashboard(): never
    {
        $this->owner();
        $summary = $this->db()->query(
            "SELECT
                (SELECT COUNT(*) FROM orders WHERE order_status = 'pending') AS needs_action,
                (SELECT COUNT(*) FROM orders WHERE order_status = 'preparing') AS preparing,
                (SELECT COUNT(*) FROM orders WHERE order_status = 'ready') AS ready,
                (SELECT COALESCE(SUM(total), 0) FROM orders
                 WHERE order_status <> 'cancelled' AND created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01')) AS sales_month,
                (SELECT COUNT(*) FROM products WHERE is_active = 1) AS products,
                (SELECT COUNT(*) FROM products WHERE is_active = 1 AND stock <= low_stock_threshold) AS low_stock"
        )->fetch();
        json_response(['summary' => $summary]);
    }

    public function notifications(): never
    {
        $user = current_auth_user();
        if ($user === null) {
            json_response(['message' => 'Please log in to continue.'], 401);
        }
        $result = $this->paginatedQuery(
            'SELECT id, order_id, title, body, read_at, created_at
             FROM notifications WHERE user_id = :id ORDER BY created_at DESC',
            'SELECT COUNT(*) FROM notifications WHERE user_id = :id',
            ['id' => $user['id']]
        );
        json_response(['notifications' => $result['rows'], 'pagination' => $result['pagination']]);
    }

    public function unreadNotificationCount(): never
    {
        $user = current_auth_user();
        if ($user === null) {
            json_response(['message' => 'Please log in to continue.'], 401);
        }
        $statement = $this->db()->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = :id AND read_at IS NULL');
        $statement->execute(['id' => $user['id']]);
        json_response(['count' => (int) $statement->fetchColumn()]);
    }

    public function markNotificationRead(int $id): never
    {
        $user = current_auth_user();
        if ($user === null) {
            json_response(['message' => 'Please log in to continue.'], 401);
        }
        require_csrf();
        $check = $this->db()->prepare('SELECT user_id FROM notifications WHERE id = :id');
        $check->execute(['id' => $id]);
        $ownerId = $check->fetchColumn();
        if ($ownerId === false || (int) $ownerId !== (int) $user['id']) {
            json_response(['message' => 'Notification not found.'], 404);
        }
        $statement = $this->db()->prepare(
            'UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE id = :id AND user_id = :user_id'
        );
        $statement->execute(['id' => $id, 'user_id' => $user['id']]);
        json_response(['message' => 'Notification marked as read.']);
    }

    public function markAllNotificationsRead(): never
    {
        $user = current_auth_user();
        if ($user === null) {
            json_response(['message' => 'Please log in to continue.'], 401);
        }
        require_csrf();
        $this->db()->prepare(
            'UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = :user_id AND read_at IS NULL'
        )->execute(['user_id' => $user['id']]);
        json_response(['message' => 'Notifications marked as read.']);
    }

    public function customerProfile(): never
    {
        $user = $this->customer();
        $address = $this->db()->prepare(
            'SELECT line1, barangay, city, province, notes FROM addresses
             WHERE user_id = :id AND is_default = 1 ORDER BY id DESC LIMIT 1'
        );
        $address->execute(['id' => $user['id']]);
        $savedAddress = $address->fetch() ?: [];
        json_response(['profile' => [
            'id' => (int) $user['id'], 'name' => $user['name'], 'email' => $user['email'],
            'phone' => $user['phone'], 'address' => $savedAddress['line1'] ?? '',
            'barangay' => $savedAddress['barangay'] ?? '', 'city' => $savedAddress['city'] ?? '',
            'province' => $savedAddress['province'] ?? '', 'notes' => $savedAddress['notes'] ?? '',
        ]]);
    }

    public function updateCustomerProfile(): never
    {
        $user = $this->customer();
        $data = $this->body();
        $name = trim((string) ($data['name'] ?? ''));
        $phone = trim((string) ($data['phone'] ?? ''));
        if ($name === '' || strlen($name) > 120 || strlen($phone) > 40) {
            json_response(['message' => 'Enter a valid name and phone number.'], 422);
        }
        $db = $this->db();
        $db->beginTransaction();
        $db->prepare('UPDATE users SET name = :name, phone = :phone WHERE id = :id')
            ->execute(['name' => $name, 'phone' => $phone, 'id' => $user['id']]);
        if (array_key_exists('address', $data)) {
            $address = trim((string) $data['address']);
            if (strlen($address) > 255) {
                $db->rollBack();
                json_response(['message' => 'Default address is too long.'], 422);
            }
            if ($address !== '') {
                $db->prepare('UPDATE addresses SET is_default = 0 WHERE user_id = :id')->execute(['id' => $user['id']]);
                $find = $db->prepare('SELECT id FROM addresses WHERE user_id = :user_id AND label = :label LIMIT 1');
                $find->execute(['user_id' => $user['id'], 'label' => 'Default']);
                $addressId = $find->fetchColumn();
                if ($addressId) {
                    $db->prepare(
                        'UPDATE addresses SET line1 = :line1, barangay = :barangay, city = :city,
                         province = :province, notes = :notes, is_default = 1 WHERE id = :id'
                    )->execute([
                        'line1' => $address, 'barangay' => trim((string) ($data['barangay'] ?? '')),
                        'city' => trim((string) ($data['city'] ?? 'Nasugbu')),
                        'province' => trim((string) ($data['province'] ?? 'Batangas')),
                        'notes' => trim((string) ($data['notes'] ?? '')), 'id' => $addressId,
                    ]);
                } else {
                    $db->prepare(
                        'INSERT INTO addresses (user_id, label, line1, barangay, city, province, notes, is_default)
                         VALUES (:user_id, "Default", :line1, :barangay, :city, :province, :notes, 1)'
                    )->execute([
                        'user_id' => $user['id'], 'line1' => $address,
                        'barangay' => trim((string) ($data['barangay'] ?? '')),
                        'city' => trim((string) ($data['city'] ?? 'Nasugbu')),
                        'province' => trim((string) ($data['province'] ?? 'Batangas')),
                        'notes' => trim((string) ($data['notes'] ?? '')),
                    ]);
                }
            }
        }
        $this->audit((int) $user['id'], 'profile.updated', 'user', $user['id']);
        $db->commit();
        json_response(['message' => 'Profile saved.', 'profile' => ['name' => $name, 'email' => $user['email'], 'phone' => $phone]]);
    }
}
