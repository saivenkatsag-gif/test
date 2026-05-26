// ═══════════════════════════════════════════════════════════════
//  organo-config.js  —  Shared Supabase client for all 3 pages
//  Include this BEFORE your page script with:
//  <script src="organo-config.js"></script>
// ═══════════════════════════════════════════════════════════════

// ▸ REPLACE these two values with your project's credentials
//   Supabase Dashboard → Project Settings → API
const SUPABASE_URL  = 'https://rqicevvcstbeawabguju.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxaWNldnZjc3RiZWF3YWJndWp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MjA0NDMsImV4cCI6MjA5NTE5NjQ0M30.bquilEonKAPHTgfINw_K8tpWRNb2qAMMRxDcVQuU8hU';

// ─── Init Supabase client (loaded from CDN) ───────────────────
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── Auth helpers ─────────────────────────────────────────────
const Auth = {
  async signUp(email, password, fullName, role = 'buyer') {
    return db.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role } }
    });
  },
  async signIn(email, password) {
    return db.auth.signInWithPassword({ email, password });
  },
  async signOut() {
    return db.auth.signOut();
  },
  async getUser() {
    const { data: { user } } = await db.auth.getUser();
    return user;
  },
  async getProfile(userId) {
    const { data } = await db.from('profiles').select('*').eq('id', userId).single();
    return data;
  },
  onAuthChange(cb) {
    return db.auth.onAuthStateChange(cb);
  }
};

