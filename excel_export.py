import io
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from datetime import datetime
from database import get_db_connection

def generate_monthly_excel(start_date=None, end_date=None, month=None, year=None):
    """
    Generate professional styled Excel report (.xlsx) for Kedai Tedhuh
    Returns BytesIO object containing binary excel data
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Determine date range
    now = datetime.now()
    if month and year:
        period_label = f"Bulan {int(month):02d} - Tahun {year}"
        date_filter = f"strftime('%Y-%m', created_at) = '{year}-{int(month):02d}'"
    elif start_date and end_date:
        period_label = f"Periode: {start_date} s/d {end_date}"
        date_filter = f"DATE(created_at) BETWEEN '{start_date}' AND '{end_date}'"
    else:
        current_m = now.strftime('%Y-%m')
        period_label = f"Bulan {now.strftime('%B %Y')}"
        date_filter = f"strftime('%Y-%m', created_at) = '{current_m}'"

    # Query 1: Summary KPI
    cursor.execute(f'''
        SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as paid_revenue,
            COALESCE(SUM(CASE WHEN payment_method = 'QRIS' AND payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as qris_revenue,
            COALESCE(SUM(CASE WHEN payment_method = 'TUNAI_KASIR' AND payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as cash_revenue,
            COALESCE(SUM(CASE WHEN payment_method NOT IN ('QRIS', 'TUNAI_KASIR') AND payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as other_revenue,
            COALESCE(SUM(discount), 0) as total_discount
        FROM orders 
        WHERE {date_filter} AND order_status != 'CANCELLED'
    ''')
    summary = dict(cursor.fetchone())

    # Query 2: Daily Sales Breakdown
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
    daily_records = [dict(r) for r in cursor.fetchall()]

    # Query 3: All Transactions
    cursor.execute(f'''
        SELECT 
            id, order_number, table_number, customer_name, cashier_name,
            order_type, subtotal, discount, total_amount, payment_method,
            payment_status, order_status, created_at
        FROM orders 
        WHERE {date_filter}
        ORDER BY id DESC
    ''')
    orders = [dict(o) for o in cursor.fetchall()]

    # Load items for each order
    for o in orders:
        cursor.execute("SELECT name, quantity, price, subtotal FROM order_items WHERE order_id = ?", (o['id'],))
        o_items = cursor.fetchall()
        o['items_summary'] = ", ".join([f"{it['quantity']}x {it['name']}" for it in o_items])

    # Query 4: All Menu Items Sales & Performance (Every single menu item!)
    cursor.execute(f'''
        SELECT 
            mi.name, 
            COALESCE(c.name, 'Lainnya') as category_name,
            mi.price as unit_price,
            COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.order_status != 'CANCELLED' THEN oi.quantity ELSE 0 END), 0) as total_qty, 
            COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.order_status != 'CANCELLED' THEN oi.subtotal ELSE 0 END), 0) as total_revenue
        FROM menu_items mi
        LEFT JOIN categories c ON c.id = mi.category_id
        LEFT JOIN order_items oi ON (oi.menu_item_id = mi.id OR oi.name = mi.name)
        LEFT JOIN orders o ON o.id = oi.order_id AND {date_filter}
        GROUP BY mi.id, mi.name, c.name, mi.price
        ORDER BY total_qty DESC, mi.name ASC
    ''')
    product_records = [dict(p) for p in cursor.fetchall()]

    conn.close()

    # ---------------- BUILD WORKBOOK ----------------
    wb = openpyxl.Workbook()
    # Remove default sheet
    wb.remove(wb.active)

    # Styles
    font_title = Font(name="Calibri", size=16, bold=True, color="1E3F36")
    font_subtitle = Font(name="Calibri", size=11, italic=True, color="555555")
    font_section = Font(name="Calibri", size=12, bold=True, color="1E3F36")
    font_header = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    font_bold = Font(name="Calibri", size=11, bold=True)
    font_regular = Font(name="Calibri", size=11)
    
    fill_primary = PatternFill(start_color="1E3F36", end_color="1E3F36", fill_type="solid")
    fill_accent = PatternFill(start_color="C86D51", end_color="C86D51", fill_type="solid")
    fill_zebra = PatternFill(start_color="F8F6F0", end_color="F8F6F0", fill_type="solid")
    fill_kpi = PatternFill(start_color="EAE5DC", end_color="EAE5DC", fill_type="solid")
    
    thin_border_side = Side(border_style="thin", color="CCCCCC")
    border_all = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)
    double_bottom = Border(bottom=Side(border_style="double", color="1E3F36"), top=thin_border_side)

    currency_format = '"Rp "#,##0'

    # ================= SHEET 1: RINGKASAN EKSEKUTIF =================
    ws1 = wb.create_sheet(title="Ringkasan Bulanan")
    ws1.views.sheetView[0].showGridLines = True

    # Title Block
    ws1["A1"] = "KEDAI TEDHUH - LAPORAN KEUANGAN & PENJUALAN"
    ws1["A1"].font = font_title
    ws1["A2"] = f"{period_label} | Dicetak pada: {now.strftime('%d-%m-%Y %H:%M')}"
    ws1["A2"].font = font_subtitle

    # KPI Summary Cards (Rows 4-7)
    ws1["A4"] = "RINGKASAN KINERJA (KPI)"
    ws1["A4"].font = font_section

    kpis = [
        ("Total Omset (Lunas)", summary['paid_revenue'], currency_format),
        ("Total Transaksi", summary['total_orders'], '#,##0" Nota"'),
        ("Pendapatan QRIS", summary['qris_revenue'], currency_format),
        ("Pendapatan Tunai", summary['cash_revenue'], currency_format),
        ("Total Potongan Diskon", summary['total_discount'], currency_format),
    ]

    row_kpi = 5
    for label, val, num_fmt in kpis:
        ws1.cell(row=row_kpi, column=1, value=label).font = font_bold
        ws1.cell(row=row_kpi, column=1).fill = fill_kpi
        ws1.cell(row=row_kpi, column=1).border = border_all
        
        cell_val = ws1.cell(row=row_kpi, column=2, value=val)
        cell_val.font = font_bold
        cell_val.number_format = num_fmt
        cell_val.border = border_all
        cell_val.alignment = Alignment(horizontal="right")
        row_kpi += 1

    # Daily Breakdown Table (Row 12+)
    row_daily = row_kpi + 2
    ws1.cell(row=row_daily, column=1, value="REKAP PENJUALAN HARIAN").font = font_section
    row_daily += 1

    headers_daily = ["Tanggal", "Jumlah Transaksi", "Omset QRIS", "Omset Tunai", "Total Pendapatan"]
    for col_idx, h in enumerate(headers_daily, 1):
        c = ws1.cell(row=row_daily, column=col_idx, value=h)
        c.font = font_header
        c.fill = fill_primary
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = border_all
    
    start_daily_row = row_daily + 1
    current_row = start_daily_row
    for r in daily_records:
        ws1.cell(row=current_row, column=1, value=r['order_date']).alignment = Alignment(horizontal="center")
        ws1.cell(row=current_row, column=2, value=r['count_orders']).alignment = Alignment(horizontal="center")
        
        c3 = ws1.cell(row=current_row, column=3, value=r['daily_qris'])
        c3.number_format = currency_format
        
        c4 = ws1.cell(row=current_row, column=4, value=r['daily_cash'])
        c4.number_format = currency_format

        c5 = ws1.cell(row=current_row, column=5, value=r['daily_revenue'])
        c5.number_format = currency_format

        for col_idx in range(1, 6):
            cell = ws1.cell(row=current_row, column=col_idx)
            cell.font = font_regular
            cell.border = border_all
            if current_row % 2 == 0:
                cell.fill = fill_zebra
        current_row += 1

    # Total Row for Daily Table
    if daily_records:
        ws1.cell(row=current_row, column=1, value="TOTAL").font = font_bold
        ws1.cell(row=current_row, column=1).alignment = Alignment(horizontal="center")
        ws1.cell(row=current_row, column=2, value=f"=SUM(B{start_daily_row}:B{current_row-1})").font = font_bold
        ws1.cell(row=current_row, column=3, value=f"=SUM(C{start_daily_row}:C{current_row-1})").font = font_bold
        ws1.cell(row=current_row, column=3).number_format = currency_format
        ws1.cell(row=current_row, column=4, value=f"=SUM(D{start_daily_row}:D{current_row-1})").font = font_bold
        ws1.cell(row=current_row, column=4).number_format = currency_format
        ws1.cell(row=current_row, column=5, value=f"=SUM(E{start_daily_row}:E{current_row-1})").font = font_bold
        ws1.cell(row=current_row, column=5).number_format = currency_format

        for col_idx in range(1, 6):
            ws1.cell(row=current_row, column=col_idx).border = double_bottom

    # ================= SHEET 2: DETAIL TRANSAKSI =================
    ws2 = wb.create_sheet(title="Daftar Transaksi")
    ws2.views.sheetView[0].showGridLines = True

    ws2["A1"] = "DAFTAR TRANSAKSI LENGKAP"
    ws2["A1"].font = font_title
    ws2["A2"] = f"{period_label} | Total: {len(orders)} Transaksi"
    ws2["A2"].font = font_subtitle

    headers_tx = [
        "No", "No Nota", "Waktu Transaksi", "Staff Kasir", "Meja / Tipe", 
        "Nama Pelanggan", "Menu yang Dipesan", "Subtotal", "Diskon", 
        "Total Akhir", "Metode Bayar", "Status Bayar", "Status Pesanan"
    ]
    
    header_row_tx = 4
    for col_idx, h in enumerate(headers_tx, 1):
        c = ws2.cell(row=header_row_tx, column=col_idx, value=h)
        c.font = font_header
        c.fill = fill_primary
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = border_all

    curr_tx_row = header_row_tx + 1
    start_tx_row = curr_tx_row
    for idx, o in enumerate(orders, 1):
        ws2.cell(row=curr_tx_row, column=1, value=idx).alignment = Alignment(horizontal="center")
        ws2.cell(row=curr_tx_row, column=2, value=o['order_number']).alignment = Alignment(horizontal="center")
        ws2.cell(row=curr_tx_row, column=3, value=str(o['created_at'])).alignment = Alignment(horizontal="center")
        ws2.cell(row=curr_tx_row, column=4, value=o.get('cashier_name') or 'Staff Kasir')
        ws2.cell(row=curr_tx_row, column=5, value=f"{o['table_number']} ({o['order_type']})")
        ws2.cell(row=curr_tx_row, column=6, value=o['customer_name'])
        ws2.cell(row=curr_tx_row, column=7, value=o.get('items_summary', ''))
        
        c_sub = ws2.cell(row=curr_tx_row, column=8, value=o['subtotal'])
        c_sub.number_format = currency_format
        
        c_disc = ws2.cell(row=curr_tx_row, column=9, value=o['discount'])
        c_disc.number_format = currency_format

        c_tot = ws2.cell(row=curr_tx_row, column=10, value=o['total_amount'])
        c_tot.number_format = currency_format
        c_tot.font = font_bold

        ws2.cell(row=curr_tx_row, column=11, value=o['payment_method']).alignment = Alignment(horizontal="center")
        ws2.cell(row=curr_tx_row, column=12, value=o['payment_status']).alignment = Alignment(horizontal="center")
        ws2.cell(row=curr_tx_row, column=13, value=o['order_status']).alignment = Alignment(horizontal="center")

        for col_idx in range(1, len(headers_tx) + 1):
            cell = ws2.cell(row=curr_tx_row, column=col_idx)
            cell.font = font_regular if col_idx != 10 else font_bold
            cell.border = border_all
            if curr_tx_row % 2 == 0:
                cell.fill = fill_zebra
        curr_tx_row += 1

    # Summary Row for Transactions
    if orders:
        ws2.cell(row=curr_tx_row, column=1, value="TOTAL").font = font_bold
        ws2.cell(row=curr_tx_row, column=1).alignment = Alignment(horizontal="center")
        ws2.cell(row=curr_tx_row, column=8, value=f"=SUM(H{start_tx_row}:H{curr_tx_row-1})").font = font_bold
        ws2.cell(row=curr_tx_row, column=8).number_format = currency_format
        ws2.cell(row=curr_tx_row, column=9, value=f"=SUM(I{start_tx_row}:I{curr_tx_row-1})").font = font_bold
        ws2.cell(row=curr_tx_row, column=9).number_format = currency_format
        ws2.cell(row=curr_tx_row, column=10, value=f"=SUM(J{start_tx_row}:J{curr_tx_row-1})").font = font_bold
        ws2.cell(row=curr_tx_row, column=10).number_format = currency_format

        for col_idx in range(1, len(headers_tx) + 1):
            ws2.cell(row=curr_tx_row, column=col_idx).border = double_bottom

    # ================= SHEET 3: PERFORMA MENU =================
    ws3 = wb.create_sheet(title="Performa Menu")
    ws3.views.sheetView[0].showGridLines = True

    ws3["A1"] = "REKAP PENJUALAN SEMUA MENU PER BULAN"
    ws3["A1"].font = font_title
    ws3["A2"] = f"{period_label} | Total {len(product_records)} Menu Terdaftar (Diurutkan dari Penjualan Tertinggi)"
    ws3["A2"].font = font_subtitle

    headers_prod = ["No", "Nama Menu", "Kategori", "Harga Satuan", "Total Porsi Terjual", "Total Omset Produk", "Status Penjualan"]
    header_row_p = 4
    for col_idx, h in enumerate(headers_prod, 1):
        c = ws3.cell(row=header_row_p, column=col_idx, value=h)
        c.font = font_header
        c.fill = fill_accent
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = border_all

    curr_p_row = header_row_p + 1
    start_p_row = curr_p_row
    for idx, p in enumerate(product_records, 1):
        ws3.cell(row=curr_p_row, column=1, value=idx).alignment = Alignment(horizontal="center")
        ws3.cell(row=curr_p_row, column=2, value=p['name']).font = font_bold
        ws3.cell(row=curr_p_row, column=3, value=p.get('category_name') or 'Menu')
        
        c_unit = ws3.cell(row=curr_p_row, column=4, value=p['unit_price'])
        c_unit.number_format = currency_format

        c_qty = ws3.cell(row=curr_p_row, column=5, value=p['total_qty'])
        c_qty.alignment = Alignment(horizontal="center")
        c_qty.font = font_bold

        c_rev = ws3.cell(row=curr_p_row, column=6, value=p['total_revenue'])
        c_rev.number_format = currency_format
        c_rev.font = font_bold

        status_text = "Sangat Laris" if p['total_qty'] >= 10 else ("Terjual" if p['total_qty'] > 0 else "Belum Ada Penjualan")
        c_status = ws3.cell(row=curr_p_row, column=7, value=status_text)
        c_status.alignment = Alignment(horizontal="center")
        if p['total_qty'] == 0:
            c_status.font = font_subtitle

        for col_idx in range(1, len(headers_prod) + 1):
            cell = ws3.cell(row=curr_p_row, column=col_idx)
            cell.border = border_all
            if curr_p_row % 2 == 0:
                cell.fill = fill_zebra
        curr_p_row += 1

    if product_records:
        ws3.cell(row=curr_p_row, column=1, value="TOTAL").font = font_bold
        ws3.cell(row=curr_p_row, column=1).alignment = Alignment(horizontal="center")
        ws3.cell(row=curr_p_row, column=5, value=f"=SUM(E{start_p_row}:E{curr_p_row-1})").font = font_bold
        ws3.cell(row=curr_p_row, column=6, value=f"=SUM(F{start_p_row}:F{curr_p_row-1})").font = font_bold
        ws3.cell(row=curr_p_row, column=6).number_format = currency_format

        for col_idx in range(1, len(headers_prod) + 1):
            ws3.cell(row=curr_p_row, column=col_idx).border = double_bottom

    # ---------------- AUTO-FIT COLUMN WIDTHS ----------------
    for sheet in [ws1, ws2, ws3]:
        for col in sheet.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val = str(cell.value or '')
                if len(val) > max_len and not str(cell.value or '').startswith('='):
                    max_len = len(val)
            sheet.column_dimensions[col_letter].width = max(max_len + 3, 12)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output
