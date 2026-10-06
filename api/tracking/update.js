// api/tracking/update.js - Vercel Serverless Function for GPS Live Tracking Updates
const { sb, trackingStore, setCorsHeaders, sendJson, parseBody, authenticateUser } = require('../_shared');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
  }

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

    // Verify user has right to update this order (must be farmer or admin)
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
};