// ─── Product helpers ──────────────────────────────────────────
const Products = {
  async getAll(options = {}) {
    let q = db.from('products')
      .select('*, sellers(store_name, location)')
      .eq('status', 'live');
    if (options.category && options.category !== 'all')
      q = q.eq('category_slug', options.category);
    if (options.search)
      q = q.ilike('name', `%${options.search}%`);
    if (options.sort === 'price_asc')  q = q.order('admin_price', { ascending: true });
    if (options.sort === 'price_desc') q = q.order('admin_price', { ascending: false });
    if (options.sort === 'rating')     q = q.order('rating', { ascending: false });
    if (options.featured)              q = q.eq('is_featured', true);
    const { data, error } = await q.limit(options.limit || 100);
    return { data: data || [], error };
  },

  async getPending() {
    const { data, error } = await db.from('products')
      .select('*, sellers(store_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    return { data: data || [], error };
  },

  async getBySellerUser(userId) {
    const { data, error } = await db.from('products')
      .select('*')
      .eq('status', 'live') // join via seller
      // We query via seller table
      ;
    // Better: get seller id first
    const { data: sellerData } = await db.from('sellers').select('id').eq('user_id', userId).single();
    if (!sellerData) return { data: [], error: 'No seller' };
    const { data: prods } = await db.from('products')
      .select('*').eq('seller_id', sellerData.id)
      .order('created_at', { ascending: false });
    return { data: prods || [], error };
  },

  async approve(productId, adminPrice, featured = false, notes = '') {
    return db.from('products').update({
      status: 'live',
      admin_price: adminPrice,
      is_featured: featured,
      admin_notes: notes,
      updated_at: new Date().toISOString()
    }).eq('id', productId);
  },

  async reject(productId, notes = '') {
    return db.from('products').update({
      status: 'rejected',
      admin_notes: notes,
      updated_at: new Date().toISOString()
    }).eq('id', productId);
  },

  async create(productData) {
    return db.from('products').insert(productData).select().single();
  },

  async updateStock(productId, qty) {
    return db.from('products').update({ stock_qty: qty }).eq('id', productId);
  }
};

// ─── Sellers helpers ──────────────────────────────────────────
const Sellers = {
  async getAll(status = 'approved') {
    const q = status === 'all'
      ? db.from('sellers').select('*, profiles(full_name, phone)').order('created_at', { ascending: false })
      : db.from('sellers').select('*, profiles(full_name, phone)').eq('status', status).order('created_at', { ascending: false });
    const { data, error } = await q;
    return { data: data || [], error };
  },

  async getOwn(userId) {
    const { data, error } = await db.from('sellers').select('*').eq('user_id', userId).single();
    return { data, error };
  },

  async create(sellerData) {
    return db.from('sellers').insert(sellerData).select().single();
  },

  async update(sellerId, updates) {
    return db.from('sellers').update({ ...updates }).eq('id', sellerId);
  },

  async approve(sellerId) {
    const { data: seller } = await db.from('sellers').update({ status: 'approved' }).eq('id', sellerId).select('user_id').single();
    if (seller) await db.from('profiles').update({ role: 'seller' }).eq('id', seller.user_id);
    return seller;
  },

  async suspend(sellerId) {
    return db.from('sellers').update({ status: 'suspended' }).eq('id', sellerId);
  }
};

// ─── Orders helpers ───────────────────────────────────────────
const Orders = {
  async getByBuyer(userId) {
    const { data, error } = await db.from('orders')
      .select('*').eq('buyer_id', userId)
      .order('created_at', { ascending: false });
    return { data: data || [], error };
  },

  async getBySeller(userId) {
    const { data: seller } = await db.from('sellers').select('id').eq('user_id', userId).single();
    if (!seller) return { data: [], error: 'No seller' };
    const { data, error } = await db.from('orders')
      .select('*, profiles(full_name)').eq('seller_id', seller.id)
      .order('created_at', { ascending: false });
    return { data: data || [], error };
  },

  async getAll() {
    const { data, error } = await db.from('orders')
      .select('*, profiles(full_name)').order('created_at', { ascending: false });
    return { data: data || [], error };
  },

  async create(orderData) {
    return db.from('orders').insert(orderData).select().single();
  },

  async updateStatus(orderId, status) {
    return db.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
  }
};

// ─── Banners helpers ──────────────────────────────────────────
const Banners = {
  async getLive() {
    const { data } = await db.from('hero_banners')
      .select('*').eq('status', 'live').order('sort_order');
    return data || [];
  },

  async getAll() {
    const { data } = await db.from('hero_banners')
      .select('*').order('sort_order');
    return data || [];
  },

  async save(bannerData) {
    if (bannerData.id) {
      return db.from('hero_banners').update({ ...bannerData, updated_at: new Date().toISOString() }).eq('id', bannerData.id);
    }
    return db.from('hero_banners').insert(bannerData).select().single();
  },

  async publish(bannerId) {
    return db.from('hero_banners').update({ status: 'live', updated_at: new Date().toISOString() }).eq('id', bannerId);
  },

  async unpublish(bannerId) {
    return db.from('hero_banners').update({ status: 'draft' }).eq('id', bannerId);
  }
};

// ─── Coupons helpers ──────────────────────────────────────────
const Coupons = {
  async getAll() {
    const { data } = await db.from('coupons').select('*').order('created_at', { ascending: false });
    return data || [];
  },
  async validate(code, orderAmount) {
    const { data } = await db.from('coupons')
      .select('*').eq('code', code.toUpperCase()).eq('is_active', true).single();
    if (!data) return { valid: false, message: 'Invalid coupon code' };
    if (data.expires_at && new Date(data.expires_at) < new Date())
      return { valid: false, message: 'Coupon has expired' };
    if (data.used_count >= data.max_uses)
      return { valid: false, message: 'Coupon usage limit reached' };
    if (orderAmount < data.min_order)
      return { valid: false, message: `Min order ₹${data.min_order} required` };
    const discount = data.discount_type === 'percentage'
      ? (orderAmount * data.discount_value / 100)
      : data.discount_value;
    return { valid: true, coupon: data, discount };
  },
  async create(couponData) {
    return db.from('coupons').insert(couponData).select().single();
  }
};

// ─── Wishlist helpers ─────────────────────────────────────────
const Wishlist = {
  async get(userId) {
    const { data } = await db.from('wishlists')
      .select('product_id, products(*)').eq('user_id', userId);
    return (data || []).map(w => w.products).filter(Boolean);
  },
  async add(userId, productId) {
    return db.from('wishlists').upsert({ user_id: userId, product_id: productId });
  },
  async remove(userId, productId) {
    return db.from('wishlists').delete().eq('user_id', userId).eq('product_id', productId);
  }
};

// ─── Notifications helpers ────────────────────────────────────
const Notifications = {
  async get(userId) {
    const { data } = await db.from('notifications')
      .select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(20);
    return data || [];
  },
  async markRead(notifId) {
    return db.from('notifications').update({ is_read: true }).eq('id', notifId);
  },
  async create(userId, title, body, type = 'info') {
    return db.from('notifications').insert({ user_id: userId, title, body, type });
  }
};

// ─── Storage helpers ──────────────────────────────────────────
const Storage = {
  async uploadProductImage(file, sellerId) {
    const ext  = file.name.split('.').pop();
    const path = `${sellerId}/${Date.now()}.${ext}`;
    const { data, error } = await db.storage.from('product-images').upload(path, file);
    if (error) return { url: null, error };
    const { data: { publicUrl } } = db.storage.from('product-images').getPublicUrl(path);
    return { url: publicUrl, error: null };
  },
  async uploadBannerImage(file) {
    const ext  = file.name.split('.').pop();
    const path = `banner-${Date.now()}.${ext}`;
    const { data, error } = await db.storage.from('banner-images').upload(path, file);
    if (error) return { url: null, error };
    const { data: { publicUrl } } = db.storage.from('banner-images').getPublicUrl(path);
    return { url: publicUrl, error: null };
  }
};

// ─── Realtime helper ──────────────────────────────────────────
const Realtime = {
  onNewOrder(sellerId, cb) {
    return db.channel('orders-' + sellerId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'orders',
        filter: `seller_id=eq.${sellerId}`
      }, cb).subscribe();
  },
  onProductApproval(sellerId, cb) {
    return db.channel('products-' + sellerId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'products',
        filter: `seller_id=eq.${sellerId}`
      }, cb).subscribe();
  }
};
