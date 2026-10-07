// api/market-prices/filters.js - Vercel Serverless Function for AGMARKNET Filters
const agmarknet = require('../../lib/agmarknet');
const { setCorsHeaders, sendJson } = require('../_shared');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
  }

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
};
