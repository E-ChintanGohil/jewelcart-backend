-- Jewelcart Database Schema
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS jewelcart;
USE jewelcart;

-- Users table for authentication
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role ENUM('admin', 'staff') DEFAULT 'staff',
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
);

-- Materials table (Gold, Silver)
CREATE TABLE materials (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(100) NOT NULL,
    type ENUM('gold', 'silver') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_type (type)
);

-- Karats table for material purity
CREATE TABLE karats (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    material_id VARCHAR(36) NOT NULL,
    value VARCHAR(20) NOT NULL, -- e.g., '18K', '925 Sterling'
    purity DECIMAL(5,2) NOT NULL, -- e.g., 75.00 for 18K gold
    price_per_gram DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    INDEX idx_material_id (material_id),
    INDEX idx_value (value)
);

-- Categories table
CREATE TABLE categories (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image VARCHAR(500),
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_name (name)
);

-- Products table
CREATE TABLE products (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    calculated_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    category_id VARCHAR(36) NOT NULL,
    subcategory VARCHAR(100),
    collection VARCHAR(100),
    material_id VARCHAR(36) NOT NULL,
    karat_id VARCHAR(36) NOT NULL,
    gemstone VARCHAR(100),
    weight DECIMAL(8,3) NOT NULL, -- Weight in grams
    dimensions VARCHAR(100),
    stock INT NOT NULL DEFAULT 0,
    featured BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    sku VARCHAR(100) UNIQUE NOT NULL,
    certification VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (material_id) REFERENCES materials(id),
    FOREIGN KEY (karat_id) REFERENCES karats(id),
    INDEX idx_category_id (category_id),
    INDEX idx_material_id (material_id),
    INDEX idx_karat_id (karat_id),
    INDEX idx_sku (sku),
    INDEX idx_featured (featured),
    INDEX idx_is_active (is_active),
    INDEX idx_collection (collection),
    INDEX idx_stock (stock)
);

-- Product images table
CREATE TABLE product_images (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    product_id VARCHAR(36) NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    alt_text VARCHAR(255),
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id),
    INDEX idx_sort_order (sort_order)
);

-- Product tags table
CREATE TABLE product_tags (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    product_id VARCHAR(36) NOT NULL,
    tag VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id),
    INDEX idx_tag (tag),
    UNIQUE KEY unique_product_tag (product_id, tag)
);

-- Customers table
CREATE TABLE customers (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    total_spent DECIMAL(12,2) DEFAULT 0,
    order_count INT DEFAULT 0,
    lead_source VARCHAR(100),
    status ENUM('lead', 'customer', 'vip') DEFAULT 'lead',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_total_spent (total_spent)
);

-- Customer addresses table
CREATE TABLE customer_addresses (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    customer_id VARCHAR(36) NOT NULL,
    street VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    zip_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'India',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    INDEX idx_customer_id (customer_id),
    INDEX idx_is_default (is_default)
);

-- Customer preferences table
CREATE TABLE customer_preferences (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    customer_id VARCHAR(36) NOT NULL,
    preference VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    INDEX idx_customer_id (customer_id),
    UNIQUE KEY unique_customer_preference (customer_id, preference)
);

-- Customer notes table
CREATE TABLE customer_notes (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    customer_id VARCHAR(36) NOT NULL,
    note TEXT NOT NULL,
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_customer_id (customer_id),
    INDEX idx_created_at (created_at)
);

-- Orders table
CREATE TABLE orders (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    customer_id VARCHAR(36) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax DECIMAL(10,2) NOT NULL DEFAULT 0,
    shipping DECIMAL(10,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
    payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_id VARCHAR(255), -- Razorpay payment ID
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    INDEX idx_customer_id (customer_id),
    INDEX idx_status (status),
    INDEX idx_payment_status (payment_status),
    INDEX idx_created_at (created_at)
);

-- Order items table
CREATE TABLE order_items (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    order_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    product_name VARCHAR(255) NOT NULL, -- Snapshot at time of order
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_order_id (order_id),
    INDEX idx_product_id (product_id)
);

-- Settings table for site configuration
CREATE TABLE settings (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    site_name VARCHAR(255) DEFAULT 'Jewelcart',
    site_description TEXT,
    logo VARCHAR(500),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    contact_address TEXT,
    gold_price DECIMAL(10,2) DEFAULT 5500,
    silver_price DECIMAL(10,2) DEFAULT 80,
    tax_rate DECIMAL(5,2) DEFAULT 18.00,
    shipping_rate DECIMAL(10,2) DEFAULT 100,
    free_shipping_threshold DECIMAL(10,2) DEFAULT 2000,
    currency VARCHAR(3) DEFAULT 'INR',
    payment_methods JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_customers_name ON customers(first_name, last_name);
CREATE INDEX idx_orders_date_range ON orders(created_at, status);

-- Insert default admin user (password: admin123 - hashed)
INSERT INTO users (email, password, first_name, last_name, role) VALUES
('admin@jewelcart.com', '$2a$10$X7Z9QJ8vY2wK3Hf9N6mL0eY4Q8R7T6P5M2A1B3C4D5E6F7G8H9I0J1', 'Admin', 'User', 'admin');

-- Insert default settings
INSERT INTO settings (id) VALUES (UUID());

-- Insert default materials
INSERT INTO materials (name, type) VALUES
('Gold', 'gold'),
('Silver', 'silver');

-- Insert default karats for gold
INSERT INTO karats (material_id, value, purity, price_per_gram)
SELECT id, '24K', 99.9, 5500 FROM materials WHERE type = 'gold'
UNION ALL
SELECT id, '22K', 91.7, 5043 FROM materials WHERE type = 'gold'
UNION ALL
SELECT id, '18K', 75.0, 4125 FROM materials WHERE type = 'gold'
UNION ALL
SELECT id, '14K', 58.3, 3206 FROM materials WHERE type = 'gold'
UNION ALL
SELECT id, '10K', 41.7, 2293 FROM materials WHERE type = 'gold'
UNION ALL
SELECT id, '9K', 37.5, 2062 FROM materials WHERE type = 'gold';

-- Insert default karats for silver
INSERT INTO karats (material_id, value, purity, price_per_gram)
SELECT id, '999 Fine', 99.9, 80 FROM materials WHERE type = 'silver'
UNION ALL
SELECT id, '958 Britannia', 95.8, 77 FROM materials WHERE type = 'silver'
UNION ALL
SELECT id, '925 Sterling', 92.5, 74 FROM materials WHERE type = 'silver'
UNION ALL
SELECT id, '900 Coin', 90.0, 72 FROM materials WHERE type = 'silver'
UNION ALL
SELECT id, '800 Standard', 80.0, 64 FROM materials WHERE type = 'silver';

-- Insert default categories
INSERT INTO categories (name, description, image) VALUES
('Rings', 'Engagement rings, wedding bands, and fashion rings', 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&h=300&fit=crop'),
('Necklaces', 'Beautiful necklaces for every occasion', 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&h=300&fit=crop'),
('Earrings', 'Elegant earrings to complement any look', 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=500&h=300&fit=crop'),
('Bracelets', 'Stylish bracelets and bangles', 'https://images.unsplash.com/photo-1603561596112-6a132309c6d2?w=500&h=300&fit=crop');