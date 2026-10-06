// api/_shared.js - Shared utilities for Vercel Serverless Functions
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ykymwiyleohoxluderod.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_1fdznVkRU4PkwcmZ3bwxEg_bOBcN5y4';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

if (!global.__df_trackingStore) {
  global.__df_trackingStore = new Map();
}
const trackingStore = global.__df_trackingStore;

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
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

const TOWNS_MAP = [
  {n:'Bhimavaram',lat:16.5449,lng:81.5212},{n:'Vijayawada',lat:16.5062,lng:80.6480},{n:'Eluru',lat:16.7107,lng:81.0952},
  {n:'Tadepalligudem',lat:16.8140,lng:81.5270},{n:'Narsapuram',lat:16.4350,lng:81.6970},{n:'Tanuku',lat:16.7540,lng:81.6810},
  {n:'Rajahmundry',lat:17.0005,lng:81.8040},{n:'Kakinada',lat:16.9891,lng:82.2475},{n:'Machilipatnam',lat:16.1875,lng:81.1389},
  {n:'Guntur',lat:16.3067,lng:80.4365},{n:'Ongole',lat:15.5057,lng:80.0499},{n:'Nellore',lat:14.4426,lng:79.9865},
  {n:'Visakhapatnam',lat:17.6868,lng:83.2185},{n:'Tirupati',lat:13.6288,lng:79.4192},{n:'Kurnool',lat:15.8281,lng:78.0373},
  {n:'Hyderabad',lat:17.3850,lng:78.4867},{n:'Tenali',lat:16.2430,lng:80.6400}
];

module.exports = {
  sb,
  trackingStore,
  setCorsHeaders,
  sendJson,
  parseBody,
  authenticateUser,
  TOWNS_MAP
};
