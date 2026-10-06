// api/tracking/[orderId].js - Vercel Serverless Function for GPS Live Tracking Location Query
const { sb, trackingStore, setCorsHeaders, sendJson, authenticateUser, TOWNS_MAP } = require('../_shared');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const orderId = req.query?.orderId || parsedUrl.pathname.split('/').filter(Boolean).pop();
  const token = req.query?.token || parsedUrl.searchParams.get('token');

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
};
