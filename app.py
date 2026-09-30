import os
import json
import time
import queue
from datetime import datetime
from functools import wraps
from flask import Flask, render_template, request, jsonify, Response, redirect, url_for, session, send_file
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash
from database import get_db_connection, init_db
from excel_export import generate_monthly_excel

app = Flask(__name__)
app.secret_key = 'tedhuh-super-secret-pos-key-2026-coffee'
CORS(app)

# Initialize database
init_db()

# Real-time event broadcasting queues (SSE)
sse_clients = []

def broadcast_event(event_type, data):
    """Send SSE message to all connected clients"""
    dead_clients = []
    payload = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    for q in sse_clients:
        try:
            q.put_nowait(payload)
        except Exception:
            dead_clients.append(q)
    for dead in dead_clients:
        if dead in sse_clients:
            sse_clients.remove(dead)

def get_current_user():
    user_id = session.get('user_id')
    if not user_id:
        return None
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, full_name, role, is_active FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def is_admin():
    u = get_current_user()
    return u is not None and u.get('role') == 'admin'

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_admin():
            return jsonify({'error': 'Akses ditolak: Fitur ini hanya dapat diakses oleh Admin.'}), 403
        return f(*args, **kwargs)
    return decorated_function

# ================= PAGES =================
@app.route('/')
def customer_page():
    """Customer ordering page with optional ?meja=XX parameter"""
    table = request.args.get('meja') or request.args.get('table') or ''
    if table.isdigit():
        table = f"Meja {int(table):02d}"
    return render_template('index.html', initial_table=table)

@app.route('/meja/<table_num>')
def table_redirect(table_num):
    clean_num = table_num.replace('meja-', '').replace('Meja-', '')
    if clean_num.isdigit():
        clean_num = f"Meja {int(clean_num):02d}"
    return redirect(url_for('customer_page', meja=clean_num))

@app.route('/kasir')
def cashier_page():
    """Cashier POS & Kitchen Display System"""
    return render_template('cashier.html')

@app.route('/kasir/cetak-qr')
def print_qr_page():
    """Printable table stand QR codes"""
    return render_template('qr_codes.html')

@app.route('/kasir/struk/<int:order_id>')
def print_receipt_page(order_id):
    """Direct thermal receipt view for printing"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
    order = cursor.fetchone()
    if not order:
        conn.close()
        return "Pesanan tidak ditemukan", 404
    
    cursor.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,))
    items = cursor.fetchall()
    
    cursor.execute("SELECT key, value FROM settings")
    settings = dict(cursor.fetchall())
    conn.close()

    return render_template('receipt.html', order=dict(order), items=[dict(i) for i in items], settings=settings)

@app.route('/kasir/struk/test')
def print_test_receipt():
    """Print test sample receipt for thermal printer testing"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    settings = dict(cursor.fetchall())
    conn.close()

    mock_order = {
        'id': 0,
        'order_number': 'TEST-THERMAL-01',
        'table_number': 'UJI PRINTER',
        'customer_name': 'Tes Koneksi Kasir',
        'order_type': 'Dine In',
        'subtotal': 44000,
        'discount': 0,
        'total_amount': 44000,
        'payment_method': 'TUNAI_KASIR',
        'payment_status': 'PAID',
        'cashier_name': 'Kasir / Barista',
        'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    mock_items = [
        {'name': 'Es Kopi Susu Tedhuh', 'quantity': 1, 'subtotal': 20000, 'temperature': 'Dingin', 'sugar_level': 'Normal', 'selected_addons': '', 'notes': 'Uji cetak thermal'},
        {'name': 'Kopi Susu Pandan Senja', 'quantity': 1, 'subtotal': 24000, 'temperature': 'Dingin', 'sugar_level': 'Normal', 'selected_addons': '', 'notes': 'Printer OK'}
    ]
    return render_template('receipt.html', order=mock_order, items=mock_items, settings=settings)

