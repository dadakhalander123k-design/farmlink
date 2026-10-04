// tests/unit.test.js - Comprehensive unit test suite for DirectFarm pure domain modules
const test = require('node:test');
const assert = require('node:assert/strict');
const pricing = require('../lib/pricing');
const matching = require('../lib/matching');
const routing = require('../lib/routing');

test('Haversine distance (km) and road multiplier', async (t) => {
  // Bhimavaram (16.5449, 81.5212) to Vijayawada (16.5062, 80.6480)
  const p1 = { lat: 16.5449, lng: 81.5212 };
  const p2 = { lat: 16.5062, lng: 80.6480 };

  const dist = pricing.km(p1, p2);
  assert.ok(dist > 100 && dist < 150, `Expected distance ~116 km, got ${dist}`);

  // Distance to self is 0
  assert.equal(pricing.km(p1, p1), 0);

  // Symmetry
  assert.equal(pricing.km(p1, p2), pricing.km(p2, p1));

  // Null / invalid coordinates
  assert.equal(pricing.km(null, p2), 0);
  assert.equal(pricing.km(p1, {}), 0);
});

test('Delivery fee calculation', async (t) => {
  const p1 = { lat: 16.5449, lng: 81.5212 };
  const pSame = { lat: 16.5449, lng: 81.5212 };
  const pFar = { lat: 17.3850, lng: 78.4867 }; // Hyderabad

  // Minimum fee is Rs 40
  const feeLocal = pricing.deliveryFee(p1, pSame);
  assert.equal(feeLocal, 40);

  // Scaled fee for long distance
  const feeFar = pricing.deliveryFee(p1, pFar);
  assert.ok(feeFar > 200, `Expected delivery fee for long distance > 200, got ${feeFar}`);
  assert.equal(feeFar % 10, 0, 'Delivery fee must be rounded to nearest 10');
});

test('Market reference logic (fallback vs live average)', async (t) => {
  // 0 live listings -> crop reference
  const ref0 = pricing.marketRef('Tomato', []);
  assert.equal(ref0.ref, 26);
  assert.equal(ref0.live, false);

  // 1 live listing -> still falls back to reference (requires >= 2 live listings)
  const singleListing = [{ id: '1', crop: 'Tomato', price: 50, qty: 100, status: 'active' }];
  const ref1 = pricing.marketRef('Tomato', singleListing);
  assert.equal(ref1.ref, 26);
  assert.equal(ref1.live, false);

  // 2 live listings -> average of prices
  const twoListings = [
    { id: '1', crop: 'Tomato', price: 30, qty: 100, status: 'active' },
    { id: '2', crop: 'Tomato', price: 40, qty: 200, status: 'active' }
  ];
  const ref2 = pricing.marketRef('Tomato', twoListings);
  assert.equal(ref2.ref, 35);
  assert.equal(ref2.live, true);

  // Exclude current listing ID
  const refExclude = pricing.marketRef('Tomato', twoListings, '1');
  assert.equal(refExclude.ref, 26); // only 1 listing remains, falls back
});

test('Price badge categorisation', async (t) => {
  const ref = 100;
  // <= -5% -> Great deal
  assert.equal(pricing.priceBadge(90, ref).t, 'Great deal');
  assert.equal(pricing.priceBadge(95, ref).t, 'Great deal');

  // between -5% and +5% -> Fair price
  assert.equal(pricing.priceBadge(100, ref).t, 'Fair price');
  assert.equal(pricing.priceBadge(105, ref).t, 'Fair price');

  // between +5% and +15% -> Slightly high
  assert.equal(pricing.priceBadge(110, ref).t, 'Slightly high');
  assert.equal(pricing.priceBadge(115, ref).t, 'Slightly high');

  // > +15% -> Above market
  assert.equal(pricing.priceBadge(120, ref).t, 'Above market');
});

test('Smart matchScore with boundary edge cases', async (t) => {
  const req = {
    crop: 'Tomato',
    grade: 'B',
    qty: 500,
    maxPrice: 30,
    maxDist: 50,
    loc: { lat: 16.5449, lng: 81.5212 }
  };

  const goodListing = {
    crop: 'Tomato',
    grade: 'B',
    qty: 500,
    price: 28,
    status: 'active',
    loc: { lat: 16.5500, lng: 81.5250 }
  };

  const res = matching.matchScore(req, goodListing, { name: 'Ramesh' }, { rating: 4.8, done: 8 });
  assert.ok(res !== null);
  assert.ok(res.total >= 0.8 && res.total <= 1.0);
  assert.equal(typeof res.pct, 'number');

  // Edge case 1: Zero quantity available
  const zeroQtyListing = { ...goodListing, qty: 0 };
  assert.equal(matching.matchScore(req, zeroQtyListing), null);

  // Edge case 2: Crop mismatch
  const diffCrop = { ...goodListing, crop: 'Chilli' };
  assert.equal(matching.matchScore(req, diffCrop), null);

  // Edge case 3: Status not active
  const soldListing = { ...goodListing, status: 'sold' };
  assert.equal(matching.matchScore(req, soldListing), null);

  // Edge case 4: Price exceeds maxPrice * 1.2 ceiling (30 * 1.2 = 36)
  const highPriceListing = { ...goodListing, price: 37 };
  assert.equal(matching.matchScore(req, highPriceListing), null);

  // Edge case 5: Grade too low (Requirement is Grade A, listing is Grade C: 3 vs 1, diff > 1)
  const gradeReq = { ...req, grade: 'A' };
  const lowGradeListing = { ...goodListing, grade: 'C' };
  assert.equal(matching.matchScore(gradeReq, lowGradeListing), null);

  // Edge case 6: Distance strictly beyond limit
  const farListing = { ...goodListing, loc: { lat: 17.6868, lng: 83.2185 } }; // Visakhapatnam > 200 km
  assert.equal(matching.matchScore(req, farListing), null);
});

test('Best combination algorithm', async (t) => {
  const req = { qty: 1000, filled: 200 }; // Needs 800 kg
  const matches = [
    { l: { price: 25, qty: 500 }, total: 0.9 },
    { l: { price: 28, qty: 400 }, total: 0.85 },
    { l: { price: 32, qty: 300 }, total: 0.7 }
  ];

  const combo = matching.bestCombo(req, matches);
  assert.equal(combo.got, 800);
  assert.equal(combo.short, 0);
  assert.equal(combo.pick.length, 2);
  assert.equal(combo.pick[0].q, 500); // 500 at 25
  assert.equal(combo.pick[1].q, 300); // 300 at 28
  assert.equal(combo.avg, (500 * 25 + 300 * 28) / 800);
});

test('Multi-stop route planner (nearest-neighbour + 2-opt)', async (t) => {
  const origin = { lat: 16.5449, lng: 81.5212, label: 'Bhimavaram' };
  const stops = [
    { loc: { lat: 16.7540, lng: 81.6810 }, label: 'Tanuku' },
    { loc: { lat: 17.0005, lng: 81.8040 }, label: 'Rajahmundry' },
    { loc: { lat: 16.8140, lng: 81.5270 }, label: 'Tadepalligudem' }
  ];

  const plan = routing.planRoute(origin, stops);
  assert.equal(plan.route.length, 3);
  assert.ok(plan.total > 0);

  const naive = routing.naiveDist(origin, stops);
  assert.ok(plan.total <= naive + 0.001, 'Optimised route should be <= naive route distance');
});


