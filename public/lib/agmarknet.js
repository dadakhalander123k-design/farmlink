// lib/agmarknet.js - AGMARKNET Official Mandi Price Service
const https = require('https');

const AGMARKNET_HOST = 'api.agmarknet.gov.in';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hour cache

// In-memory cache: key -> { data, timestamp }
const memoryCache = new Map();

const STATE_NAMES = {
  1: 'Andaman and Nicobar', 2: 'Andhra Pradesh', 3: 'Arunachal Pradesh', 4: 'Assam',
  5: 'Bihar', 6: 'Chandigarh', 7: 'Chattisgarh', 8: 'Dadra and Nagar Haveli',
  9: 'Daman and Diu', 10: 'Goa', 11: 'Gujarat', 12: 'Haryana',
  13: 'Himachal Pradesh', 14: 'Jammu and Kashmir', 15: 'Jharkhand', 16: 'Karnataka',
  17: 'Keralam', 18: 'Lakshadweep', 19: 'Madhya Pradesh', 20: 'Maharashtra',
  21: 'Manipur', 22: 'Meghalaya', 23: 'Mizoram', 24: 'Nagaland',
  25: 'NCT of Delhi', 26: 'Odisha', 27: 'Pondicherry', 28: 'Punjab',
  29: 'Rajasthan', 30: 'Sikkim', 31: 'Tamil Nadu', 32: 'Telangana',
  33: 'Tripura', 34: 'Uttar Pradesh', 35: 'Uttarakhand', 36: 'West Bengal'
};

// Top national agricultural trading hubs
const TOP_ACTIVE_STATES = [20, 19, 16, 32, 11, 2, 31, 29, 34, 28, 12, 25];

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
      timeout: 10000
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
  'bhindi': ['Bhindi(Ladies Finger)', 'Okra'],
  'ladies finger': ['Bhindi(Ladies Finger)', 'Okra'],
  'banana': ['Banana'],
  'mango': ['Mango'],
  'apple': ['Apple'],
  'rice': ['Rice', 'Paddy(Common)'],
  'paddy': ['Paddy(Common)', 'Rice'],
  'wheat': ['Wheat'],
  'cotton': ['Cotton'],
  'maize': ['Maize'],
  'coconut': ['Coconut'],
  'turmeric': ['Turmeric'],
  'ginger': ['Ginger(Dry)', 'Ginger(Green)'],
  'garlic': ['Garlic'],
  'mustard': ['Mustard', 'Mustard Oil'],
  'groundnut': ['Groundnut', 'Ground Nut Seed'],
  'soyabean': ['Soyabean'],
  'soybean': ['Soyabean'],
  'jowar': ['Jowar(Sorghum)'],
  'bajra': ['Bajra(Pearl Millet/Cumbu)'],
  'ragi': ['Ragi(Finger Millet)'],
  'gram': ['Bengal Gram(Gram)(Whole)', 'Black Gram(Urd Beans)(Whole)', 'Green Gram(Moong)(Whole)'],
  'bengal gram': ['Bengal Gram(Gram)(Whole)', 'Bengal Gram Dal (Chana Dal)'],
  'black gram': ['Black Gram(Urd Beans)(Whole)', 'Black Gram Dal(Urd Dal)'],
  'green gram': ['Green Gram(Moong)(Whole)', 'Green Gram Dal (Moong Dal)'],
  'red gram': ['Red gram/Arhar/Tur(whole)', 'Red gram split/Arhar dal/Tur dal'],
  'arhar': ['Red gram/Arhar/Tur(whole)', 'Red gram split/Arhar dal/Tur dal'],
  'tur': ['Red gram/Arhar/Tur(whole)', 'Red gram split/Arhar dal/Tur dal'],
  'almond': ['Almond(Badam)'],
  'badam': ['Almond(Badam)'],
  'almond(badam)': ['Almond(Badam)'],
  'cashew': ['Cashewnuts'],
  'cashewnuts': ['Cashewnuts'],
  'cabbage': ['Cabbage'],
  'cauliflower': ['Cauliflower'],
  'lemon': ['Lemon', 'Lime'],
  'papaya': ['Papaya'],
  'watermelon': ['Water Melon'],
  'water melon': ['Water Melon'],
  'absinthe': ['Absinthe']
};

/**
 * Fetch official filters (states, commodities)
 */
async function getFilters() {
  const cacheKey = 'filters';
  const cached = memoryCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS * 12)) {
    return cached.data;
  }

  try {
    const res = await fetchAgmarknet('/v1/daily-price-arrival/filters');
    if (!res || !res.data) {
      throw new Error('Filters data missing from AGMARKNET');
    }

    const commodities = (res.data.cmdt_data || []).map(c => ({
      id: c.cmdt_id,
      name: c.cmdt_name,
      groupId: c.cmdt_group_id
    }));

    const states = [
      { id: 0, name: 'All India / National (All States)' },
      ...(res.data.state_data || []).filter(s => s.state_id !== 100000).map(s => ({
        id: s.state_id,
        name: s.state_name
      }))
    ];

    const result = { commodities, states };
    memoryCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    if (cached) return cached.data;
    throw err;
  }
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
 * Normalize report data regardless of whether it comes from
 * commodity-market (grouped by commodity) or commodity-wise (grouped by market)
 */