# ================= AUTH & USER MANAGEMENT APIS =================
@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    """Login via Username/Password OR 4-digit PIN"""
    data = request.json or {}
    pin = data.get('pin', '').strip()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    conn = get_db_connection()
    cursor = conn.cursor()

    user = None
    if pin:
        cursor.execute("SELECT * FROM users WHERE pin = ? AND is_active = 1", (pin,))
        user = cursor.fetchone()
    elif username and password:
        cursor.execute("SELECT * FROM users WHERE username = ? AND is_active = 1", (username,))
        row = cursor.fetchone()
        if row and check_password_hash(row['password_hash'], password):
            user = row

    conn.close()

    if not user:
        return jsonify({'error': 'PIN atau Username & Password tidak sesuai.'}), 401

    user_dict = dict(user)
    session['user_id'] = user_dict['id']
    session['username'] = user_dict['username']
    session['full_name'] = user_dict['full_name']
    session['role'] = user_dict['role']

    return jsonify({
        'success': True,
        'user': {
            'id': user_dict['id'],
            'username': user_dict['username'],
            'full_name': user_dict['full_name'],
            'role': user_dict['role']
        }
    })

@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    """Get current active session user"""
    u = get_current_user()
    if not u:
        # Default fallback guest user if not yet logged in so UI works smoothly
        return jsonify({'logged_in': False, 'user': None})
    return jsonify({'logged_in': True, 'user': u})

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/users', methods=['GET'])
@admin_required
def get_users():
    """Get list of users / staff (Admin only)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, full_name, role, pin, is_active, created_at FROM users ORDER BY id ASC")
    users = [dict(u) for u in cursor.fetchall()]
    conn.close()
    return jsonify(users)

@app.route('/api/users', methods=['POST'])
@admin_required
def save_user():
    """Create or update user/staff"""
    data = request.json or {}
    user_id = data.get('id')
    username = data.get('username', '').strip()
    full_name = data.get('full_name', '').strip()
    role = data.get('role', 'kasir')
    pin = data.get('pin', '1234').strip()
    password = data.get('password', '').strip()
    is_active = 1 if data.get('is_active', True) else 0

    if not username or not full_name or not pin:
        return jsonify({'error': 'Username, nama lengkap, dan PIN 4-digit wajib diisi.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    if user_id:
        # Update existing
        if password:
            hashed = generate_password_hash(password)
            cursor.execute('''
                UPDATE users SET username = ?, full_name = ?, role = ?, pin = ?, password_hash = ?, is_active = ?
                WHERE id = ?
            ''', (username, full_name, role, pin, hashed, is_active, user_id))
        else:
            cursor.execute('''
                UPDATE users SET username = ?, full_name = ?, role = ?, pin = ?, is_active = ?
                WHERE id = ?
            ''', (username, full_name, role, pin, is_active, user_id))
    else:
        # Create new
        hashed = generate_password_hash(password or 'tedhuh123')
        try:
            cursor.execute('''
                INSERT INTO users (username, password_hash, pin, full_name, role, is_active)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (username, hashed, pin, full_name, role, is_active))
        except Exception as e:
            conn.close()
            return jsonify({'error': 'Username sudah digunakan oleh staf lain.'}), 400

    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/users/<int:user_id>/toggle-status', methods=['POST'])
@admin_required
def toggle_user_status(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT is_active FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'User tidak ditemukan'}), 404
    new_status = 0 if row['is_active'] == 1 else 1
    cursor.execute("UPDATE users SET is_active = ? WHERE id = ?", (new_status, user_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'is_active': new_status})

# ================= REAL-TIME SSE =================
@app.route('/api/stream')
def sse_stream():
    """Server-Sent Events endpoint for instant real-time live updates"""
    client_queue = queue.Queue(maxsize=50)
    sse_clients.append(client_queue)

    def event_stream():
        yield f"event: ping\ndata: {json.dumps({'time': time.time(), 'status': 'connected'})}\n\n"
        try:
            while True:
                try:
                    data = client_queue.get(timeout=20)
                    yield data
                except queue.Empty:
                    yield f": keep-alive\n\n"
        except GeneratorExit:
            if client_queue in sse_clients:
                sse_clients.remove(client_queue)

    return Response(event_stream(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive'
    })

# ================= MENU & SETTINGS APIS =================
@app.route('/api/menu', methods=['GET'])
def get_menu():
    """Fetch categories and active menu items"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM categories ORDER BY sort_order ASC")
    categories = [dict(c) for c in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM menu_items ORDER BY category_id, id")
    items = []
    for item in cursor.fetchall():
        item_dict = dict(item)
        try:
            item_dict['options'] = json.loads(item_dict.get('options_json') or '[]')
        except Exception:
            item_dict['options'] = []
        items.append(item_dict)
    
    conn.close()
    return jsonify({'categories': categories, 'items': items})

@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get cafe profile settings"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    settings = dict(cursor.fetchall())
    conn.close()
    return jsonify(settings)

@app.route('/api/settings', methods=['POST'])
def save_settings():
    """Save or update cafe / thermal printer settings"""
    data = request.json or {}
    conn = get_db_connection()
    cursor = conn.cursor()
    for key, value in data.items():
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (str(key), str(value)))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/pos/printer/test-network', methods=['POST'])
def test_network_printer():
    """Test raw ESC/POS connection to an IP/Ethernet thermal printer"""
    import socket
    data = request.json or {}
    ip = data.get('ip', '').strip()
    try:
        port = int(data.get('port', 9100))
    except (ValueError, TypeError):
        port = 9100

    if not ip:
        return jsonify({'error': 'Alamat IP Printer wajib diisi.'}), 400

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(3.5)
            s.connect((ip, port))
            # ESC/POS commands
            esc_pos_test = bytearray()
            esc_pos_test.extend(b'\x1b@') # initialize printer
            esc_pos_test.extend(b'\x1ba\x01') # center align
            esc_pos_test.extend(b'\x1bE\x01') # bold on
            esc_pos_test.extend(b'KEDAI TEDHUH\n')
            esc_pos_test.extend(b'UJI PRINTER THERMAL (LAN/IP)\n')
            esc_pos_test.extend(b'\x1bE\x00') # bold off
            esc_pos_test.extend(b'--------------------------------\n')
            esc_pos_test.extend(f'IP: {ip}:{port}\n'.encode('utf-8'))
            esc_pos_test.extend(f'Waktu: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n'.encode('utf-8'))
            esc_pos_test.extend(b'Status: TERKONEKSI (OK)\n')
            esc_pos_test.extend(b'Printer siap digunakan di kasir!\n')
            esc_pos_test.extend(b'--------------------------------\n\n\n\n')
            esc_pos_test.extend(b'\x1dV\x42\x00') # paper cut
            s.sendall(esc_pos_test)
        return jsonify({'success': True, 'message': f'Berhasil terhubung dan mengirim struk uji coba ke {ip}:{port}!'})
    except Exception as e:
        return jsonify({'success': False, 'error': f'Koneksi gagal ke {ip}:{port} ({str(e)})'}), 200

