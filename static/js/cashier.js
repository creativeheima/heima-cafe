/**
 * KEDAI TEDHUH - CASHIER & KITCHEN POS LOGIC
 * With User Auth, Staff Management, and Monthly Excel Reports
 */

const CashierApp = {
  data: {
    activeTab: 'live-orders', // 'live-orders', 'walk-in', 'tables', 'stock', 'reports', 'users'
    currentUser: null,
    orders: [],
    categories: [],
    menuItems: [],
    tables: [],
    settings: {},
    usersList: [],
    // Walk-in POS
    walkInCart: [],
    walkInTable: 'Meja 01',
    walkInCustomer: 'Pelanggan Walk-In',
    walkInPayment: 'TUNAI_KASIR',
    walkInCashGiven: 0,
    walkInDiscount: 0,
    walkInDiscountType: 'rp', // 'rp' or 'percent'
    walkInDiscountPercent: 0,
    walkInNotes: '',
    selectedCategory: 'all',
    walkInViewMode: 'menu', // 'menu' or 'history'
    walkInHistoryFilter: 'all', // 'all', 'pending', 'today', 'takeaway'
    walkInHistorySearch: '',
    // Stock / Menu Management
    stockSearchQuery: '',
    stockSelectedCat: 'all',
    stockSelectedStatus: 'all',
    // Reports
    reportFilterMode: 'month', // 'today', 'month', 'custom'
    reportMonth: new Date().getMonth() + 1,
    reportYear: new Date().getFullYear(),
    reportStartDate: '',
    reportEndDate: '',
    monthlyStats: null,
    // System
    waiterCalls: [],
    sseSource: null,
    audioMuted: false,
    btDevice: null,
    btCharacteristic: null
  },

  async init() {
    this.initAudio();
    await this.checkAuth();
    await this.fetchData();
    this.initSSE();
    this.startPollingBackup();
    this.renderHeaderUser();
    this.renderActiveTab();
  },

  initAudio() {
    document.addEventListener('click', () => {
      if (window.cafeAudio) window.cafeAudio.init();
    }, { once: true });
  },

  toggleAudio() {
    this.data.audioMuted = !this.data.audioMuted;
    if (window.cafeAudio) window.cafeAudio.isMuted = this.data.audioMuted;
    const btn = document.getElementById('btn-audio-toggle');
    if (btn) {
      btn.innerHTML = this.data.audioMuted 
        ? `<span class="text-red-400">🔇 Mute</span>`
        : `<span class="text-emerald-400">🔔 Suara Bel</span>`;
    }
  },

  testSound() {
    if (window.cafeAudio) window.cafeAudio.playOrderBell();
  },

  // ================= AUTHENTICATION & USERS =================
  async checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.logged_in && data.user) {
        this.data.currentUser = data.user;
      } else {
        // Show login modal if not logged in
        this.openLoginModal();
      }
    } catch (e) {
      console.error(e);
    }
  },

  openLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      const pinInput = document.getElementById('login-pin-input');
      if (pinInput) {
        pinInput.value = '';
        setTimeout(() => pinInput.focus(), 150);
      }
      const errElem = document.getElementById('login-error-msg');
      if (errElem) errElem.classList.add('hidden');
    }
  },

  closeLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  appendLoginPin(digit) {
    const pinInput = document.getElementById('login-pin-input');
    if (!pinInput) return;
    if (pinInput.value.length < 6) {
      pinInput.value += digit;
      if (pinInput.value.length === 4) {
        setTimeout(() => this.submitLogin(), 200);
      }
    }
  },

  clearLoginPin() {
    const pinInput = document.getElementById('login-pin-input');
    if (pinInput) {
      pinInput.value = '';
      pinInput.focus();
    }
  },

  backspaceLoginPin() {
    const pinInput = document.getElementById('login-pin-input');
    if (pinInput && pinInput.value.length > 0) {
      pinInput.value = pinInput.value.slice(0, -1);
      pinInput.focus();
    }
  },

  async quickPinLogin(pin) {
    const pinInput = document.getElementById('login-pin-input');
    if (pinInput) pinInput.value = pin;
    await this.submitLogin();
  },

  async submitLogin() {
    const pin = (document.getElementById('login-pin-input')?.value || '').trim();
    const username = (document.getElementById('login-user-input')?.value || '').trim();
    const password = (document.getElementById('login-pass-input')?.value || '').trim();

    const payload = pin ? { pin } : { username, password };
    const errElem = document.getElementById('login-error-msg');
    if (errElem) errElem.classList.add('hidden');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success && data.user) {
        this.data.currentUser = data.user;
        this.closeLoginModal();
        this.renderHeaderUser();
        this.renderActiveTab();
        this.showToast(`Selamat bertugas, ${data.user.full_name}! 👋`);
      } else {
        if (errElem) {
          errElem.textContent = data.error || 'Login gagal. Periksa PIN atau akun Anda.';
          errElem.classList.remove('hidden');
        }
      }
    } catch (e) {
      alert('Terjadi kesalahan koneksi.');
    }
  },

  async logout() {
    if (!confirm('Apakah Anda ingin keluar dari sesi kasir?')) return;
    await fetch('/api/auth/logout', { method: 'POST' });
    this.data.currentUser = null;
    this.renderHeaderUser();
    this.switchTab('live-orders');
    this.openLoginModal();
  },

  renderHeaderUser() {
    const badge = document.getElementById('header-user-badge');
    const userTabBtn = document.getElementById('tab-btn-users');
    const stockTabBtn = document.getElementById('tab-btn-stock');
    const reportsTabBtn = document.getElementById('tab-btn-reports');
    if (!badge) return;

    const isAdmin = this.data.currentUser && this.data.currentUser.role === 'admin';

    // Show/hide Admin-only tabs (Stock, Reports, Users)
    if (stockTabBtn) stockTabBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    if (reportsTabBtn) reportsTabBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    if (userTabBtn) userTabBtn.style.display = isAdmin ? 'inline-flex' : 'none';

    // If currently on an admin-restricted tab and user is NOT admin, redirect to live-orders
    if (['stock', 'reports', 'users'].includes(this.data.activeTab) && !isAdmin) {
      this.switchTab('live-orders');
    }

    if (this.data.currentUser) {
      const roleColor = isAdmin ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      badge.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="px-2.5 py-1 rounded-xl text-xs font-bold border ${roleColor} flex items-center gap-1.5">
            <span>👤 ${this.data.currentUser.full_name}</span>
            <span class="text-[10px] uppercase opacity-75">(${this.data.currentUser.role})</span>
          </div>
          <button onclick="CashierApp.logout()" class="text-[11px] text-stone-400 hover:text-red-400 font-semibold px-2 py-1 rounded-lg border border-stone-700 hover:border-red-500/40 transition">
            Ganti Staff
          </button>
        </div>
      `;
    } else {
      badge.innerHTML = `
        <button onclick="CashierApp.openLoginModal()" class="bg-[#C8822A] hover:bg-[#A06218] text-white text-xs font-bold px-3 py-1.5 rounded-xl transition shadow-sm">
          🔑 Masuk Kasir / PIN
        </button>
      `;
    }
  },

  // ================= DATA FETCHING & REAL-TIME =================
  async fetchData() {
    try {
      const [ordersRes, menuRes, tablesRes, settingsRes, callsRes] = await Promise.all([
        fetch('/api/pos/orders?status=ALL').then(r => r.json()),
        fetch('/api/menu').then(r => r.json()),
        fetch('/api/tables').then(r => r.json()),
        fetch('/api/settings').then(r => r.json()),
        fetch('/api/pos/waiter-calls').then(r => r.json())
      ]);

      this.data.orders = ordersRes || [];
      this.data.categories = menuRes.categories || [];
      this.data.menuItems = menuRes.items || [];
      this.data.tables = tablesRes || [];
      this.data.settings = settingsRes || {};
      this.data.waiterCalls = callsRes || [];

      this.updateSummaryBadges();
      this.updatePrinterStatusDot();
    } catch (e) {
      console.error('Error fetching POS data:', e);
    }
  },

  initSSE() {
    if (!window.EventSource) return;

    this.data.sseSource = new EventSource('/api/stream');

    this.data.sseSource.addEventListener('open', () => this.setOnlineStatus(true));
    this.data.sseSource.addEventListener('error', () => this.setOnlineStatus(false));

    // Event 1: New order arrives -> PLAY CRISP BELL & POPUP ON CASHIER SCREEN ONLY
    this.data.sseSource.addEventListener('new_order', (e) => {
      const payload = JSON.parse(e.data);
      const newOrder = payload.order;
      
      this.data.orders.unshift(newOrder);
      if (window.cafeAudio) window.cafeAudio.playOrderBell();

      this.updateSummaryBadges();
      if (this.data.activeTab === 'live-orders') this.renderLiveOrders();
      if (this.data.activeTab === 'tables') this.renderTables();
      this.showToast(`🔔 Pesanan Baru Masuk! ${newOrder.table_number} (${newOrder.customer_name})`);
    });

    // Event 2: Order status updated
    this.data.sseSource.addEventListener('order_status_updated', (e) => {
      const payload = JSON.parse(e.data);
      const order = this.data.orders.find(o => o.id == payload.order_id);
      if (order) {
        order.order_status = payload.order_status;
        order.payment_status = payload.payment_status;
      }
      this.updateSummaryBadges();
      if (this.data.activeTab === 'live-orders') this.renderLiveOrders();
      if (this.data.activeTab === 'tables') this.renderTables();
    });

    // Event 3: Waiter call
    this.data.sseSource.addEventListener('call_waiter', (e) => {
      const call = JSON.parse(e.data);
      this.data.waiterCalls.unshift(call);
      if (window.cafeAudio) window.cafeAudio.playWaiterCall();
      this.showToast(`🚨 Panggilan Pelayan dari ${call.table_number}!`, true);
      this.renderWaiterCallsBanner();
    });

    // Event 4: Menu or category updated by admin
    this.data.sseSource.addEventListener('menu_updated', async () => {
      await this.fetchData();
      if (this.data.activeTab === 'stock') this.renderStockManagement();
    });

    // Event 5: Order deleted by admin
    this.data.sseSource.addEventListener('order_deleted', async (e) => {
      const payload = JSON.parse(e.data);
      const delId = payload.order_id;
      this.data.orders = this.data.orders.filter(o => o.id != delId);
      await this.fetchData();
      this.updateSummaryBadges();
      if (this.data.activeTab === 'live-orders') this.renderLiveOrders();
      if (this.data.activeTab === 'pos') this.renderWalkInHistory();
      if (this.data.activeTab === 'tables') this.renderTables();
      if (this.data.activeTab === 'reports') this.renderReports();
      this.showToast(`🗑️ Pesanan ${payload.order_number} telah dihapus.`);
    });
  },

  startPollingBackup() {
    setInterval(async () => {
      try {
        const res = await fetch('/api/pos/orders?status=ALL');
        if (res.ok) {
          this.data.orders = await res.json();
          this.updateSummaryBadges();
          if (this.data.activeTab === 'live-orders') this.renderLiveOrders();
        }
      } catch (e) {}
    }, 5000);
  },

  setOnlineStatus(isOnline) {
    const el = document.getElementById('connection-status');
    if (el) {
      el.className = isOnline 
        ? 'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30';
      el.innerHTML = isOnline 
        ? '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Online Real-time'
        : '<span class="w-2 h-2 rounded-full bg-red-400"></span> Reconnecting...';
    }
  },

  switchTab(tab) {
    const isAdmin = this.data.currentUser && this.data.currentUser.role === 'admin';
    if (['stock', 'reports', 'users'].includes(tab) && !isAdmin) {
      this.showToast('⛔ Akses Ditolak: Fitur ini khusus untuk Admin / Owner.');
      return;
    }
    this.data.activeTab = tab;
    document.querySelectorAll('.pos-nav-btn').forEach(btn => {
      if (btn.dataset.tab === tab) {
        btn.classList.add('bg-[#C8822A]', 'text-white', 'shadow-md');
        btn.classList.remove('text-stone-300', 'hover:bg-stone-800');
      } else {
        btn.classList.remove('bg-[#C8822A]', 'text-white', 'shadow-md');
        btn.classList.add('text-stone-300', 'hover:bg-stone-800');
      }
    });

    this.renderActiveTab();
  },

  renderActiveTab() {
    const container = document.getElementById('tab-content');
    if (!container) return;

    if (this.data.activeTab === 'live-orders') {
      this.renderLiveOrders();
    } else if (this.data.activeTab === 'walk-in') {
      this.renderWalkInPOS();
    } else if (this.data.activeTab === 'tables') {
      this.renderTables();
    } else if (this.data.activeTab === 'stock') {
      this.renderStockManagement();
    } else if (this.data.activeTab === 'reports') {
      this.renderReports();
    } else if (this.data.activeTab === 'users') {
      this.renderUsersManagement();
    }
  },

  updateSummaryBadges() {
    const pendingOrders = this.data.orders.filter(o => o.order_status === 'PENDING').length;
    const cookingOrders = this.data.orders.filter(o => o.order_status === 'COOKING' || o.order_status === 'ACCEPTED').length;
    
    const badgePending = document.getElementById('badge-pending-count');
    if (badgePending) {
      badgePending.textContent = pendingOrders;
      badgePending.style.display = pendingOrders > 0 ? 'inline-flex' : 'none';
    }

    const statPending = document.getElementById('stat-pending-orders');
    if (statPending) statPending.textContent = pendingOrders;

    const statCooking = document.getElementById('stat-cooking-orders');
    if (statCooking) statCooking.textContent = cookingOrders;

    const todayRevenue = this.data.orders
      .filter(o => o.payment_status === 'PAID')
      .reduce((sum, o) => sum + o.total_amount, 0);
    
    const statRevenue = document.getElementById('stat-today-revenue');
    if (statRevenue) statRevenue.textContent = `Rp ${todayRevenue.toLocaleString('id-ID')}`;
  },

  // ================= 1. LIVE ORDERS KANBAN =================
  renderLiveOrders() {
    const container = document.getElementById('tab-content');
    if (!container) return;

    const pending = this.data.orders.filter(o => o.order_status === 'PENDING');
    const cooking = this.data.orders.filter(o => o.order_status === 'ACCEPTED' || o.order_status === 'COOKING');
    const ready = this.data.orders.filter(o => o.order_status === 'READY');
    const completed = this.data.orders.filter(o => o.order_status === 'COMPLETED').slice(0, 10);

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 h-full">
        <!-- 1. PENDING -->
        <div class="bg-stone-900/60 rounded-2xl p-4 border border-stone-800 flex flex-col">
          <div class="flex items-center justify-between pb-3 mb-3 border-b border-stone-800">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-amber-500 animate-ping"></span>
              <h3 class="font-bold text-sm text-amber-400">1. Pesanan Baru (${pending.length})</h3>
            </div>
            <span class="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">Perlu Konfirmasi</span>
          </div>
          <div class="space-y-3 overflow-y-auto flex-1 pr-1">
            ${pending.length === 0 ? '<div class="text-center py-12 text-stone-600 text-xs">Belum ada pesanan baru</div>' : ''}
            ${pending.map(o => this.renderOrderCard(o, 'pending')).join('')}
          </div>
        </div>

        <!-- 2. COOKING -->
        <div class="bg-stone-900/60 rounded-2xl p-4 border border-stone-800 flex flex-col">
          <div class="flex items-center justify-between pb-3 mb-3 border-b border-stone-800">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-blue-500"></span>
              <h3 class="font-bold text-sm text-blue-400">2. Sedang Diracik (${cooking.length})</h3>
            </div>
            <span class="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold">Barista & Dapur</span>
          </div>
          <div class="space-y-3 overflow-y-auto flex-1 pr-1">
            ${cooking.length === 0 ? '<div class="text-center py-12 text-stone-600 text-xs">Dapur santai</div>' : ''}
            ${cooking.map(o => this.renderOrderCard(o, 'cooking')).join('')}
          </div>
        </div>

        <!-- 3. READY -->
        <div class="bg-stone-900/60 rounded-2xl p-4 border border-stone-800 flex flex-col">
          <div class="flex items-center justify-between pb-3 mb-3 border-b border-stone-800">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
              <h3 class="font-bold text-sm text-emerald-400">3. Siap Disajikan (${ready.length})</h3>
            </div>
            <span class="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">Antar ke Meja</span>
          </div>
          <div class="space-y-3 overflow-y-auto flex-1 pr-1">
            ${ready.length === 0 ? '<div class="text-center py-12 text-stone-600 text-xs">Semua telah diantar</div>' : ''}
            ${ready.map(o => this.renderOrderCard(o, 'ready')).join('')}
          </div>
        </div>

        <!-- 4. COMPLETED -->
        <div class="bg-stone-900/60 rounded-2xl p-4 border border-stone-800 flex flex-col">
          <div class="flex items-center justify-between pb-3 mb-3 border-b border-stone-800">
            <h3 class="font-bold text-sm text-stone-400">4. Selesai Hari Ini (${completed.length})</h3>
            <span class="text-xs text-stone-500">Riwayat Terkini</span>
          </div>
          <div class="space-y-3 overflow-y-auto flex-1 pr-1">
            ${completed.length === 0 ? '<div class="text-center py-12 text-stone-600 text-xs">Belum ada transaksi selesai</div>' : ''}
            ${completed.map(o => this.renderOrderCard(o, 'completed')).join('')}
          </div>
        </div>
      </div>
    `;
  },

  renderOrderCard(order, column) {
    const timeFormatted = order.created_at ? order.created_at.slice(11, 16) : '';
    const isPaid = order.payment_status === 'PAID';

    return `
      <div class="bg-stone-800/90 rounded-xl p-3.5 border border-stone-700/80 shadow-md flex flex-col justify-between transition hover:border-stone-500">
        <div>
          <div class="flex justify-between items-start">
            <div>
              <span class="text-xs font-black text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/50">${order.table_number}</span>
              <h4 class="font-bold text-stone-100 text-sm mt-1">${order.customer_name}</h4>
              <p class="text-[11px] text-stone-400">${order.order_number} • ${timeFormatted} • <span class="text-stone-300">${order.cashier_name || 'Staff'}</span></p>
            </div>
            <div class="text-right">
              <span class="text-xs font-bold text-white block">Rp ${order.total_amount.toLocaleString('id-ID')}</span>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mt-0.5 ${isPaid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">
                ${isPaid ? 'Lunas (' + order.payment_method + ')' : 'Belum Lunas'}
              </span>
            </div>
          </div>

          <div class="mt-3 pt-2 border-t border-stone-700/60 space-y-1.5">
            ${(order.items || []).map(i => `
              <div class="flex justify-between text-xs text-stone-200">
                <span><strong class="text-amber-400">${i.quantity}x</strong> ${i.name}</span>
                <span class="text-stone-400">Rp ${i.subtotal.toLocaleString('id-ID')}</span>
              </div>
              ${(i.temperature && i.temperature !== '-') || (i.sugar_level && i.sugar_level !== '-') || i.selected_addons ? `
                <div class="text-[10px] text-stone-400 pl-4">
                  ${[i.temperature, i.sugar_level, i.selected_addons].filter(x => x && x !== '-').join(' • ')}
                </div>
              ` : ''}
              ${i.notes ? `<div class="text-[10px] text-amber-300/90 italic pl-4 font-medium">"${i.notes}"</div>` : ''}
            `).join('')}
          </div>
        </div>

        <div class="mt-4 pt-2 border-t border-stone-700/60 flex items-center justify-between gap-1.5">
          <div class="flex items-center gap-1">
            <button onclick="CashierApp.printReceipt(${order.id})" 
              title="Cetak Struk Thermal"
              class="bg-stone-700 hover:bg-stone-600 text-stone-200 text-xs p-2 rounded-lg transition active:scale-95">
              🖨️ Struk
            </button>
            <button onclick="CashierApp.deleteOrder(${order.id}, '${order.order_number}')" 
              title="Hapus Pesanan"
              class="bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-white border border-rose-800/60 text-xs p-2 rounded-lg transition active:scale-95">
              🗑️
            </button>
          </div>

          ${column === 'pending' ? `
            <button onclick="CashierApp.updateOrderStatus(${order.id}, 'COOKING', true)" 
              class="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs py-2 px-3 rounded-lg shadow-sm transition active:scale-95">
              ✅ Terima & Buat
            </button>
            <button onclick="CashierApp.updateOrderStatus(${order.id}, 'CANCELLED')" 
              class="bg-red-900/60 hover:bg-red-800 text-red-200 text-xs py-2 px-2.5 rounded-lg transition">
              Tolak
            </button>
          ` : column === 'cooking' ? `
            <button onclick="CashierApp.updateOrderStatus(${order.id}, 'READY')" 
              class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2 px-3 rounded-lg shadow-sm transition active:scale-95">
              ☕ Siap Disajikan
            </button>
          ` : column === 'ready' ? `
            <button onclick="CashierApp.completeOrder(${order.id})" 
              class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 px-3 rounded-lg shadow-sm transition active:scale-95">
              ✨ Selesai & Lunas
            </button>
          ` : `
            <span class="text-[11px] text-stone-400 italic">Transaksi Selesai</span>
          `}
        </div>
      </div>
    `;
  },

  async updateOrderStatus(orderId, newStatus, autoPrint = false) {
    try {
      const res = await fetch(`/api/pos/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        const o = this.data.orders.find(ord => ord.id === orderId);
        if (o) o.order_status = newStatus;
        this.updateSummaryBadges();
        this.renderLiveOrders();
        if (autoPrint) {
          const shouldAuto = this.data.settings?.printer_auto_print !== '0';
          if (shouldAuto) this.printReceipt(orderId);
        }
      }
    } catch (e) {
      alert('Gagal mengupdate status pesanan.');
    }
  },

  async completeOrder(orderId) {
    const order = this.data.orders.find(o => o.id === orderId);
    if (!order) return;

    if (order.payment_status !== 'PAID') {
      const proceed = confirm(`Tandai pesanan ini sebagai LUNAS (Tunai Kasir) dan selesaikan?`);
      if (!proceed) return;
      await fetch(`/api/pos/orders/${orderId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: 'TUNAI_KASIR', cash_given: order.total_amount })
      });
    }

    await this.updateOrderStatus(orderId, 'COMPLETED');
  },

  printReceipt(orderId) {
    const is80 = (this.data.settings && this.data.settings.printer_paper_width === '80mm');
    const width = is80 ? 460 : 360;
    const url = orderId === 'test' ? '/kasir/struk/test' : `/kasir/struk/${orderId}`;
    const win = window.open(url, '_blank', `width=${width},height=650,top=100,left=100,scrollbars=yes`);
    if (win) win.focus();
  },

  async deleteOrder(orderId, orderNumber) {
    const orderNum = orderNumber || `#${orderId}`;
    const confirmed = confirm(
      `⚠️ HAPUS PESANAN ${orderNum}?\n\n` +
      `Tindakan ini akan menghapus data pesanan & riwayat transaksi secara permanen.\n` +
      `Jika pesanan terkait dengan meja aktif, status meja akan dikembalikan menjadi kosong (tersedia).\n\n` +
      `Apakah Anda yakin ingin menghapus pesanan ini?`
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/pos/orders/${orderId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        this.data.orders = this.data.orders.filter(o => o.id !== orderId);
        await this.fetchData();
        this.updateSummaryBadges();

        if (this.data.activeTab === 'live-orders') this.renderLiveOrders();
        if (this.data.activeTab === 'pos') this.renderWalkInHistory();
        if (this.data.activeTab === 'tables') this.renderTables();
        if (this.data.activeTab === 'reports') this.renderReports();

        this.showToast(`🗑️ ${data.message || 'Pesanan berhasil dihapus.'}`);
      } else {
        alert(data.error || 'Gagal menghapus pesanan.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan jaringan saat menghapus pesanan.');
    }
  },

  // ================= 2. WALK-IN FAST POS =================
  renderWalkInPOS() {
    const container = document.getElementById('tab-content');
    if (!container) return;

    const subtotal = this.calculateWalkInSubtotal();
    const discount = this.calculateWalkInDiscount();
    const total = this.calculateWalkInTotal();
    const pendingCount = this.getPendingOrdersCount();

    container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full">
        <!-- Left Panel: Menu Grid OR Previous Orders History -->
        <div class="lg:col-span-7 xl:col-span-8 flex flex-col bg-stone-900/60 rounded-2xl p-4 border border-stone-800">
          
          <!-- Top Sub-Tabs: Menu vs Pesanan Sebelumnya -->
          <div class="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-800">
            <div class="flex items-center gap-2">
              <button onclick="CashierApp.setWalkInView('menu')" 
                class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${this.data.walkInViewMode === 'menu' ? 'bg-[#C8822A] text-white shadow-sm' : 'bg-stone-800 text-stone-300 hover:text-white'}">
                <span>🍽️ Katalog Menu</span>
              </button>

              <button onclick="CashierApp.setWalkInView('history')" 
                class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${this.data.walkInViewMode === 'history' ? 'bg-[#C8822A] text-white shadow-sm' : 'bg-stone-800 text-stone-300 hover:text-white'}">
                <span>📜 Pesanan Sebelumnya</span>
                ${pendingCount > 0 ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-stone-950">${pendingCount} Pending</span>` : ''}
              </button>
            </div>

            ${this.data.walkInViewMode === 'menu' ? `
              <div class="text-[11px] text-stone-400 hidden sm:block">
                Pilih menu untuk menambahkan ke nota kasir
              </div>
            ` : `
              <button onclick="CashierApp.fetchData().then(() => CashierApp.renderWalkInPOS())" 
                class="text-[11px] text-amber-300 hover:text-amber-200 font-bold px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center gap-1">
                <span>🔄 Segarkan</span>
              </button>
            `}
          </div>

          ${this.data.walkInViewMode === 'menu' ? `
            <!-- Menu Search & Category Filters -->
            <div class="flex items-center gap-3 mb-4">
              <input type="text" id="walkin-search" placeholder="Cari menu kasir..." oninput="CashierApp.filterWalkInMenu(this.value)"
                class="flex-1 bg-stone-800 text-stone-100 text-xs px-3.5 py-2.5 rounded-xl border border-stone-700 focus:outline-none focus:border-[#C8822A]">
              <div class="flex gap-1 overflow-x-auto no-scrollbar">
                <button onclick="CashierApp.selectWalkInCat('all')" 
                  class="px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${this.data.selectedCategory === 'all' ? 'bg-[#C8822A] text-white' : 'bg-stone-800 text-stone-300'}">
                  Semua
                </button>
                ${this.data.categories.map(c => `
                  <button onclick="CashierApp.selectWalkInCat(${c.id})" 
                    class="px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${this.data.selectedCategory === c.id ? 'bg-[#C8822A] text-white' : 'bg-stone-800 text-stone-300'}">
                    ${c.name}
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- Menu Grid -->
            <div id="walkin-menu-grid" class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto flex-1 pr-1">
              ${this.renderWalkInTiles()}
            </div>
          ` : `
            <!-- History / Previous Orders View -->
            <div class="flex flex-col flex-1 overflow-hidden">
              <div class="flex items-center gap-2 mb-3">
                <input type="text" placeholder="Cari no. order, meja, atau nama pelanggan..." 
                  value="${this.data.walkInHistorySearch || ''}"
                  oninput="CashierApp.filterWalkInHistory(this.value)"
                  class="flex-1 bg-stone-800 text-stone-100 text-xs px-3.5 py-2 rounded-xl border border-stone-700 focus:outline-none focus:border-[#C8822A]">
                
                <div class="flex gap-1">
                  <button onclick="CashierApp.setWalkInHistoryFilter('all')" 
                    class="px-2.5 py-2 rounded-xl text-xs font-bold ${this.data.walkInHistoryFilter === 'all' ? 'bg-[#C8822A] text-white' : 'bg-stone-800 text-stone-300'}">
                    Semua
                  </button>
                  <button onclick="CashierApp.setWalkInHistoryFilter('pending')" 
                    class="px-2.5 py-2 rounded-xl text-xs font-bold ${this.data.walkInHistoryFilter === 'pending' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-amber-300'}">
                    ⏳ Pending (${pendingCount})
                  </button>
                  <button onclick="CashierApp.setWalkInHistoryFilter('today')" 
                    class="px-2.5 py-2 rounded-xl text-xs font-bold ${this.data.walkInHistoryFilter === 'today' ? 'bg-emerald-600 text-white' : 'bg-stone-800 text-stone-300'}">
                    Hari Ini
                  </button>
                </div>
              </div>

              <div class="flex-1 overflow-y-auto">
                ${this.renderWalkInHistory()}
              </div>
            </div>
          `}
        </div>

        <!-- Right Panel: Cart & Register -->
        <div class="lg:col-span-5 xl:col-span-4 bg-stone-900/90 rounded-2xl p-4 border border-stone-800 flex flex-col justify-between">
          <div>
            <div class="flex justify-between items-center pb-3 border-b border-stone-800">
              <div class="flex items-center gap-2">
                <span class="text-lg">🛒</span>
                <div>
                  <h3 class="font-extrabold text-sm text-white">Kasir Walk-In / Langsung</h3>
                  <div class="text-[10px] text-stone-400">Pemesanan meja atau bungkus</div>
                </div>
              </div>
              <button onclick="CashierApp.clearWalkInCart()" class="text-xs text-red-400 hover:text-red-300 font-semibold px-2 py-1 rounded bg-red-950/40 border border-red-900/50">Reset</button>
            </div>

            <!-- Table & Customer inputs -->
            <div class="grid grid-cols-2 gap-2 my-2.5">
              <div>
                <label class="text-[10px] text-stone-400 font-semibold uppercase block mb-1">Pilih Meja / Tipe</label>
                <select id="walkin-table-select" onchange="CashierApp.data.walkInTable = this.value"
                  class="w-full bg-stone-800 text-stone-100 text-xs p-2 rounded-xl border border-stone-700 focus:outline-none focus:border-[#C8822A]">
                  <option value="Takeaway">Bungkus / Takeaway</option>
                  ${this.data.tables.map(t => `
                    <option value="${t.table_number}" ${t.table_number === this.data.walkInTable ? 'selected' : ''}>${t.name} (${t.status === 'OCCUPIED' ? 'Terisi' : 'Kosong'})</option>
                  `).join('')}
                </select>
              </div>
              <div>
                <label class="text-[10px] text-stone-400 font-semibold uppercase block mb-1">Nama Pelanggan</label>
                <input type="text" id="walkin-customer-name" value="${this.data.walkInCustomer}" 
                  oninput="CashierApp.data.walkInCustomer = this.value"
                  placeholder="Nama pembeli"
                  class="w-full bg-stone-800 text-stone-100 text-xs p-2 rounded-xl border border-stone-700 focus:outline-none focus:border-[#C8822A]">
              </div>
            </div>

            <!-- Cart Items List -->
            <div class="max-h-52 overflow-y-auto space-y-2 pr-1 my-2">
              ${this.data.walkInCart.length === 0 ? `
                <div class="text-center py-8 text-stone-500 text-xs">
                  <div class="text-2xl mb-1">☕</div>
                  Pilih menu di samping untuk menambahkan ke nota kasir
                </div>
              ` : this.data.walkInCart.map(i => `
                <div class="bg-stone-800 p-2.5 rounded-xl border border-stone-700/80 flex items-center justify-between text-xs">
                  <div class="flex-1 pr-2">
                    <div class="font-bold text-stone-200">${i.name}</div>
                    <div class="text-[11px] text-stone-400">@ Rp ${i.price.toLocaleString('id-ID')}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="flex items-center border border-stone-600 rounded bg-stone-700">
                      <button onclick="CashierApp.updateWalkInQty(${i.id}, -1)" class="w-5 h-5 flex items-center justify-center font-bold text-stone-300">-</button>
                      <span class="w-6 text-center font-bold text-white">${i.quantity}</span>
                      <button onclick="CashierApp.updateWalkInQty(${i.id}, 1)" class="w-5 h-5 flex items-center justify-center font-bold text-stone-300">+</button>
                    </div>
                    <span class="font-bold text-amber-400 w-16 text-right">Rp ${(i.price * i.quantity).toLocaleString('id-ID')}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="border-t border-stone-800 pt-2.5 space-y-2">
            
            <!-- DISKON TRANSAKSI -->
            <div class="p-2.5 bg-stone-950/80 rounded-xl border border-stone-800 space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-stone-300 flex items-center gap-1 text-[11px]">
                  <span>🎟️ Diskon / Potongan:</span>
                </span>
                <div class="flex items-center bg-stone-800 rounded-lg p-0.5 border border-stone-700">
                  <button type="button" onclick="CashierApp.setWalkInDiscountType('rp')"
                    class="px-2 py-0.5 rounded text-[10px] font-bold transition ${this.data.walkInDiscountType === 'rp' ? 'bg-[#C8822A] text-white' : 'text-stone-400 hover:text-stone-200'}">
                    Rp
                  </button>
                  <button type="button" onclick="CashierApp.setWalkInDiscountType('percent')"
                    class="px-2 py-0.5 rounded text-[10px] font-bold transition ${this.data.walkInDiscountType === 'percent' ? 'bg-[#C8822A] text-white' : 'text-stone-400 hover:text-stone-200'}">
                    %
                  </button>
                </div>
              </div>

              <div class="flex items-center gap-2">
                ${this.data.walkInDiscountType === 'rp' ? `
                  <div class="relative flex-1">
                    <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-xs font-bold">Rp</span>
                    <input type="number" id="walkin-discount-val" value="${this.data.walkInDiscount || ''}" min="0"
                      oninput="CashierApp.setWalkInDiscount(this.value)" placeholder="0"
                      class="w-full bg-stone-800 text-white pl-8 pr-2.5 py-1.5 rounded-lg border border-stone-700 text-xs font-bold focus:outline-none focus:border-[#C8822A]">
                  </div>
                ` : `
                  <div class="relative flex-1">
                    <input type="number" id="walkin-discount-val" value="${this.data.walkInDiscountPercent || ''}" min="0" max="100"
                      oninput="CashierApp.setWalkInDiscount(this.value)" placeholder="0"
                      class="w-full bg-stone-800 text-white px-2.5 py-1.5 rounded-lg border border-stone-700 text-xs font-bold focus:outline-none focus:border-[#C8822A]">
                    <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-xs font-bold">%</span>
                  </div>
                `}
                <button type="button" onclick="CashierApp.resetWalkInDiscount()" class="px-2 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 text-xs rounded-lg border border-stone-700">
                  Reset
                </button>
              </div>

              <!-- Quick Discount Presets -->
              <div class="flex gap-1 flex-wrap pt-0.5">
                <button type="button" onclick="CashierApp.setQuickDiscount(5, 'percent')" class="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-[10px] font-bold border border-stone-700">5%</button>
                <button type="button" onclick="CashierApp.setQuickDiscount(10, 'percent')" class="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-[10px] font-bold border border-stone-700">10%</button>
                <button type="button" onclick="CashierApp.setQuickDiscount(15, 'percent')" class="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-[10px] font-bold border border-stone-700">15%</button>
                <button type="button" onclick="CashierApp.setQuickDiscount(5000, 'rp')" class="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-[10px] font-bold border border-stone-700">5rb</button>
                <button type="button" onclick="CashierApp.setQuickDiscount(10000, 'rp')" class="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-[10px] font-bold border border-stone-700">10rb</button>
              </div>
            </div>

            <!-- TOTALS SUMMARY -->
            <div class="space-y-1.5 text-xs bg-stone-950/60 p-2.5 rounded-xl border border-stone-800">
              <div class="flex justify-between text-stone-400">
                <span>Subtotal</span>
                <span id="walkin-subtotal-val">Rp ${subtotal.toLocaleString('id-ID')}</span>
              </div>
              ${discount > 0 ? `
                <div class="flex justify-between text-amber-400 font-bold">
                  <span>Diskon (${this.data.walkInDiscountType === 'percent' ? this.data.walkInDiscountPercent + '%' : 'Rp'})</span>
                  <span id="walkin-discount-val-display">-Rp ${discount.toLocaleString('id-ID')}</span>
                </div>
              ` : ''}
              <div class="flex justify-between text-base font-extrabold text-white pt-1 border-t border-stone-800">
                <span>Total Tagihan</span>
                <span id="walkin-total-val" class="text-emerald-400">Rp ${total.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <!-- Payment Method Selectors -->
            <div class="grid grid-cols-2 gap-2">
              <button onclick="CashierApp.setWalkInPayment('TUNAI_KASIR')"
                class="py-2 px-3 rounded-xl border text-xs font-bold transition ${this.data.walkInPayment === 'TUNAI_KASIR' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-stone-800 border-stone-700 text-stone-300'}">
                💵 Uang Tunai (Cash)
              </button>
              <button onclick="CashierApp.setWalkInPayment('QRIS')"
                class="py-2 px-3 rounded-xl border text-xs font-bold transition ${this.data.walkInPayment === 'QRIS' ? 'bg-[#C8822A] border-[#C8822A] text-white' : 'bg-stone-800 border-stone-700 text-stone-300'}">
                📱 QRIS Kasir
              </button>
            </div>

            ${this.data.walkInPayment === 'TUNAI_KASIR' ? `
              <div class="p-2 bg-stone-800/80 rounded-xl border border-stone-700">
                <div class="flex justify-between items-center text-xs mb-1">
                  <span class="text-stone-400">Uang Diterima:</span>
                  <input type="number" id="walkin-cash-input" value="${this.data.walkInCashGiven || ''}" 
                    oninput="CashierApp.setWalkInCash(this.value)"
                    placeholder="Rp..." class="w-28 text-right bg-stone-900 border border-stone-600 rounded px-2 py-1 text-white text-xs font-bold">
                </div>
                <div class="flex gap-1 mt-1">
                  ${[20000, 50000, 100000].map(amt => `
                    <button onclick="CashierApp.setWalkInCash(${amt})" class="flex-1 bg-stone-700 hover:bg-stone-600 text-[10px] font-bold py-1 rounded text-stone-200">
                      ${amt/1000}k
                    </button>
                  `).join('')}
                  <button onclick="CashierApp.setWalkInCash(${total})" class="flex-1 bg-stone-700 hover:bg-stone-600 text-[10px] font-bold py-1 rounded text-emerald-400">
                    Pas
                  </button>
                </div>
                <div class="flex justify-between items-center text-xs font-bold mt-1.5 pt-1.5 border-t border-stone-700/60 text-amber-300">
                  <span>Kembalian:</span>
                  <span id="walkin-change-val">Rp ${Math.max(0, (this.data.walkInCashGiven || 0) - total).toLocaleString('id-ID')}</span>
                </div>
              </div>
            ` : ''}

            <!-- TWO ACTION BUTTONS: Pending (Bayar Nanti) vs Bayar Lunas & Cetak -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button onclick="CashierApp.submitWalkInOrder(true)" 
                class="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 font-bold text-xs py-3 rounded-xl transition active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm">
                <span>⏳ Simpan Pending (Bayar Nanti)</span>
              </button>

              <button onclick="CashierApp.submitWalkInOrder(false)" 
                class="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs py-3 rounded-xl shadow-lg transition active:scale-[0.98] flex items-center justify-center gap-1.5">
                <span>🖨️ Bayar Lunas & Cetak</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    `;
  },

  getPendingOrdersCount() {
    return (this.data.orders || []).filter(o => o.order_status === 'PENDING' || o.payment_status === 'UNPAID').length;
  },

  setWalkInView(mode) {
    this.data.walkInViewMode = mode;
    this.renderWalkInPOS();
  },

  setWalkInHistoryFilter(f) {
    this.data.walkInHistoryFilter = f;
    this.renderWalkInPOS();
  },

  filterWalkInHistory(q) {
    this.data.walkInHistorySearch = (q || '').toLowerCase();
    this.renderWalkInPOS();
  },

  renderWalkInTiles() {
    let list = this.data.menuItems;
    if (this.data.selectedCategory !== 'all') {
      list = list.filter(i => i.category_id === this.data.selectedCategory);
    }
    return list.map(item => `
      <div onclick="CashierApp.addWalkInItem(${item.id})" 
        class="bg-stone-800 hover:bg-stone-700 cursor-pointer p-3 rounded-xl border border-stone-700/80 flex flex-col justify-between transition active:scale-95">
        <div>
          <div class="h-20 w-full rounded-lg bg-stone-900 overflow-hidden mb-2">
            <img src="${item.image_url}" alt="${item.name}" class="w-full h-full object-cover">
          </div>
          <h4 class="font-bold text-xs text-stone-100 line-clamp-1">${item.name}</h4>
        </div>
        <span class="text-xs font-extrabold text-amber-400 mt-2 block">Rp ${item.price.toLocaleString('id-ID')}</span>
      </div>
    `).join('');
  },

  renderWalkInHistory() {
    let orders = [...(this.data.orders || [])];
    const filter = this.data.walkInHistoryFilter || 'all';
    const search = (this.data.walkInHistorySearch || '').trim();

    if (filter === 'pending') {
      orders = orders.filter(o => o.order_status === 'PENDING' || o.payment_status === 'UNPAID');
    } else if (filter === 'today') {
      const todayStr = new Date().toISOString().slice(0, 10);
      orders = orders.filter(o => (o.created_at || '').startsWith(todayStr));
    } else if (filter === 'takeaway') {
      orders = orders.filter(o => o.order_type === 'Takeaway');
    }

    if (search) {
      orders = orders.filter(o => 
        (o.order_number || '').toLowerCase().includes(search) ||
        (o.customer_name || '').toLowerCase().includes(search) ||
        (o.table_number || '').toLowerCase().includes(search)
      );
    }

    if (orders.length === 0) {
      return `
        <div class="text-center py-16 text-stone-500">
          <div class="text-4xl mb-2">📜</div>
          <div class="font-bold text-sm text-stone-300">Tidak ada riwayat pesanan ditemukan</div>
          <div class="text-xs text-stone-500 mt-1">Gunakan filter atau kata kunci pencarian yang berbeda.</div>
        </div>
      `;
    }

    return `
      <div class="space-y-3 overflow-y-auto max-h-[calc(100vh-270px)] pr-1">
        ${orders.map(order => {
          const isPending = order.order_status === 'PENDING' || order.payment_status === 'UNPAID';
          const itemsSummary = (order.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ') || 'Menu';
          const timeStr = order.created_at ? order.created_at.slice(11, 16) : '';
          return `
            <div class="bg-stone-800/90 rounded-2xl p-3.5 border transition ${isPending ? 'border-amber-500/50 bg-amber-950/20' : 'border-stone-700/80'}">
              <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-2">
                  <span class="font-extrabold text-white text-xs tracking-wider">${order.order_number}</span>
                  <span class="text-[10px] text-stone-400 font-mono">${timeStr}</span>
                  <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${order.table_number === 'Takeaway' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}">
                    ${order.table_number}
                  </span>
                </div>

                <div class="flex items-center gap-1.5">
                  ${isPending ? `
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                      ⏳ Belum Bayar
                    </span>
                  ` : `
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      ✅ Lunas
                    </span>
                  `}
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-700 text-stone-300">
                    ${order.order_status}
                  </span>
                </div>
              </div>

              <div class="text-xs text-stone-300 mb-1.5 font-medium flex items-center gap-2">
                <span>👤 ${order.customer_name || 'Pelanggan'}</span>
                <span class="text-stone-500">•</span>
                <span class="text-[11px] text-stone-400 truncate max-w-[280px]" title="${itemsSummary}">${itemsSummary}</span>
              </div>

              <div class="flex items-center justify-between pt-2 border-t border-stone-700/60 mt-2">
                <div class="text-xs">
                  <span class="text-stone-400">Total: </span>
                  <span class="font-extrabold text-amber-400">Rp ${(order.total_amount || 0).toLocaleString('id-ID')}</span>
                  ${order.discount > 0 ? `
                    <span class="text-[10px] text-stone-400 ml-1">(Diskon Rp ${order.discount.toLocaleString('id-ID')})</span>
                  ` : ''}
                </div>

                <div class="flex items-center gap-1.5">
                  <button onclick="CashierApp.printReceipt(${order.id})" 
                    class="bg-stone-700 hover:bg-stone-600 text-stone-200 text-xs font-bold px-2.5 py-1.5 rounded-xl border border-stone-600 transition flex items-center gap-1">
                    <span>🖨️ Struk</span>
                  </button>

                  ${isPending ? `
                    <button onclick="CashierApp.payPendingOrder(${order.id})" 
                      class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold px-3 py-1.5 rounded-xl shadow transition flex items-center gap-1">
                      <span>💵 Lunasi</span>
                    </button>
                  ` : ''}

                  ${order.order_status !== 'COMPLETED' ? `
                    <button onclick="CashierApp.updateOrderStatus(${order.id}, 'COMPLETED')" 
                      class="bg-[#472E0B] hover:bg-[#5C3C10] text-[#FFEFCB] text-xs font-bold px-2.5 py-1.5 rounded-xl border border-[#5C3C10] transition">
                      Selesai
                    </button>
                  ` : ''}

                  <button onclick="CashierApp.deleteOrder(${order.id}, '${order.order_number}')" 
                    title="Hapus Pesanan"
                    class="bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-white border border-rose-800/60 text-xs font-bold px-2.5 py-1.5 rounded-xl transition flex items-center gap-1">
                    <span>🗑️ Hapus</span>
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  addWalkInItem(itemId) {
    const item = this.data.menuItems.find(i => i.id === itemId);
    if (!item) return;
    const existing = this.data.walkInCart.find(i => i.id === itemId);
    if (existing) {
      existing.quantity++;
    } else {
      this.data.walkInCart.push({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        temperature: item.has_ice_hot ? 'Dingin' : '-',
        sugar_level: item.has_sugar_level ? 'Normal' : '-',
        selected_addons: [],
        notes: ''
      });
    }
    this.renderWalkInPOS();
  },

  updateWalkInQty(itemId, delta) {
    const item = this.data.walkInCart.find(i => i.id === itemId);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) {
      this.data.walkInCart = this.data.walkInCart.filter(i => i.id !== itemId);
    }
    this.renderWalkInPOS();
  },

  clearWalkInCart() {
    this.data.walkInCart = [];
    this.data.walkInCashGiven = 0;
    this.data.walkInDiscount = 0;
    this.data.walkInDiscountPercent = 0;
    this.data.walkInNotes = '';
    this.renderWalkInPOS();
  },

  selectWalkInCat(catId) {
    this.data.selectedCategory = catId;
    this.renderWalkInPOS();
  },

  setWalkInPayment(method) {
    this.data.walkInPayment = method;
    this.renderWalkInPOS();
  },

  setWalkInCash(amount) {
    this.data.walkInCashGiven = Number(amount);
    const input = document.getElementById('walkin-cash-input');
    if (input) input.value = amount;
    const changeEl = document.getElementById('walkin-change-val');
    if (changeEl) {
      changeEl.textContent = `Rp ${Math.max(0, this.data.walkInCashGiven - this.calculateWalkInTotal()).toLocaleString('id-ID')}`;
    }
  },

  calculateWalkInSubtotal() {
    return this.data.walkInCart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  },

  calculateWalkInDiscount() {
    const subtotal = this.calculateWalkInSubtotal();
    if (subtotal <= 0) return 0;
    if (this.data.walkInDiscountType === 'percent') {
      const pct = Math.min(100, Math.max(0, Number(this.data.walkInDiscountPercent) || 0));
      return Math.min(subtotal, Math.round(subtotal * (pct / 100)));
    } else {
      const rp = Math.max(0, Number(this.data.walkInDiscount) || 0);
      return Math.min(subtotal, rp);
    }
  },

  calculateWalkInTotal() {
    return Math.max(0, this.calculateWalkInSubtotal() - this.calculateWalkInDiscount());
  },

  setWalkInDiscountType(type) {
    this.data.walkInDiscountType = type;
    this.renderWalkInPOS();
  },

  setWalkInDiscount(val) {
    if (this.data.walkInDiscountType === 'percent') {
      this.data.walkInDiscountPercent = Math.min(100, Math.max(0, Number(val) || 0));
    } else {
      this.data.walkInDiscount = Math.max(0, Number(val) || 0);
    }
    const subEl = document.getElementById('walkin-subtotal-val');
    const discEl = document.getElementById('walkin-discount-val-display');
    const totalEl = document.getElementById('walkin-total-val');
    const changeEl = document.getElementById('walkin-change-val');
    const subtotal = this.calculateWalkInSubtotal();
    const discount = this.calculateWalkInDiscount();
    const total = this.calculateWalkInTotal();

    if (subEl) subEl.textContent = `Rp ${subtotal.toLocaleString('id-ID')}`;
    if (discEl) discEl.textContent = `-Rp ${discount.toLocaleString('id-ID')}`;
    if (totalEl) totalEl.textContent = `Rp ${total.toLocaleString('id-ID')}`;
    if (changeEl && this.data.walkInCashGiven) {
      changeEl.textContent = `Rp ${Math.max(0, this.data.walkInCashGiven - total).toLocaleString('id-ID')}`;
    }
  },

  setQuickDiscount(val, type = 'percent') {
    this.data.walkInDiscountType = type;
    if (type === 'percent') {
      this.data.walkInDiscountPercent = val;
      this.data.walkInDiscount = 0;
    } else {
      this.data.walkInDiscount = val;
      this.data.walkInDiscountPercent = 0;
    }
    this.renderWalkInPOS();
  },

  resetWalkInDiscount() {
    this.data.walkInDiscount = 0;
    this.data.walkInDiscountPercent = 0;
    this.renderWalkInPOS();
  },

  async submitWalkInOrder(isPending = false) {
    if (this.data.walkInCart.length === 0) {
      alert('Pilih menu terlebih dahulu!');
      return;
    }

    const subtotal = this.calculateWalkInSubtotal();
    const discount = this.calculateWalkInDiscount();
    const total = this.calculateWalkInTotal();

    if (!isPending && this.data.walkInPayment === 'TUNAI_KASIR' && this.data.walkInCashGiven > 0 && this.data.walkInCashGiven < total) {
      alert('Uang tunai yang diberikan kurang dari total pesanan!');
      return;
    }

    const payload = {
      table_number: this.data.walkInTable,
      customer_name: this.data.walkInCustomer || 'Walk-in Pelanggan',
      order_type: this.data.walkInTable === 'Takeaway' ? 'Takeaway' : 'Dine In',
      notes: this.data.walkInNotes,
      payment_method: isPending ? 'PENDING' : this.data.walkInPayment,
      is_cashier_direct: true,
      cashier_name: this.data.currentUser?.full_name || 'Staff Kasir',
      is_pending: isPending,
      order_status: isPending ? 'PENDING' : 'COMPLETED',
      is_paid: !isPending,
      subtotal: subtotal,
      discount: discount,
      total_amount: total,
      items: this.data.walkInCart
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.order) {
        this.clearWalkInCart();
        if (isPending) {
          this.showToast(`⏳ Pesanan ${data.order.order_number} (${data.order.table_number}) disimpan PENDING (Belum Bayar)`);
        } else {
          this.showToast(`✅ Pesanan walk-in ${data.order.order_number} LUNAS!`);
          if (this.data.settings?.printer_auto_print !== '0') {
            this.printReceipt(data.order.id);
          }
        }
        await this.fetchData();
        this.renderWalkInPOS();
      } else {
        alert(data.error || 'Gagal membuat pesanan kasir.');
      }
    } catch (e) {
      alert('Gagal membuat pesanan kasir.');
    }
  },

  async payPendingOrder(orderId) {
    const order = this.data.orders.find(o => o.id === orderId);
    if (!order) return;

    const opt = prompt(
      `PILIH METODE PEMBAYARAN\n` +
      `Pesanan: ${order.order_number} (${order.table_number})\n` +
      `Total Tagihan: Rp ${order.total_amount.toLocaleString('id-ID')}\n\n` +
      `1 = TUNAI KASIR\n` +
      `2 = QRIS KASIR\n\n` +
      `Ketik 1 atau 2 lalu tekan OK:`,
      "1"
    );
    if (!opt) return;

    let paymentMethod = 'TUNAI_KASIR';
    let cashGiven = order.total_amount;

    if (opt.trim() === '2') {
      paymentMethod = 'QRIS';
    } else {
      paymentMethod = 'TUNAI_KASIR';
      const cashStr = prompt(
        `UANG TUNAI DITERIMA\n` +
        `Total Tagihan: Rp ${order.total_amount.toLocaleString('id-ID')}\n` +
        `Masukkan jumlah uang tunai yang diterima pelanggan:`,
        order.total_amount
      );
      if (cashStr === null) return;
      cashGiven = Number(cashStr) || order.total_amount;
      if (cashGiven < order.total_amount) {
        alert('Uang yang diterima kurang dari total tagihan!');
        return;
      }
      const change = cashGiven - order.total_amount;
      if (change > 0) {
        alert(`Uang Diterima: Rp ${cashGiven.toLocaleString('id-ID')}\nKembalian: Rp ${change.toLocaleString('id-ID')}`);
      }
    }

    try {
      const res = await fetch(`/api/pos/orders/${orderId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: paymentMethod, cash_given: cashGiven })
      });
      const data = await res.json();
      if (data.success || res.ok) {
        await this.updateOrderStatus(orderId, 'COMPLETED', true);
        await this.fetchData();
        this.renderWalkInPOS();
        this.showToast(`✅ Pesanan ${order.order_number} berhasil dilunasi & selesai!`);
      } else {
        alert('Gagal memperbarui status pembayaran.');
      }
    } catch (e) {
      alert('Terjadi kesalahan memproses pelunasan.');
    }
  },

  // ================= 3. TABLE MAP VIEW =================
  renderTables() {
    const container = document.getElementById('tab-content');
    if (!container) return;

    container.innerHTML = `
      <div class="bg-stone-900/60 rounded-2xl p-6 border border-stone-800 h-full flex flex-col">
        <div class="flex justify-between items-center mb-6">
          <div>
            <h3 class="font-extrabold text-base text-white">Denah Meja Kedai Tedhuh</h3>
            <p class="text-xs text-stone-400">Pantau ketersediaan meja dan pesanan aktif di setiap meja</p>
          </div>
          <div class="flex gap-4 text-xs font-semibold">
            <span class="flex items-center gap-1.5 text-emerald-400"><span class="w-3 h-3 rounded-full bg-emerald-500"></span> Meja Kosong</span>
            <span class="flex items-center gap-1.5 text-amber-400"><span class="w-3 h-3 rounded-full bg-amber-500"></span> Meja Terisi</span>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 overflow-y-auto flex-1">
          ${this.data.tables.map(t => {
            const activeOrder = this.data.orders.find(o => o.table_number === t.table_number && o.order_status !== 'COMPLETED' && o.order_status !== 'CANCELLED');
            const isOccupied = t.status === 'OCCUPIED' || !!activeOrder;

            return `
              <div class="p-4 rounded-2xl border transition ${isOccupied ? 'bg-amber-950/40 border-amber-600/50' : 'bg-stone-800/80 border-stone-700/80'} flex flex-col justify-between h-40">
                <div>
                  <div class="flex justify-between items-center">
                    <span class="font-black text-sm ${isOccupied ? 'text-amber-400' : 'text-emerald-400'}">${t.table_number}</span>
                    <span class="w-2.5 h-2.5 rounded-full ${isOccupied ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}"></span>
                  </div>
                  <p class="text-[11px] text-stone-400 mt-1">${isOccupied ? 'Ada Pesanan' : 'Siap Ditempati'}</p>
                </div>

                ${activeOrder ? `
                  <div class="bg-black/30 p-2 rounded-lg text-left">
                    <div class="font-bold text-xs text-stone-200 truncate">${activeOrder.customer_name}</div>
                    <div class="text-[10px] text-amber-300">Rp ${activeOrder.total_amount.toLocaleString('id-ID')}</div>
                  </div>
                  <button onclick="CashierApp.switchTab('live-orders')" class="w-full text-center text-[10px] text-stone-300 font-bold hover:underline">
                    Lihat Pesanan &rarr;
                  </button>
                ` : `
                  <button onclick="CashierApp.orderForTable('${t.table_number}')" 
                    class="w-full bg-stone-700 hover:bg-stone-600 text-stone-200 text-xs font-semibold py-1.5 rounded-lg transition">
                    + Order Meja
                  </button>
                `}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  orderForTable(tableNumber) {
    this.data.walkInTable = tableNumber;
    this.switchTab('walk-in');
  },

  // ================= 4. STOCK & AVAILABILITY =================
  renderStockManagement() {
    const container = document.getElementById('tab-content');
    if (!container) return;

    const isAdmin = this.data.currentUser && this.data.currentUser.role === 'admin';
    if (!isAdmin) {
      container.innerHTML = `
        <div class="bg-stone-900/60 rounded-3xl p-12 border border-stone-800 text-center max-w-lg mx-auto my-12 shadow-2xl">
          <div class="w-16 h-16 rounded-2xl bg-amber-500/10 text-[#C8822A] flex items-center justify-center text-3xl mx-auto mb-4 border border-amber-500/20">
            🔒
          </div>
          <h3 class="text-base font-extrabold text-white mb-2">Akses Terbatas (Khusus Admin)</h3>
          <p class="text-xs text-stone-400 mb-6 leading-relaxed">
            Hanya Admin / Owner Kedai Tedhuh yang berhak mengedit menu, mengatur kategori, dan mengelola stok.
          </p>
          <button onclick="CashierApp.openLoginModal()" class="bg-[#C8822A] hover:bg-[#A06218] text-white text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-md">
            Masuk Sebagai Admin (PIN 1234)
          </button>
        </div>
      `;
      return;
    }

    // Filter menu items by search, category, and status
    const query = (this.data.stockSearchQuery || '').toLowerCase().trim();
    const catFilter = this.data.stockSelectedCat || 'all';
    const statusFilter = this.data.stockSelectedStatus || 'all';

    const filteredItems = this.data.menuItems.filter(item => {
      const matchQuery = !query || item.name.toLowerCase().includes(query) || (item.badge && item.badge.toLowerCase().includes(query));
      const matchCat = catFilter === 'all' || item.category_id == catFilter;
      const matchStatus = statusFilter === 'all' || (statusFilter === 'available' ? item.is_available == 1 : item.is_available == 0);
      return matchQuery && matchCat && matchStatus;
    });

    container.innerHTML = `
      <div class="bg-stone-900/60 rounded-2xl p-6 border border-stone-800 h-full flex flex-col">
        <!-- Top Toolbar with Action Buttons -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-stone-800">
          <div>
            <div class="flex items-center gap-2.5">
              <h3 class="font-extrabold text-base text-white">Kelola Menu & Kategori Produk</h3>
              <span class="bg-[#472E0B] text-[#FFEFCB] text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-[#5C3C10]">
                ${this.data.menuItems.length} Menu Terdaftar
              </span>
            </div>
            <p class="text-xs text-stone-400 mt-1">Tambah menu baru, edit nama, harga, foto, kategori, dan atur ketersediaan stok</p>
          </div>

          <div class="flex items-center gap-2.5 flex-wrap">
            <button onclick="CashierApp.openCategoryModal()" 
              class="bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold px-3.5 py-2 rounded-xl transition border border-stone-700 flex items-center gap-1.5 shadow-sm">
              <span>📁 Kelola Kategori (${this.data.categories.length})</span>
            </button>
            <button onclick="CashierApp.openMenuForm()" 
              class="bg-[#472E0B] hover:bg-[#5C3C10] text-[#FFEFCB] text-xs font-bold px-4 py-2 rounded-xl transition border border-[#5C3C10] flex items-center gap-1.5 shadow-md active:scale-95">
              <span>➕ Tambah Menu Baru</span>
            </button>
          </div>
        </div>

        <!-- Filter Controls -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div class="flex-1 flex items-center gap-2 flex-wrap">
            <!-- Search bar -->
            <input type="text" id="stock-menu-search" placeholder="Cari nama menu..." 
              value="${this.data.stockSearchQuery || ''}"
              oninput="CashierApp.filterStockMenu(this.value)"
              class="bg-stone-800 text-stone-100 text-xs px-3.5 py-2 rounded-xl border border-stone-700 focus:outline-none focus:border-[#C8822A] w-56">

            <!-- Category Filter -->
            <select onchange="CashierApp.filterStockCategory(this.value)" 
              class="bg-stone-800 text-stone-200 text-xs px-3 py-2 rounded-xl border border-stone-700 focus:outline-none focus:border-[#C8822A]">
              <option value="all" ${catFilter === 'all' ? 'selected' : ''}>Semua Kategori (${this.data.categories.length})</option>
              ${this.data.categories.map(c => `
                <option value="${c.id}" ${catFilter == c.id ? 'selected' : ''}>${c.name}</option>
              `).join('')}
            </select>

            <!-- Status Filter -->
            <select onchange="CashierApp.filterStockStatus(this.value)" 
              class="bg-stone-800 text-stone-200 text-xs px-3 py-2 rounded-xl border border-stone-700 focus:outline-none focus:border-[#C8822A]">
              <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>Semua Status</option>
              <option value="available" ${statusFilter === 'available' ? 'selected' : ''}>Hanya Tersedia</option>
              <option value="sold_out" ${statusFilter === 'sold_out' ? 'selected' : ''}>Hanya Habis</option>
            </select>
          </div>

          <div class="text-[11px] text-stone-400">
            Menampilkan <span class="font-bold text-white">${filteredItems.length}</span> dari ${this.data.menuItems.length} menu
          </div>
        </div>

        <!-- Table -->
        <div class="overflow-y-auto flex-1 border border-stone-800 rounded-xl">
          <table class="w-full text-left text-xs text-stone-300">
            <thead class="bg-stone-800/80 uppercase text-[10px] font-bold text-stone-400 sticky top-0">
              <tr>
                <th class="p-3">Menu</th>
                <th class="p-3">Kategori</th>
                <th class="p-3">Harga</th>
                <th class="p-3 text-center">Opsi</th>
                <th class="p-3 text-center">Status Stok</th>
                <th class="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-800">
              ${filteredItems.length === 0 ? `
                <tr><td colspan="6" class="p-8 text-center text-stone-500">Tidak ada menu yang sesuai dengan filter pencarian.</td></tr>
              ` : filteredItems.map(item => {
                const cat = this.data.categories.find(c => c.id === item.category_id);
                const catName = cat ? cat.name : 'Lainnya';
                return `
                  <tr class="hover:bg-stone-800/40 transition">
                    <td class="p-3 flex items-center gap-3">
                      <img src="${item.image_url}" alt="${item.name}" 
                        onerror="this.src='https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&auto=format&fit=crop&q=80'"
                        class="w-10 h-10 rounded-xl object-cover border border-stone-700/60 shadow-sm flex-shrink-0">
                      <div>
                        <div class="font-bold text-white text-xs flex items-center gap-1.5">
                          <span>${item.name}</span>
                          ${item.badge ? `<span class="text-[9px] bg-[#C8822A] text-white px-1.5 py-0.2 rounded font-bold">${item.badge}</span>` : ''}
                        </div>
                        <div class="text-[11px] text-stone-400 line-clamp-1 mt-0.5">${item.description || '-'}</div>
                      </div>
                    </td>
                    <td class="p-3">
                      <span class="bg-stone-800 text-stone-200 text-[11px] px-2.5 py-1 rounded-lg border border-stone-700 font-medium">
                        ${catName}
                      </span>
                    </td>
                    <td class="p-3 font-bold text-amber-400 whitespace-nowrap">
                      Rp ${item.price.toLocaleString('id-ID')}
                    </td>
                    <td class="p-3 text-center whitespace-nowrap">
                      <div class="flex items-center justify-center gap-1">
                        ${item.has_ice_hot ? `<span class="text-[9px] bg-sky-950 text-sky-300 border border-sky-800/60 px-1.5 py-0.5 rounded font-mono" title="Pilihan Es/Panas Aktif">🧊/☕</span>` : ''}
                        ${item.has_sugar_level ? `<span class="text-[9px] bg-amber-950 text-amber-300 border border-amber-800/60 px-1.5 py-0.5 rounded font-mono" title="Pilihan Gula Aktif">🍬</span>` : ''}
                      </div>
                    </td>
                    <td class="p-3 text-center whitespace-nowrap">
                      <span class="px-2.5 py-1 rounded-full font-bold text-[10px] ${item.is_available ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}">
                        ${item.is_available ? 'Tersedia' : 'Habis'}
                      </span>
                    </td>
                    <td class="p-3 text-right whitespace-nowrap">
                      <div class="flex items-center justify-end gap-1.5">
                        <!-- Edit Button -->
                        <button onclick="CashierApp.openMenuForm(${item.id})" 
                          title="Edit Rincian Menu"
                          class="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-lg border border-stone-700 transition text-xs font-bold flex items-center gap-1">
                          ✏️ Edit
                        </button>
                        <!-- Toggle Stock Button -->
                        <button onclick="CashierApp.toggleMenuStock(${item.id})" 
                          title="${item.is_available ? 'Tandai Habis' : 'Aktifkan Kembali'}"
                          class="px-2.5 py-1 rounded-lg text-xs font-bold transition ${item.is_available ? 'bg-amber-900/40 hover:bg-amber-800 text-amber-200 border border-amber-800/50' : 'bg-emerald-900/40 hover:bg-emerald-800 text-emerald-200 border border-emerald-800/50'}">
                          ${item.is_available ? 'Tandai Habis' : 'Aktifkan'}
                        </button>
                        <!-- Delete Button -->
                        <button onclick="CashierApp.confirmDeleteMenu(${item.id}, '${item.name.replace(/'/g, "\\'")}')" 
                          title="Hapus Menu"
                          class="p-1.5 bg-stone-800 hover:bg-red-900/60 text-stone-400 hover:text-red-300 rounded-lg border border-stone-700 transition">
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  filterStockMenu(query) {
    this.data.stockSearchQuery = query;
    this.renderStockManagement();
  },

  filterStockCategory(catId) {
    this.data.stockSelectedCat = catId;
    this.renderStockManagement();
  },

  filterStockStatus(status) {
    this.data.stockSelectedStatus = status;
    this.renderStockManagement();
  },

  async toggleMenuStock(itemId) {
    try {
      const res = await fetch(`/api/pos/menu/${itemId}/toggle-stock`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const item = this.data.menuItems.find(i => i.id === itemId);
        if (item) item.is_available = data.is_available;
        this.renderStockManagement();
        this.showToast(`Status ketersediaan ${data.is_available ? 'diaktifkan (Tersedia)' : 'ditandai habis'}.`);
      } else {
        alert(data.error || 'Gagal mengubah stok.');
      }
    } catch (e) {
      alert('Gagal mengubah stok.');
    }
  },

  // ================= MENU CRUD MODAL HANDLERS =================
  openMenuForm(itemId = null) {
    const modal = document.getElementById('menu-form-modal');
    if (!modal) return;

    // Populate category select options
    const catSelect = document.getElementById('menu-form-category');
    if (catSelect) {
      catSelect.innerHTML = this.data.categories.map(c => `
        <option value="${c.id}">${c.name}</option>
      `).join('');
    }

    const idInput = document.getElementById('menu-form-id');
    const nameInput = document.getElementById('menu-form-name');
    const priceInput = document.getElementById('menu-form-price');
    const badgeInput = document.getElementById('menu-form-badge');
    const availInput = document.getElementById('menu-form-available');
    const imageInput = document.getElementById('menu-form-image');
    const descInput = document.getElementById('menu-form-desc');
    const icehotInput = document.getElementById('menu-form-icehot');
    const sugarInput = document.getElementById('menu-form-sugar');
    const titleElem = document.getElementById('menu-form-title');

    if (itemId) {
      const item = this.data.menuItems.find(i => i.id === itemId);
      if (!item) return;

      if (idInput) idInput.value = item.id;
      if (titleElem) titleElem.textContent = `Edit Menu: ${item.name}`;
      if (nameInput) nameInput.value = item.name;
      if (catSelect) catSelect.value = item.category_id;
      if (priceInput) priceInput.value = item.price;
      if (badgeInput) badgeInput.value = item.badge || '';
      if (availInput) availInput.value = item.is_available ? '1' : '0';
      if (imageInput) imageInput.value = item.image_url || '';
      if (descInput) descInput.value = item.description || '';
      if (icehotInput) icehotInput.checked = Boolean(item.has_ice_hot);
      if (sugarInput) sugarInput.checked = Boolean(item.has_sugar_level);
    } else {
      if (idInput) idInput.value = '';
      if (titleElem) titleElem.textContent = 'Tambah Menu Baru';
      if (nameInput) nameInput.value = '';
      if (catSelect && this.data.categories.length > 0) catSelect.value = this.data.categories[0].id;
      if (priceInput) priceInput.value = '';
      if (badgeInput) badgeInput.value = '';
      if (availInput) availInput.value = '1';
      if (imageInput) imageInput.value = 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&auto=format&fit=crop&q=80';
      if (descInput) descInput.value = '';
      if (icehotInput) icehotInput.checked = true;
      if (sugarInput) sugarInput.checked = true;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (nameInput) nameInput.focus();
  },

  closeMenuFormModal() {
    const modal = document.getElementById('menu-form-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  setMenuPresetImage(type) {
    const imgInput = document.getElementById('menu-form-image');
    if (!imgInput) return;
    const presets = {
      coffee: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&auto=format&fit=crop&q=80',
      tea: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
      food: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
      pastry: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop&q=80',
      mocktail: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80'
    };
    imgInput.value = presets[type] || presets.coffee;
  },

  async saveMenuForm() {
    const id = document.getElementById('menu-form-id')?.value;
    const name = (document.getElementById('menu-form-name')?.value || '').trim();
    const category_id = parseInt(document.getElementById('menu-form-category')?.value);
    const price = parseInt(document.getElementById('menu-form-price')?.value);
    const badge = (document.getElementById('menu-form-badge')?.value || '').trim();
    const is_available = document.getElementById('menu-form-available')?.value === '1' ? 1 : 0;
    const image_url = (document.getElementById('menu-form-image')?.value || '').trim();
    const description = (document.getElementById('menu-form-desc')?.value || '').trim();
    const has_ice_hot = document.getElementById('menu-form-icehot')?.checked ? 1 : 0;
    const has_sugar_level = document.getElementById('menu-form-sugar')?.checked ? 1 : 0;

    if (!name || isNaN(price) || isNaN(category_id)) {
      alert('Nama menu, harga, dan kategori wajib diisi.');
      return;
    }

    const payload = {
      name,
      category_id,
      price,
      badge,
      is_available,
      image_url,
      description,
      has_ice_hot,
      has_sugar_level
    };

    try {
      const url = id ? `/api/pos/menu/items/${id}` : '/api/pos/menu/items';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        this.closeMenuFormModal();
        await this.fetchData();
        this.renderStockManagement();
        this.showToast(id ? `Menu "${name}" berhasil diperbarui! ✨` : `Menu baru "${name}" berhasil ditambahkan! 🎉`);
      } else {
        alert(data.error || 'Gagal menyimpan menu.');
      }
    } catch (e) {
      alert('Terjadi kesalahan saat menyimpan menu.');
    }
  },

  async confirmDeleteMenu(itemId, itemName) {
    if (!confirm(`Yakin ingin menghapus menu "${itemName}"?\nMenu ini akan dihapus dari sistem kasir dan menu pemesanan pelanggan.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/pos/menu/items/${itemId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.fetchData();
        this.renderStockManagement();
        this.showToast(`Menu "${itemName}" berhasil dihapus.`);
      } else {
        alert(data.error || 'Gagal menghapus menu.');
      }
    } catch (e) {
      alert('Terjadi kesalahan saat menghapus menu.');
    }
  },

  // ================= CATEGORY MANAGEMENT MODAL =================
  openCategoryModal() {
    const modal = document.getElementById('category-modal');
    if (!modal) return;
    this.resetCategoryForm();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    this.renderCategoryModalList();
  },

  closeCategoryModal() {
    const modal = document.getElementById('category-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  async renderCategoryModalList() {
    const tbody = document.getElementById('category-table-body');
    if (!tbody) return;

    try {
      const res = await fetch('/api/pos/categories');
      const cats = await res.json();
      this.data.categories = cats;

      const iconEmoji = {
        coffee: '☕',
        sparkles: '✨',
        'cup-soda': '🥤',
        utensils: '🍽️',
        croissant: '🥐',
        'glass-water': '🍹',
        tea: '🍵',
        bread: '🥪',
        'ice-cream': '🍨'
      };

      tbody.innerHTML = cats.map(c => `
        <tr class="hover:bg-stone-800/40">
          <td class="p-2.5 font-medium text-white flex items-center gap-2">
            <span class="text-base">${iconEmoji[c.icon] || '📁'}</span>
            <span>${c.name}</span>
          </td>
          <td class="p-2.5 text-center text-stone-400 font-mono">${c.sort_order}</td>
          <td class="p-2.5 text-center">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${c.item_count > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-stone-800 text-stone-500'}">
              ${c.item_count} Menu
            </span>
          </td>
          <td class="p-2.5 text-right whitespace-nowrap">
            <div class="flex items-center justify-end gap-1.5">
              <button onclick="CashierApp.editCategory(${c.id}, '${c.name.replace(/'/g, "\\'")}', '${c.icon}', ${c.sort_order})" 
                class="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-amber-300 text-[11px] font-semibold border border-stone-700">
                Edit
              </button>
              <button onclick="CashierApp.deleteCategory(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${c.item_count})" 
                class="px-2 py-1 rounded bg-stone-800 hover:bg-red-900/60 text-stone-400 hover:text-red-300 text-[11px] font-semibold border border-stone-700">
                Hapus
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.error(e);
    }
  },

  editCategory(id, name, icon, order) {
    const idInput = document.getElementById('category-form-id');
    const nameInput = document.getElementById('category-form-name');
    const iconInput = document.getElementById('category-form-icon');
    const orderInput = document.getElementById('category-form-order');
    const titleElem = document.getElementById('category-form-title');
    const cancelBtn = document.getElementById('btn-cancel-cat-edit');

    if (idInput) idInput.value = id;
    if (nameInput) {
      nameInput.value = name;
      nameInput.focus();
    }
    if (iconInput) iconInput.value = icon || 'coffee';
    if (orderInput) orderInput.value = order || 1;
    if (titleElem) titleElem.textContent = `Edit Kategori: ${name}`;
    if (cancelBtn) cancelBtn.classList.remove('hidden');
  },

  resetCategoryForm() {
    const idInput = document.getElementById('category-form-id');
    const nameInput = document.getElementById('category-form-name');
    const iconInput = document.getElementById('category-form-icon');
    const orderInput = document.getElementById('category-form-order');
    const titleElem = document.getElementById('category-form-title');
    const cancelBtn = document.getElementById('btn-cancel-cat-edit');

    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (iconInput) iconInput.value = 'coffee';
    if (orderInput) orderInput.value = (this.data.categories.length + 1).toString();
    if (titleElem) titleElem.textContent = 'Tambah Kategori Baru';
    if (cancelBtn) cancelBtn.classList.add('hidden');
  },

  async saveCategoryForm() {
    const id = document.getElementById('category-form-id')?.value;
    const name = (document.getElementById('category-form-name')?.value || '').trim();
    const icon = document.getElementById('category-form-icon')?.value || 'coffee';
    const sort_order = parseInt(document.getElementById('category-form-order')?.value) || 0;

    if (!name) {
      alert('Nama kategori wajib diisi.');
      return;
    }

    const payload = { name, icon, sort_order };

    try {
      const url = id ? `/api/pos/categories/${id}` : '/api/pos/categories';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        this.resetCategoryForm();
        await this.fetchData();
        await this.renderCategoryModalList();
        if (this.data.activeTab === 'stock') this.renderStockManagement();
        this.showToast(id ? `Kategori "${name}" berhasil diperbarui!` : `Kategori "${name}" berhasil ditambahkan!`);
      } else {
        alert(data.error || 'Gagal menyimpan kategori.');
      }
    } catch (e) {
      alert('Terjadi kesalahan saat menyimpan kategori.');
    }
  },

  async deleteCategory(catId, catName, itemCount) {
    if (itemCount > 0) {
      alert(`Kategori "${catName}" tidak dapat dihapus karena masih digunakan oleh ${itemCount} menu.\nSilakan pindahkan atau hapus menu-menu tersebut terlebih dahulu.`);
      return;
    }

    if (!confirm(`Yakin ingin menghapus kategori "${catName}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/pos/categories/${catId}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        await this.fetchData();
        await this.renderCategoryModalList();
        if (this.data.activeTab === 'stock') this.renderStockManagement();
        this.showToast(`Kategori "${catName}" berhasil dihapus.`);
      } else {
        alert(data.error || 'Gagal menghapus kategori.');
      }
    } catch (e) {
      alert('Terjadi kesalahan saat menghapus kategori.');
    }
  },

  // ================= 5. MONTHLY REPORTS & EXCEL EXPORT =================
  async renderReports() {
    const container = document.getElementById('tab-content');
    if (!container) return;

    const isAdmin = this.data.currentUser && this.data.currentUser.role === 'admin';
    if (!isAdmin) {
      container.innerHTML = `
        <div class="bg-stone-900/60 rounded-3xl p-12 border border-stone-800 text-center max-w-lg mx-auto my-12 shadow-2xl">
          <div class="w-16 h-16 rounded-2xl bg-amber-500/10 text-[#C8822A] flex items-center justify-center text-3xl mx-auto mb-4 border border-amber-500/20">
            🔒
          </div>
          <h3 class="text-base font-extrabold text-white mb-2">Akses Terbatas (Khusus Admin)</h3>
          <p class="text-xs text-stone-400 mb-6 leading-relaxed">
            Laporan omset keuangan dan ekspor Excel hanya dapat diakses oleh akun Admin / Owner.
          </p>
          <button onclick="CashierApp.openLoginModal()" class="bg-[#C8822A] hover:bg-[#A06218] text-white text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-md">
            Masuk Sebagai Admin (PIN 1234)
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="bg-stone-900/60 rounded-2xl p-6 border border-stone-800 h-full flex flex-col overflow-y-auto">
        <!-- Top Toolbar with Excel Export & Filter -->
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 pb-4 border-b border-stone-800">
          <div>
            <h3 class="font-extrabold text-base text-white">Laporan Keuangan & Penjualan Bulanan</h3>
            <p class="text-xs text-stone-400">Analisis komprehensif omset, metode bayar, dan ekspor laporan ke Excel (.xlsx)</p>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <!-- Month Selector -->
            <select id="report-month-select" onchange="CashierApp.changeReportMonth(this.value)" class="bg-stone-800 text-stone-200 text-xs px-3 py-2 rounded-xl border border-stone-700">
              ${[
                'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
              ].map((m, idx) => `
                <option value="${idx + 1}" ${idx + 1 === this.data.reportMonth ? 'selected' : ''}>${m}</option>
              `).join('')}
            </select>

            <!-- Year Selector -->
            <select id="report-year-select" onchange="CashierApp.changeReportYear(this.value)" class="bg-stone-800 text-stone-200 text-xs px-3 py-2 rounded-xl border border-stone-700">
              ${[2024, 2025, 2026, 2027].map(y => `
                <option value="${y}" ${y === this.data.reportYear ? 'selected' : ''}>${y}</option>
              `).join('')}
            </select>

            <!-- Refresh Button -->
            <button onclick="CashierApp.loadMonthlyStats()" class="bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold px-3 py-2 rounded-xl border border-stone-700">
              🔄 Tampilkan
            </button>

            <!-- EXCEL EXPORT BUTTON -->
            <button onclick="CashierApp.downloadExcelReport()" 
              class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow-lg transition flex items-center gap-1.5 active:scale-95">
              <span>📥 Unduh Laporan Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        <div id="monthly-stats-content">
          <div class="text-center py-12 text-stone-500 text-xs">Memuat data laporan...</div>
        </div>
      </div>
    `;

    await this.loadMonthlyStats();
  },

  changeReportMonth(m) {
    this.data.reportMonth = Number(m);
    this.loadMonthlyStats();
  },

  changeReportYear(y) {
    this.data.reportYear = Number(y);
    this.loadMonthlyStats();
  },

  async loadMonthlyStats() {
    const target = document.getElementById('monthly-stats-content');
    if (!target) return;

    try {
      const url = `/api/pos/reports/monthly?month=${this.data.reportMonth}&year=${this.data.reportYear}`;
      const res = await fetch(url);
      const data = await res.json();
      this.data.monthlyStats = data;

      const monthName = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][this.data.reportMonth - 1];

      target.innerHTML = `
        <!-- KPI Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <div class="bg-stone-800/80 p-4 rounded-xl border border-stone-700">
            <span class="text-[11px] text-stone-400 block font-semibold">Total Omset (Lunas)</span>
            <span class="text-xl font-black text-emerald-400 mt-1 block">Rp ${data.paid_revenue.toLocaleString('id-ID')}</span>
            <span class="text-[10px] text-stone-500 mt-0.5 block">${monthName} ${this.data.reportYear}</span>
          </div>

          <div class="bg-stone-800/80 p-4 rounded-xl border border-stone-700">
            <span class="text-[11px] text-stone-400 block font-semibold">Total Transaksi</span>
            <span class="text-xl font-black text-white mt-1 block">${data.total_orders} Nota</span>
            <span class="text-[10px] text-stone-500 mt-0.5 block">Selesai diproses</span>
          </div>

          <div class="bg-stone-800/80 p-4 rounded-xl border border-stone-700">
            <span class="text-[11px] text-stone-400 block font-semibold">Total Menu Terjual</span>
            <span class="text-xl font-black text-amber-400 mt-1 block">${data.total_items_sold_count || 0} Porsi</span>
            <span class="text-[10px] text-stone-500 mt-0.5 block">Semua menu & cup</span>
          </div>

          <div class="bg-stone-800/80 p-4 rounded-xl border border-stone-700">
            <span class="text-[11px] text-stone-400 block font-semibold">Pendapatan QRIS</span>
            <span class="text-xl font-black text-[#E59838] mt-1 block">Rp ${data.qris_revenue.toLocaleString('id-ID')}</span>
            <span class="text-[10px] text-stone-500 mt-0.5 block">Non-tunai</span>
          </div>

          <div class="bg-stone-800/80 p-4 rounded-xl border border-stone-700">
            <span class="text-[11px] text-stone-400 block font-semibold">Pendapatan Tunai</span>
            <span class="text-xl font-black text-amber-300 mt-1 block">Rp ${data.cash_revenue.toLocaleString('id-ID')}</span>
            <span class="text-[10px] text-stone-500 mt-0.5 block">Cash kasir</span>
          </div>
        </div>

        <!-- 2 Columns: Daily Sales Breakdown & Top Selling Items -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
          <!-- Daily Breakdown (7 cols) -->
          <div class="lg:col-span-7 bg-stone-800/70 p-4 rounded-xl border border-stone-700 flex flex-col">
            <div class="flex justify-between items-center mb-3">
              <h4 class="font-bold text-xs uppercase tracking-wider text-white">Trend Penjualan Harian (${monthName})</h4>
              <span class="text-[11px] text-stone-400">${(data.daily_breakdown || []).length} hari aktif</span>
            </div>
            
            <div class="overflow-y-auto max-h-64 border border-stone-700/60 rounded-lg">
              <table class="w-full text-left text-xs text-stone-300">
                <thead class="bg-stone-900 uppercase text-[10px] font-bold text-stone-400 sticky top-0">
                  <tr>
                    <th class="p-2.5">Tanggal</th>
                    <th class="p-2.5 text-center">Nota</th>
                    <th class="p-2.5 text-right">QRIS</th>
                    <th class="p-2.5 text-right">Tunai</th>
                    <th class="p-2.5 text-right font-bold text-white">Total Omset</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-stone-800">
                  ${(data.daily_breakdown || []).length === 0 ? `
                    <tr><td colspan="5" class="p-4 text-center text-stone-500">Belum ada transaksi di bulan ini</td></tr>
                  ` : data.daily_breakdown.map(d => `
                    <tr class="hover:bg-stone-800/40">
                      <td class="p-2.5 font-medium text-white">${d.order_date}</td>
                      <td class="p-2.5 text-center">${d.count_orders}</td>
                      <td class="p-2.5 text-right text-amber-400">Rp ${d.daily_qris.toLocaleString('id-ID')}</td>
                      <td class="p-2.5 text-right text-amber-200">Rp ${d.daily_cash.toLocaleString('id-ID')}</td>
                      <td class="p-2.5 text-right font-bold text-emerald-400">Rp ${d.daily_revenue.toLocaleString('id-ID')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Top Items (5 cols) -->
          <div class="lg:col-span-5 bg-stone-800/70 p-4 rounded-xl border border-stone-700 flex flex-col">
            <h4 class="font-bold text-xs uppercase tracking-wider text-white mb-3">10 Menu Terlaris Bulan Ini</h4>
            <div class="space-y-2 overflow-y-auto max-h-64 pr-1">
              ${(data.top_items || []).length === 0 ? '<div class="text-xs text-stone-500 py-6 text-center">Belum ada data menu</div>' : data.top_items.map((it, idx) => `
                <div class="flex items-center justify-between p-2 rounded-lg bg-stone-900/60 text-xs">
                  <div class="flex items-center gap-2">
                    <span class="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-[10px]">${idx + 1}</span>
                    <span class="font-bold text-white">${it.name}</span>
                  </div>
                  <div class="text-right">
                    <span class="font-bold text-amber-400 block">${it.total_sold} porsi</span>
                    <span class="text-[10px] text-stone-400">Rp ${it.total_revenue.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- DEDICATED SECTION: REKAP PENJUALAN SEMUA MENU PER BULAN -->
        <div class="bg-stone-800/70 p-5 rounded-2xl border border-stone-700 mb-6 flex flex-col">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-base font-extrabold text-white">📦 Rekap Penjualan Semua Menu (Per Bulan)</span>
                <span class="bg-[#C8822A] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">${(data.all_menu_sales || []).length} Menu</span>
              </div>
              <p class="text-xs text-stone-400 mt-0.5">Rincian berapa banyak setiap menu terjual dan total omsetnya pada bulan ${monthName} ${this.data.reportYear}</p>
            </div>

            <!-- Search & Filter Controls -->
            <div class="flex items-center gap-2">
              <input type="text" id="filter-menu-sales-search" placeholder="Cari nama menu..." 
                oninput="CashierApp.filterAllMenuSalesTable()"
                class="bg-stone-900 text-stone-100 text-xs px-3 py-1.5 rounded-xl border border-stone-700 focus:outline-none focus:border-[#C8822A] w-44">
              <select id="filter-menu-sales-category" onchange="CashierApp.filterAllMenuSalesTable()"
                class="bg-stone-900 text-stone-200 text-xs px-3 py-1.5 rounded-xl border border-stone-700">
                <option value="all">Semua Kategori</option>
                ${this.data.categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- All Menu Items Table -->
          <div class="overflow-x-auto max-h-96 border border-stone-700/60 rounded-xl">
            <table class="w-full text-left text-xs text-stone-300">
              <thead class="bg-stone-900 uppercase text-[10px] font-bold text-stone-400 sticky top-0 shadow-sm">
                <tr>
                  <th class="p-3 text-center">No</th>
                  <th class="p-3">Menu</th>
                  <th class="p-3">Kategori</th>
                  <th class="p-3 text-right">Harga Satuan</th>
                  <th class="p-3 text-center font-bold text-amber-400">Total Terjual (Porsi/Cup)</th>
                  <th class="p-3 text-right font-bold text-emerald-400">Total Omset Produk</th>
                  <th class="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody id="all-menu-sales-tbody" class="divide-y divide-stone-800">
                ${(data.all_menu_sales || []).map((m, idx) => {
                  const isSold = m.total_sold > 0;
                  return `
                    <tr class="hover:bg-stone-800/40 all-menu-row" data-name="${m.name.toLowerCase()}" data-category="${m.category_name}">
                      <td class="p-3 text-center font-bold text-stone-500">${idx + 1}</td>
                      <td class="p-3 flex items-center gap-2.5">
                        <img src="${m.image_url}" alt="${m.name}" class="w-8 h-8 rounded-lg object-cover bg-stone-900" onerror="this.src='https://images.unsplash.com/photo-1509785307050-d4066910ec1e?w=100'">
                        <span class="font-bold text-white text-xs">${m.name}</span>
                      </td>
                      <td class="p-3 text-stone-400">${m.category_name}</td>
                      <td class="p-3 text-right text-stone-300">Rp ${m.price.toLocaleString('id-ID')}</td>
                      <td class="p-3 text-center">
                        <span class="px-2.5 py-1 rounded-full font-black text-xs ${isSold ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-stone-800 text-stone-500'}">
                          ${m.total_sold} Porsi
                        </span>
                      </td>
                      <td class="p-3 text-right font-bold ${isSold ? 'text-emerald-400' : 'text-stone-500'}">
                        Rp ${m.total_revenue.toLocaleString('id-ID')}
                      </td>
                      <td class="p-3 text-center">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${m.total_sold >= 10 ? 'bg-emerald-500/20 text-emerald-300' : isSold ? 'bg-blue-500/20 text-blue-300' : 'bg-stone-800 text-stone-500'}">
                          ${m.total_sold >= 10 ? 'Sangat Laris' : isSold ? 'Terjual' : 'Belum Terjual'}
                        </span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              <tfoot class="bg-stone-900/90 font-bold text-xs text-white border-t border-stone-700">
                <tr>
                  <td colspan="4" class="p-3 text-right uppercase tracking-wider text-stone-400">Total Keseluruhan Menu Terjual:</td>
                  <td class="p-3 text-center text-amber-300 font-black text-sm">${data.total_items_sold_count || 0} Porsi</td>
                  <td class="p-3 text-right text-emerald-400 font-black text-sm">Rp ${(data.all_menu_sales || []).reduce((sum, i) => sum + i.total_revenue, 0).toLocaleString('id-ID')}</td>
                  <td class="p-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Transactions Table -->
        <div class="bg-stone-800/70 p-4 rounded-xl border border-stone-700 flex flex-col">
          <div class="flex justify-between items-center mb-3">
            <h4 class="font-bold text-xs uppercase tracking-wider text-white">Daftar Transaksi Lengkap (${(data.transactions || []).length} Transaksi)</h4>
          </div>
          <div class="overflow-x-auto max-h-80 border border-stone-700/60 rounded-lg">
            <table class="w-full text-left text-xs text-stone-300">
              <thead class="bg-stone-900 uppercase text-[10px] font-bold text-stone-400 sticky top-0">
                <tr>
                  <th class="p-2.5">No Nota</th>
                  <th class="p-2.5">Waktu</th>
                  <th class="p-2.5">Staff Kasir</th>
                  <th class="p-2.5">Meja</th>
                  <th class="p-2.5">Pelanggan</th>
                  <th class="p-2.5">Menu</th>
                  <th class="p-2.5 text-right">Total</th>
                  <th class="p-2.5 text-center">Metode</th>
                  <th class="p-2.5 text-center">Status</th>
                  <th class="p-2.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stone-800">
                ${(data.transactions || []).length === 0 ? `
                  <tr><td colspan="10" class="p-4 text-center text-stone-500">Tidak ada transaksi</td></tr>
                ` : data.transactions.map(o => `
                  <tr class="hover:bg-stone-800/40">
                    <td class="p-2.5 font-bold text-white">${o.order_number}</td>
                    <td class="p-2.5 text-stone-400">${(o.created_at || '').slice(0, 16)}</td>
                    <td class="p-2.5 text-stone-300">${o.cashier_name || 'Staff Kasir'}</td>
                    <td class="p-2.5 font-bold text-emerald-400">${o.table_number}</td>
                    <td class="p-2.5">${o.customer_name}</td>
                    <td class="p-2.5 text-stone-400 text-[11px] max-w-xs truncate">${(o.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ')}</td>
                    <td class="p-2.5 text-right font-bold text-white">Rp ${o.total_amount.toLocaleString('id-ID')}</td>
                    <td class="p-2.5 text-center font-semibold text-stone-300">${o.payment_method}</td>
                    <td class="p-2.5 text-center">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${o.payment_status === 'PAID' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}">
                        ${o.payment_status}
                      </span>
                    </td>
                    <td class="p-2.5 text-center">
                      <div class="flex items-center justify-center gap-1">
                        <button onclick="CashierApp.printReceipt(${o.id})" class="text-[11px] bg-stone-700 hover:bg-stone-600 px-2 py-1 rounded text-stone-200" title="Cetak Struk">
                          Struk
                        </button>
                        ${this.data.currentUser?.role === 'admin' ? `
                          <button onclick="CashierApp.deleteOrder(${o.id}, '${o.order_number}')" 
                            class="text-[11px] bg-rose-950/50 hover:bg-rose-900 border border-rose-800/60 px-2 py-1 rounded text-rose-300 hover:text-white transition" 
                            title="Hapus Pesanan (Admin)">
                            🗑️
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (e) {
      target.innerHTML = `<div class="p-6 text-center text-red-400 text-xs">Gagal memuat statistik laporan bulanan.</div>`;
    }
  },

  downloadExcelReport() {
    const url = `/api/pos/reports/export-excel?month=${this.data.reportMonth}&year=${this.data.reportYear}`;
    window.open(url, '_blank');
  },

  filterAllMenuSalesTable() {
    const searchVal = (document.getElementById('filter-menu-sales-search')?.value || '').toLowerCase().trim();
    const catVal = document.getElementById('filter-menu-sales-category')?.value || 'all';

    document.querySelectorAll('.all-menu-row').forEach(row => {
      const name = row.dataset.name || '';
      const cat = row.dataset.category || '';

      const matchesSearch = !searchVal || name.includes(searchVal);
      const matchesCat = catVal === 'all' || cat === catVal;

      if (matchesSearch && matchesCat) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  },

  // ================= 6. USER & STAFF MANAGEMENT (ADMIN) =================
  async renderUsersManagement() {
    const container = document.getElementById('tab-content');
    if (!container) return;

    if (this.data.currentUser?.role !== 'admin') {
      container.innerHTML = `
        <div class="p-12 text-center text-stone-400">
          <p class="text-sm font-bold text-red-400">Akses Terbatas (Khusus Admin / Owner)</p>
          <p class="text-xs mt-1">Silakan login sebagai Admin untuk mengelola akun staf kasir.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="bg-stone-900/60 rounded-2xl p-6 border border-stone-800 h-full flex flex-col">
        <div class="flex justify-between items-center mb-6">
          <div>
            <h3 class="font-extrabold text-base text-white">Manajemen Akun Staff Kasir & Barista</h3>
            <p class="text-xs text-stone-400">Kelola akun, hak akses role, dan PIN 4-digit untuk login cepat</p>
          </div>
          <button onclick="CashierApp.openUserFormModal()" 
            class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-1.5 active:scale-95">
            <span>+ Tambah Staff Baru</span>
          </button>
        </div>

        <div id="users-table-container" class="overflow-y-auto flex-1 border border-stone-800 rounded-xl">
          <div class="p-6 text-center text-stone-500 text-xs">Memuat data staf...</div>
        </div>
      </div>
    `;

    await this.loadUsersList();
  },

  async loadUsersList() {
    const tableContainer = document.getElementById('users-table-container');
    if (!tableContainer) return;

    try {
      const res = await fetch('/api/users');
      const users = await res.json();
      this.data.usersList = users;

      tableContainer.innerHTML = `
        <table class="w-full text-left text-xs text-stone-300">
          <thead class="bg-stone-800/80 uppercase text-[10px] font-bold text-stone-400 sticky top-0">
            <tr>
              <th class="p-3">Nama Lengkap</th>
              <th class="p-3">Username</th>
              <th class="p-3">Role / Hak Akses</th>
              <th class="p-3">PIN Cepat</th>
              <th class="p-3 text-center">Status</th>
              <th class="p-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-800">
            ${users.map(u => `
              <tr class="hover:bg-stone-800/40">
                <td class="p-3 font-bold text-white">${u.full_name}</td>
                <td class="p-3 text-stone-400">${u.username}</td>
                <td class="p-3">
                  <span class="px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${u.role === 'admin' ? 'bg-amber-500/20 text-amber-300' : u.role === 'kasir' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}">
                    ${u.role}
                  </span>
                </td>
                <td class="p-3 font-mono font-bold text-amber-400">${u.pin}</td>
                <td class="p-3 text-center">
                  <span class="px-2 py-0.5 rounded-full font-bold text-[10px] ${u.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}">
                    ${u.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td class="p-3 text-center flex items-center justify-center gap-1.5">
                  <button onclick="CashierApp.openUserFormModal(${u.id})" class="bg-stone-700 hover:bg-stone-600 text-stone-200 px-2.5 py-1 rounded text-xs font-semibold">
                    Edit
                  </button>
                  <button onclick="CashierApp.toggleUserStatus(${u.id})" class="bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white px-2 py-1 rounded text-xs">
                    ${u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      tableContainer.innerHTML = `<div class="p-6 text-center text-red-400 text-xs">Gagal memuat daftar staff.</div>`;
    }
  },

  openUserFormModal(userId = null) {
    const modal = document.getElementById('user-form-modal');
    if (!modal) return;

    let user = null;
    if (userId) {
      user = this.data.usersList.find(u => u.id === userId);
    }

    document.getElementById('user-form-id').value = user ? user.id : '';
    document.getElementById('user-form-fullname').value = user ? user.full_name : '';
    document.getElementById('user-form-username').value = user ? user.username : '';
    document.getElementById('user-form-role').value = user ? user.role : 'kasir';
    document.getElementById('user-form-pin').value = user ? user.pin : '';
    document.getElementById('user-form-password').value = '';
    document.getElementById('user-form-title').textContent = user ? 'Edit Akun Staff' : 'Tambah Staff Kasir Baru';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  closeUserFormModal() {
    const modal = document.getElementById('user-form-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  async saveUserForm() {
    const id = document.getElementById('user-form-id').value;
    const full_name = document.getElementById('user-form-fullname').value.trim();
    const username = document.getElementById('user-form-username').value.trim();
    const role = document.getElementById('user-form-role').value;
    const pin = document.getElementById('user-form-pin').value.trim();
    const password = document.getElementById('user-form-password').value.trim();

    if (!full_name || !username || !pin) {
      alert('Nama lengkap, username, dan PIN 4-digit wajib diisi!');
      return;
    }

    const payload = { id: id ? Number(id) : null, full_name, username, role, pin, password };

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.closeUserFormModal();
        this.loadUsersList();
        this.showToast('Data staf berhasil disimpan!');
      } else {
        alert(data.error || 'Gagal menyimpan data staf.');
      }
    } catch (e) {
      alert('Terjadi kesalahan koneksi.');
    }
  },

  async toggleUserStatus(userId) {
    if (!confirm('Ubah status aktif staff ini?')) return;
    try {
      const res = await fetch(`/api/users/${userId}/toggle-status`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.loadUsersList();
        this.showToast('Status staff diperbarui.');
      }
    } catch (e) {
      alert('Gagal mengubah status.');
    }
  },

  // ================= NOTIFICATIONS & TOASTS =================
  showToast(message, isUrgent = false) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl text-xs font-bold text-white flex items-center gap-2 transition-all transform duration-300 ${isUrgent ? 'bg-red-600 animate-bounce' : 'bg-emerald-600'}`;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  },

  renderWaiterCallsBanner() {
    const container = document.getElementById('waiter-calls-container');
    if (!container) return;
    if (this.data.waiterCalls.length === 0) {
      container.innerHTML = '';
      return;
    }
    const latest = this.data.waiterCalls[0];
    container.innerHTML = `
      <div class="bg-red-600/90 text-white px-4 py-2 text-xs font-bold flex items-center justify-between animate-pulse">
        <span>🚨 Panggilan Pelayan: <strong>${latest.table_number}</strong> membutuhkan bantuan! (${latest.timestamp || 'Barusan'})</span>
        <button onclick="CashierApp.resolveWaiterCall(${latest.id})" class="bg-white text-red-700 px-3 py-1 rounded font-extrabold hover:bg-stone-100 text-[11px]">
          Tandai Selesai
        </button>
      </div>
    `;
  },

  async resolveWaiterCall(callId) {
    await fetch(`/api/pos/waiter-calls/${callId}/resolve`, { method: 'POST' });
    this.data.waiterCalls = this.data.waiterCalls.filter(c => c.id !== callId);
    this.renderWaiterCallsBanner();
  },

  // ================= THERMAL PRINTER SETTINGS & HARDWARE =================
  openPrinterModal() {
    const s = this.data.settings || {};
    const conn = s.printer_connection || 'browser';
    const paper = s.printer_paper_width || '58mm';
    const autoPrint = s.printer_auto_print !== '0';
    const autoCut = s.printer_auto_cut !== '0';
    const showLogo = s.receipt_show_logo !== '0';
    const ip = s.printer_ip || '192.168.1.200';
    const port = s.printer_port || '9100';
    const footer = s.receipt_footer_msg || 'Terima kasih telah singgah & tedhuh bersama kami.';

    // Radio printer_conn
    const connRadios = document.querySelectorAll('input[name="printer_conn"]');
    connRadios.forEach(r => { r.checked = (r.value === conn); });

    // Radio printer_paper_width
    const paperRadios = document.querySelectorAll('input[name="printer_paper_width"]');
    paperRadios.forEach(r => { r.checked = (r.value === paper); });

    // Checkboxes
    const autoPrintEl = document.getElementById('setting-printer-autoprint');
    if (autoPrintEl) autoPrintEl.checked = autoPrint;

    const autoCutEl = document.getElementById('setting-printer-autocut');
    if (autoCutEl) autoCutEl.checked = autoCut;

    const logoEl = document.getElementById('setting-receipt-logo');
    if (logoEl) logoEl.checked = showLogo;

    // Inputs
    const ipEl = document.getElementById('setting-printer-ip');
    if (ipEl) ipEl.value = ip;

    const portEl = document.getElementById('setting-printer-port');
    if (portEl) portEl.value = port;

    const footerEl = document.getElementById('setting-receipt-footer');
    if (footerEl) footerEl.value = footer;

    this.selectPrinterConn(conn);

    const modal = document.getElementById('printer-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closePrinterModal() {
    const modal = document.getElementById('printer-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  selectPrinterConn(type) {
    const options = ['browser', 'bluetooth', 'network'];
    options.forEach(opt => {
      const el = document.getElementById(`opt-conn-${opt}`);
      const radio = document.querySelector(`input[name="printer_conn"][value="${opt}"]`);
      if (opt === type) {
        if (el) {
          el.className = 'printer-conn-option cursor-pointer p-3 rounded-2xl border transition flex flex-col justify-between border-[#C8822A] bg-amber-500/10 shadow-sm';
        }
        if (radio) radio.checked = true;
      } else {
        if (el) {
          el.className = 'printer-conn-option cursor-pointer p-3 rounded-2xl border transition flex flex-col justify-between border-stone-800 bg-stone-950/60 hover:border-stone-700';
        }
      }
    });

    const panelBt = document.getElementById('panel-conn-bluetooth');
    const panelNet = document.getElementById('panel-conn-network');
    if (panelBt) panelBt.classList.toggle('hidden', type !== 'bluetooth');
    if (panelNet) panelNet.classList.toggle('hidden', type !== 'network');

    // Update Live Banner in modal
    const iconEl = document.getElementById('printer-status-icon');
    const titleEl = document.getElementById('printer-status-title');
    const descEl = document.getElementById('printer-status-desc');
    const tagEl = document.getElementById('printer-status-tag');
    const dot = document.getElementById('printer-status-dot');

    if (type === 'browser') {
      if (iconEl) iconEl.textContent = '🟢';
      if (titleEl) titleEl.textContent = 'Driver Browser / Windows Siap';
      if (descEl) descEl.textContent = 'Mencetak via print dialog browser (kompatibel semua kabel USB & driver printer Windows)';
      if (tagEl) {
        tagEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        tagEl.textContent = 'Siap Digunakan';
      }
      if (dot) {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
        dot.title = 'Printer: Driver USB/Windows (Aktif)';
      }
    } else if (type === 'bluetooth') {
      const isBtConnected = this.data.btDevice && this.data.btDevice.gatt && this.data.btDevice.gatt.connected;
      if (isBtConnected) {
        if (iconEl) iconEl.textContent = '📶';
        if (titleEl) titleEl.textContent = `Terhubung: ${this.data.btDevice.name || 'Printer Bluetooth'}`;
        if (descEl) descEl.textContent = 'Koneksi BLE aktif & siap mencetak struk thermal langsung';
        if (tagEl) {
          tagEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
          tagEl.textContent = 'Bluetooth Online';
        }
        if (dot) {
          dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
          dot.title = `Bluetooth: ${this.data.btDevice.name || 'Online'}`;
        }
      } else {
        if (iconEl) iconEl.textContent = '🟡';
        if (titleEl) titleEl.textContent = 'Web Bluetooth Dipilih';
        if (descEl) descEl.textContent = 'Silakan klik tombol "Scan Bluetooth" untuk memasangkan printer thermal';
        if (tagEl) {
          tagEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30';
          tagEl.textContent = 'Belum Pairing';
        }
        if (dot) {
          dot.className = 'w-2 h-2 rounded-full bg-amber-400';
          dot.title = 'Bluetooth: Belum Pairing';
        }
      }
    } else if (type === 'network') {
      const ip = document.getElementById('setting-printer-ip')?.value || this.data.settings?.printer_ip || '192.168.1.200';
      const port = document.getElementById('setting-printer-port')?.value || this.data.settings?.printer_port || '9100';
      if (iconEl) iconEl.textContent = '🌐';
      if (titleEl) titleEl.textContent = `Jaringan LAN / Wi-Fi (Port ${port})`;
      if (descEl) descEl.textContent = `ESC/POS TCP Socket siap kirim ke alamat ${ip}:${port}`;
      if (tagEl) {
        tagEl.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30';
        tagEl.textContent = 'TCP Socket LAN';
      }
      if (dot) {
        dot.className = 'w-2 h-2 rounded-full bg-blue-400';
        dot.title = `LAN Printer: ${ip}:${port}`;
      }
    }
  },

  updatePrinterStatusDot() {
    const s = this.data.settings || {};
    const conn = s.printer_connection || 'browser';
    const dot = document.getElementById('printer-status-dot');
    if (!dot) return;

    if (conn === 'browser') {
      dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      dot.title = 'Printer: Driver USB/Windows (Aktif)';
    } else if (conn === 'bluetooth') {
      const isBt = this.data.btDevice && this.data.btDevice.gatt && this.data.btDevice.gatt.connected;
      dot.className = isBt ? 'w-2 h-2 rounded-full bg-emerald-400' : 'w-2 h-2 rounded-full bg-amber-400';
      dot.title = isBt ? `Printer: Bluetooth (${this.data.btDevice.name})` : 'Printer: Bluetooth (Belum Tersambung)';
    } else if (conn === 'network') {
      dot.className = 'w-2 h-2 rounded-full bg-blue-400';
      dot.title = `Printer: LAN / Wi-Fi (${s.printer_ip || '192.168.1.200'})`;
    }
  },

  async connectBluetoothPrinter() {
    if (!navigator.bluetooth) {
      alert('Fitur Web Bluetooth memerlukan peramban Google Chrome atau Microsoft Edge (desktop/Android) dengan koneksi aman (localhost atau HTTPS).');
      return;
    }

    try {
      this.showToast('🔍 Memindai printer Bluetooth terdekat...');
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          '0000ffe0-0000-1000-8000-00805f9b34fb',
          '0000ff00-0000-1000-8000-00805f9b34fb'
        ]
      });

      const server = await device.gatt.connect();
      this.data.btDevice = device;

      // Find writable characteristic
      let writeChar = null;
      try {
        const services = await server.getPrimaryServices();
        for (const service of services) {
          const chars = await service.getCharacteristics();
          for (const ch of chars) {
            if (ch.properties.write || ch.properties.writeWithoutResponse) {
              writeChar = ch;
              break;
            }
          }
          if (writeChar) break;
        }
      } catch (svcErr) {
        console.warn('GATT service query fallback:', svcErr);
      }

      this.data.btCharacteristic = writeChar;

      // Update UI
      const info = document.getElementById('bluetooth-device-info');
      if (info) {
        info.innerHTML = `<span class="text-emerald-400 font-bold">✅ Terhubung ke: ${device.name || 'Printer Bluetooth'}</span>`;
      }
      const discBtn = document.getElementById('btn-disconnect-bt');
      if (discBtn) discBtn.classList.remove('hidden');

      this.selectPrinterConn('bluetooth');
      this.showToast(`Berhasil terhubung ke ${device.name || 'Printer Bluetooth'}!`);

      device.addEventListener('gattserverdisconnected', () => {
        this.disconnectBluetoothPrinter(false);
        this.showToast('Printer Bluetooth terputus.', true);
      });
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        console.error('Bluetooth Connection Error:', err);
        alert('Gagal menghubungkan printer Bluetooth: ' + err.message);
      }
    }
  },

  disconnectBluetoothPrinter(notify = true) {
    if (this.data.btDevice && this.data.btDevice.gatt) {
      try { this.data.btDevice.gatt.disconnect(); } catch (e) {}
    }
    this.data.btDevice = null;
    this.data.btCharacteristic = null;

    const info = document.getElementById('bluetooth-device-info');
    if (info) info.textContent = 'Belum ada printer Bluetooth terhubung';

    const discBtn = document.getElementById('btn-disconnect-bt');
    if (discBtn) discBtn.classList.add('hidden');

    this.selectPrinterConn('bluetooth');
    if (notify) this.showToast('Koneksi Bluetooth diputuskan.');
  },

  async testNetworkPrinter() {
    const ip = document.getElementById('setting-printer-ip')?.value?.trim();
    const port = parseInt(document.getElementById('setting-printer-port')?.value || '9100', 10);

    if (!ip) {
      alert('Masukkan IP Address printer terlebih dahulu.');
      return;
    }

    try {
      this.showToast(`Menguji koneksi socket ke ${ip}:${port}...`);
      const res = await fetch('/api/pos/printer/test-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`✅ ${data.message}`);
      } else {
        alert(`Gagal koneksi ke printer LAN: ${data.error}`);
      }
    } catch (e) {
      alert('Terjadi kesalahan menghubungi server untuk tes printer LAN.');
    }
  },

  async savePrinterSettings() {
    const connRadio = document.querySelector('input[name="printer_conn"]:checked');
    const paperRadio = document.querySelector('input[name="printer_paper_width"]:checked');

    const conn = connRadio ? connRadio.value : 'browser';
    const paper = paperRadio ? paperRadio.value : '58mm';
    const autoPrint = document.getElementById('setting-printer-autoprint')?.checked ? '1' : '0';
    const autoCut = document.getElementById('setting-printer-autocut')?.checked ? '1' : '0';
    const showLogo = document.getElementById('setting-receipt-logo')?.checked ? '1' : '0';
    const ip = document.getElementById('setting-printer-ip')?.value?.trim() || '192.168.1.200';
    const port = document.getElementById('setting-printer-port')?.value?.trim() || '9100';
    const footer = document.getElementById('setting-receipt-footer')?.value?.trim() || 'Terima kasih telah singgah & tedhuh bersama kami.';

    const payload = {
      printer_connection: conn,
      printer_paper_width: paper,
      printer_auto_print: autoPrint,
      printer_auto_cut: autoCut,
      receipt_show_logo: showLogo,
      printer_ip: ip,
      printer_port: port,
      receipt_footer_msg: footer
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.data.settings = { ...this.data.settings, ...payload };
        this.updatePrinterStatusDot();
        this.closePrinterModal();
        this.showToast('✅ Pengaturan printer thermal berhasil disimpan!');
      } else {
        alert(data.error || 'Gagal menyimpan pengaturan.');
      }
    } catch (e) {
      alert('Terjadi kesalahan koneksi.');
    }
  },

  buildEscPosTestTicket() {
    // Generate ESC/POS byte sequence for thermal test
    const encoder = new TextEncoder();
    const init = new Uint8Array([0x1B, 0x40]); // ESC @
    const alignCenter = new Uint8Array([0x1B, 0x61, 0x01]); // ESC a 1
    const alignLeft = new Uint8Array([0x1B, 0x61, 0x00]); // ESC a 0
    const boldOn = new Uint8Array([0x1B, 0x45, 0x01]);
    const boldOff = new Uint8Array([0x1B, 0x45, 0x00]);
    const doubleSize = new Uint8Array([0x1D, 0x21, 0x11]);
    const normalSize = new Uint8Array([0x1D, 0x21, 0x00]);
    const cut = new Uint8Array([0x1D, 0x56, 0x41, 0x03]); // Feed & Cut

    const textHeader = encoder.encode("KEDAI TEDHUH\n");
    const textSub = encoder.encode("TEST PRINT STRUK THERMAL\n--------------------------------\n");
    const textBody = encoder.encode("Status: KONEKSI BLUETOOTH OK\nTanggal: " + new Date().toLocaleString('id-ID') + "\nPaper: " + (this.data.settings?.printer_paper_width || '58mm') + "\n--------------------------------\nTerima kasih!\n\n\n\n");

    const parts = [
      init,
      alignCenter,
      boldOn,
      doubleSize,
      textHeader,
      normalSize,
      boldOff,
      textSub,
      alignLeft,
      textBody,
      cut
    ];

    let totalLen = parts.reduce((acc, p) => acc + p.length, 0);
    let merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) {
      merged.set(p, offset);
      offset += p.length;
    }
    return merged;
  },

  async testPrintThermal() {
    const connRadio = document.querySelector('input[name="printer_conn"]:checked');
    const conn = connRadio ? connRadio.value : (this.data.settings?.printer_connection || 'browser');

    if (conn === 'bluetooth') {
      if (!this.data.btCharacteristic) {
        alert('Printer Bluetooth belum terhubung. Klik "Scan Bluetooth" terlebih dahulu untuk menghubungkan.');
        return;
      }
      try {
        this.showToast('🖨️ Mengirim data cetak via Bluetooth...');
        const bytes = this.buildEscPosTestTicket();
        // Send in 100-byte chunks for BLE MTU safety
        const chunkSize = 100;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.slice(i, i + chunkSize);
          await this.data.btCharacteristic.writeValue(chunk);
          await new Promise(r => setTimeout(r, 20));
        }
        this.showToast('✅ Berhasil mencetak struk tes Bluetooth!');
      } catch (btErr) {
        console.error('Bluetooth write error:', btErr);
        alert('Gagal mengirim ke printer Bluetooth: ' + btErr.message);
      }
    } else if (conn === 'network') {
      await this.testNetworkPrinter();
    } else {
      // Browser / Windows Driver fallback
      this.printReceipt('test');
    }
  }
};

window.CashierApp = CashierApp;