function normalizeReport(report) {
  if (!report) return null;
  if (report.commodityGroups && Array.isArray(report.commodityGroups)) {
    return report;
  }
  if (report.markets && Array.isArray(report.markets)) {
    const groupMap = new Map();
    for (const mkt of report.markets) {
      const mName = mkt.marketName || mkt.marketCenter || 'Unknown APMC';
      for (const grp of (mkt.commodityGroups || [])) {
        const gName = grp.groupName || 'Produce';
        if (!groupMap.has(gName)) {
          groupMap.set(gName, new Map());
        }
        const cmdtMap = groupMap.get(gName);
        for (const cmdt of (grp.commodities || [])) {
          const cName = cmdt.commodityName;
          if (!cmdtMap.has(cName)) {
            cmdtMap.set(cName, { commodityName: cName, markets: [] });
          }
          const cObj = cmdtMap.get(cName);
          cObj.markets.push({
            marketCenter: mName,
            total_arrivals: cmdt.total_arrivals,
            data: cmdt.data || []
          });
        }
      }
    }

    const commodityGroups = [];
    for (const [gName, cmdtMap] of groupMap.entries()) {
      commodityGroups.push({
        groupName: gName,
        commodities: Array.from(cmdtMap.values())
      });
    }

    return {
      success: true,
      title: report.title,
      commodityGroups
    };
  }
  return null;
}

/**
 * Fetch daily report for state and date with dual-endpoint fallback
 */