@app.route('/api/tables', methods=['GET'])
def get_tables():
    """Get tables status list"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tables ORDER BY table_number")
    tables = [dict(t) for t in cursor.fetchall()]
    conn.close()
    return jsonify(tables)

# ================= CUSTOMER & CASHIER ORDERING APIS =================
@app.route('/api/orders', methods=['POST'])
def create_order():
    """Place a new order (from customer online or cashier direct)"""
    data = request.json or {}
    items = data.get('items', [])
    if not items:
        return jsonify({'error': 'Keranjang pesanan masih kosong.'}), 400

    table_number = data.get('table_number', 'Takeaway').strip()
    customer_name = data.get('customer_name', 'Pelanggan').strip()
    customer_phone = data.get('customer_phone', '').strip()
    order_type = data.get('order_type', 'Dine In')
    notes = data.get('notes', '').strip()
    payment_method = data.get('payment_method', 'QRIS')
    is_cashier_direct = data.get('is_cashier_direct', False)

    # Determine cashier name
    active_user = get_current_user()
    if is_cashier_direct:
        cashier_name = (active_user['full_name'] if active_user else data.get('cashier_name')) or 'Staff Kasir'
    else:
        cashier_name = 'Pesan Mandiri (QR)'

    conn = get_db_connection()
    cursor = conn.cursor()

    # Generate Order Number: TDH-YYYYMMDD-XXXX
    date_str = datetime.now().strftime('%Y%m%d')
    cursor.execute("SELECT COUNT(*) FROM orders WHERE order_number LIKE ?", (f"TDH-{date_str}-%",))
    daily_count = cursor.fetchone()[0] + 1
    order_number = f"TDH-{date_str}-{daily_count:03d}"

    # Calculate total
    subtotal = 0
    calculated_items = []
    for item in items:
        price = int(item.get('price', 0))
        qty = int(item.get('quantity', 1))
        addons_total = sum(int(a.get('price', 0)) for a in item.get('selected_addons', []))
        unit_price = price + addons_total
        item_subtotal = unit_price * qty
        subtotal += item_subtotal

        calculated_items.append({
            'menu_item_id': item.get('id'),
            'name': item.get('name'),
            'price': unit_price,
            'quantity': qty,
            'subtotal': item_subtotal,
            'temperature': item.get('temperature', '-'),
            'sugar_level': item.get('sugar_level', '-'),
            'selected_addons': ", ".join([f"{a['name']} (+Rp {a['price']:,})" if a.get('price') else a['name'] for a in item.get('selected_addons', [])]),
            'notes': item.get('notes', '')
        })

    discount = int(data.get('discount', 0))
    total_amount = max(0, subtotal - discount)
    
    is_pending = data.get('is_pending', False)
    if is_pending or data.get('order_status') == 'PENDING':
        order_status = 'PENDING'
        payment_status = 'UNPAID'
    elif is_cashier_direct:
        order_status = data.get('order_status', 'ACCEPTED')
        payment_status = 'PAID' if data.get('is_paid', True) else 'UNPAID'
    else:
        order_status = 'PENDING'
        payment_status = 'UNPAID'

    cursor.execute('''
        INSERT INTO orders (
            order_number, table_number, customer_name, customer_phone,
            order_type, notes, subtotal, discount, tax, total_amount,
            payment_method, payment_status, order_status, cashier_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ''', (
        order_number, table_number, customer_name, customer_phone,
        order_type, notes, subtotal, discount, total_amount,
        payment_method, payment_status, order_status, cashier_name
    ))
    order_id = cursor.lastrowid

    # Insert items
    for ci in calculated_items:
        cursor.execute('''
            INSERT INTO order_items (
                order_id, menu_item_id, name, price, quantity,
                subtotal, temperature, sugar_level, selected_addons, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            order_id, ci['menu_item_id'], ci['name'], ci['price'], ci['quantity'],
            ci['subtotal'], ci['temperature'], ci['sugar_level'], ci['selected_addons'], ci['notes']
        ))

    # Update table status if table_number starts with Meja
    if table_number.startswith('Meja'):
        if order_status in ['COMPLETED', 'CANCELLED']:
            cursor.execute("UPDATE tables SET status = 'AVAILABLE', current_order_id = NULL WHERE table_number = ?", (table_number,))
        else:
            cursor.execute("UPDATE tables SET status = 'OCCUPIED', current_order_id = ? WHERE table_number = ?", (order_id, table_number))

    conn.commit()

    cursor.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
    created_order = dict(cursor.fetchone())
    created_order['items'] = calculated_items

    conn.close()

    # Broadcast event to cashier POS in real-time
    broadcast_event('new_order', {
        'order': created_order,
        'message': f"Pesanan baru masuk dari {table_number} ({customer_name})!"
    })

    return jsonify({
        'success': True,
        'message': 'Pesanan berhasil dibuat!',
        'order': created_order
    })

@app.route('/api/orders/<identifier>', methods=['GET'])
def get_order_detail(identifier):
    """Get single order detail by ID or order_number"""
    conn = get_db_connection()
    cursor = conn.cursor()

    if identifier.isdigit():
        cursor.execute("SELECT * FROM orders WHERE id = ?", (int(identifier),))
    else:
        cursor.execute("SELECT * FROM orders WHERE order_number = ?", (identifier,))
    
    order = cursor.fetchone()
    if not order:
        conn.close()
        return jsonify({'error': 'Pesanan tidak ditemukan'}), 404
    
    order_dict = dict(order)
    cursor.execute("SELECT * FROM order_items WHERE order_id = ?", (order_dict['id'],))
    order_dict['items'] = [dict(i) for i in cursor.fetchall()]
    conn.close()

    return jsonify(order_dict)

@app.route('/api/waiter-call', methods=['POST'])
def call_waiter():
    """Customer asks for waiter assistance"""
    data = request.json or {}
    table_number = data.get('table_number', 'Meja').strip()
    message = data.get('message', 'Memanggil kasir/waiter ke meja')

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO waiter_calls (table_number, message, status) VALUES (?, ?, 'PENDING')", (table_number, message))
    call_id = cursor.lastrowid
    conn.commit()
    conn.close()

    # Broadcast live alert to cashier ONLY
    broadcast_event('call_waiter', {
        'id': call_id,
        'table_number': table_number,
        'message': message,
        'timestamp': datetime.now().strftime('%H:%M')
    })

    return jsonify({'success': True, 'message': 'Panggilan telah terkirim ke kasir. Staff kami segera menuju meja Anda!'})

# ================= CASHIER & POS APIS =================
@app.route('/api/pos/orders', methods=['GET'])
def get_pos_orders():
    """Get orders for cashier dashboard"""
    filter_status = request.args.get('status', 'ACTIVE')
    conn = get_db_connection()
    cursor = conn.cursor()

    if filter_status == 'ACTIVE':
        cursor.execute("SELECT * FROM orders WHERE order_status IN ('PENDING', 'ACCEPTED', 'COOKING', 'READY') ORDER BY id DESC")
    elif filter_status == 'ALL':
        cursor.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 100")
    else:
        cursor.execute("SELECT * FROM orders WHERE order_status = ? ORDER BY id DESC LIMIT 50", (filter_status,))
    
    orders = []
    for row in cursor.fetchall():
        o = dict(row)
        cursor.execute("SELECT * FROM order_items WHERE order_id = ?", (o['id'],))
        o['items'] = [dict(i) for i in cursor.fetchall()]
        orders.append(o)

    conn.close()
    return jsonify(orders)

@app.route('/api/pos/orders/<int:order_id>/status', methods=['POST'])
def update_order_status(order_id):
    """Cashier changes order status (e.g. ACCEPTED, COOKING, READY, COMPLETED, CANCELLED)"""
    data = request.json or {}
    new_status = data.get('status')
    if not new_status:
        return jsonify({'error': 'Status baru tidak valid'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
    order = cursor.fetchone()
    if not order:
        conn.close()
        return jsonify({'error': 'Pesanan tidak ditemukan'}), 404

    cursor.execute("UPDATE orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_status, order_id))

    if new_status in ['COMPLETED', 'CANCELLED']:
        cursor.execute("UPDATE tables SET status = 'AVAILABLE', current_order_id = NULL WHERE table_number = ?", (order['table_number'],))
        if new_status == 'COMPLETED':
            cursor.execute("UPDATE orders SET payment_status = 'PAID' WHERE id = ?", (order_id,))

    conn.commit()

    cursor.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
    updated_order = dict(cursor.fetchone())
    conn.close()

    # Broadcast event with table_number so only the relevant table listens!
    broadcast_event('order_status_updated', {
        'order_id': order_id,
        'order_number': updated_order['order_number'],
        'order_status': new_status,
        'payment_status': updated_order['payment_status'],
        'table_number': updated_order['table_number']
    })

    return jsonify({'success': True, 'order': updated_order})

@app.route('/api/pos/orders/<int:order_id>/payment', methods=['POST'])
def update_order_payment(order_id):
    """Mark order as paid and specify payment method"""
    data = request.json or {}
    payment_method = data.get('payment_method', 'TUNAI_KASIR')
    cash_given = int(data.get('cash_given', 0))

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT total_amount FROM orders WHERE id = ?", (order_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Pesanan tidak ditemukan'}), 404

    total_amount = row[0]
    change_amount = max(0, cash_given - total_amount) if cash_given > 0 else 0

    cursor.execute("UPDATE orders SET payment_status = 'PAID', payment_method = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (payment_method, order_id))
    conn.commit()
    conn.close()

    broadcast_event('payment_updated', {
        'order_id': order_id,
        'payment_status': 'PAID',
        'payment_method': payment_method
    })

    return jsonify({
        'success': True,
        'payment_status': 'PAID',
        'payment_method': payment_method,
        'change_amount': change_amount
    })

@app.route('/api/pos/orders/<int:order_id>', methods=['DELETE'])
def delete_order(order_id):
    """Delete an order (removes from orders & order_items, frees table if occupied)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, order_number, table_number FROM orders WHERE id = ?", (order_id,))
    order = cursor.fetchone()
    if not order:
        conn.close()
        return jsonify({'error': 'Pesanan tidak ditemukan'}), 404

    table_num = order['table_number']
    order_num = order['order_number']

    # Delete order items first
    cursor.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
    # Delete order
    cursor.execute("DELETE FROM orders WHERE id = ?", (order_id,))

    # If table had this order as current_order_id, free the table
    if table_num and table_num.startswith('Meja'):
        cursor.execute("UPDATE tables SET status = 'AVAILABLE', current_order_id = NULL WHERE current_order_id = ? OR table_number = ?", (order_id, table_num))

    conn.commit()
    conn.close()

    broadcast_event('order_deleted', {
        'order_id': order_id,
        'order_number': order_num,
        'table_number': table_num
    })

    return jsonify({'success': True, 'message': f'Pesanan {order_num} berhasil dihapus.'})

