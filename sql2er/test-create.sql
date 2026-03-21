-- ============================================
-- SQL2ER テスト用DDL
-- ============================================
-- テスト内容：
-- ✓ インライン PRIMARY KEY：users.id, tenants.id など
-- ✓ 複合主キー：orders(order_id, tenant_id)
-- ✓ FOREIGN KEY制約（明示的、複合FK含む）
-- ✓ データ型パターン：VARCHAR, DECIMAL, INT, BIGINT, DATETIME
-- ✓ AUTO_INCREMENT フラグ
-- ✓ NOT NULL 制約

-- テーブル1: users（インラインPK形式）
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- テーブル2: tenants（インラインPK形式）
CREATE TABLE tenants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- テーブル3: orders（複合主キーと外部キー制約）
CREATE TABLE orders (
    order_id INT NOT NULL,
    tenant_id INT NOT NULL,
    user_id INT NOT NULL,
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    PRIMARY KEY (order_id, tenant_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- テーブル4: products（インラインPK、複合FK）
CREATE TABLE products (
    product_id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    stock_quantity INT DEFAULT 0,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- テーブル5: order_items（複合PK、複合FK参照）
CREATE TABLE order_items (
    order_item_id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    tenant_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (order_id, tenant_id) REFERENCES orders(order_id, tenant_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- テーブル6: payments（複合FK参照）
CREATE TABLE payments (
    payment_id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    tenant_id INT NOT NULL,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50),
    FOREIGN KEY (order_id, tenant_id) REFERENCES orders(order_id, tenant_id)
);
