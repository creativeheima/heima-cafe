import io
import time
import openpyxl
from app import app
from database import init_db
from seed_data import seed_database

def run_tests():
    print("=========================================================")
    print("   AUTOMATED SYSTEM VERIFICATION - KEDAI TEDHUH v2.0    ")
    print("=========================================================")
    seed_database()
    client = app.test_client()

    # 1. Test Menu API
    res = client.get('/api/menu')
    assert res.status_code == 200
    menu_data = res.get_json()
    assert len(menu_data['categories']) > 0 and len(menu_data['items']) > 0
    print(f"[PASS] 1. Menu API: {len(menu_data['categories'])} categories, {len(menu_data['items'])} items")

    # 2. Test Tables API
    res = client.get('/api/tables')
    assert res.status_code == 200
    tables = res.get_json()
    assert len(tables) >= 12
    print(f"[PASS] 2. Tables API: {len(tables)} tables loaded")

    # 3. Test PIN Authentication (Kasir PIN 1111)
    res = client.post('/api/auth/login', json={'pin': '1111'})
    assert res.status_code == 200, f"PIN login failed: {res.data}"
    login_data = res.get_json()
    assert login_data['success'] is True
    assert login_data['user']['role'] == 'kasir'
    print(f"[PASS] 3. PIN Login: Authenticated as '{login_data['user']['full_name']}'")

    # 4. RBAC Verification: Kasir MUST be BLOCKED (403 Forbidden) from Laporan & Kelola Stok/Menu
    res = client.get('/api/pos/reports/monthly')
    assert res.status_code == 403, f"Expected 403 for Kasir accessing reports, got {res.status_code}"
    res = client.get('/api/pos/reports/export-excel')
    assert res.status_code == 403, f"Expected 403 for Kasir accessing export excel, got {res.status_code}"
    res = client.post('/api/pos/menu/items', json={'name': 'Hacker Item', 'category_id': 1, 'price': 10000})
    assert res.status_code == 403, f"Expected 403 for Kasir creating menu, got {res.status_code}"
    res = client.post('/api/pos/categories', json={'name': 'Hacker Category'})
    assert res.status_code == 403, f"Expected 403 for Kasir creating category, got {res.status_code}"
    res = client.post('/api/pos/menu/1/toggle-stock')
    assert res.status_code == 403, f"Expected 403 for Kasir toggling stock, got {res.status_code}"
    res = client.get('/api/users')
    assert res.status_code == 403, f"Expected 403 for Kasir accessing users, got {res.status_code}"
    print("[PASS] 4. RBAC Protection: Kasir is strictly blocked (403 Forbidden) from Laporan, Stok, Menu CRUD & Staff")

    # 5. Test Username & Password Authentication (Admin)
    res = client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
    assert res.status_code == 200
    admin_data = res.get_json()
    assert admin_data['user']['role'] == 'admin'
    print(f"[PASS] 5. Admin Auth: Authenticated as '{admin_data['user']['full_name']}' (role: admin)")

    # 6. Admin Category Management CRUD
    res = client.post('/api/pos/categories', json={'name': 'Kue Tradisional', 'icon': 'bread', 'sort_order': 7})
    assert res.status_code == 200
    new_cat = res.get_json()
    new_cat_id = new_cat['id']
    assert new_cat_id > 0

    res = client.put(f'/api/pos/categories/{new_cat_id}', json={'name': 'Jajanan & Roti Tradisional', 'icon': 'bread', 'sort_order': 7})
    assert res.status_code == 200

    res = client.get('/api/pos/categories')
    assert res.status_code == 200
    cats_list = res.get_json()
    assert any(c['id'] == new_cat_id for c in cats_list)
    print(f"[PASS] 6. Category CRUD (Admin): Created & Updated category (id={new_cat_id})")

    # 7. Admin Menu Item CRUD & Stock Toggle
    new_item_payload = {
        'name': 'Pisang Goreng Wijen Madu',
        'category_id': new_cat_id,
        'price': 18000,
        'badge': 'Menu Baru',
        'description': 'Pisang kepok pilihan dengan taburan wijen dan sirup madu organik.',
        'image_url': 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop&q=80',
        'is_available': 1,
        'has_ice_hot': 0,
        'has_sugar_level': 0
    }
    res = client.post('/api/pos/menu/items', json=new_item_payload)
    assert res.status_code == 200
    new_item_id = res.get_json()['id']
    assert new_item_id > 0

    # Edit Menu Item
    new_item_payload['price'] = 20000
    new_item_payload['badge'] = 'Best Seller'
    res = client.put(f'/api/pos/menu/items/{new_item_id}', json=new_item_payload)
    assert res.status_code == 200

    # Toggle stock as Admin
    res = client.post(f'/api/pos/menu/{new_item_id}/toggle-stock')
    assert res.status_code == 200
    assert res.get_json()['is_available'] == 0

    # Delete Menu Item & Category cleanup
    res = client.delete(f'/api/pos/menu/items/{new_item_id}')
    assert res.status_code == 200
    res = client.delete(f'/api/pos/categories/{new_cat_id}')
    assert res.status_code == 200
    print(f"[PASS] 7. Menu CRUD & Stock Toggle (Admin): Created, Updated, Toggled Stock, and Cleaned up")

    # 8. Test User Management (Admin can view and add staff)
    res = client.get('/api/users')
    assert res.status_code == 200
    users = res.get_json()
    assert len(users) >= 4
    print(f"[PASS] 8. User List: {len(users)} staff accounts registered")

    # Add a new staff user
    new_user_payload = {
        'username': f'kasir_test_{int(time.time())}',
        'full_name': 'Test Cashier User',
        'role': 'kasir',
        'pin': '9999',
        'password': 'password123'
    }
    res = client.post('/api/users', json=new_user_payload)
    assert res.status_code == 200
    print("[PASS] 9. Add Staff User: Successfully created new staff account")

    # 10. Test Customer Order (Meja 03) & Table Isolation Verification
    first_item = menu_data['items'][0]
    order_payload = {
        'table_number': 'Meja 03',
        'customer_name': 'Budi Meja 3',
        'customer_phone': '',
        'order_type': 'Dine In',
        'payment_method': 'QRIS',
        'items': [
            {
                'id': first_item['id'],
                'name': first_item['name'],
                'price': first_item['price'],
                'quantity': 2,
                'temperature': 'Dingin (Ice)',
                'sugar_level': 'Normal Sugar',
                'selected_addons': [{'name': 'Extra Shot Espresso', 'price': 4000}],
                'notes': 'Tanpa sedotan'
            }
        ]
    }
    res = client.post('/api/orders', json=order_payload)
    assert res.status_code == 200
    order = res.get_json()['order']
    order_id = order['id']
    assert order['table_number'] == 'Meja 03'
    print(f"[PASS] 10. Order Placed for Meja 03: #{order['order_number']}")

    # 11. Test POS Order Status Update & Table Isolation in broadcast
    res = client.post(f'/api/pos/orders/{order_id}/status', json={'status': 'COOKING'})
    assert res.status_code == 200
    updated_order = res.get_json()['order']
    assert updated_order['order_status'] == 'COOKING'
    assert updated_order['table_number'] == 'Meja 03'
    print("[PASS] 11. Order Status Update: Changed to COOKING with table_number preserved for isolation")

    # Complete order
    res = client.post(f'/api/pos/orders/{order_id}/status', json={'status': 'COMPLETED'})
    assert res.status_code == 200

    # 12. Test Monthly Report API with All Menu Sales Tracking (Admin only)
    import datetime
    now = datetime.datetime.now()
    res = client.get(f'/api/pos/reports/monthly?month={now.month}&year={now.year}')
    assert res.status_code == 200
    monthly_data = res.get_json()
    assert 'paid_revenue' in monthly_data
    assert 'daily_breakdown' in monthly_data
    assert 'transactions' in monthly_data
    assert 'top_items' in monthly_data
    assert 'all_menu_sales' in monthly_data, "Missing all_menu_sales in monthly report"
    assert len(monthly_data['all_menu_sales']) == 20, f"Expected 20 menu items, got {len(monthly_data['all_menu_sales'])}"
    print(f"[PASS] 12. Monthly Report API (Admin): Omset Rp {monthly_data['paid_revenue']:,}, All {len(monthly_data['all_menu_sales'])} menu items sales tracked")

    # 13. Test Excel Report Export (.xlsx) (Admin only)
    res = client.get(f'/api/pos/reports/export-excel?month={now.month}&year={now.year}')
    assert res.status_code == 200
    assert res.mimetype == 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    excel_bytes = io.BytesIO(res.data)
    wb = openpyxl.load_workbook(excel_bytes)
    assert "Ringkasan Bulanan" in wb.sheetnames, "Missing Ringkasan Bulanan sheet"
    assert "Daftar Transaksi" in wb.sheetnames, "Missing Daftar Transaksi sheet"
    assert "Performa Menu" in wb.sheetnames, "Missing Performa Menu sheet"
    ws3 = wb["Performa Menu"]
    assert ws3.max_row >= 25, f"Expected at least 25 rows in Performa Menu sheet, got {ws3.max_row}"
    print(f"[PASS] 13. Excel Export (.xlsx) (Admin): Generated 3 sheets ({', '.join(wb.sheetnames)}) with all menu items included")

    # 14. Verify Struk with Cashier Name
    res = client.get(f'/kasir/struk/{order_id}')
    assert res.status_code == 200
    assert "Kasir:" in res.get_data(as_text=True)
    print("[PASS] 14. Thermal Receipt: Verified cashier name field on 58mm/80mm receipt")

    # 15. Verify Test Struk Endpoint
    res = client.get('/kasir/struk/test')
    assert res.status_code == 200
    struk_html = res.get_data(as_text=True)
    assert "TEST-THERMAL-01" in struk_html
    assert "Tes Koneksi Kasir" in struk_html
    print("[PASS] 15. Test Struk: Verified test receipt endpoint (/kasir/struk/test)")

    # 16. Verify Thermal Printer Settings Upsert & Get
    new_settings = {
        'printer_connection': 'bluetooth',
        'printer_paper_width': '80mm',
        'printer_auto_print': '1',
        'printer_auto_cut': '1',
        'receipt_show_logo': '1',
        'printer_ip': '192.168.1.150',
        'printer_port': '9100',
        'receipt_footer_msg': 'Matur suwun sanget sampun tedhuh!'
    }
    res = client.post('/api/settings', json=new_settings)
    assert res.status_code == 200
    assert res.get_json()['success'] is True

    res = client.get('/api/settings')
    assert res.status_code == 200
    saved_settings = res.get_json()
    assert saved_settings['printer_connection'] == 'bluetooth'
    assert saved_settings['printer_paper_width'] == '80mm'
    assert saved_settings['printer_ip'] == '192.168.1.150'
    assert saved_settings['receipt_footer_msg'] == 'Matur suwun sanget sampun tedhuh!'
    print("[PASS] 16. Printer Settings API: Successfully saved and retrieved thermal configuration")

    # 17. Verify Network Printer Socket Endpoint (Graceful error handling when printer offline)
    res = client.post('/api/pos/printer/test-network', json={'ip': '127.0.0.1', 'port': 65530})
    assert res.status_code == 200
    net_data = res.get_json()
    assert 'success' in net_data
    print("[PASS] 17. Network Printer Socket API: Verified raw TCP test-network endpoint")

    # 18. Verify Walk-in Order with Discount
    discount_order_payload = {
        'table_number': 'Takeaway',
        'customer_name': 'Pelanggan Diskon',
        'order_type': 'Takeaway',
        'payment_method': 'TUNAI_KASIR',
        'is_cashier_direct': True,
        'is_paid': True,
        'discount': 5000,
        'items': [
            {'id': 1, 'name': 'Es Kopi Susu Tedhuh', 'price': 20000, 'quantity': 2, 'temperature': 'Dingin', 'sugar_level': 'Normal'}
        ]
    }
    res = client.post('/api/orders', json=discount_order_payload)
    assert res.status_code == 200
    disc_order = res.get_json()['order']
    assert disc_order['subtotal'] == 40000
    assert disc_order['discount'] == 5000
    assert disc_order['total_amount'] == 35000
    print("[PASS] 18. Walk-in Discount: Applied Rp 5.000 discount (Subtotal Rp 40k -> Total Rp 35k)")

    # 19. Verify Walk-in Order with Pending Option (Open Bill) & Later Settlement
    pending_order_payload = {
        'table_number': 'Meja 05',
        'customer_name': 'Pelanggan Meja 5 Pending',
        'order_type': 'Dine In',
        'payment_method': 'PENDING',
        'is_cashier_direct': True,
        'is_pending': True,
        'discount': 2000,
        'items': [
            {'id': 1, 'name': 'Es Kopi Susu Tedhuh', 'price': 20000, 'quantity': 1, 'temperature': 'Dingin', 'sugar_level': 'Normal'}
        ]
    }
    res = client.post('/api/orders', json=pending_order_payload)
    assert res.status_code == 200
    pend_order = res.get_json()['order']
    assert pend_order['order_status'] == 'PENDING'
    assert pend_order['payment_status'] == 'UNPAID'
    assert pend_order['total_amount'] == 18000
    
    # Check Meja 05 status is OCCUPIED
    res = client.get('/api/tables')
    t5 = next(t for t in res.get_json() if t['table_number'] == 'Meja 05')
    assert t5['status'] == 'OCCUPIED'

    # Settle pending order
    res = client.post(f'/api/pos/orders/{pend_order["id"]}/payment', json={'payment_method': 'TUNAI_KASIR', 'cash_given': 20000})
    assert res.status_code == 200
    res = client.post(f'/api/pos/orders/{pend_order["id"]}/status', json={'status': 'COMPLETED'})
    assert res.status_code == 200

    # Verify table freed
    res = client.get('/api/tables')
    t5_after = next(t for t in res.get_json() if t['table_number'] == 'Meja 05')
    assert t5_after['status'] == 'AVAILABLE'
    # 20. Verify Direct Web Access without QR & Cashier Link Removed from Footer
    res = client.get('/')
    assert res.status_code == 200
    page_html = res.get_data(as_text=True)
    assert 'table-modal' in page_html, "Missing table modal for direct web access without QR"
    assert 'Buka Aplikasi Kasir' not in page_html, "Buka Aplikasi Kasir must be removed from customer web footer"
    print("[PASS] 20. Customer Web Access & Footer: Website accessible without QR scan, and Cashier POS link removed from footer")

    # 21. Verify Order Deletion: Kasir (Live & Walk-in) and Admin (Reports & General)
    order_to_delete_payload = {
        'table_number': 'Meja 06',
        'customer_name': 'Pelanggan Live Meja 6',
        'order_type': 'Dine In',
        'payment_method': 'PENDING',
        'is_cashier_direct': True,
        'is_pending': True,
        'discount': 0,
        'items': [
            {'id': 1, 'name': 'Es Kopi Susu Tedhuh', 'price': 20000, 'quantity': 2, 'temperature': 'Dingin', 'sugar_level': 'Normal'}
        ]
    }
    res = client.post('/api/orders', json=order_to_delete_payload)
    assert res.status_code == 200
    del_order = res.get_json()['order']
    del_order_id = del_order['id']

    # Confirm Meja 06 is OCCUPIED
    res = client.get('/api/tables')
    t6 = next(t for t in res.get_json() if t['table_number'] == 'Meja 06')
    assert t6['status'] == 'OCCUPIED'

    # Kasir (PIN 1111) can delete orders in live & walk-in
    login_res = client.post('/api/auth/login', json={'pin': '1111'})
    assert login_res.status_code == 200
    assert login_res.get_json()['user']['role'] == 'kasir'
    
    res = client.delete(f'/api/pos/orders/{del_order_id}')
    assert res.status_code == 200, f"Expected 200 OK for Kasir deleting order in live/walk-in, got {res.status_code}"
    assert res.get_json()['success'] is True

    # Confirm order no longer exists
    res = client.get(f'/api/orders/{del_order_id}')
    assert res.status_code == 404

    # Confirm table Meja 06 is freed back to AVAILABLE
    res = client.get('/api/tables')
    t6_after = next(t for t in res.get_json() if t['table_number'] == 'Meja 06')
    assert t6_after['status'] == 'AVAILABLE'
    assert t6_after['current_order_id'] is None

    # Kasir is STILL BLOCKED from accessing Reports section
    res = client.get('/api/pos/reports/monthly')
    assert res.status_code == 403

    # Admin (admin/admin123) creates a completed order and can delete from reports
    admin_login = client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
    assert admin_login.status_code == 200
    
    # Create an order to be deleted by admin
    admin_order_payload = {
        'table_number': 'Takeaway',
        'customer_name': 'Pelanggan Laporan Admin',
        'order_type': 'Takeaway',
        'payment_method': 'TUNAI_KASIR',
        'is_cashier_direct': True,
        'discount': 0,
        'items': [{'id': 2, 'name': 'Americano Klasik', 'price': 15000, 'quantity': 1, 'temperature': 'Dingin', 'sugar_level': 'Normal'}]
    }
    res = client.post('/api/orders', json=admin_order_payload)
    assert res.status_code == 200
    adm_order_id = res.get_json()['order']['id']
    
    # Admin can access reports and delete order
    res = client.get('/api/pos/reports/monthly')
    assert res.status_code == 200
    res = client.delete(f'/api/pos/orders/{adm_order_id}')
    assert res.status_code == 200
    
    # Deleting non-existent order returns 404
    res = client.delete(f'/api/pos/orders/{adm_order_id}')
    assert res.status_code == 404
    print(f"[PASS] 21. Order Deletion: Kasir can delete live/walk-in orders (freed Meja 06), Kasir blocked from reports (403), Admin can access reports & delete orders (200)")

    print("\n=========================================================")
    print("   ALL VERIFICATIONS PASSED (21/21)! SYSTEM READY!       ")
    print("=========================================================")

if __name__ == '__main__':
    run_tests()
