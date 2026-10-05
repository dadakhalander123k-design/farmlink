// server.js - DirectFarm Unified Server (Static Files + AGMARKNET API + Live Tracking)
const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');
const agmarknet = require('./lib/agmarknet');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

// Supabase client for auth & order authorization checks
const SUPABASE_URL = 'https://ykymwiyleohoxluderod.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1fdznVkRU4PkwcmZ3bwxEg_bOBcN5y4';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// In-memory live tracking store: orderId -> { lat, lng, label, speed, updatedAt, isLive, farmerId }
const trackingStore = new Map();

// MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-cache'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
  });
}

/**
 * Verify user token using Supabase df_me RPC
 */
async function authenticateUser(token) {
  if (!token) return null;
  try {
    const res = await sb.rpc('df_me', { p_token: token });
    if (res.error || !res.data) return null;
    return res.data;
  } catch (e) {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const pathname = parsedUrl.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // --- API: AGMARKNET Filters ---
  if (pathname === '/api/market-prices/filters' && req.method === 'GET') {
    try {
      const filters = await agmarknet.getFilters();
      return sendJson(res, 200, { success: true, ...filters });
    } catch (err) {
      console.error('Error fetching AGMARKNET filters:', err.message);
      return sendJson(res, 502, {
        success: false,
        error: 'Market filters temporarily unavailable.',
        message: err.message
      });
    }
  }

  // --- API: AGMARKNET Market Prices ---
  if (pathname === '/api/market-prices' && req.method === 'GET') {
    const commodity = parsedUrl.searchParams.get('commodity') || 'Tomato';
    const stateId = parseInt(parsedUrl.searchParams.get('state') || '2', 10);
    const date = parsedUrl.searchParams.get('date') || null;

    try {
      const data = await agmarknet.getMarketPrices(commodity, stateId, date);
      return sendJson(res, 200, data);
    } catch (err) {
      console.error('Error fetching market prices:', err.message);
      return sendJson(res, 502, {
        success: false,
        error: 'Market prices are temporarily unavailable.',
        message: err.message,
        retry: true
      });
    }
  }

  // --- API: Live Tracking Location Update (From Farmer / Driver) ---
  if (pathname === '/api/tracking/update' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { token, orderId, lat, lng, label, speed, farmerLoc } = body;

      if (!orderId || typeof lat !== 'number' || typeof lng !== 'number') {
        return sendJson(res, 400, { success: false, error: 'Invalid tracking payload' });
      }

      // Verify token
      const user = await authenticateUser(token);
      if (!user) {
        return sendJson(res, 401, { success: false, error: 'Unauthorized: Invalid session' });
      }

      // Verify user has right to update this order (must be farmer)
      const myOrdersRes = await sb.rpc('df_my_orders', { p_token: token });
      const orders = myOrdersRes.data || [];
      const order = orders.find(o => o.id === orderId);

      if (!order && user.role !== 'farmer') {
        return sendJson(res, 403, { success: false, error: 'Unauthorized: You are not the delivery provider for this order.' });
      }

      const point = {
        lat: lat,
        lng: lng,
        label: label || 'Driver Vehicle (GPS Active)',
        speed: speed || 0,
        updatedAt: Date.now(),
        isLive: true,
        farmerId: user.id
      };

      const existing = trackingStore.get(orderId) || {};
      const resolvedFarmLoc = farmerLoc || existing.farmerLoc || (user.loc_label && user.lat ? { label: user.loc_label, lat: Number(user.lat), lng: Number(user.lng) } : null);

      trackingStore.set(orderId, {
        ...existing,
        ...point,
        farmerLoc: resolvedFarmLoc
      });

      return sendJson(res, 200, {
        success: true,
        message: 'Location updated',
        currentLoc: point,
        farmerLoc: resolvedFarmLoc
      });
    } catch (err) {
      console.error('Error updating tracking:', err);
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // Reference agricultural towns in Andhra Pradesh
  const TOWNS_MAP = [
    {n:'Bhimavaram',lat:16.5449,lng:81.5212},{n:'Vijayawada',lat:16.5062,lng:80.6480},{n:'Eluru',lat:16.7107,lng:81.0952},
    {n:'Tadepalligudem',lat:16.8140,lng:81.5270},{n:'Narsapuram',lat:16.4350,lng:81.6970},{n:'Tanuku',lat:16.7540,lng:81.6810},
    {n:'Rajahmundry',lat:17.0005,lng:81.8040},{n:'Kakinada',lat:16.9891,lng:82.2475},{n:'Machilipatnam',lat:16.1875,lng:81.1389},
    {n:'Guntur',lat:16.3067,lng:80.4365},{n:'Ongole',lat:15.5057,lng:80.0499},{n:'Nellore',lat:14.4426,lng:79.9865},
    {n:'Visakhapatnam',lat:17.6868,lng:83.2185},{n:'Tirupati',lat:13.6288,lng:79.4192},{n:'Kurnool',lat:15.8281,lng:78.0373},
    {n:'Hyderabad',lat:17.3850,lng:78.4867},{n:'Tenali',lat:16.2430,lng:80.6400}
  ];

  // --- API: Live Tracking Location Query (For Buyer & Farmer) ---
  if (pathname.startsWith('/api/tracking/') && req.method === 'GET') {
    const parts = pathname.split('/');
    const orderId = parts[3];
    const token = parsedUrl.searchParams.get('token');

    if (!orderId) {
      return sendJson(res, 400, { success: false, error: 'Missing orderId' });
    }

    // Verify token
    const user = await authenticateUser(token);
    if (!user) {
      return sendJson(res, 401, { success: false, error: 'Unauthorized: Invalid session' });
    }

    // Verify user is authorized to track this order
    const ordersRes = await sb.rpc('df_my_orders', { p_token: token });
    const orders = ordersRes.data || [];
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      return sendJson(res, 403, { success: false, error: 'Unauthorized: Order not found in your account.' });
    }

    const livePoint = trackingStore.get(orderId);
    const hasLive = livePoint && (Date.now() - livePoint.updatedAt < 60 * 60 * 1000);

    const destLoc = {
      label: order.dest_label,
      lat: Number(order.dest_lat),
      lng: Number(order.dest_lng)
    };

    let farmerLoc = (livePoint && livePoint.farmerLoc) ? livePoint.farmerLoc : null;

    if (!farmerLoc) {
      try {
        const lRes = await sb.rpc('df_list_listings', { p_token: token, p_limit: 300, p_offset: 0 });
        if (lRes && lRes.data && Array.isArray(lRes.data)) {
          let matched = null;
          if (order.listing_id) {
            matched = lRes.data.find(l => l.id === order.listing_id);
          }
          if (!matched && order.farmer_id) {
            matched = lRes.data.find(l => l.farmer_id === order.farmer_id);
          }
          if (matched && matched.lat != null && matched.lng != null) {
            farmerLoc = {
              label: matched.loc_label || order.farmer_org || `${order.farmer_name || 'Farmer'} Farm`,
              lat: Number(matched.lat),
              lng: Number(matched.lng)
            };
          }
        }
      } catch (e) {
        console.warn('Listing RPC lookup error:', e);
      }
    }

    if (!farmerLoc) {
      const searchStr = `${order.farmer_org || ''} ${order.farmer_name || ''} ${order.crop || ''}`.toLowerCase();
      const matchTown = TOWNS_MAP.find(t => searchStr.includes(t.n.toLowerCase()));
      if (matchTown) {
        farmerLoc = {
          label: `${matchTown.n} Farm (${order.farmer_org || order.farmer_name || 'Farmer'})`,
          lat: matchTown.lat,
          lng: matchTown.lng
        };
      }
    }

    if (!farmerLoc) {
      farmerLoc = {
        label: order.farmer_org ? `${order.farmer_org} Farm (Bhimavaram)` : 'Farmer Farm (Bhimavaram)',
        lat: 16.5449,
        lng: 81.5212
      };
    }

    const currentLoc = hasLive ? {
      lat: livePoint.lat,
      lng: livePoint.lng,
      label: livePoint.label || 'Driver Vehicle (GPS Active)',
      speed: livePoint.speed,
      updatedAt: livePoint.updatedAt
    } : {
      lat: farmerLoc.lat,
      lng: farmerLoc.lng,
      label: order.status === 'out' ? `In transit from ${farmerLoc.label}` : `${farmerLoc.label} (Farm Origin)`,
      speed: 0,
      updatedAt: livePoint ? livePoint.updatedAt : Date.now()
    };

    return sendJson(res, 200, {
      success: true,
      orderId: orderId,
      status: order.status,
      statusHistory: order.status_history || [],
      crop: order.crop,
      qty: order.qty,
      price: order.price,
      deliveryFee: order.delivery_fee,
      destLoc: destLoc,
      farmerLoc: farmerLoc,
      isLive: Boolean(hasLive),
      currentLoc: currentLoc,
      lastUpdated: livePoint ? livePoint.updatedAt : Date.now()
    });
  }

  // --- Static File Serving ---
  let filePath = path.join(ROOT_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security: prevent path traversal outside ROOT_DIR
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // If not found, serve index.html for SPA hash routing
      filePath = path.join(ROOT_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        return res.end('Server Error loading file');
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
      });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`DirectFarm MVP server running at http://localhost:${PORT}`);
  console.log(`- AGMARKNET API ready at http://localhost:${PORT}/api/market-prices`);
  console.log(`- Live Tracking API ready at http://localhost:${PORT}/api/tracking`);
});
