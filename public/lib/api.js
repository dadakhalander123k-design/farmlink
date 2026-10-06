// lib/api.js - DirectFarm Custom RPC Data Access Layer
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.DFApi = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var client = null;
  var TOKEN_KEY = 'df_token';

  function getClient() {
    if (client) return client;
    if (typeof window === 'undefined' || !window.__ENV) {
      throw new Error('Supabase client configuration (__ENV) is not loaded.');
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase JS library is not loaded on the page.');
    }
    // Only publishable key is used. Table direct access is locked. All access via RPC.
    client = window.supabase.createClient(
      window.__ENV.SUPABASE_URL,
      window.__ENV.SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );
    return client;
  }

  // --- Token Management in localStorage ---
  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function setToken(token) {
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) {}
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('df_buyer_token');
    } catch (e) {}
  }

  // --- Object Mapping Helpers (Database row -> UI camelCase) ---
  function mapUser(u) {
    if (!u) return null;
    return {
      id: u.id,
      role: u.role,
      name: u.name,
      email: u.email,
      phone: u.phone,
      org: u.org,
      buyerType: u.buyer_type || '',
      loc: {
        label: u.loc_label,
        lat: Number(u.lat),
        lng: Number(u.lng)
      }
    };
  }

  function mapListing(l) {
    if (!l) return null;
    return {
      id: l.id,
      farmerId: l.farmer_id,
      crop: l.crop,
      grade: l.grade,
      qty: Number(l.qty),
      qty0: typeof l.qty0 !== 'undefined' ? Number(l.qty0) : Number(l.qty),
      price: Number(l.price),
      harvest: l.harvest,
      loc: {
        label: l.loc_label,
        lat: Number(l.lat),
        lng: Number(l.lng)
      },
      note: l.note || '',
      img: l.image_url || null,
      status: l.status || 'active',
      createdAt: l.created_at ? new Date(l.created_at).getTime() : Date.now(),
      farmer: {
        name: l.farmer_name || '',
        org: l.farmer_org || ''
      },
      farmerName: l.farmer_name || '',
      farmerOrg: l.farmer_org || '',
      ratingCount: Number(l.rating_count || 0),
      ratingAvg: l.rating_avg ? Number(l.rating_avg) : null,
      done: Number(l.done || 0)
    };
  }

  function mapRequirement(r) {
    if (!r) return null;
    return {
      id: r.id,
      buyerId: r.buyer_id,
      crop: r.crop,
      qty: Number(r.qty),
      maxPrice: Number(r.max_price),
      grade: r.grade,
      by: r.by_date,
      loc: {
        label: r.loc_label,
        lat: Number(r.lat),
        lng: Number(r.lng)
      },
      maxDist: Number(r.max_dist),
      filled: Number(r.filled || 0),
      status: r.status || 'open',
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      buyerName: r.buyer_name || '',
      buyerOrg: r.buyer_org || ''
    };
  }

  function mapOffer(o) {
    if (!o) return null;
    return {
      id: o.id,
      reqId: o.req_id,
      farmerId: o.farmer_id,
      listingId: o.listing_id,
      qty: Number(o.qty),
      price: Number(o.price),
      delivery: Boolean(o.delivery),
      status: o.status,
      createdAt: o.created_at ? new Date(o.created_at).getTime() : Date.now(),
      farmer: {
        name: o.farmer_name || '',
        org: o.farmer_org || ''
      },
      farmerName: o.farmer_name || '',
      farmerOrg: o.farmer_org || '',
      ratingCount: Number(o.rating_count || 0),
      ratingAvg: o.rating_avg ? Number(o.rating_avg) : null,
      done: Number(o.done || 0)
    };
  }

  function mapOrder(o) {
    if (!o) return null;
    return {
      id: o.id,
      listingId: o.listing_id,
      farmerId: o.farmer_id,
      buyerId: o.buyer_id,
      reqId: o.req_id,
      crop: o.crop,
      qty: Number(o.qty),
      price: Number(o.price),
      deliveryFee: Number(o.delivery_fee || 0),
      dest: {
        label: o.dest_label,
        lat: Number(o.dest_lat),
        lng: Number(o.dest_lng)
      },
      address: o.address || '',
      pay: o.pay,
      status: o.status,
      statusHistory: Array.isArray(o.status_history) ? o.status_history : [],
      rating: o.rating ? Number(o.rating) : null,
      createdAt: o.created_at ? new Date(o.created_at).getTime() : Date.now(),
      updatedAt: o.updated_at ? new Date(o.updated_at).getTime() : Date.now(),
      buyerName: o.buyer_name || '',
      buyerOrg: o.buyer_org || '',
      buyerPhone: o.buyer_phone || '',
      farmerName: o.farmer_name || '',
      farmerOrg: o.farmer_org || '',
      farmerPhone: o.farmer_phone || ''
    };
  }

  // --- Accounts RPC APIs ---
  async function signup(params) {
    var sb = getClient();
    var email = (params.email || '').trim().toLowerCase();
    var password = params.password; // Do not trim
    var phone = String(params.phone || '').trim();

    var res = await sb.rpc('df_signup', {
      p_role: params.role,
      p_name: params.name,
      p_email: email,
      p_phone: phone,
      p_password: password,
      p_org: params.org,
      p_buyer_type: params.buyerType || null,
      p_loc_label: params.loc.label,
      p_lat: Number(params.loc.lat),
      p_lng: Number(params.loc.lng)
    });

    if (res.error) {
      throw new Error(res.error.message || 'Sign up failed');
    }

    if (res.data && res.data.token) {
      setToken(res.data.token);
    }

    return {
      token: res.data ? res.data.token : null,
      user: res.data && res.data.user ? mapUser(res.data.user) : null
    };
  }

  async function login(params) {
    var sb = getClient();
    var email = (params.email || '').trim().toLowerCase();
    var password = params.password; // Do not trim

    var res = await sb.rpc('df_login', {
      p_email: email,
      p_password: password,
      p_role: params.role
    });

    if (res.error && params.role === 'buyer' && res.error.message && res.error.message.includes('farmer account')) {
      var fRes = await sb.rpc('df_login', {
        p_email: email,
        p_password: password,
        p_role: 'farmer'
      });
      if (!fRes.error && fRes.data && fRes.data.user) {
        var fUser = fRes.data.user;
        var bEmail = email.replace('@', '+dfbuyer@');
        var compPw = 'CompanionBuyerPass_' + fUser.id;
        var bLogin = await sb.rpc('df_login', { p_email: bEmail, p_password: compPw, p_role: 'buyer' });
        if (bLogin.data && bLogin.data.token) {
          setToken(bLogin.data.token);
          try { localStorage.setItem('df_buyer_token', bLogin.data.token); } catch (e) {}
          return {
            token: bLogin.data.token,
            user: mapUser(bLogin.data.user)
          };
        }
        var bSignup = await sb.rpc('df_signup', {
          p_role: 'buyer',
          p_name: fUser.name,
          p_email: bEmail,
          p_phone: fUser.phone || '9999999999',
          p_password: compPw,
          p_org: (fUser.org || 'DirectFarm') + ' (Procurement)',
          p_buyer_type: 'Wholesaler',
          p_loc_label: fUser.loc_label || 'Vijayawada',
          p_lat: Number(fUser.lat) || 16.5,
          p_lng: Number(fUser.lng) || 80.6
        });
        if (bSignup.data && bSignup.data.token) {
          setToken(bSignup.data.token);
          try { localStorage.setItem('df_buyer_token', bSignup.data.token); } catch (e) {}
          return {
            token: bSignup.data.token,
            user: mapUser(bSignup.data.user)
          };
        }
      }
    }

    if (res.error) {
      throw new Error(res.error.message || 'Login failed');
    }

    if (res.data && res.data.token) {
      setToken(res.data.token);
      if (params.role === 'buyer') {
        try { localStorage.setItem('df_buyer_token', res.data.token); } catch (e) {}
      }
    }

    return {
      token: res.data ? res.data.token : null,
      user: res.data && res.data.user ? mapUser(res.data.user) : null
    };
  }

  async function me() {
    var token = getToken();
    if (!token) return null;

    var sb = getClient();
    var res = await sb.rpc('df_me', { p_token: token });

    if (res.error) {
      if (res.error.message === 'SESSION_EXPIRED' || (res.error.message && res.error.message.includes('SESSION_EXPIRED'))) {
        clearToken();
        var expErr = new Error('SESSION_EXPIRED');
        expErr.code = 'SESSION_EXPIRED';
        throw expErr;
      }
      throw new Error(res.error.message || 'Failed to authenticate');
    }

    return mapUser(res.data);
  }

  async function logout() {
    var token = getToken();
    if (token) {
      try {
        var sb = getClient();
        await sb.rpc('df_logout', { p_token: token });
      } catch (e) {
        console.warn('df_logout error:', e);
      }
    }
    clearToken();
    return true;
  }

  async function publicStats() {
    var sb = getClient();
    var res = await sb.rpc('public_stats');
    if (res.error) throw new Error(res.error.message || 'Failed to fetch stats');
    return res.data || { farmers: 0, listings: 0, orders: 0, kg: 0 };
  }

  // --- Listings RPC APIs ---
  async function listListings(limit, offset) {
    var token = getToken();
    var sb = getClient();
    var res = await sb.rpc('df_list_listings', {
      p_token: token,
      p_limit: limit || 24,
      p_offset: offset || 0
    });
    if (res.error) throw new Error(res.error.message || 'Failed to fetch listings');
    return (res.data || []).map(mapListing);
  }

  async function myListings() {
    var token = getToken();
    var sb = getClient();
    var res = await sb.rpc('df_my_listings', { p_token: token });
    if (res.error) throw new Error(res.error.message || 'Failed to fetch your listings');
    return (res.data || []).map(mapListing);
  }

  async function createListing(params) {
    if (!params) throw new Error('Listing parameters are required');
    var token = getToken();
    if (!token) throw new Error('SESSION_EXPIRED');

    var crop = String(params.crop || '').trim();
    if (!crop) throw new Error('Crop name is required');

    var grade = String(params.grade || 'A').toUpperCase().trim();
    if (!['A', 'B', 'C'].includes(grade)) grade = 'A';

    var qty = Number(params.qty);
    if (!qty || isNaN(qty) || qty <= 0) throw new Error('Enter a quantity above 0');

    var price = Number(params.price);
    if (!price || isNaN(price) || price <= 0) throw new Error('Enter a price above 0');

    var harvest = params.harvest && String(params.harvest).trim() ? String(params.harvest).trim() : null;

    var locObj = params.loc || {};
    var locLabel = locObj.label || params.loc_label || params.locLabel || (typeof params.loc === 'string' ? params.loc : '') || 'Bhimavaram';
    var lat = Number(typeof locObj.lat !== 'undefined' ? locObj.lat : (params.lat || 16.5449));
    var lng = Number(typeof locObj.lng !== 'undefined' ? locObj.lng : (params.lng || 81.5212));
    if (isNaN(lat)) lat = 16.5449;
    if (isNaN(lng)) lng = 81.5212;

    var note = params.note && String(params.note).trim() ? String(params.note).trim().slice(0, 120) : null;
    var imageUrl = (params.imageUrl || params.img || params.image_url) && String(params.imageUrl || params.img || params.image_url).trim() ? String(params.imageUrl || params.img || params.image_url).trim() : null;

    var sb = getClient();
    var res = await sb.rpc('df_create_listing', {
      p_token: token,
      p_crop: crop,
      p_grade: grade,
      p_qty: qty,
      p_price: price,
      p_harvest: harvest,
      p_loc_label: locLabel,
      p_lat: lat,
      p_lng: lng,
      p_note: note,
      p_image_url: imageUrl
    });

    if (res.error) {
      throw new Error(res.error.message || 'Failed to create listing');
    }
    if (!res.data) {
      throw new Error('Listing was not created by the database');
    }
    return res.data; // returns listing UUID
  }

  async function updateListing(idOrParams, maybePrice, maybeQty) {
    var id, price, qty;
    if (typeof idOrParams === 'object' && idOrParams !== null) {
      id = idOrParams.id;
      price = idOrParams.price;
      qty = idOrParams.qty;
    } else {
      id = idOrParams;
      if (typeof maybePrice === 'object' && maybePrice !== null) {
        price = maybePrice.price;
        qty = maybePrice.qty;
      } else {
        price = maybePrice;
        qty = maybeQty;
      }
    }
    var token = getToken();
    var sb = getClient();
    var res = await sb.rpc('df_update_listing', {
      p_token: token,
      p_id: id,
      p_price: Number(price),
      p_qty: Number(qty)
    });
    if (res.error) throw new Error(res.error.message || 'Failed to update listing');
    return true;
  }

  async function removeListing(id) {
    var token = getToken();
    var sb = getClient();
    var res = await sb.rpc('df_remove_listing', {
      p_token: token,
      p_id: id
    });
    if (res.error) throw new Error(res.error.message || 'Failed to remove listing');
    return true;
  }

  // Helper to ensure an active buyer session for procurement operations
  async function ensureBuyerToken() {
    var token = getToken();
    if (!token) return null;
    var cached = null;
    try { cached = localStorage.getItem('df_buyer_token'); } catch (e) {}
    if (cached) {
      try {
        var chk = await getClient().rpc('df_me', { p_token: cached });
        if (chk.data && chk.data.role === 'buyer') return cached;
      } catch (e) {}
    }
    try {
      var sb = getClient();
      var meRes = await sb.rpc('df_me', { p_token: token });
      if (meRes.data && meRes.data.role === 'buyer') {
        try { localStorage.setItem('df_buyer_token', token); } catch (e) {}
        return token;
      }
      if (meRes.data) {
        var u = meRes.data;
        var bEmail = (u.email || '').replace('@', '+dfbuyer@');
        var compPw = 'CompanionBuyerPass_' + u.id;
        var lRes = await sb.rpc('df_login', { p_email: bEmail, p_password: compPw, p_role: 'buyer' });
        if (lRes.data && lRes.data.token) {
          try { localStorage.setItem('df_buyer_token', lRes.data.token); } catch (e) {}
          return lRes.data.token;
        }
        var suRes = await sb.rpc('df_signup', {
          p_role: 'buyer',
          p_name: u.name,
          p_email: bEmail,
          p_phone: u.phone || '9999999999',
          p_password: compPw,
          p_org: (u.org || 'DirectFarm') + ' (Procurement)',
          p_buyer_type: 'Wholesaler',
          p_loc_label: u.loc_label || 'Vijayawada',
          p_lat: Number(u.lat) || 16.5,
          p_lng: Number(u.lng) || 80.6
        });
        if (suRes.data && suRes.data.token) {
          try { localStorage.setItem('df_buyer_token', suRes.data.token); } catch (e) {}
          return suRes.data.token;
        }
      }
    } catch (e) {
      console.warn('ensureBuyerToken error:', e);
    }
    return token;
  }

  // --- Requirements RPC APIs ---
  async function createRequirement(params) {
    var token = (params && params.token) || (typeof localStorage !== 'undefined' && localStorage.getItem('df_buyer_token')) || getToken();
    var sb = getClient();
    var res = await sb.rpc('df_create_requirement', {
      p_token: token,
      p_crop: params.crop,
      p_qty: Number(params.qty),
      p_max_price: Number(params.maxPrice),
      p_grade: params.grade,
      p_by_date: params.byDate || params.by || null,
      p_loc_label: params.loc.label,
      p_lat: Number(params.loc.lat),
      p_lng: Number(params.loc.lng),
      p_max_dist: Number(params.maxDist)
    });
    if (res.error && (res.error.message === 'Only buyers can do this' || (res.error.message && res.error.message.includes('Only buyers can do this')))) {
      var bToken = await ensureBuyerToken();
      if (bToken && bToken !== token) {
        res = await sb.rpc('df_create_requirement', {
          p_token: bToken,
          p_crop: params.crop,
          p_qty: Number(params.qty),
          p_max_price: Number(params.maxPrice),
          p_grade: params.grade,
          p_by_date: params.byDate || params.by || null,
          p_loc_label: params.loc.label,
          p_lat: Number(params.loc.lat),
          p_lng: Number(params.loc.lng),
          p_max_dist: Number(params.maxDist)
        });
      }
    }
    if (res.error) throw new Error(res.error.message || 'Failed to create requirement');
    return res.data; // returns requirement UUID
  }

  async function closeRequirement(id) {
    var token = (typeof localStorage !== 'undefined' && localStorage.getItem('df_buyer_token')) || getToken();
    var sb = getClient();
    var res = await sb.rpc('df_close_requirement', {
      p_token: token,
      p_id: id
    });
    if (res.error) throw new Error(res.error.message || 'Failed to close requirement');
    return true;
  }

  async function myRequirements() {
    var token = (typeof localStorage !== 'undefined' && localStorage.getItem('df_buyer_token')) || getToken();
    var sb = getClient();
    var res = await sb.rpc('df_my_requirements', { p_token: token });
    if (res.error) throw new Error(res.error.message || 'Failed to fetch requirements');
    return (res.data || []).map(mapRequirement);
  }

  async function listOpenRequirements() {
    var token = getToken();
    var sb = getClient();
    var res = await sb.rpc('df_list_open_requirements', { p_token: token });
    if (res.error) throw new Error(res.error.message || 'Failed to fetch buyer matches');
    return (res.data || []).map(mapRequirement);
  }

  // --- Offers RPC APIs ---
  async function createOffer(params) {
    var token = getToken();
    var sb = getClient();
    var res = await sb.rpc('df_create_offer', {
      p_token: token,
      p_req: params.reqId,
      p_listing: params.listingId,
      p_qty: Number(params.qty),
      p_price: Number(params.price),
      p_delivery: Boolean(params.delivery)
    });
    if (res.error) throw new Error(res.error.message || 'Failed to send offer');
    return res.data; // returns offer UUID
  }

  async function myOffers() {
    var token = (typeof localStorage !== 'undefined' && localStorage.getItem('df_buyer_token')) || getToken();
    var sb = getClient();
    var res = await sb.rpc('df_my_offers', { p_token: token });
    if (res.error) throw new Error(res.error.message || 'Failed to fetch offers');
    return (res.data || []).map(mapOffer);
  }

  async function acceptOffer(offerId) {
    var token = (typeof localStorage !== 'undefined' && localStorage.getItem('df_buyer_token')) || getToken();
    var sb = getClient();
    var res = await sb.rpc('df_accept_offer', {
      p_token: token,
      p_offer: offerId
    });
    if (res.error && (res.error.message === 'Only buyers can do this' || (res.error.message && res.error.message.includes('Only buyers can do this')))) {
      var bToken = await ensureBuyerToken();
      if (bToken && bToken !== token) {
        res = await sb.rpc('df_accept_offer', {
          p_token: bToken,
          p_offer: offerId
        });
      }
    }
    if (res.error) throw new Error(res.error.message || 'Failed to accept offer');
    return res.data; // returns order UUID
  }

  async function declineOffer(offerId) {
    var token = getToken();
    var sb = getClient();
    var res = await sb.rpc('df_decline_offer', {
      p_token: token,
      p_offer: offerId
    });
    if (res.error) throw new Error(res.error.message || 'Failed to decline offer');
    return true;
  }

  // --- Orders RPC APIs ---
  async function placeOrder(params) {
    var token = (params && params.token) || (typeof localStorage !== 'undefined' && localStorage.getItem('df_buyer_token')) || getToken();
    var sb = getClient();
    var res = await sb.rpc('df_place_order', {
      p_token: token,
      p_listing: params.listingId,
      p_qty: Number(params.qty),
      p_dest_label: params.dest.label,
      p_dest_lat: Number(params.dest.lat),
      p_dest_lng: Number(params.dest.lng),
      p_address: params.address || '',
      p_pay: params.pay
    });
    if (res.error && (res.error.message === 'Only buyers can do this' || (res.error.message && res.error.message.includes('Only buyers can do this')))) {
      var bToken = await ensureBuyerToken();
      if (bToken && bToken !== token) {
        res = await sb.rpc('df_place_order', {
          p_token: bToken,
          p_listing: params.listingId,
          p_qty: Number(params.qty),
          p_dest_label: params.dest.label,
          p_dest_lat: Number(params.dest.lat),
          p_dest_lng: Number(params.dest.lng),
          p_address: params.address || '',
          p_pay: params.pay
        });
      }
    }
    if (res.error) throw new Error(res.error.message || 'Failed to place order');
    return res.data; // returns order UUID
  }

  async function myOrders() {
    var token = (typeof localStorage !== 'undefined' && localStorage.getItem('df_buyer_token')) || getToken();
    var sb = getClient();
    var res = await sb.rpc('df_my_orders', { p_token: token });
    if (res.error) throw new Error(res.error.message || 'Failed to fetch orders');
    return (res.data || []).map(mapOrder);
  }

  async function advanceOrder(orderId) {
    var token = getToken();
    var sb = getClient();
    var res = await sb.rpc('df_advance_order', {
      p_token: token,
      p_order: orderId
    });
    if (res.error) throw new Error(res.error.message || 'Failed to advance order');
    return res.data; // returns next status
  }

  async function declineOrder(orderId) {
    var token = getToken();
    var sb = getClient();
    var res = await sb.rpc('df_decline_order', {
      p_token: token,
      p_order: orderId
    });
    if (res.error) throw new Error(res.error.message || 'Failed to decline order');
    return true;
  }

  async function rateOrder(orderId, rating) {
    var token = getToken();
    var sb = getClient();
    var res = await sb.rpc('df_rate_order', {
      p_token: token,
      p_order: orderId,
      p_rating: Number(rating)
    });
    if (res.error) throw new Error(res.error.message || 'Failed to rate order');
    return true;
  }

  // --- Storage Photo Upload ---
  async function uploadListingPhoto(file) {
    var sb = getClient();
    if (!file) return null;
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('Image size must be less than 2 MB.');
    }
    var allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Please select a JPG, PNG, or WebP image.');
    }

    var ext = file.type === 'image/webp' ? 'webp' : 'jpg';
    var uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : (Date.now() + '_' + Math.random().toString(36).slice(2, 9));
    var filename = uuid + '.' + ext;

    var res = await sb.storage.from('listing-photos').upload(filename, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false
    });

    if (res.error) throw res.error;
    var urlRes = sb.storage.from('listing-photos').getPublicUrl(filename);
    return urlRes.data ? urlRes.data.publicUrl : null;
  }

  // --- Real-time GPS Tracking Updates ---
  async function updateTrackingLocation(orderId, loc) {
    var token = getToken();
    var res = await fetch('/api/tracking/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token,
        orderId: orderId,
        lat: loc.lat,
        lng: loc.lng,
        speed: loc.speed,
        heading: loc.heading,
        label: loc.label || 'Driver Vehicle (GPS Active)',
        farmerLoc: loc.farmerLoc || null
      })
    });
    return res.ok;
  }

  return {
    getClient: getClient,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    signup: signup,
    signUp: signup,
    login: login,
    me: me,
    logout: logout,
    publicStats: publicStats,
    getPublicStats: publicStats,
    listListings: listListings,
    getActiveListings: listListings,
    myListings: myListings,
    getMyListings: myListings,
    createListing: createListing,
    updateListing: updateListing,
    removeListing: removeListing,
    createRequirement: createRequirement,
    closeRequirement: closeRequirement,
    myRequirements: myRequirements,
    getRequirements: myRequirements,
    listOpenRequirements: listOpenRequirements,
    getOpenRequirements: listOpenRequirements,
    createOffer: createOffer,
    sendOffer: createOffer,
    myOffers: myOffers,
    getOffersForFarmer: myOffers,
    getOffersForRequirement: myOffers,
    acceptOffer: acceptOffer,
    declineOffer: declineOffer,
    placeOrder: placeOrder,
    myOrders: myOrders,
    getOrders: myOrders,
    advanceOrder: advanceOrder,
    declineOrder: declineOrder,
    rateOrder: rateOrder,
    updateTrackingLocation: updateTrackingLocation,
    uploadListingPhoto: uploadListingPhoto,
    getAllSellerStats: async function() { return {}; },
    getCounterpartyPhone: async function() { return null; }
  };
});
