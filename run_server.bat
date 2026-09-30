@echo off
setlocal enabledelayedexpansion
title Kedai Tedhuh - Server Pemesanan & POS Kasir

:: 1. Pindah ke direktori tempat file bat ini berada
cd /d "%~dp0"

echo ========================================================
echo       KEDAI TEDHUH - SISTEM PEMESANAN & KASIR POS        
echo ========================================================
echo.

:: 2. Cek apakah Python terpasang di sistem
set PY_CMD=python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    py --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] Python tidak terdeteksi di laptop ini!
        echo.
        echo Kemungkinan penyebab:
        echo 1. Python belum di-install di laptop ini.
        echo    Silakan unduh dari: https://www.python.org/downloads/
        echo 2. Python sudah di-install, tetapi lupa dicentang "Add Python to PATH".
        echo    Silakan install ulang Python dan pastikan mencentang "Add Python to PATH".
        echo.
        echo ========================================================
        pause
        exit /b 1
    ) else (
        set PY_CMD=py
    )
)

echo [OK] Python terdeteksi: 
%PY_CMD% --version
echo.

:: 3. Cek apakah library yang dibutuhkan sudah terpasang
echo Memeriksa library pendukung (Flask, Flask-CORS, OpenPyXL)...
%PY_CMD% -c "import flask, flask_cors, openpyxl" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Ada library yang belum terpasang. Menginstall otomatis...
    echo Sedang menjalankan: %PY_CMD% -m pip install -r requirements.txt
    echo.
    %PY_CMD% -m pip install -r requirements.txt
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] Gagal menginstall library otomatis!
        echo Pastikan laptop terhubung ke internet dan coba jalankan:
        echo   pip install -r requirements.txt
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Semua library berhasil dipasang!
) else (
    echo [OK] Semua library lengkap dan siap!
)

echo.
echo ========================================================
echo Memulai Server Kedai Tedhuh...
echo ========================================================
echo.
echo Akses URL di Browser Laptop Kasir:
echo  - Halaman Pemesanan Pelanggan : http://localhost:5000/
echo  - Contoh Scan QR Meja 03      : http://localhost:5000/?meja=03
echo  - Aplikasi Kasir & POS        : http://localhost:5000/kasir
echo  - Cetak Kartu Stand QR Meja   : http://localhost:5000/kasir/cetak-qr
echo.
echo Tips Agar HP Pelanggan Bisa Scan QR:
echo  1. Sambungkan HP dan Laptop ke WiFi yang sama.
echo  2. Buka IP Laptop di HP (contoh: http://192.168.1.X:5000/?meja=01)
echo.
echo Tekan Ctrl+C di jendela ini untuk menghentikan server.
echo ========================================================
echo.

:: 4. Jalankan aplikasi Flask
%PY_CMD% app.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server berhenti secara tidak normal (Error code: %errorlevel%).
    echo Silakan periksa pesan error di atas (misal: Port 5000 sedang dipakai).
)

pause
