-- One-time migration for a fresh, empty InfinityFree database.
-- Import after auth_schema.sql and mysql_legacy_schema.sql.
-- Do not use this SQL-only migration if any of the legacy tables contain data.

CREATE TABLE IF NOT EXISTS schema_migrations (
    migration VARCHAR(120) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY categories_name_unique (name),
    UNIQUE KEY categories_slug_unique (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS addresses (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    label VARCHAR(80) NOT NULL,
    line1 VARCHAR(255) NOT NULL,
    barangay VARCHAR(120) NOT NULL,
    city VARCHAR(120) NOT NULL,
    province VARCHAR(120) NOT NULL,
    notes VARCHAR(500) NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY addresses_user_default_idx (user_id, is_default),
    CONSTRAINT addresses_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cart_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    product_id INT UNSIGNED NOT NULL,
    qty INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY cart_items_user_product_unique (user_id, product_id),
    CONSTRAINT cart_items_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT cart_items_product_fk FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
    CONSTRAINT cart_items_qty_positive CHECK (qty > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_proofs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    reference_no VARCHAR(20) NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('under_review', 'approved', 'rejected') NOT NULL DEFAULT 'under_review',
    reject_reason VARCHAR(100) NULL,
    reject_note VARCHAR(500) NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INT UNSIGNED NULL,
    reviewed_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY payment_proofs_reference_unique (reference_no),
    KEY payment_proofs_order_status_idx (order_id, status),
    CONSTRAINT payment_proofs_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
    CONSTRAINT payment_proofs_reviewer_fk FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    title VARCHAR(160) NOT NULL,
    body VARCHAR(1000) NOT NULL,
    read_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY notifications_user_created_idx (user_id, created_at),
    KEY notifications_order_idx (order_id),
    CONSTRAINT notifications_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT notifications_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NULL,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NULL,
    entity_id VARCHAR(100) NULL,
    details JSON NULL,
    ip VARCHAR(45) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY audit_log_user_created_idx (user_id, created_at),
    KEY audit_log_entity_idx (entity, entity_id),
    CONSTRAINT audit_log_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_status_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(30) NULL,
    to_status VARCHAR(30) NOT NULL,
    by_user_id INT UNSIGNED NULL,
    note VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY order_status_history_order_created_idx (order_id, created_at),
    CONSTRAINT order_status_history_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
    CONSTRAINT order_status_history_user_fk FOREIGN KEY (by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE products
    ADD COLUMN category_id INT UNSIGNED NULL,
    ADD COLUMN slug VARCHAR(180) NULL,
    ADD COLUMN low_stock_threshold INT UNSIGNED NOT NULL DEFAULT 5,
    ADD COLUMN image_path VARCHAR(500) NULL;

ALTER TABLE products
    MODIFY COLUMN category_id INT UNSIGNED NOT NULL,
    MODIFY COLUMN slug VARCHAR(180) NOT NULL,
    ADD UNIQUE INDEX products_slug_unique (slug),
    ADD INDEX products_category_id_idx (category_id),
    ADD CONSTRAINT products_category_fk FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT,
    ADD CONSTRAINT products_stock_nonnegative CHECK (stock >= 0);

ALTER TABLE orders
    ADD COLUMN order_no VARCHAR(32) NULL,
    ADD COLUMN fulfillment ENUM('delivery','pickup') NULL,
    ADD COLUMN payment_method_v2 ENUM('gcash','cod','cash_pickup') NULL,
    ADD COLUMN order_status ENUM('pending','preparing','ready','completed','cancelled') NULL,
    ADD COLUMN payment_status_v2 ENUM('unpaid','under_review','paid','rejected') NULL,
    ADD COLUMN delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN delivery_address_snapshot JSON NULL,
    ADD COLUMN delivery_by ENUM('lalamove','owner') NULL,
    ADD COLUMN stock_deducted TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN cancelled_by INT UNSIGNED NULL,
    ADD COLUMN cancel_reason VARCHAR(500) NULL;

ALTER TABLE orders
    MODIFY COLUMN order_no VARCHAR(32) NOT NULL,
    MODIFY COLUMN fulfillment ENUM('delivery','pickup') NOT NULL,
    MODIFY COLUMN order_status ENUM('pending','preparing','ready','completed','cancelled') NOT NULL,
    ADD UNIQUE INDEX orders_order_no_unique (order_no),
    ADD INDEX orders_workflow_idx (order_status, payment_status_v2, created_at),
    ADD CONSTRAINT orders_cancelled_by_fk FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE order_items
    ADD COLUMN name_snapshot VARCHAR(160) NULL,
    ADD COLUMN price_snapshot DECIMAL(10,2) NULL,
    ADD COLUMN qty INT UNSIGNED NULL;

ALTER TABLE order_items
    MODIFY COLUMN name_snapshot VARCHAR(160) NOT NULL,
    MODIFY COLUMN price_snapshot DECIMAL(10,2) NOT NULL,
    MODIFY COLUMN qty INT UNSIGNED NOT NULL;

ALTER TABLE stock_movements
    ADD COLUMN change_qty INT NULL,
    ADD COLUMN type ENUM('sale','restock','adjustment','cancellation') NULL,
    ADD COLUMN reason VARCHAR(500) NULL,
    ADD COLUMN order_id BIGINT UNSIGNED NULL,
    ADD COLUMN user_id INT UNSIGNED NULL;

ALTER TABLE stock_movements
    MODIFY COLUMN change_qty INT NOT NULL,
    MODIFY COLUMN type ENUM('sale','restock','adjustment','cancellation') NOT NULL,
    MODIFY COLUMN reason VARCHAR(500) NOT NULL,
    ADD INDEX stock_movements_order_idx (order_id),
    ADD CONSTRAINT stock_movements_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
    ADD CONSTRAINT stock_movements_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

INSERT INTO schema_migrations (migration) VALUES ('20261111_commerce');
