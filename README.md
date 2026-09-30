# 🌿 Kedai Tedhuh - Sistem Pemesanan Online & Aplikasi Kasir (POS) All-in-One

Aplikasi modern terintegrasi untuk **Kedai Tedhuh** yang menghubungkan website pemesanan pelanggan (QR Code Meja / Dine-in / Takeaway) secara langsung dan real-time ke sistem POS Kasir & Barista Kitchen Display.

---

## 🚀 Fitur Utama

### 📱 1. Website Pemesanan Pelanggan (`/` atau `/?meja=03`)
* **Deteksi Nomor Meja Otomatis via QR Code**: Pelanggan cukup scan QR di stand meja untuk langsung masuk ke menu dengan nomor meja yang terkunci secara otomatis.
* **Kategori & Pencarian Instan**: Signature Tedhuh, Espresso & Klasik, Non-Kopi & Teh, Makanan Utama, Camilan & Pastry, Mocktail Segar.
* **Kustomisasi Minuman & Makanan**:
  * Pilihan Suhu: Dingin (Ice) / Panas (Hot).
  * Tingkat Manis: Normal / Less Sugar (50%) / No Sugar (0%).
  * Add-on Tambahan: Extra Shot Espresso, Ganti Susu Oat, Topping Grass Jelly/Ice Cream.
  * Catatan Khusus Dapur: Misal "jangan terlalu manis", "es dipisah".
* **Keranjang Interaktif & Checkout**:
  * Pilihan metode bayar: **QRIS** (Dukung BCA, GoPay, OVO, Dana, Livin) atau **Bayar di Kasir (Tunai)**.
* **Pelacakan Status Pesanan Real-time (Live Order Tracking)**:
  * Pelanggan dapat memantau proses pesanan dari HP: *Terkirim ➜ Sedang Diracik Barista ➜ Siap Diantar ke Meja ➜ Selesai*.
* **Fitur Panggil Pelayan (Call Waiter)**:
  * Tombol 1 klik untuk memanggil waiter ke nomor meja pelanggan jika butuh bantuan.

---

### 🖥️ 2. Aplikasi Kasir & Barista Display (`/kasir`)
* **Live Orders Queue & Kitchen Display (KDS)**:
  * Suara bel kafe otomatis (**Ding-dong!**) saat ada pesanan baru masuk dari meja pelanggan.
  * Kolom status Kanban: *Pesanan Baru (Pending)* ➜ *Sedang Diracik (Cooking)* ➜ *Siap Disajikan (Ready)* ➜ *Selesai*.
  * Tombol satu klik: **Terima & Buat**, **Siap Saji**, **Selesai & Lunas**, atau **Tolak**.
* **Cetak Struk Thermal Instan (58mm / 80mm)**:
  * Format struk kafe profesional siap cetak ke printer kasir thermal bluetooth/USB via browser.
* **Kasir Walk-In (POS Cepat di Meja Kasir)**:
  * Layar sentuh/desktop untuk melayani pembeli yang langsung datang ke meja kasir.
  * Tombol hitung kembalian cepat (pecahan Rp 20k, 50k, 100k, dan Uang Pas).
* **Denah Meja (Table Map)**:
  * Status visual 12 meja (Meja Kosong / Meja Terisi dengan detail pesanan aktif).
* **Kelola Stok & Menu (Quick Out-of-Stock)**:
  * Saklar cepat untuk mematikan/menghidupkan menu yang habis. Jika dimatikan di kasir, menu langsung otomatis bertanda *Habis Terjual* di HP pelanggan secara real-time.
* **Autentikasi Multi-User & PIN Cepat**:
  * Login cepat via PIN 4-digit (Admin: `1234`, Kasir: `1111`, Barista: `2222`).
  * Nama kasir bertugas otomatis tercatat di pesanan dan tercetak di struk thermal.
  * Tab Kelola Staff untuk menambah dan mengatur hak akses akun.
* **Laporan Penjualan Bulanan & Rekap Semua Menu Terjual**:
  * Pilihan filter per Bulan & Tahun.
  * **Tabel Rekap Penjualan Semua Menu**: Menampilkan seluruh menu kafe lengkap dengan jumlah porsi/cup yang terjual dalam bulan tersebut dan total omsetnya, dengan filter kategori dan pencarian instan.
  * Metrik omset bersih, total transaksi, total porsi terjual, dan rasio QRIS vs Tunai.
* **Ekspor Laporan Bulanan ke Excel (.xlsx)**:
  * Unduh file Excel profesional dengan 3 lembar kerja (*Ringkasan Bulanan*, *Daftar Transaksi*, dan *Performa Menu Terjual*) lengkap dengan formula `=SUM()`.
* **Cetak Kartu QR Stand Meja (`/kasir/cetak-qr`)**:
  * Halaman siap cetak kartu QR Code meja (Meja 01 s/d Meja 12) dengan logo Kedai Tedhuh dan info WiFi, siap dilaminasi atau diletakkan di stand akrilik meja.

---