@app.route('/api/pos/menu/<int:item_id>/toggle-stock', methods=['POST'])
@admin_required
def toggle_menu_stock(item_id):
    """Quickly toggle item in/out of stock"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT is_available, name FROM menu_items WHERE id = ?", (item_id,))
    item = cursor.fetchone()
    if not item:
        conn.close()
        return jsonify({'error': 'Menu tidak ditemukan'}), 404

    new_status = 0 if item['is_available'] == 1 else 1
    cursor.execute("UPDATE menu_items SET is_available = ? WHERE id = ?", (new_status, item_id))
    conn.commit()
    conn.close()

    broadcast_event('menu_stock_changed', {
        'item_id': item_id,
        'name': item['name'],
        'is_available': new_status
    })

    return jsonify({'success': True, 'item_id': item_id, 'is_available': new_status})

# ================= MENU & CATEGORY POS MANAGEMENT APIS (ADMIN ONLY) =================
@app.route('/api/pos/categories', methods=['GET'])
def get_pos_categories():
    """Fetch all categories with associated menu items count"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT c.id, c.name, c.icon, c.sort_order, COUNT(mi.id) as item_count
        FROM categories c
        LEFT JOIN menu_items mi ON mi.category_id = c.id
        GROUP BY c.id
        ORDER BY c.sort_order ASC, c.id ASC
    ''')
    cats = [dict(c) for c in cursor.fetchall()]
    conn.close()
    return jsonify(cats)

@app.route('/api/pos/categories', methods=['POST'])
@admin_required
def create_category():
    """Create a new menu category"""
    data = request.json or {}
    name = data.get('name', '').strip()
    icon = data.get('icon', 'coffee').strip()
    try:
        sort_order = int(data.get('sort_order', 0))
    except (ValueError, TypeError):
        sort_order = 0

    if not name:
        return jsonify({'error': 'Nama kategori wajib diisi.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)", (name, icon, sort_order))
    cat_id = cursor.lastrowid
    conn.commit()
    conn.close()

    broadcast_event('menu_updated', {'action': 'category_created', 'id': cat_id, 'name': name})
    return jsonify({'success': True, 'id': cat_id, 'name': name})

@app.route('/api/pos/categories/<int:cat_id>', methods=['PUT'])
@admin_required
def update_category(cat_id):
    """Update an existing category"""
    data = request.json or {}
    name = data.get('name', '').strip()
    icon = data.get('icon', 'coffee').strip()
    try:
        sort_order = int(data.get('sort_order', 0))
    except (ValueError, TypeError):
        sort_order = 0

    if not name:
        return jsonify({'error': 'Nama kategori wajib diisi.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM categories WHERE id = ?", (cat_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Kategori tidak ditemukan.'}), 404

    cursor.execute("UPDATE categories SET name = ?, icon = ?, sort_order = ? WHERE id = ?", (name, icon, sort_order, cat_id))
    conn.commit()
    conn.close()

    broadcast_event('menu_updated', {'action': 'category_updated', 'id': cat_id, 'name': name})
    return jsonify({'success': True})

@app.route('/api/pos/categories/<int:cat_id>', methods=['DELETE'])
@admin_required
def delete_category(cat_id):
    """Delete a category if no menu items belong to it"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM menu_items WHERE category_id = ?", (cat_id,))
    count = cursor.fetchone()[0]
    if count > 0:
        conn.close()
        return jsonify({'error': f'Kategori masih digunakan oleh {count} menu. Silakan pindahkan atau hapus menu tersebut terlebih dahulu.'}), 400

    cursor.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()

    broadcast_event('menu_updated', {'action': 'category_deleted', 'id': cat_id})
    return jsonify({'success': True})

@app.route('/api/pos/menu/items', methods=['POST'])
@admin_required
def create_menu_item():
    """Create a new menu item"""
    data = request.json or {}
    name = data.get('name', '').strip()
    category_id = data.get('category_id')
    price = data.get('price')
    description = data.get('description', '').strip()
    image_url = data.get('image_url', '').strip()
    badge = data.get('badge', '').strip()
    has_ice_hot = 1 if data.get('has_ice_hot', True) else 0
    has_sugar_level = 1 if data.get('has_sugar_level', True) else 0
    is_available = 1 if data.get('is_available', True) else 0
    options_json = data.get('options_json') or '[]'
    if isinstance(options_json, list):
        options_json = json.dumps(options_json)

    if not name or price is None or category_id is None:
        return jsonify({'error': 'Nama menu, harga, dan kategori wajib diisi.'}), 400

    try:
        price = int(price)
        category_id = int(category_id)
    except (ValueError, TypeError):
        return jsonify({'error': 'Harga dan kategori harus berupa angka.'}), 400

    if not image_url:
        image_url = 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&auto=format&fit=crop&q=80'

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO menu_items (
            category_id, name, description, price, image_url,
            is_available, is_recommended, badge, has_ice_hot, has_sugar_level, options_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (category_id, name, description, price, image_url, is_available, 1 if badge else 0, badge, has_ice_hot, has_sugar_level, options_json))
    
    item_id = cursor.lastrowid
    conn.commit()
    conn.close()

    broadcast_event('menu_updated', {'action': 'item_created', 'id': item_id, 'name': name})
    return jsonify({'success': True, 'id': item_id})

@app.route('/api/pos/menu/items/<int:item_id>', methods=['PUT'])
@admin_required
def update_menu_item(item_id):
    """Update an existing menu item"""
    data = request.json or {}
    name = data.get('name', '').strip()
    category_id = data.get('category_id')
    price = data.get('price')
    description = data.get('description', '').strip()
    image_url = data.get('image_url', '').strip()
    badge = data.get('badge', '').strip()
    has_ice_hot = 1 if data.get('has_ice_hot', True) else 0
    has_sugar_level = 1 if data.get('has_sugar_level', True) else 0
    is_available = 1 if data.get('is_available', True) else 0

    if not name or price is None or category_id is None:
        return jsonify({'error': 'Nama menu, harga, dan kategori wajib diisi.'}), 400

    try:
        price = int(price)
        category_id = int(category_id)
    except (ValueError, TypeError):
        return jsonify({'error': 'Harga dan kategori harus berupa angka.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, image_url FROM menu_items WHERE id = ?", (item_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return jsonify({'error': 'Menu tidak ditemukan.'}), 404

    if not image_url:
        image_url = existing['image_url'] or 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&auto=format&fit=crop&q=80'

    cursor.execute('''
        UPDATE menu_items SET
            category_id = ?,
            name = ?,
            description = ?,
            price = ?,
            image_url = ?,
            is_available = ?,
            is_recommended = ?,
            badge = ?,
            has_ice_hot = ?,
            has_sugar_level = ?
        WHERE id = ?
    ''', (category_id, name, description, price, image_url, is_available, 1 if badge else 0, badge, has_ice_hot, has_sugar_level, item_id))
    
    conn.commit()
    conn.close()

    broadcast_event('menu_updated', {'action': 'item_updated', 'id': item_id, 'name': name})
    return jsonify({'success': True})

@app.route('/api/pos/menu/items/<int:item_id>', methods=['DELETE'])
@admin_required
def delete_menu_item(item_id):
    """Delete a menu item"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM menu_items WHERE id = ?", (item_id,))
    item = cursor.fetchone()
    if not item:
        conn.close()
        return jsonify({'error': 'Menu tidak ditemukan.'}), 404

    cursor.execute("DELETE FROM menu_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

    broadcast_event('menu_updated', {'action': 'item_deleted', 'id': item_id, 'name': item['name']})
    return jsonify({'success': True})

@app.route('/api/pos/waiter-calls', methods=['GET'])
def get_waiter_calls():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM waiter_calls WHERE status = 'PENDING' ORDER BY id DESC")
    calls = [dict(c) for c in cursor.fetchall()]
    conn.close()
    return jsonify(calls)

@app.route('/api/pos/waiter-calls/<int:call_id>/resolve', methods=['POST'])
def resolve_waiter_call(call_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE waiter_calls SET status = 'RESOLVED' WHERE id = ?", (call_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ================= MONTHLY REPORTS & EXCEL EXPORT APIS =================
@app.route('/api/pos/reports/monthly', methods=['GET'])
@admin_required
def get_monthly_report():
    """Monthly & Custom date range analytics"""
    month = request.args.get('month')
    year = request.args.get('year')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    now = datetime.now()
    if month and year:
        date_filter = f"strftime('%Y-%m', created_at) = '{year}-{int(month):02d}'"
    elif start_date and end_date:
        date_filter = f"DATE(created_at) BETWEEN '{start_date}' AND '{end_date}'"
    else:
        current_m = now.strftime('%Y-%m')
        date_filter = f"strftime('%Y-%m', created_at) = '{current_m}'"

    conn = get_db_connection()
    cursor = conn.cursor()

    # KPI summary
    cursor.execute(f'''
        SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as paid_revenue,
            COALESCE(SUM(total_amount), 0) as total_volume,
            COALESCE(SUM(CASE WHEN payment_method = 'QRIS' AND payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as qris_revenue,
            COALESCE(SUM(CASE WHEN payment_method = 'TUNAI_KASIR' AND payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as cash_revenue,
            COALESCE(SUM(discount), 0) as total_discount
        FROM orders 
        WHERE {date_filter} AND order_status != 'CANCELLED'
    ''')
    stats = dict(cursor.fetchone())

    # Daily breakdown
    cursor.execute(f'''
        SELECT 
            DATE(created_at) as order_date,
            COUNT(*) as count_orders,
            COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as daily_revenue,
            COALESCE(SUM(CASE WHEN payment_method = 'QRIS' AND payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as daily_qris,
            COALESCE(SUM(CASE WHEN payment_method != 'QRIS' AND payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as daily_cash
        FROM orders 
        WHERE {date_filter} AND order_status != 'CANCELLED'
        GROUP BY DATE(created_at)
        ORDER BY order_date ASC
    ''')
    stats['daily_breakdown'] = [dict(r) for r in cursor.fetchall()]

    # Top selling items
    cursor.execute(f'''
        SELECT oi.name, SUM(oi.quantity) as total_sold, SUM(oi.subtotal) as total_revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE {date_filter} AND o.order_status != 'CANCELLED'
        GROUP BY oi.name
        ORDER BY total_sold DESC
        LIMIT 10
    ''')
    stats['top_items'] = [dict(row) for row in cursor.fetchall()]

    # All menu items sales tracking for the month (Every single menu item!)
    cursor.execute(f'''
        SELECT 
            mi.id,
            mi.name,
            COALESCE(c.name, 'Lainnya') as category_name,
            mi.price,
            mi.image_url,
            COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.order_status != 'CANCELLED' THEN oi.quantity ELSE 0 END), 0) as total_sold,
            COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.order_status != 'CANCELLED' THEN oi.subtotal ELSE 0 END), 0) as total_revenue
        FROM menu_items mi
        LEFT JOIN categories c ON c.id = mi.category_id
        LEFT JOIN order_items oi ON (oi.menu_item_id = mi.id OR oi.name = mi.name)
        LEFT JOIN orders o ON o.id = oi.order_id AND {date_filter}
        GROUP BY mi.id, mi.name, c.name, mi.price, mi.image_url
        ORDER BY total_sold DESC, mi.name ASC
    ''')
    stats['all_menu_sales'] = [dict(row) for row in cursor.fetchall()]
    stats['total_items_sold_count'] = sum(r['total_sold'] for r in stats['all_menu_sales'])

    # All transactions in range
    cursor.execute(f'''
        SELECT * FROM orders 
        WHERE {date_filter}
        ORDER BY id DESC LIMIT 200
    ''')
    recent = []
    for r in cursor.fetchall():
        ord_d = dict(r)
        cursor.execute("SELECT name, quantity, subtotal FROM order_items WHERE order_id = ?", (ord_d['id'],))
        ord_d['items'] = [dict(it) for it in cursor.fetchall()]
        recent.append(ord_d)
    stats['transactions'] = recent

    conn.close()
    return jsonify(stats)

@app.route('/api/pos/reports/export-excel', methods=['GET'])
@admin_required
def export_excel():
    """Download professionally formatted Excel report (.xlsx)"""
    month = request.args.get('month')
    year = request.args.get('year')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    now = datetime.now()
    if month and year:
        filename = f"Laporan_Kedai_Tedhuh_{year}_{int(month):02d}.xlsx"
    elif start_date and end_date:
        filename = f"Laporan_Kedai_Tedhuh_{start_date}_sd_{end_date}.xlsx"
    else:
        filename = f"Laporan_Kedai_Tedhuh_{now.strftime('%Y_%m')}.xlsx"

    excel_buffer = generate_monthly_excel(start_date=start_date, end_date=end_date, month=month, year=year)

    return send_file(
        excel_buffer,
        as_attachment=True,
        download_name=filename,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

if __name__ == '__main__':
    print("==================================================")
    print("       KEDAI TEDHUH - SISTEM PEMESANAN & POS     ")
    print("==================================================")
    print(" * Halaman Pemesanan Pelanggan : http://127.0.0.1:5000/")
    print(" * Contoh Scan Meja 03        : http://127.0.0.1:5000/?meja=03")
    print(" * Aplikasi Kasir & POS        : http://127.0.0.1:5000/kasir")
    print(" * Cetak QR Code Meja         : http://127.0.0.1:5000/kasir/cetak-qr")
    print("==================================================")
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
