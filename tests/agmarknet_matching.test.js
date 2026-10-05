const test = require('node:test');
const assert = require('node:assert/strict');
const agmarknet = require('../lib/agmarknet');
const matching = require('../lib/matching');
const pricing = require('../lib/pricing');

test('AGMARKNET: Live fetch filters from official backend', async (t) => {
  const filters = await agmarknet.getFilters();
  assert.ok(filters.commodities.length > 50, 'Should load real commodities from AGMARKNET');
  assert.ok(filters.states.length > 20, 'Should load real states from AGMARKNET');

  const tomato = filters.commodities.find(c => c.name.toLowerCase() === 'tomato');
  assert.ok(tomato, 'Tomato should be in AGMARKNET commodity list');
  assert.equal(tomato.id, 65);
});

test('AGMARKNET: Fetch and compute live mandi reference price for Tomato in AP', async (t) => {
  const result = await agmarknet.getMarketPrices('Tomato', 2);
  assert.equal(result.success, true);
  assert.equal(result.found, true);
  assert.equal(result.commodity, 'Tomato');
  assert.ok(result.marketsReportingCount > 0, 'Markets reporting must be > 0');
  assert.ok(result.averageMandiReferencePriceKg > 0, 'Average price per kg must be > 0');
  assert.ok(result.averageMandiReferencePriceQuintal > 0, 'Average price per quintal must be > 0');
  assert.ok(Math.abs(result.averageMandiReferencePriceQuintal - result.averageMandiReferencePriceKg * 100) < 5);
  assert.ok(result.date, 'Observation date must be provided');
  assert.equal(result.source, 'Government of India — AGMARKNET');
  assert.ok(Array.isArray(result.marketDetails) && result.marketDetails.length > 0);
  assert.ok(typeof result.marketDetails[0].modalPrice === 'number');
});

test('AGMARKNET: No fake data for unknown commodities', async (t) => {
  const result = await agmarknet.getMarketPrices('NonExistentCrop12345', 2);
  assert.equal(result.success, true);
  assert.equal(result.found, false);
  assert.match(result.message, /No market data available/);
});

test('Smart Matching System: 35/30/20/10/5 transparent buyer scoring', async (t) => {
  const buyerLoc = { lat: 16.5449, lng: 81.5212, label: 'Bhimavaram' };
  const officialRef = 28; // Rs 28/kg

  const nearListing = {
    crop: 'Tomato',
    price: 24, // Favorable (below 28)
    qty: 500,
    status: 'active',
    loc: { lat: 16.5500, lng: 81.5300, label: 'Near Bhimavaram' },
    ratingAvg: 4.8
  };

  const farExpensiveListing = {
    crop: 'Tomato',
    price: 38, // Unfavorable (above 28)
    qty: 100,
    status: 'active',
    loc: { lat: 17.6868, lng: 83.2185, label: 'Visakhapatnam' },
    ratingAvg: 4.0
  };

  const scoreNear = matching.smartBuyerScore(nearListing, 'Tomato', buyerLoc, officialRef);
  const scoreFar = matching.smartBuyerScore(farExpensiveListing, 'Tomato', buyerLoc, officialRef);

  assert.ok(scoreNear !== null);
  assert.ok(scoreFar !== null);
  assert.ok(scoreNear.total > scoreFar.total, 'Near favorable listing must rank higher');
  assert.ok(scoreNear.breakdown.priceSuitability > scoreFar.breakdown.priceSuitability, 'Lower price relative to official market reference must score higher');
});
