// lib/agmarknet.js - AGMARKNET Official Mandi Price Service
const https = require('https');

const AGMARKNET_HOST = 'api.agmarknet.gov.in';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

// In-memory cache: key -> { data, timestamp }
const memoryCache = new Map();

function fetchAgmarknet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: AGMARKNET_HOST,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://agmarknet.gov.in',
        'Referer': 'https://agmarknet.gov.in/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 12000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            reject(new Error('Invalid JSON from AGMARKNET: ' + e.message));
          }
        } else {
          reject(new Error(`AGMARKNET responded with status ${res.statusCode}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('AGMARKNET request timed out'));
    });

    req.on('error', (err) => {
      reject(new Error('AGMARKNET network error: ' + err.message));
    });

    req.end();
  });
}

/**
 * Normalization map for DirectFarm crops to AGMARKNET commodity names / aliases
 */
const CROP_NORMALIZATION = {
  'tomato': ['Tomato'],
  'onion': ['Onion', 'Onion Green'],
  'chilli': ['Green Chilli', 'Dry Chillies', 'Chili Red', 'Bajji chilli'],
  'green chilli': ['Green Chilli'],
  'dry chillies': ['Dry Chillies'],
  'potato': ['Potato'],
  'brinjal': ['Brinjal'],
  'okra': ['Bhindi(Ladies Finger)', 'Okra'],
  'banana': ['Banana'],
  'mango': ['Mango'],
  'rice': ['Rice', 'Paddy(Common)'],
  'paddy': ['Paddy(Common)', 'Rice'],
  'coconut': ['Coconut'],
  'turmeric': ['Turmeric']
};

/**
 * Fetch official filters (states, commodities)
 */
async function getFilters() {
  const cacheKey = 'filters';
  const cached = memoryCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS * 4)) {
    return cached.data;
  }

  const res = await fetchAgmarknet('/v1/daily-price-arrival/filters');
  if (!res || !res.data) {
    throw new Error('Filters data missing from AGMARKNET');
  }

  const result = {
    commodities: (res.data.cmdt_data || []).map(c => ({
      id: c.cmdt_id,
      name: c.cmdt_name,
      groupId: c.cmdt_group_id
    })),
    states: (res.data.state_data || []).filter(s => s.state_id !== 100000).map(s => ({
      id: s.state_id,
      name: s.state_name
    }))
  };

  memoryCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

/**
 * Format a Date object to YYYY-MM-DD
 */
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fetch daily report for state and date
 */
async function fetchStateDailyReport(stateId, dateStr) {
  const path = `/v1/prices-and-arrivals/commodity-market/daily-report-state?date=${dateStr}&state=${stateId}&includeExcel=false`;
  return await fetchAgmarknet(path);
}

/**
 * Get market prices for a given commodity and state
 * @param {string|number} commodityNameOrId - e.g. "Tomato" or "Onion"
 * @param {number} stateId - default 2 (Andhra Pradesh)
 * @param {string} [requestedDate] - YYYY-MM-DD
 */
async function getMarketPrices(commodityNameOrId, stateId = 2, requestedDate = null) {
  const normQuery = String(commodityNameOrId || 'Tomato').trim().toLowerCase();
  const normList = CROP_NORMALIZATION[normQuery] || [normQuery];

  // Try today, then yesterday if today has no arrivals yet (e.g. early morning)
  const datesToTry = [];
  if (requestedDate) {
    datesToTry.push(requestedDate);
  } else {
    const now = new Date();
    datesToTry.push(formatDate(now));
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    datesToTry.push(formatDate(yesterday));
    const dayBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    datesToTry.push(formatDate(dayBefore));
  }

  let matchedCommodity = null;
  let observations = [];
  let successfulDate = null;
  let lastError = null;

  for (const dt of datesToTry) {
    const cacheKey = `report_${stateId}_${dt}`;
    let report = null;
    const cached = memoryCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      report = cached.data;
    } else {
      try {
        report = await fetchStateDailyReport(stateId, dt);
        if (report && report.commodityGroups) {
          memoryCache.set(cacheKey, { data: report, timestamp: Date.now() });
        }
      } catch (err) {
        lastError = err;
        continue;
      }
    }

    if (!report || !report.commodityGroups || !Array.isArray(report.commodityGroups)) {
      continue;
    }

    // Search for commodity in report
    for (const grp of report.commodityGroups) {
      if (!grp.commodities || !Array.isArray(grp.commodities)) continue;
      for (const cmdt of grp.commodities) {
        const cName = cmdt.commodityName;
        const matches = normList.some(alias => cName.toLowerCase().includes(alias.toLowerCase())) ||
                        cName.toLowerCase().includes(normQuery);

        if (matches) {
          matchedCommodity = cmdt;
          successfulDate = dt;
          break;
        }
      }
      if (matchedCommodity) break;
    }

    if (matchedCommodity && matchedCommodity.markets && matchedCommodity.markets.length > 0) {
      break;
    }
  }

  if (!matchedCommodity) {
    // If not found in tested dates
    return {
      success: true,
      found: false,
      commodity: commodityNameOrId,
      message: `No market data available for ${commodityNameOrId} in selected region.`,
      source: 'Government of India — AGMARKNET',
      sourceUrl: 'https://agmarknet.gov.in/home'
    };
  }

  // Parse and extract valid observations
  // Each market has { marketCenter, total_arrivals, data: [{ variety, minimumPrice, maximumPrice, modalPrice, unitOfPrice, unitOfArrivals, arrivals }] }
  const markets = matchedCommodity.markets || [];
  const marketDetails = [];

  for (const mkt of markets) {
    const mName = mkt.marketCenter || 'Unknown APMC';
    const items = mkt.data || [];
    for (const it of items) {
      const modal = Number(it.modalPrice);
      const min = Number(it.minimumPrice);
      const max = Number(it.maximumPrice);
      const arrivals = Number(it.arrivals || mkt.total_arrivals || 0);

      // Remove invalid/null/non-numeric price records
      if (!isNaN(modal) && modal > 0) {
        observations.push({
          market: mName,
          variety: it.variety || 'Standard',
          modalPrice: modal,
          minPrice: !isNaN(min) && min > 0 ? min : modal,
          maxPrice: !isNaN(max) && max > 0 ? max : modal,
          unitOfPrice: it.unitOfPrice || 'Rs./Quintal',
          arrivals: arrivals,
          unitOfArrivals: it.unitOfArrivals || 'Metric Tonnes'
        });

        marketDetails.push({
          market: mName,
          variety: it.variety || 'Standard',
          modalPrice: modal,
          minPrice: !isNaN(min) && min > 0 ? min : modal,
          maxPrice: !isNaN(max) && max > 0 ? max : modal,
          pricePerKg: Math.round((modal / 100) * 10) / 10,
          arrivals: arrivals,
          unitOfArrivals: it.unitOfArrivals || 'MT'
        });
      }
    }
  }

  if (observations.length === 0) {
    return {
      success: true,
      found: false,
      commodity: matchedCommodity.commodityName,
      message: `No active price records reported for ${matchedCommodity.commodityName}.`,
      date: successfulDate,
      source: 'Government of India — AGMARKNET',
      sourceUrl: 'https://agmarknet.gov.in/home'
    };
  }

  // Calculate Average Mandi Reference Price from actual observations
  const sumModal = observations.reduce((acc, o) => acc + o.modalPrice, 0);
  const avgModalQuintal = Math.round(sumModal / observations.length);
  const avgModalKg = Math.round((avgModalQuintal / 100) * 10) / 10;

  const minObserved = Math.min(...observations.map(o => o.minPrice));
  const maxObserved = Math.max(...observations.map(o => o.maxPrice));
  const minObservedKg = Math.round((minObserved / 100) * 10) / 10;
  const maxObservedKg = Math.round((maxObserved / 100) * 10) / 10;

  // Find most frequent modal price (statistical mode)
  const freqMap = {};
  let mostFrequentModal = observations[0].modalPrice;
  let maxFreq = 0;
  for (const o of observations) {
    freqMap[o.modalPrice] = (freqMap[o.modalPrice] || 0) + 1;
    if (freqMap[o.modalPrice] > maxFreq) {
      maxFreq = freqMap[o.modalPrice];
      mostFrequentModal = o.modalPrice;
    }
  }

  return {
    success: true,
    found: true,
    commodity: matchedCommodity.commodityName,
    rawCommodityQuery: commodityNameOrId,
    stateId: stateId,
    date: successfulDate,
    updatedLabel: successfulDate === formatDate(new Date()) ? 'Updated today' : `Latest available data: ${successfulDate}`,
    source: 'Government of India — AGMARKNET',
    sourceUrl: 'https://agmarknet.gov.in/home',
    marketsReportingCount: observations.length,
    // Calculated values
    averageMandiReferencePriceQuintal: avgModalQuintal,
    averageMandiReferencePriceKg: avgModalKg,
    modalPriceQuintal: mostFrequentModal,
    modalPriceKg: Math.round((mostFrequentModal / 100) * 10) / 10,
    minPriceQuintal: minObserved,
    minPriceKg: minObservedKg,
    maxPriceQuintal: maxObserved,
    maxPriceKg: maxObservedKg,
    marketDetails: marketDetails
  };
}

module.exports = {
  getFilters,
  getMarketPrices,
  CROP_NORMALIZATION
};
