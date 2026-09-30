import json
from werkzeug.security import generate_password_hash
from database import get_db_connection, init_db

def seed_database():
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Seed Categories if empty
    cursor.execute("SELECT COUNT(*) FROM categories")
    if cursor.fetchone()[0] == 0:
        print("Seeding categories...")
        categories = [
            ("Signature Tedhuh", "sparkles", 1),
            ("Espresso & Klasik", "coffee", 2),
            ("Non-Kopi & Teh", "cup-soda", 3),
            ("Makanan Utama", "utensils", 4),
            ("Camilan & Pastry", "croissant", 5),
            ("Mocktail Segar", "glass-water", 6)
        ]
        cursor.executemany("INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)", categories)

    # 2. Seed Menu Items if empty
    cursor.execute("SELECT COUNT(*) FROM menu_items")
    if cursor.fetchone()[0] == 0:
        print("Seeding menu items...")
        menu_items = [
            # Signature Tedhuh
            (
                1, "Es Kopi Susu Tedhuh", 
                "Perpaduan espresso arabika pilihan, susu segar creamy, dan gula aren organik khas racikan Kedai Tedhuh.",
                20000, "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&auto=format&fit=crop&q=80",
                1, 1, "Best Seller", 1, 1,
                json.dumps([{"name": "Extra Shot Espresso", "price": 4000}, {"name": "Ganti Oat Milk", "price": 6000}, {"name": "Grass Jelly Topping", "price": 3000}])
            ),
            (
                1, "Kopi Susu Pandan Senja", 
                "Kopi susu dengan sari daun pandan wangi asli yang harum lembut, menghadirkan nostalgia sore yang teduh.",
                24000, "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600&auto=format&fit=crop&q=80",
                1, 1, "Signature", 1, 1,
                json.dumps([{"name": "Extra Shot Espresso", "price": 4000}, {"name": "Ganti Oat Milk", "price": 6000}])
            ),
            (
                1, "Tedhuh Cold Brew Float", 
                "Cold brew fermentasi 16 jam dengan vanilla ice cream lembut di atasnya. Segar, bold, dan seimbang.",
                27000, "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=600&auto=format&fit=crop&q=80",
                1, 1, "Rekomendasi", 0, 0,
                json.dumps([{"name": "Extra Scoop Ice Cream", "price": 5000}])
            ),
            (
                1, "Latte Kelapa Tedhuh", 
                "Kombinasi unik kelapa muda gurih dengan espresso pekat dan sirup vanila. Sensasi tropis menyegarkan.",
                25000, "https://images.unsplash.com/photo-1529892485617-25f63cd7b1e9?w=600&auto=format&fit=crop&q=80",
                1, 0, "Unik", 1, 1,
                json.dumps([{"name": "Extra Shot Espresso", "price": 4000}])
            ),

            # Espresso & Klasik
            (
                2, "Americano (Hot / Iced)", 
                "Double shot espresso arabika murni dipadukan dengan air mineral dingin/panas. Profil rasa floral dan fruity.",
                18000, "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80",
                1, 0, "", 1, 1,
                json.dumps([{"name": "Extra Shot Espresso", "price": 4000}])
            ),
            (
                2, "Caffe Latte", 
                "Espresso dengan steamed fresh milk berbusa halus microfoam yang lembut dan creamy.",
                23000, "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=600&auto=format&fit=crop&q=80",
                1, 0, "Favorit", 1, 1,
                json.dumps([{"name": "Sirup Vanilla / Caramel / Hazelnut", "price": 4000}, {"name": "Ganti Oat Milk", "price": 6000}])
            ),
            (
                2, "Caramel Macchiato", 
                "Susu vanilla berlayer espresso bold disiram saus karamel homemade lezat di atasnya.",
                26000, "https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=600&auto=format&fit=crop&q=80",
                1, 1, "Best Seller", 1, 1,
                json.dumps([{"name": "Extra Shot Espresso", "price": 4000}, {"name": "Extra Caramel Drizzle", "price": 3000}])
            ),

            # Non-Kopi & Teh
            (
                3, "Matcha Uji Artisan Latte", 
                "Bubuk matcha murni impor dari Uji Kyoto dengan susu segar dan sedikit pemanis alami. Earthy & rich.",
                26000, "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=600&auto=format&fit=crop&q=80",
                1, 1, "Favorit", 1, 1,
                json.dumps([{"name": "Ganti Oat Milk", "price": 6000}, {"name": "Cheese Foam", "price": 4000}])
            ),
            (
                3, "Dark Chocolate Tedhuh", 
                "Cokelat hitam pekat 70% kaya antioksidan dengan tekstur creamy memanjakan lidah.",
                24000, "https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=600&auto=format&fit=crop&q=80",
                1, 0, "", 1, 1,
                json.dumps([{"name": "Marshmallow Topping", "price": 3000}])
            ),
            (
                3, "Lychee Breeze Iced Tea", 
                "Teh hitam wangi seduh dingin dipadukan buah leci asli dan perasan jeruk nipis segar.",
                20000, "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&auto=format&fit=crop&q=80",
                1, 0, "Segar", 0, 1,
                json.dumps([{"name": "Extra Buah Leci (2 pcs)", "price": 4000}, {"name": "Chia Seeds", "price": 3000}])
            ),

            # Makanan Utama
            (
                4, "Nasi Kulit Sambal Bawang Tedhuh", 
                "Nasi hangat dengan kulit ayam krispi gurih renyah, telur mata sapi, serundeng, dan sambal bawang ulek segar.",
                28000, "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
                1, 1, "Best Seller", 0, 0,
                json.dumps([{"name": "Tambah Telur Mata Sapi", "price": 4000}, {"name": "Ekstra Sambal", "price": 3000}])
            ),
            (
                4, "Rice Bowl Ayam Sambal Matah", 
                "Potongan fillet ayam krispi berbalur sambal matah khas Bali beraroma serai dan daun jeruk segar.",
                32000, "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=600&auto=format&fit=crop&q=80",
                1, 1, "Rekomendasi", 0, 0,
                json.dumps([{"name": "Tambah Nasi Putih", "price": 4000}, {"name": "Tambah Telur", "price": 4000}])
            ),
            (
                4, "Nasi Goreng Tedhuh Spesial", 
                "Nasi goreng bumbu rempah tradisional dengan suwiran ayam, bakso, acar segar, kerupuk, dan telur ceplok.",
                29000, "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&auto=format&fit=crop&q=80",
                1, 0, "Favorit", 0, 0,
                json.dumps([{"name": "Level Pedas: Sedang", "price": 0}, {"name": "Level Pedas: Ekstra Pedas", "price": 0}])
            ),
            (
                4, "Spaghetti Carbonara Creamy", 
                "Pasta spaghetti dengan saus krim susu keju parmesan gurih, smoked beef gurih, dan taburan parsley.",
                34000, "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=600&auto=format&fit=crop&q=80",
                1, 0, "", 0, 0,
                json.dumps([{"name": "Extra Keju Parmesan", "price": 4000}])
            ),

            # Camilan & Pastry
            (
                5, "Croissant Butter Almond", 
                "Croissant renyah berlapis mentega Prancis dengan filling krim almond dan taburan irisan almond panggang.",
                25000, "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop&q=80",
                1, 1, "Favorit", 0, 0,
                json.dumps([])
            ),
            (
                5, "Truffle Fries with Mayo", 
                "Kentang goreng renyah dengan aroma minyak truffle mewah, taburan keju parmesan dan dipping saus garlic mayo.",
                22000, "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80",
                1, 0, "Best Seller", 0, 0,
                json.dumps([{"name": "Extra Dipping Sauce", "price": 3000}])
            ),
            (
                5, "Pisang Goreng Madu Wijen", 
                "Pisang raja manis legit digoreng renyah dengan balutan madu murni dan taburan wijen harum (isi 4 pcs).",
                19000, "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80",
                1, 0, "", 0, 0,
                json.dumps([{"name": "Drizzle Coklat Lumer", "price": 3000}])
            ),
            (
                5, "Dimsum Ayam Udang (4 pcs)", 
                "Dimsum kukus homemade padat daging ayam dan udang segar dengan chili oil pedas gurih.",
                23000, "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=600&auto=format&fit=crop&q=80",
                1, 0, "", 0, 0,
                json.dumps([{"name": "Extra Chili Oil", "price": 2000}])
            ),

            # Mocktail Segar
            (
                6, "Tedhuh Sunset Berry Fizz", 
                "Kombinasi sparkling soda, sirup strawberry alami, sari jeruk sunkist, dan garnish daun rosemary.",
                23000, "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80",
                1, 1, "Rekomendasi", 0, 0,
                json.dumps([])
            ),
            (
                6, "Cucumber Mint Cooler", 
                "Minuman dingin menyegarkan dari timun jepang segar, daun mint remas, jeruk nipis, dan tonic water.",
                22000, "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80",
                1, 0, "", 0, 0,
                json.dumps([])
            )
        ]

        cursor.executemany('''
            INSERT INTO menu_items (
                category_id, name, description, price, image_url, 
                is_available, is_recommended, badge, has_ice_hot, has_sugar_level, options_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', menu_items)

    # 3. Seed Tables if empty
    cursor.execute("SELECT COUNT(*) FROM tables")
    if cursor.fetchone()[0] == 0:
        print("Seeding tables...")
        tables = []
        for i in range(1, 13):
            t_num = f"Meja {i:02d}"
            tables.append((t_num, f"Meja No. {i}", "AVAILABLE", None))
        cursor.executemany("INSERT INTO tables (table_number, name, status, current_order_id) VALUES (?, ?, ?, ?)", tables)

    # 4. Seed Settings if empty
    cursor.execute("SELECT COUNT(*) FROM settings")
    if cursor.fetchone()[0] == 0:
        print("Seeding settings...")
        settings = [
            ("cafe_name", "Kedai Tedhuh"),
            ("tagline", "Menikmati Ketenangan Dalam Setiap Teguk"),
            ("address", "Jl. Rindang No. 7, Kawasan Asri, Tedhuh"),
            ("phone", "0812-3456-7890"),
            ("instagram", "@kedai.tedhuh"),
            ("wifi_ssid", "KedaiTedhuh_FreeWiFi"),
            ("wifi_password", "kopitedhuh2026"),
            ("qris_image", "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=00020101021126610016ID.CO.QRIS.WWW01189360099900000000010210KEDAI_TEDHUH5204581253033605802ID5912KEDAI_TEDHUH6007BANDUNG62070703A016304"),
            ("tax_percent", "0")
        ]
        cursor.executemany("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", settings)

    # 4.1 Ensure thermal printer settings exist
    printer_defaults = [
        ("printer_connection", "browser"),
        ("printer_paper_width", "58mm"),
        ("printer_auto_print", "1"),
        ("printer_auto_cut", "1"),
        ("printer_cash_drawer", "0"),
        ("printer_ip", "192.168.1.200"),
        ("printer_port", "9100"),
        ("receipt_show_logo", "1"),
        ("receipt_footer_msg", "Terima kasih telah singgah & tedhuh bersama kami.")
    ]
    for k, v in printer_defaults:
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        print("Seeding initial users & staff...")
        users = [
            ("admin", generate_password_hash("admin123"), "1234", "Agung Pratama (Owner/Admin)", "admin", 1),
            ("kasir1", generate_password_hash("kasir123"), "1111", "Siti Rahma (Kasir Shift 1)", "kasir", 1),
            ("kasir2", generate_password_hash("kasir123"), "3333", "Dimas Nugraha (Kasir Shift 2)", "kasir", 1),
            ("barista", generate_password_hash("barista123"), "2222", "Rian Hidayat (Head Barista)", "barista", 1)
        ]
        cursor.executemany('''
            INSERT INTO users (username, password_hash, pin, full_name, role, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', users)

    conn.commit()
    conn.close()
    print("Database seeding checked and ready!")

if __name__ == '__main__':
    seed_database()
