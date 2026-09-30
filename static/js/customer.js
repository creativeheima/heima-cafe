/**
 * KEDAI TEDHUH - CUSTOMER ORDERING LOGIC (TABLE ISOLATED)
 */

const CustomerApp = {
  data: {
    categories: [],
    menuItems: [],
    tables: [],
    settings: {},
    activeCategory: 'all',
    searchQuery: '',
    selectedTable: '',
    customerName: '',
    cart: [],
    currentItem: null,
    activeOrder: null,
    sseSource: null
  },

  getTableKey() {
    return 'tedhuh_order_' + (this.data.selectedTable || 'general').replace(/[^a-zA-Z0-9]/g, '_');
  },

  init(initialTable) {
    // 1. Determine table number (URL priority over storage)
    if (initialTable) {
      this.data.selectedTable = initialTable;
      localStorage.setItem('tedhuh_table', initialTable);
    } else {
      this.data.selectedTable = localStorage.getItem('tedhuh_table') || 'Meja 01';
    }

    // 2. Load customer name
    this.data.customerName = localStorage.getItem('tedhuh_customer_name') || '';

    // 3. Load cart for this table
    const cartKey = 'tedhuh_cart_' + (this.data.selectedTable || 'general').replace(/[^a-zA-Z0-9]/g, '_');
    const savedCart = localStorage.getItem(cartKey);
    if (savedCart) {
      try { this.data.cart = JSON.parse(savedCart); } catch (e) { this.data.cart = []; }
    }

    // 4. Check if there is an active order STRICTLY for this table
    const savedOrderId = localStorage.getItem(this.getTableKey());
    if (savedOrderId) {
      this.checkActiveOrder(savedOrderId, false); // false = don't force popup on browse
    }

    // 5. Fetch initial menu & tables
    this.fetchData();
    this.initSSE();

    // Audio interaction unlock
    document.addEventListener('click', () => {
      if (window.cafeAudio) window.cafeAudio.init();
    }, { once: true });
  },

  async fetchData() {
    try {
      const [menuRes, tablesRes, settingsRes] = await Promise.all([
        fetch('/api/menu').then(r => r.json()),
        fetch('/api/tables').then(r => r.json()),
        fetch('/api/settings').then(r => r.json())
      ]);

      this.data.categories = menuRes.categories || [];
      this.data.menuItems = menuRes.items || [];
      this.data.tables = tablesRes || [];
      this.data.settings = settingsRes || {};

      this.renderTableSelector();
      this.renderCategories();
      this.renderMenu();
      this.updateCartUI();
      this.updateFloatingStatusButton();
    } catch (err) {
      console.error('Failed to load menu data:', err);
    }
  },

  initSSE() {
    if (!window.EventSource) return;
    this.data.sseSource = new EventSource('/api/stream');
    
    // Listen for order status updates STRICTLY filtered by table_number
    this.data.sseSource.addEventListener('order_status_updated', (e) => {
      const update = JSON.parse(e.data);
      
      // CRITICAL FIX: Only process if update belongs to THIS table!
      if (update.table_number !== this.data.selectedTable) {
        return;
      }

      if (this.data.activeOrder && this.data.activeOrder.id == update.order_id) {
        this.data.activeOrder.order_status = update.order_status;
        this.data.activeOrder.payment_status = update.payment_status;
        
        // Update floating tracker button
        this.updateFloatingStatusButton();

        // If tracking modal is open, re-render it
        const modal = document.getElementById('tracking-modal');
        if (modal && !modal.classList.contains('hidden')) {
          this.renderTrackingModal();
        }

        // Play gentle chime
        if (window.cafeAudio) window.cafeAudio.playSuccess();
      }
    });

    // Menu stock updates
    this.data.sseSource.addEventListener('menu_stock_changed', (e) => {
      const update = JSON.parse(e.data);
      const item = this.data.menuItems.find(i => i.id == update.item_id);
      if (item) {
        item.is_available = update.is_available;
        this.renderMenu();
      }
    });

    // Menu or Category CRUD changes from Admin POS
    this.data.sseSource.addEventListener('menu_updated', () => {
      this.fetchData();
    });

    // Order deleted by admin
    this.data.sseSource.addEventListener('order_deleted', (e) => {
      const update = JSON.parse(e.data);
      if (this.data.activeOrder && this.data.activeOrder.id == update.order_id) {
        this.data.activeOrder = null;
        localStorage.removeItem(this.getTableKey());
        this.updateFloatingStatusButton();
        this.closeTrackingModal();
        alert(`Pesanan ${update.order_number} telah dihapus/dibatalkan oleh kasir.`);
      }
    });
  },

  // ---------------- UI RENDERING ----------------
  renderTableSelector() {
    const badge = document.getElementById('current-table-badge');
    if (badge) {
      badge.textContent = this.data.selectedTable || 'Pilih Meja';
    }
    this.populateDrawerTableOptions();
  },

  renderCategories() {
    const container = document.getElementById('category-pills');
    if (!container) return;

    let html = `
      <button onclick="CustomerApp.selectCategory('all')" 
        class="category-pill whitespace-nowrap px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 shadow-sm
        ${this.data.activeCategory === 'all' 
          ? 'bg-[#472E0B] text-white shadow-md' 
          : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'}">
        Semua Menu
      </button>
    `;

    this.data.categories.forEach(cat => {
      const active = this.data.activeCategory === cat.id;
      html += `
        <button onclick="CustomerApp.selectCategory(${cat.id})" 
          class="category-pill whitespace-nowrap px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 shadow-sm flex items-center gap-1.5
          ${active 
            ? 'bg-[#472E0B] text-white shadow-md' 
            : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'}">
          ${cat.name}
        </button>
      `;
    });

    container.innerHTML = html;
  },

  selectCategory(catId) {
    this.data.activeCategory = catId;
    this.renderCategories();
    this.renderMenu();
  },

  searchMenu(query) {
    this.data.searchQuery = query.toLowerCase().trim();
    this.renderMenu();
  },

  renderMenu() {
    const grid = document.getElementById('menu-grid');
    if (!grid) return;

    let filtered = this.data.menuItems;

    if (this.data.activeCategory !== 'all') {
      filtered = filtered.filter(item => item.category_id === this.data.activeCategory);
    }

    if (this.data.searchQuery) {
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(this.data.searchQuery) ||
        (item.description && item.description.toLowerCase().includes(this.data.searchQuery))
      );
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-16 text-center text-stone-500">
          <p class="font-medium text-stone-700">Menu tidak ditemukan</p>
          <p class="text-xs text-stone-400 mt-1">Coba cari dengan kata kunci lain.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(item => {
      const isAvailable = item.is_available === 1;
      return `
        <div class="menu-card bg-white rounded-2xl overflow-hidden border border-stone-200/80 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between ${!isAvailable ? 'opacity-60 grayscale-[40%]' : ''}">
          <div>
            <div class="relative h-44 w-full bg-stone-100 overflow-hidden">
              <img src="${item.image_url}" alt="${item.name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-300 hover:scale-105" 
                   onerror="this.src='https://images.unsplash.com/photo-1509785307050-d4066910ec1e?w=500&auto=format&fit=crop&q=80'" />
              
              ${item.badge ? `
                <span class="absolute top-3 left-3 bg-[#C8822A] text-white text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full shadow-sm">
                  ${item.badge}
                </span>
              ` : ''}

              ${!isAvailable ? `
                <div class="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center">
                  <span class="bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md uppercase tracking-wider">
                    Habis Terjual
                  </span>
                </div>
              ` : ''}
            </div>

            <div class="p-4">
              <h3 class="font-bold text-base text-stone-800 line-clamp-1">${item.name}</h3>
              <p class="text-xs text-stone-500 mt-1 line-clamp-2 leading-relaxed">${item.description || ''}</p>
            </div>
          </div>

          <div class="p-4 pt-0 flex items-center justify-between mt-auto">
            <div>
              <span class="text-xs text-stone-400 block font-medium">Harga</span>
              <span class="text-base font-bold text-[#472E0B]">Rp ${item.price.toLocaleString('id-ID')}</span>
            </div>

            ${isAvailable ? `
              <button onclick="CustomerApp.openCustomizeModal(${item.id})" 
                class="bg-[#472E0B] hover:bg-[#5C3C10] text-white text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm active:scale-95">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                Pilih
              </button>
            ` : `
              <button disabled class="bg-stone-200 text-stone-400 text-xs font-semibold px-3 py-2 rounded-xl cursor-not-allowed">
                Habis
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  },

  // ---------------- CUSTOMIZE MODAL ----------------
  openCustomizeModal(itemId) {
    const item = this.data.menuItems.find(i => i.id === itemId);
    if (!item) return;

    this.data.currentItem = {
      ...item,
      quantity: 1,
      selectedTemperature: item.has_ice_hot ? 'Dingin (Ice)' : '-',
      selectedSugar: item.has_sugar_level ? 'Normal Sugar' : '-',
      selectedAddons: [],
      notes: ''
    };

    this.renderCustomizeModal();
  },

  renderCustomizeModal() {
    const modal = document.getElementById('customize-modal');
    const content = document.getElementById('customize-modal-content');
    if (!modal || !content) return;

    const item = this.data.currentItem;
    const unitPrice = this.calculateCurrentItemPrice();

    content.innerHTML = `
      <div class="relative">
        <div class="h-44 w-full bg-stone-100 relative">
          <img src="${item.image_url}" alt="${item.name}" class="w-full h-full object-cover">
          <button onclick="CustomerApp.closeCustomizeModal()" class="absolute top-3 right-3 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div class="p-5 max-h-[60vh] overflow-y-auto">
          <div class="flex justify-between items-start">
            <div>
              <h2 class="text-lg font-bold text-stone-900">${item.name}</h2>
              <p class="text-xs text-stone-500 mt-0.5">${item.description || ''}</p>
            </div>
            <span class="text-base font-extrabold text-[#472E0B]">Rp ${item.price.toLocaleString('id-ID')}</span>
          </div>

          ${item.has_ice_hot ? `
            <div class="mt-4 border-t border-stone-100 pt-3">
              <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Pilihan Suhu</label>
              <div class="grid grid-cols-2 gap-2">
                <button type="button" onclick="CustomerApp.setTemp('Dingin (Ice)')" 
                  class="py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${item.selectedTemperature.includes('Dingin') ? 'border-[#472E0B] bg-[#472E0B]/10 text-[#472E0B]' : 'border-stone-200 text-stone-600'}">
                  🧊 Dingin (Ice)
                </button>
                <button type="button" onclick="CustomerApp.setTemp('Panas (Hot)')" 
                  class="py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${item.selectedTemperature.includes('Panas') ? 'border-[#472E0B] bg-[#472E0B]/10 text-[#472E0B]' : 'border-stone-200 text-stone-600'}">
                  ☕ Panas (Hot)
                </button>
              </div>
            </div>
          ` : ''}

          ${item.has_sugar_level ? `
            <div class="mt-3 border-t border-stone-100 pt-3">
              <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Tingkat Manis</label>
              <div class="grid grid-cols-3 gap-2">
                ${['Normal Sugar', 'Less Sugar (50%)', 'No Sugar (0%)'].map(s => `
                  <button type="button" onclick="CustomerApp.setSugar('${s}')" 
                    class="py-1.5 px-2 rounded-xl border text-[11px] font-semibold text-center transition ${item.selectedSugar === s ? 'border-[#472E0B] bg-[#472E0B]/10 text-[#472E0B]' : 'border-stone-200 text-stone-600'}">
                    ${s}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          ${item.options && item.options.length > 0 ? `
            <div class="mt-3 border-t border-stone-100 pt-3">
              <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">Tambahan Extra</label>
              <div class="space-y-1.5">
                ${item.options.map(opt => {
                  const isChecked = item.selectedAddons.some(a => a.name === opt.name);
                  return `
                    <label class="flex items-center justify-between p-2 rounded-xl border ${isChecked ? 'border-[#472E0B] bg-[#472E0B]/5' : 'border-stone-200'} cursor-pointer">
                      <div class="flex items-center gap-2">
                        <input type="checkbox" onchange="CustomerApp.toggleAddon('${opt.name}', ${opt.price})" ${isChecked ? 'checked' : ''} class="w-4 h-4 accent-[#472E0B] rounded">
                        <span class="text-xs font-medium text-stone-700">${opt.name}</span>
                      </div>
                      <span class="text-xs font-bold text-stone-600">+Rp ${opt.price.toLocaleString('id-ID')}</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <div class="mt-3 border-t border-stone-100 pt-3">
            <label class="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1">Catatan Khusus (Opsional)</label>
            <input type="text" id="item-notes" placeholder="Misal: jangan manis, es batu dipisah..." value="${item.notes || ''}" 
              oninput="CustomerApp.data.currentItem.notes = this.value"
              class="w-full text-xs p-2.5 border border-stone-200 rounded-xl focus:outline-none focus:border-[#472E0B]">
          </div>
        </div>

        <div class="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-3">
          <div class="flex items-center border border-stone-300 rounded-xl bg-white p-1">
            <button onclick="CustomerApp.changeQty(-1)" class="w-7 h-7 rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-100 font-bold">-</button>
            <span class="w-7 text-center text-xs font-bold text-stone-800">${item.quantity}</span>
            <button onclick="CustomerApp.changeQty(1)" class="w-7 h-7 rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-100 font-bold">+</button>
          </div>

          <button onclick="CustomerApp.addToCart()" 
            class="flex-1 bg-[#472E0B] hover:bg-[#5C3C10] text-white py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-between shadow-md transition active:scale-[0.98]">
            <span>Tambah</span>
            <span>Rp ${(unitPrice * item.quantity).toLocaleString('id-ID')}</span>
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  setTemp(temp) {
    this.data.currentItem.selectedTemperature = temp;
    this.renderCustomizeModal();
  },

  setSugar(sugar) {
    this.data.currentItem.selectedSugar = sugar;
    this.renderCustomizeModal();
  },

  toggleAddon(name, price) {
    const list = this.data.currentItem.selectedAddons;
    const idx = list.findIndex(a => a.name === name);
    if (idx > -1) {
      list.splice(idx, 1);
    } else {
      list.push({ name, price });
    }
    this.renderCustomizeModal();
  },

  changeQty(delta) {
    const newQty = this.data.currentItem.quantity + delta;
    if (newQty >= 1) {
      this.data.currentItem.quantity = newQty;
      this.renderCustomizeModal();
    }
  },

  calculateCurrentItemPrice() {
    const item = this.data.currentItem;
    const base = item.price;
    const addons = item.selectedAddons.reduce((sum, a) => sum + a.price, 0);
    return base + addons;
  },

  closeCustomizeModal() {
    const modal = document.getElementById('customize-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  addToCart() {
    const item = this.data.currentItem;
    const cartItem = {
      cartId: Date.now() + Math.random(),
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      temperature: item.selectedTemperature,
      sugar_level: item.selectedSugar,
      selected_addons: item.selectedAddons,
      notes: item.notes || '',
      image_url: item.image_url
    };

    this.data.cart.push(cartItem);
    this.saveCart();
    this.closeCustomizeModal();
    this.updateCartUI();

    if (window.cafeAudio) window.cafeAudio.playSuccess();
  },

  saveCart() {
    const cartKey = 'tedhuh_cart_' + (this.data.selectedTable || 'general').replace(/[^a-zA-Z0-9]/g, '_');
    localStorage.setItem(cartKey, JSON.stringify(this.data.cart));
  },

  // ---------------- CART DRAWER ----------------
  updateCartUI() {
    const bar = document.getElementById('floating-cart-bar');
    const badge = document.getElementById('cart-total-badge');
    const totalElem = document.getElementById('cart-subtotal-text');

    const totalQty = this.data.cart.reduce((sum, i) => sum + i.quantity, 0);
    const subtotal = this.data.cart.reduce((sum, i) => {
      const addons = (i.selected_addons || []).reduce((aSum, a) => aSum + a.price, 0);
      return sum + ((i.price + addons) * i.quantity);
    }, 0);

    if (totalQty > 0) {
      if (bar) bar.classList.remove('hidden');
      if (badge) badge.textContent = `${totalQty} Item`;
      if (totalElem) totalElem.textContent = `Rp ${subtotal.toLocaleString('id-ID')}`;
    } else {
      if (bar) bar.classList.add('hidden');
    }
  },

  openCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    if (!drawer) return;
    this.populateDrawerTableOptions();
    this.renderCartDrawerItems();
    drawer.classList.remove('translate-x-full');
  },

  closeCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    if (drawer) drawer.classList.add('translate-x-full');
  },

  renderCartDrawerItems() {
    const container = document.getElementById('cart-items-container');
    const totalElem = document.getElementById('drawer-total-amount');
    const nameInput = document.getElementById('drawer-customer-name');

    if (nameInput) {
      nameInput.value = this.data.customerName;
    }

    if (this.data.cart.length === 0) {
      container.innerHTML = `
        <div class="py-12 text-center text-stone-400">
          <p class="font-medium text-stone-600">Keranjang masih kosong</p>
          <p class="text-xs mt-1">Pilih menu favoritmu untuk mulai memesan</p>
        </div>
      `;
      if (totalElem) totalElem.textContent = 'Rp 0';
      return;
    }

    let subtotal = 0;
    container.innerHTML = this.data.cart.map(item => {
      const addonsTotal = (item.selected_addons || []).reduce((s, a) => s + a.price, 0);
      const unit = item.price + addonsTotal;
      const itemSub = unit * item.quantity;
      subtotal += itemSub;

      const details = [];
      if (item.temperature && item.temperature !== '-') details.push(item.temperature);
      if (item.sugar_level && item.sugar_level !== '-') details.push(item.sugar_level);
      if (item.selected_addons && item.selected_addons.length > 0) {
        details.push(item.selected_addons.map(a => a.name).join(', '));
      }

      return `
        <div class="p-3 bg-stone-50 rounded-xl border border-stone-200/80 flex flex-col justify-between">
          <div class="flex justify-between items-start gap-2">
            <div>
              <h4 class="font-bold text-sm text-stone-800">${item.name}</h4>
              ${details.length > 0 ? `
                <p class="text-[11px] text-stone-500 mt-0.5">${details.join(' • ')}</p>
              ` : ''}
              ${item.notes ? `
                <p class="text-[11px] text-[#C8822A] italic mt-0.5">Catatan: "${item.notes}"</p>
              ` : ''}
            </div>
            <span class="font-extrabold text-sm text-[#472E0B] whitespace-nowrap">Rp ${itemSub.toLocaleString('id-ID')}</span>
          </div>

          <div class="flex items-center justify-between mt-3 pt-2 border-t border-stone-200/60">
            <button onclick="CustomerApp.removeCartItem(${item.cartId})" class="text-xs text-red-500 hover:text-red-700 font-medium">Hapus</button>
            <div class="flex items-center border border-stone-300 rounded-lg bg-white">
              <button onclick="CustomerApp.updateCartQty(${item.cartId}, -1)" class="w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-stone-100">-</button>
              <span class="w-7 text-center text-xs font-bold text-stone-800">${item.quantity}</span>
              <button onclick="CustomerApp.updateCartQty(${item.cartId}, 1)" class="w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-stone-100">+</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (totalElem) totalElem.textContent = `Rp ${subtotal.toLocaleString('id-ID')}`;
  },

  updateCartQty(cartId, delta) {
    const item = this.data.cart.find(i => i.cartId === cartId);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) {
      this.data.cart = this.data.cart.filter(i => i.cartId !== cartId);
    }
    this.saveCart();
    this.updateCartUI();
    this.renderCartDrawerItems();
  },

  removeCartItem(cartId) {
    this.data.cart = this.data.cart.filter(i => i.cartId !== cartId);
    this.saveCart();
    this.updateCartUI();
    this.renderCartDrawerItems();
  },

  // ---------------- ORDER SUBMISSION ----------------
  async submitOrder() {
    if (this.data.cart.length === 0) {
      alert('Keranjang pesanan masih kosong.');
      return;
    }

    const nameInput = document.getElementById('drawer-customer-name');
    const customerName = (nameInput ? nameInput.value : '').trim();
    if (!customerName) {
      alert('Silakan masukkan nama Anda agar barista tahu siapa yang memesan.');
      if (nameInput) nameInput.focus();
      return;
    }

    this.data.customerName = customerName;
    localStorage.setItem('tedhuh_customer_name', customerName);

    const paymentMethodElem = document.querySelector('input[name="payment_method"]:checked');
    const paymentMethod = paymentMethodElem ? paymentMethodElem.value : 'QRIS';

    const orderPayload = {
      table_number: this.data.selectedTable || 'Meja 01',
      customer_name: customerName,
      customer_phone: '',
      order_type: this.data.selectedTable === 'Takeaway' ? 'Takeaway' : 'Dine In',
      notes: '',
      payment_method: paymentMethod,
      items: this.data.cart
    };

    const submitBtn = document.getElementById('btn-submit-order');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Memproses Pesanan...';
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      const result = await res.json();

      if (result.success && result.order) {
        // Clear cart for this table
        this.data.cart = [];
        this.saveCart();
        this.updateCartUI();
        this.closeCartDrawer();

        // Track order isolated for this table
        this.data.activeOrder = result.order;
        localStorage.setItem(this.getTableKey(), result.order.id);

        if (window.cafeAudio) window.cafeAudio.playSuccess();
        this.updateFloatingStatusButton();
        this.renderTrackingModal();
      } else {
        alert(result.error || 'Gagal mengirim pesanan. Silakan coba lagi.');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan koneksi. Silakan periksa jaringan Anda.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Kirim Pesanan Sekarang';
      }
    }
  },

  // ---------------- ORDER TRACKING & CALL WAITER ----------------
  async checkActiveOrder(orderId, shouldOpenModal = false) {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (res.ok) {
        const order = await res.json();
        // CRITICAL CHECK: Does this order really belong to THIS table?
        if (order.table_number === this.data.selectedTable && order.order_status !== 'COMPLETED' && order.order_status !== 'CANCELLED') {
          this.data.activeOrder = order;
          this.updateFloatingStatusButton();
          if (shouldOpenModal) {
            this.renderTrackingModal();
          }
        } else {
          // If order is completed or belonged to another table, clear from this table
          localStorage.removeItem(this.getTableKey());
          this.data.activeOrder = null;
          this.updateFloatingStatusButton();
        }
      }
    } catch (e) {}
  },

  updateFloatingStatusButton() {
    const btn = document.getElementById('floating-order-status-btn');
    if (!btn) return;

    if (this.data.activeOrder && this.data.activeOrder.order_status !== 'COMPLETED' && this.data.activeOrder.order_status !== 'CANCELLED') {
      btn.classList.remove('hidden');
      const badge = document.getElementById('status-btn-text');
      let statusLabel = 'Terkirim';
      if (this.data.activeOrder.order_status === 'COOKING' || this.data.activeOrder.order_status === 'ACCEPTED') statusLabel = 'Sedang Diracik';
      else if (this.data.activeOrder.order_status === 'READY') statusLabel = 'Siap Diantar';
      if (badge) badge.textContent = `${this.data.activeOrder.order_number}: ${statusLabel}`;
    } else {
      btn.classList.add('hidden');
    }
  },

  renderTrackingModal() {
    const modal = document.getElementById('tracking-modal');
    const content = document.getElementById('tracking-modal-content');
    if (!modal || !content || !this.data.activeOrder) return;

    const order = this.data.activeOrder;
    
    const stepOrder = ['PENDING', 'ACCEPTED', 'COOKING', 'READY', 'COMPLETED'];
    let currentStepIndex = 1;
    if (order.order_status === 'PENDING') currentStepIndex = 1;
    else if (order.order_status === 'ACCEPTED' || order.order_status === 'COOKING') currentStepIndex = 2;
    else if (order.order_status === 'READY') currentStepIndex = 3;
    else if (order.order_status === 'COMPLETED') currentStepIndex = 4;

    content.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between border-b border-stone-200 pb-4">
          <div>
            <span class="text-xs font-bold text-[#C8822A] uppercase tracking-wider">Status Pesanan Meja</span>
            <h2 class="text-xl font-extrabold text-stone-900">${order.order_number}</h2>
            <p class="text-xs text-stone-500 font-medium">${order.table_number} • Pemesan: <strong>${order.customer_name}</strong></p>
          </div>
          <button onclick="CustomerApp.closeTrackingModal()" class="text-stone-400 hover:text-stone-600 p-1">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <!-- Stepper -->
        <div class="my-6">
          <div class="flex justify-between items-center relative">
            <div class="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-stone-200 -z-0">
              <div class="h-full bg-[#472E0B] transition-all duration-500" style="width: ${((currentStepIndex - 1) / 3) * 100}%"></div>
            </div>

            <div class="relative z-10 flex flex-col items-center">
              <div class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition ${currentStepIndex >= 1 ? 'bg-[#472E0B] text-white' : 'bg-stone-200 text-stone-500'}">
                1
              </div>
              <span class="text-[10px] font-bold mt-1 text-center text-stone-700">Terkirim</span>
            </div>

            <div class="relative z-10 flex flex-col items-center">
              <div class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition ${currentStepIndex >= 2 ? 'bg-[#472E0B] text-white animate-pulse-subtle' : 'bg-stone-200 text-stone-500'}">
                2
              </div>
              <span class="text-[10px] font-bold mt-1 text-center text-stone-700">Diracik</span>
            </div>

            <div class="relative z-10 flex flex-col items-center">
              <div class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition ${currentStepIndex >= 3 ? 'bg-[#C8822A] text-white animate-bounce' : 'bg-stone-200 text-stone-500'}">
                3
              </div>
              <span class="text-[10px] font-bold mt-1 text-center text-stone-700">Diantar</span>
            </div>

            <div class="relative z-10 flex flex-col items-center">
              <div class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition ${currentStepIndex >= 4 ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-500'}">
                4
              </div>
              <span class="text-[10px] font-bold mt-1 text-center text-stone-700">Selesai</span>
            </div>
          </div>

          <div class="mt-4 p-3 rounded-xl bg-stone-50 border border-stone-200/80 text-center">
            ${currentStepIndex === 1 ? `
              <p class="text-xs text-amber-700 font-semibold animate-pulse">⏳ Menunggu konfirmasi kasir kedai...</p>
            ` : currentStepIndex === 2 ? `
              <p class="text-xs text-[#472E0B] font-semibold">☕ Pesanan sedang diracik barista & dapur!</p>
            ` : currentStepIndex === 3 ? `
              <p class="text-xs text-[#C8822A] font-bold">🚀 Pesanan siap! Staff sedang mengantar ke ${order.table_number}.</p>
            ` : `
              <p class="text-xs text-emerald-700 font-bold">✨ Pesanan selesai. Selamat menikmati waktu tedhuh Anda!</p>
            `}
          </div>
        </div>

        <!-- Payment Info Banner -->
        <div class="p-3 mb-4 rounded-xl ${order.payment_status === 'PAID' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'} flex items-center justify-between text-xs font-semibold">
          <span>Status Bayar: <strong>${order.payment_status === 'PAID' ? 'LUNAS' : 'BELUM DIBAYAR'}</strong> (${order.payment_method})</span>
          <span>Total: Rp ${order.total_amount.toLocaleString('id-ID')}</span>
        </div>

        ${order.payment_method === 'QRIS' && order.payment_status !== 'PAID' ? `
          <div class="text-center p-3 border border-stone-200 rounded-xl bg-white mb-4">
            <p class="text-xs font-bold text-stone-700 mb-2">Scan QRIS untuk Pembayaran</p>
            <img src="${this.data.settings.qris_image || 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=KEDAI_TEDHUH'}" alt="QRIS" class="w-40 h-40 mx-auto rounded-lg shadow-sm border border-stone-200">
            <p class="text-[10px] text-stone-500 mt-2">Dukung semua e-wallet: BCA, Livin, GoPay, OVO, Dana, ShopeePay</p>
          </div>
        ` : ''}

        <div class="flex gap-2">
          <button onclick="CustomerApp.callWaiter()" 
            class="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold py-2.5 rounded-xl border border-stone-300 flex items-center justify-center gap-1.5 transition">
            🔔 Panggil Waiter / Kasir
          </button>
          <button onclick="CustomerApp.closeTrackingModal()" 
            class="bg-[#472E0B] hover:bg-[#5C3C10] text-white text-xs font-bold py-2.5 px-5 rounded-xl transition">
            Tutup
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  closeTrackingModal() {
    const modal = document.getElementById('tracking-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  async callWaiter() {
    const table = this.data.selectedTable || 'Meja 01';
    if (!confirm(`Panggil waiter ke ${table}?`)) return;

    try {
      const res = await fetch('/api/waiter-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_number: table,
          message: `Pelanggan di ${table} membutuhkan bantuan/pelayanan.`
        })
      });
      const data = await res.json();
      alert(data.message || 'Panggilan terkirim. Waiter segera menuju ke meja Anda!');
    } catch (e) {
      alert('Gagal memanggil waiter. Silakan hubungi kasir secara langsung.');
    }
  },

  populateDrawerTableOptions() {
    const select = document.getElementById('drawer-table-select');
    if (!select) return;
    const current = this.data.selectedTable || 'Meja 01';
    let html = `<option value="Takeaway" ${current === 'Takeaway' ? 'selected' : ''}>🥡 Bungkus / Takeaway</option>`;
    (this.data.tables || []).forEach(t => {
      const isSelected = current === t.table_number;
      html += `<option value="${t.table_number}" ${isSelected ? 'selected' : ''}>🍽️ ${t.name}</option>`;
    });
    select.innerHTML = html;
  },

  setTableFromDrawer(val) {
    this.selectTable(val, false);
  },

  openTableModal() {
    this.renderTableModalGrid();
    const modal = document.getElementById('table-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeTableModal() {
    const modal = document.getElementById('table-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  renderTableModalGrid() {
    const grid = document.getElementById('table-modal-grid');
    if (!grid) return;
    const current = this.data.selectedTable || '';

    // Highlight takeaway button if selected
    const btnTakeaway = document.getElementById('btn-opt-takeaway');
    if (btnTakeaway) {
      if (current === 'Takeaway') {
        btnTakeaway.className = 'w-full p-3.5 rounded-2xl border-2 transition flex items-center justify-between font-bold text-xs border-[#472E0B] bg-[#FFEFCB]/50 text-[#472E0B] shadow-sm';
      } else {
        btnTakeaway.className = 'w-full p-3.5 rounded-2xl border-2 transition flex items-center justify-between font-bold text-xs border-stone-200 hover:border-[#472E0B] text-stone-700 bg-stone-50';
      }
    }

    grid.innerHTML = (this.data.tables || []).map(t => {
      const isSelected = current === t.table_number;
      return `
        <button type="button" onclick="CustomerApp.selectTable('${t.table_number}')"
          class="p-3 rounded-2xl border-2 text-center transition flex flex-col items-center justify-center gap-1 ${
            isSelected 
              ? 'border-[#472E0B] bg-[#472E0B] text-[#FFEFCB] shadow-md scale-105' 
              : 'border-[#EED7AE]/70 bg-white hover:border-[#472E0B] text-[#472E0B]'
          }">
          <span class="text-base">${isSelected ? '✅' : '🪑'}</span>
          <span class="font-extrabold text-xs whitespace-nowrap">${t.name}</span>
          <span class="text-[9px] opacity-75">${t.status === 'OCCUPIED' && !isSelected ? 'Terisi' : 'Tersedia'}</span>
        </button>
      `;
    }).join('');
  },

  selectTable(tableNumber, shouldCloseModal = true) {
    if (!tableNumber) return;
    this.data.selectedTable = tableNumber;
    localStorage.setItem('tedhuh_table', tableNumber);
    this.renderTableSelector();
    this.checkActiveOrder(localStorage.getItem(this.getTableKey()), false);
    this.updateCartUI();
    if (shouldCloseModal) {
      this.closeTableModal();
    }
  },

  changeTable() {
    this.openTableModal();
  }
};

window.CustomerApp = CustomerApp;
