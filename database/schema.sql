CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    phone VARCHAR(40),
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(80) PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    category VARCHAR(80) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    size VARCHAR(80),
    availability VARCHAR(60),
    image_url TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(50) PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    total DECIMAL(12,2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(80) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT OR IGNORE INTO products (id, name, category, price, size, availability, image_url, description)
VALUES
  ('betta-red', 'Red Betta', 'Fish', 320, '2.5 in', 'In stock', 'https://images.unsplash.com/photo-1544551763-46a013bb70b5?auto=format&fit=crop&w=900&q=80', 'Bright color and easy temperament for beginner aquariums.'),
  ('guppy-spark', 'Spark Guppy', 'Fish', 180, '1.5 in', 'Limited', 'https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?auto=format&fit=crop&w=900&q=80', 'Colorful community fish for planted and active tanks.'),
  ('goldfish-oranda', 'Oranda Goldfish', 'Fish', 450, '4 in', 'Ask to confirm', 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=900&q=80', 'A favorite for calm, spacious home aquariums.'),
  ('aquarium-30g', '30-Gallon Aquarium', 'Aquariums', 6800, '30 gal', 'Available', 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80', 'A clean setup for new hobbyists and small collections.'),
  ('aquarium-60g', '60-Gallon Aquarium', 'Aquariums', 12700, '60 gal', 'Ask to confirm', 'https://images.unsplash.com/photo-1535591273668-578e31182c4f?auto=format&fit=crop&w=900&q=80', 'Perfect for larger fish displays and premium layouts.'),
  ('filter-kit', 'Starter Filter Kit', 'Accessories', 960, 'Standard', 'In stock', 'https://images.unsplash.com/photo-1570288686795-53f8d4b0d4d5?auto=format&fit=crop&w=900&q=80', 'Simple filtration and maintenance essentials for healthy tanks.');