## 🛠️ Cara Menjalankan Aplikasi di Laptop Baru

### Syarat Awal (Prasyarat):
1. **Python 3.10+**: Pastikan Python sudah terpasang.
   > ⚠️ **PENTING**: Saat menginstall Python, **wajib centang kotak "Add Python to PATH"** (atau "Add python.exe to PATH") di jendela instalasi pertama!
2. **Library Pendukung**: Sudah disediakan file `requirements.txt`.

---

### Cara 1: Menggunakan File Batch (Otomatis & Paling Praktis)
Cukup klik ganda (double-click) file:
```
run_server.bat
```
*Script ini sudah otomatis mendeteksi Python, menginstall library yang kurang (`pip install -r requirements.txt`), dan langsung menyalakan server.*

---

### Cara 2: Melalui Terminal / Command Prompt Manual
1. Buka folder `heima-cafe` di File Explorer.
2. Klik Address Bar di bagian atas File Explorer, ketik `cmd` lalu tekan **Enter**.
3. Install library yang dibutuhkan (cukup sekali di awal):
   ```bash
   pip install -r requirements.txt
   ```
4. Jalankan server:
   ```bash
   python app.py
   ```
   *(atau `py app.py` jika perintah python tidak terbaca)*
5. Buka browser:
   * **Halaman Pelanggan (QR Menu)**: [http://localhost:5000/](http://localhost:5000/)
   * **Contoh Scan Meja 03**: [http://localhost:5000/?meja=03](http://localhost:5000/?meja=03)
   * **Aplikasi Kasir POS**: [http://localhost:5000/kasir](http://localhost:5000/kasir)
   * **Cetak Kartu Stand QR Meja**: [http://localhost:5000/kasir/cetak-qr](http://localhost:5000/kasir/cetak-qr)

---

### ❓ Troubleshooting Jika Muncul Error di Laptop Lain:
1. **`'python' is not recognized as an internal or external command`**:
   - Python belum terinstall atau lupa mencentang *"Add Python to PATH"*.
   - Solusi: Unduh installer dari [python.org](https://www.python.org/downloads/), jalankan installer, pilih *Modify* atau install ulang, dan pastikan centang opsi **Add Python to PATH**. Coba juga jalankan dengan `py app.py`.
2. **`ModuleNotFoundError: No module named 'flask'`**:
   - Library belum dipasang di laptop tersebut.
   - Solusi: Jalankan `pip install -r requirements.txt` di terminal.
3. **`python: can't open file 'app.py': [Errno 2] No such file or directory`**:
   - Terminal dibuka di folder yang salah (misal di `C:\Users\NamaUser`).
   - Solusi: Buka folder `heima-cafe` dulu di File Explorer, klik address bar, ketik `cmd`, lalu ketik `python app.py`.
4. **`OSError: [WinError 10048] Only one usage of each socket address...`**:
   - Port 5000 sedang dipakai oleh aplikasi lain atau jendela server lama belum ditutup.
   - Solusi: Tutup jendela terminal server lama, lalu jalankan kembali.

---

## 📲 Cara Akses dari Smartphone Pelanggan di Kedai
1. Hubungkan HP pelanggan dan komputer/laptop kasir ke jaringan **WiFi yang sama**.
2. Cek alamat IP lokal komputer kasir (buka PowerShell lalu ketik `ipconfig`, cari IPv4 Address, misalnya `192.168.1.15`).
3. Pada halaman Cetak QR (`/kasir/cetak-qr`), masukkan IP tersebut ke kolom Base URL:
   `http://192.168.1.15:5000`
4. Cetak kartu QR meja. Ketika pelanggan mengarahkan kamera HP ke QR Code Meja 3, HP pelanggan langsung membuka `http://192.168.1.15:5000/?meja=Meja%2003` dan siap memesan!

---

## 📁 Struktur Berkas

```
heima-cafe/
├── app.py                   # Server Flask utama (REST API, SSE Real-time, Route)
├── database.py              # Skema database SQLite & helper koneksi
├── seed_data.py             # Data awal menu, 12 meja, dan profil Kedai Tedhuh
├── test_system.py           # Skrip pengujian otomatis (10/10 test case)
├── run_server.bat           # Peluncur satu-klik untuk Windows
├── kedai_tedhuh.db          # Database lokal SQLite
├── static/
│   ├── css/
│   │   └── style.css        # Desain tema Kedai Tedhuh & format cetak struk thermal
│   └── js/
│       ├── chime.js         # Generator audio Web Audio API (bel notifikasi kasir)
│       ├── customer.js      # Logika pemesanan pelanggan & tracking status
│       └── cashier.js       # Logika aplikasi POS kasir & dapur
└── templates/
    ├── index.html           # Tampilan website pemesanan pelanggan (Mobile-first)
    ├── cashier.html         # Tampilan aplikasi kasir POS & Kitchen Display
    ├── qr_codes.html        # Halaman cetak kartu QR Code stand meja
    └── receipt.html         # Template cetak struk thermal 58mm/80mm
```