async function fetchStateDailyReport(stateId, dateStr) {
  if (!stateId || stateId <= 0) return null;
  const cacheKey = `report_${stateId}_${dateStr}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  // Endpoint 1: commodity-wise (unthrottled and reliable)
  try {
    const raw = await fetchAgmarknet(`/v1/prices-and-arrivals/commodity-wise/daily-report-state?date=${dateStr}&stateIds=${stateId}&includeExcel=false`);
    const normalized = normalizeReport(raw);
    if (normalized && normalized.commodityGroups && normalized.commodityGroups.length > 0) {
      memoryCache.set(cacheKey, { data: normalized, timestamp: Date.now() });
      return normalized;
    }
  } catch (_) {}

  // Endpoint 2: commodity-market
  try {
    const raw = await fetchAgmarknet(`/v1/prices-and-arrivals/commodity-market/daily-report-state?date=${dateStr}&state=${stateId}&includeExcel=false`);
    const normalized = normalizeReport(raw);
    if (normalized && normalized.commodityGroups && normalized.commodityGroups.length > 0) {
      memoryCache.set(cacheKey, { data: normalized, timestamp: Date.now() });
      return normalized;
    }
  } catch (_) {}

  if (cached) return cached.data;
  return null;
}

/**
 * Match commodity in report by exact name, aliases, or fuzzy match
 */
function matchCommodityInReport(report, query) {
  if (!report || !report.commodityGroups || !Array.isArray(report.commodityGroups)) return null;
  const normQuery = String(query || '').trim().toLowerCase();
  const aliases = (CROP_NORMALIZATION[normQuery] || [normQuery]).map(a => a.toLowerCase().trim());

  // Pass 1: Exact match
  for (const grp of report.commodityGroups) {
    for (const c of (grp.commodities || [])) {
      const cName = String(c.commodityName || '').trim().toLowerCase();
      if (cName === normQuery || aliases.includes(cName)) {
        if (c.markets && c.markets.length > 0) return c;
      }
    }
  }

  // Pass 2: Starts with or contains match
  for (const grp of report.commodityGroups) {
    for (const c of (grp.commodities || [])) {
      const cName = String(c.commodityName || '').trim().toLowerCase();
      if (cName.includes(normQuery) || aliases.some(a => cName.includes(a) || a.includes(cName))) {
        if (c.markets && c.markets.length > 0) return c;
      }
    }
  }

  return null;
}

/**
 * Get market prices for a given commodity and state
 * @param {string|number} commodityNameOrId - e.g. "Tomato", "Wheat", "Absinthe", "Almond(Badam)"
 * @param {number} stateId - default 2 (Andhra Pradesh), 0 for All India
 * @param {string} [requestedDate] - YYYY-MM-DD
 */
async function getMarketPrices(commodityNameOrId, stateId = 2, requestedDate = null) {
  const rawQuery = String(commodityNameOrId || 'Tomato').trim();
  const sId = typeof stateId === 'number' ? stateId : parseInt(stateId || '2', 10);
  const normQuery = rawQuery.toLowerCase();

  // Fast check: if filters are cached, ensure this query matches a known commodity
  const filtersCached = memoryCache.get('filters');
  if (filtersCached && filtersCached.data && filtersCached.data.commodities) {
    const isKnown = filtersCached.data.commodities.some(c => {
      const cLower = c.name.toLowerCase();
      return cLower === normQuery || cLower.includes(normQuery) || normQuery.includes(cLower);
    }) || Object.keys(CROP_NORMALIZATION).some(k => k === normQuery || normQuery.includes(k) || k.includes(normQuery));

    if (!isKnown) {
      return {
        success: true,
        found: false,
        commodity: rawQuery,
        message: `No market data available for ${rawQuery} in AGMARKNET mandis.`,
        source: 'Government of India — AGMARKNET',
        sourceUrl: 'https://agmarknet.gov.in/home'
      };
    }
  }

  // Generate dates: prioritize yesterday (completed day with full data) then today, then earlier days
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dayBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const datesToTry = [];

  if (requestedDate) {
    datesToTry.push(requestedDate);
  } else {
    // Yesterday first (reliable finalized arrivals), then today, then day before
    datesToTry.push(formatDate(yesterday));
    datesToTry.push(formatDate(now));
    datesToTry.push(formatDate(dayBefore));
    for (let i = 3; i < 7; i++) {
      datesToTry.push(formatDate(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
    }
  }

  let matchedCommodity = null;
  let successfulDate = null;
  let reportingStateId = sId;
  let isFallback = false;

  // Step 1: If user requested a specific state (> 0), try that state first
  if (sId > 0) {
    for (const dt of datesToTry) {
      const report = await fetchStateDailyReport(sId, dt);
      const match = matchCommodityInReport(report, rawQuery);
      if (match) {
        matchedCommodity = match;
        successfulDate = dt;
        reportingStateId = sId;
        break;
      }
    }
  }

  // Step 2: If not found in requested state (or stateId === 0 for All India), search candidate states
  if (!matchedCommodity) {
    const candidateStates = TOP_ACTIVE_STATES.filter(st => st !== sId);
    const priorityDates = datesToTry.slice(0, 2);
    for (const dt of priorityDates) {
      for (const st of candidateStates) {
        const report = await fetchStateDailyReport(st, dt);
        const match = matchCommodityInReport(report, rawQuery);
        if (match) {
          matchedCommodity = match;
          successfulDate = dt;
          reportingStateId = st;
          isFallback = sId > 0 && st !== sId;
          break;
        }
      }
      if (matchedCommodity) break;
    }
  }

  if (!matchedCommodity) {
    const regionName = sId > 0 ? (STATE_NAMES[sId] || `State ${sId}`) : 'official';
    return {
      success: true,
      found: false,
      commodity: rawQuery,
      message: `No market data available for ${rawQuery} in ${regionName} AGMARKNET mandis for the selected period.`,
      source: 'Government of India — AGMARKNET',
      sourceUrl: 'https://agmarknet.gov.in/home'
    };
  }

  // Parse and extract valid observations from reporting APMC mandis
  const markets = matchedCommodity.markets || [];
  const observations = [];
  const marketDetails = [];

  for (const mkt of markets) {
    const mName = mkt.marketCenter || 'Unknown APMC';
    const items = mkt.data || [];
    for (const it of items) {
      const modal = Number(it.modalPrice);
      const min = Number(it.minimumPrice);
      const max = Number(it.maximumPrice);
      const arrivals = Number(it.arrivals || mkt.total_arrivals || 0);

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

  // Calculate Average Mandi Reference Price
  const sumModal = observations.reduce((acc, o) => acc + o.modalPrice, 0);
  const avgModalQuintal = Math.round(sumModal / observations.length);
  const avgModalKg = Math.round((avgModalQuintal / 100) * 10) / 10;

  const minObserved = Math.min(...observations.map(o => o.minPrice));
  const maxObserved = Math.max(...observations.map(o => o.maxPrice));
  const minObservedKg = Math.round((minObserved / 100) * 10) / 10;
  const maxObservedKg = Math.round((maxObserved / 100) * 10) / 10;

  // Statistical modal price
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

  const reportingStateName = STATE_NAMES[reportingStateId] || `State ${reportingStateId}`;
  const requestedStateName = sId > 0 ? (STATE_NAMES[sId] || `State ${sId}`) : 'All India';

  let updatedLabel = successfulDate === formatDate(new Date()) ? 'Updated today' : `Latest available: ${successfulDate}`;
  if (isFallback) {
    updatedLabel += ` (${reportingStateName} Mandis)`;
  } else if (reportingStateName) {
    updatedLabel += ` (${reportingStateName})`;
  }

  return {
    success: true,
    found: true,
    commodity: matchedCommodity.commodityName,
    rawCommodityQuery: commodityNameOrId,
    stateId: reportingStateId,
    stateName: reportingStateName,
    reportingState: reportingStateName,
    isFallbackRegion: isFallback,
    requestedState: requestedStateName,
    date: successfulDate,
    updatedLabel: updatedLabel,
    message: isFallback
      ? `No active arrivals reported in ${requestedStateName}; showing official live AGMARKNET mandi rates from ${reportingStateName}.`
      : undefined,
    source: 'Government of India — AGMARKNET',
    sourceUrl: 'https://agmarknet.gov.in/home',
    marketsReportingCount: observations.length,
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
  CROP_NORMALIZATION,
  STATE_NAMES
};
