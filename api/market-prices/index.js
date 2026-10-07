// api/market-prices/index.js - Vercel Serverless Function for AGMARKNET Market Prices
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

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const commodity = req.query?.commodity || parsedUrl.searchParams.get('commodity') || 'Tomato';
  const stateParam = req.query?.state || parsedUrl.searchParams.get('state') || '2';
  const stateId = parseInt(stateParam, 10);
  const date = req.query?.date || parsedUrl.searchParams.get('date') || null;

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
};
