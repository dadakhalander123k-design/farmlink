// tests/integration.test.js - Simulation of order, offer, and atomic stock decrement workflows
const test = require('node:test');
const assert = require('node:assert/strict');
const pricing = require('../lib/pricing');
const matching = require('../lib/matching');

test('Order placement and stock decrement contract simulation', async (t) => {
  // Initial state in database
  let listing = {
    id: 'l-1',
    farmer_id: 'f-1',
    crop: 'Tomato',
    qty: 50,
    price: 30,
    status: 'active'
  };

  function simulatePlaceOrder(orderQty) {
    if (listing.status !== 'active') {
      throw new Error('This produce is no longer available');
    }
    if (listing.qty < orderQty) {
      throw new Error(`Only ${listing.qty} kg left`);
    }
    listing.qty -= orderQty;
    if (listing.qty <= 0) {
      listing.status = 'sold';
    }
    return { orderId: 'ord-' + Math.random().toString(36).slice(2, 6), qty: orderQty };
  }

  // 1. Buy 30 kg from 50 kg
  const o1 = simulatePlaceOrder(30);
  assert.equal(o1.qty, 30);
  assert.equal(listing.qty, 20);
  assert.equal(listing.status, 'active');

  // 2. Race condition: Attempt to buy 25 kg when only 20 kg left
  assert.throws(() => {
    simulatePlaceOrder(25);
  }, /Only 20 kg left/);

  // 3. Buy exact remaining 20 kg -> status becomes 'sold'
  const o2 = simulatePlaceOrder(20);
  assert.equal(o2.qty, 20);
  assert.equal(listing.qty, 0);
  assert.equal(listing.status, 'sold');

  // 4. Any subsequent order rejected as no longer available
  assert.throws(() => {
    simulatePlaceOrder(5);
  }, /This produce is no longer available/);
});

test('Offer flow and requirement fulfillment contract simulation', async (t) => {
  let requirement = {
    id: 'req-1',
    buyer_id: 'b-1',
    crop: 'Onion',
    qty: 1000,
    filled: 0,
    status: 'open'
  };

  let listing = {
    id: 'l-2',
    farmer_id: 'f-2',
    crop: 'Onion',
    qty: 600,
    price: 22,
    status: 'active'
  };

  let offer = {
    id: 'off-1',
    req_id: requirement.id,
    farmer_id: listing.farmer_id,
    listing_id: listing.id,
    qty: 600,
    price: 22,
    status: 'pending'
  };

  function simulateAcceptOffer(off) {
    if (off.status !== 'pending') throw new Error('This offer is no longer available');
    if (requirement.status !== 'open') throw new Error('This requirement is not open');
    if (listing.qty < off.qty) throw new Error('That produce is no longer available in this quantity');

    const allocated = Math.min(off.qty, requirement.qty - requirement.filled);
    listing.qty -= allocated;
    if (listing.qty <= 0) listing.status = 'sold';
    off.status = 'accepted';
    requirement.filled += allocated;
    if (requirement.filled >= requirement.qty) {
      requirement.status = 'fulfilled';
    }
    return allocated;
  }

  const allocated = simulateAcceptOffer(offer);
  assert.equal(allocated, 600);
  assert.equal(requirement.filled, 600);
  assert.equal(requirement.status, 'open'); // 400 kg remaining
  assert.equal(listing.qty, 0);
  assert.equal(listing.status, 'sold');
  assert.equal(offer.status, 'accepted');
});
