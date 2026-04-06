-- AirPods Pro Manager MySQL Schema
-- Import this into XAMPP phpMyAdmin

CREATE DATABASE IF NOT EXISTS airpods_manager;
USE airpods_manager;

-- Sales table
CREATE TABLE IF NOT EXISTS sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL,
    model VARCHAR(100) NOT NULL,
    `condition` VARCHAR(50) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    buy_price DECIMAL(10, 2) NOT NULL,
    sell_price DECIMAL(10, 2) NOT NULL,
    fees DECIMAL(10, 2) DEFAULT 0,
    profit DECIMAL(10, 2) NOT NULL,
    buyer VARCHAR(255),
    city VARCHAR(100),
    tracking_number VARCHAR(255),
    notes TEXT,
    userId VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stock table
CREATE TABLE IF NOT EXISTS stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    model VARCHAR(100) NOT NULL,
    `condition` VARCHAR(50) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    buy_price DECIMAL(10, 2) NOT NULL,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Pending Sales table
CREATE TABLE IF NOT EXISTS pending_sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL,
    model VARCHAR(100) NOT NULL,
    `condition` VARCHAR(50) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    buy_price DECIMAL(10, 2) NOT NULL,
    sell_price DECIMAL(10, 2) NOT NULL,
    fees DECIMAL(10, 2) DEFAULT 0,
    profit DECIMAL(10, 2) NOT NULL,
    buyer VARCHAR(255),
    city VARCHAR(100),
    tracking_number VARCHAR(255),
    notes TEXT,
    userId VARCHAR(100) NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Market Prices table
CREATE TABLE IF NOT EXISTS market_prices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    model VARCHAR(100) NOT NULL,
    `condition` VARCHAR(50) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table (Mock for local dev)
CREATE TABLE IF NOT EXISTS users (
    uid VARCHAR(100) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    role ENUM('admin', 'client') DEFAULT 'client',
    displayName VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initial Admin User
INSERT IGNORE INTO users (uid, email, role, displayName) 
VALUES ('local-dev-user', 'admin@localhost', 'admin', 'Local Admin');

-- Initial Stock Data (Optional)
INSERT IGNORE INTO stock (model, `condition`, quantity, buy_price) VALUES 
('AirPods Pro 2', 'bontatlan', 10, 5000),
('AirPods 4 ANC', 'bontatlan', 5, 6000),
('AirPods 3', 'bontott', 3, 4000);
