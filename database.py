import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'kedai_tedhuh.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Categories
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon TEXT DEFAULT 'coffee',
            sort_order INTEGER DEFAULT 0
        )
    ''')

    # 2. Menu Items
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER,
            name TEXT NOT NULL,
            description TEXT,
            price INTEGER NOT NULL,
            image_url TEXT,
            is_available INTEGER DEFAULT 1,
            is_recommended INTEGER DEFAULT 0,
            badge TEXT DEFAULT '',
            has_ice_hot INTEGER DEFAULT 1,
            has_sugar_level INTEGER DEFAULT 1,
            options_json TEXT DEFAULT '[]',
            FOREIGN KEY (category_id) REFERENCES categories (id)
        )
    ''')

    # 3. Orders
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT UNIQUE NOT NULL,
            table_number TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            customer_phone TEXT DEFAULT '',
            order_type TEXT DEFAULT 'Dine In',
            notes TEXT DEFAULT '',
            subtotal INTEGER NOT NULL,
            discount INTEGER DEFAULT 0,
            tax INTEGER DEFAULT 0,
            total_amount INTEGER NOT NULL,
            payment_method TEXT DEFAULT 'QRIS',
            payment_status TEXT DEFAULT 'UNPAID',
            order_status TEXT DEFAULT 'PENDING',
            cashier_name TEXT DEFAULT 'Staff Kasir',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Migration check for cashier_name column in orders
    cursor.execute("PRAGMA table_info(orders)")
    columns = [col[1] for col in cursor.fetchall()]
    if 'cashier_name' not in columns:
        cursor.execute("ALTER TABLE orders ADD COLUMN cashier_name TEXT DEFAULT 'Staff Kasir'")

    # 4. Order Items
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            menu_item_id INTEGER,
            name TEXT NOT NULL,
            price INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            subtotal INTEGER NOT NULL,
            temperature TEXT DEFAULT '',
            sugar_level TEXT DEFAULT '',
            selected_addons TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
        )
    ''')

    # 5. Tables
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tables (
            table_number TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'AVAILABLE',
            current_order_id INTEGER,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 6. Waiter Calls
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS waiter_calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_number TEXT NOT NULL,
            message TEXT DEFAULT 'Memanggil kasir / barista',
            status TEXT DEFAULT 'PENDING',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 7. Settings
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')

    # 8. Users & Staff Management
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            pin TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'kasir',
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully at:", DB_PATH)
