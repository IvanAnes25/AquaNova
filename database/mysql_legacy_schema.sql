-- Fresh local MySQL setup only.
-- Select the aquanova database and import this after auth_schema.sql.
-- Run scripts/migrate.php up after importing this file.

CREATE TABLE IF NOT EXISTS products (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(160) NOT NULL,
    category VARCHAR(100) NOT NULL,
    short_description VARCHAR(500) NULL,
    description TEXT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INT UNSIGNED NOT NULL DEFAULT 0,
    image_url VARCHAR(500) NULL,
    featured TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY products_active_idx (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_number VARCHAR(32) NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    customer_name VARCHAR(120) NOT NULL,
    customer_email VARCHAR(190) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    delivery_method VARCHAR(40) NOT NULL,
    delivery_address VARCHAR(500) NULL,
    payment_method VARCHAR(40) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    notes VARCHAR(500) NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    payment_status VARCHAR(40) NOT NULL DEFAULT 'Not required',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY orders_order_number_unique (order_number),
    KEY orders_user_created_idx (user_id, created_at),
    CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    product_id INT UNSIGNED NOT NULL,
    product_name VARCHAR(160) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    line_total DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (id),
    KEY order_items_order_idx (order_id),
    KEY order_items_product_idx (product_id),
    CONSTRAINT order_items_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
    CONSTRAINT order_items_product_fk FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_movements (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id INT UNSIGNED NOT NULL,
    product_name VARCHAR(160) NOT NULL,
    movement_type VARCHAR(40) NOT NULL,
    quantity_change INT NOT NULL,
    stock_before INT UNSIGNED NOT NULL,
    stock_after INT UNSIGNED NOT NULL,
    note VARCHAR(500) NOT NULL DEFAULT '',
    actor_user_id INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY stock_movements_product_created_idx (product_id, created_at),
    CONSTRAINT stock_movements_product_fk FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
    CONSTRAINT stock_movements_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
