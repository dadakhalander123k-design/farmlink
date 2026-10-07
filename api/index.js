// api/index.js - API Health & Index
const { sendJson, setCorsHeaders } = require('./_shared');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.statusCode = 204;
    return res.end();
  }
  return sendJson(res, 200, {
    success: true,
    service: 'Farmlink API',
    version: '2.0.0',
    endpoints: [
      '/api/market-prices/filters',
      '/api/market-prices',
      '/api/tracking/update',
      '/api/tracking/:orderId'
    ]
  });
};
