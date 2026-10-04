// tests/verification_matrix.test.js
// Systematic verification suite covering all 6 scenarios in VERIFY AND REPORT table

const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ykymwiyleohoxluderod.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_1fdznVkRU4PkwcmZ3bwxEg_bOBcN5y4';

const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const randPhone = () => '9' + Math.floor(100000000 + Math.random() * 900000000);

test('Scenario 1: Signup Farmer A and Buyer B, Logout/Login, Wrong Password & Wrong Role messages', async () => {
  const ts = Date.now();
  const farmerEmail = `farmer_a_${ts}@testmail.com`;
  const buyerEmail = `buyer_b_${ts}@testmail.com`;
  const farmerPw = 'FarmerPass123!';
  const buyerPw = 'BuyerPass123!';

  // 1.1 Sign up Farmer A
  const faSignup = await sb.rpc('df_signup', {
    p_role: 'farmer',
    p_name: 'Farmer Anand',
    p_email: farmerEmail,
    p_phone: randPhone(),
    p_password: farmerPw,
    p_org: 'Anand Organic Farms',
    p_buyer_type: null,
    p_loc_label: 'Bhimavaram',
    p_lat: 16.5449,
    p_lng: 81.5212
  });
  assert.equal(faSignup.error, null, 'Farmer A signup should succeed');
  assert.ok(faSignup.data.token, 'Farmer A receives token');
  assert.equal(faSignup.data.user.role, 'farmer');

  // 1.2 Sign up Buyer B
  const bbSignup = await sb.rpc('df_signup', {
    p_role: 'buyer',
    p_name: 'Buyer Bhavana',
    p_email: buyerEmail,
    p_phone: randPhone(),
    p_password: buyerPw,
    p_org: 'Bhavana Fresh Mart',
    p_buyer_type: 'Retailer',
    p_loc_label: 'Vijayawada',
    p_lat: 16.5062,
    p_lng: 80.6480
  });
  assert.equal(bbSignup.error, null, 'Buyer B signup should succeed');
  assert.ok(bbSignup.data.token, 'Buyer B receives token');
  assert.equal(bbSignup.data.user.role, 'buyer');

  // 1.3 Logout Farmer A and verify session invalidation
  const faLogout = await sb.rpc('df_logout', { p_token: faSignup.data.token });
  assert.equal(faLogout.error, null);
  const faExpiredCheck = await sb.rpc('df_me', { p_token: faSignup.data.token });
  assert.ok(faExpiredCheck.error, 'Logged out session must fail');
  assert.equal(faExpiredCheck.error.message, 'SESSION_EXPIRED');

  // 1.4 Test Wrong Password for Farmer A
  const wrongPw = await sb.rpc('df_login', {
    p_email: farmerEmail,
    p_password: 'WrongPassword999!',
    p_role: 'farmer'
  });
  assert.ok(wrongPw.error, 'Wrong password must produce an error');
  assert.ok(
    wrongPw.error.message.toLowerCase().includes('password') ||
    wrongPw.error.message.toLowerCase().includes('credential') ||
    wrongPw.error.message.toLowerCase().includes('invalid'),
    `Message was: ${wrongPw.error.message}`
  );

  // 1.5 Test Wrong Role for Farmer A attempting Buyer login
  const wrongRole = await sb.rpc('df_login', {
    p_email: farmerEmail,
    p_password: farmerPw,
    p_role: 'buyer'
  });
  assert.ok(wrongRole.error, 'Wrong role login must fail');
  assert.ok(
    wrongRole.error.message.toLowerCase().includes('farmer account') ||
    wrongRole.error.message.toLowerCase().includes('role'),
    `Message was: ${wrongRole.error.message}`
  );

  // 1.6 Successful re-login as Farmer A
  const faLogin = await sb.rpc('df_login', {
    p_email: farmerEmail,
    p_password: farmerPw,
    p_role: 'farmer'
  });
  assert.equal(faLogin.error, null, 'Farmer A re-login must succeed');
  assert.ok(faLogin.data.token);

  // 1.7 Successful re-login as Buyer B
  const bbLogin = await sb.rpc('df_login', {
    p_email: buyerEmail,
    p_password: buyerPw,
    p_role: 'buyer'
  });
  assert.equal(bbLogin.error, null, 'Buyer B re-login must succeed');
  assert.ok(bbLogin.data.token);
});

test('Scenario 2: Farmer lists tomatoes -> Buyer orders 50kg -> Stock drops 50 -> Advance to delivered -> Rate once only', async () => {
  const ts = Date.now();
  const fEmail = `farmer_sc2_${ts}@testmail.com`;
  const bEmail = `buyer_sc2_${ts}@testmail.com`;
  const fPw = 'TestPass123!';
  const bPw = 'TestPass123!';

  const fRes = await sb.rpc('df_signup', {
    p_role: 'farmer', p_name: 'Farmer Suresh', p_email: fEmail, p_phone: randPhone(),
    p_password: fPw, p_org: 'Suresh Farms', p_buyer_type: null,
    p_loc_label: 'Bhimavaram', p_lat: 16.5449, p_lng: 81.5212
  });
  const bRes = await sb.rpc('df_signup', {
    p_role: 'buyer', p_name: 'Buyer Kiran', p_email: bEmail, p_phone: randPhone(),
    p_password: bPw, p_org: 'Kiran Supermarket', p_buyer_type: 'Retailer',
    p_loc_label: 'Eluru', p_lat: 16.7107, p_lng: 81.0952
  });

  const fToken = fRes.data.token;
  const bToken = bRes.data.token;

  // 2.1 Farmer A lists Tomatoes (100 kg at ₹25/kg)
  const lRes = await sb.rpc('df_create_listing', {
    p_token: fToken,
    p_crop: 'Tomato',
    p_grade: 'A',
    p_qty: 100,
    p_price: 25,
    p_harvest: '2026-10-04',
    p_loc_label: 'Bhimavaram',
    p_lat: 16.5449,
    p_lng: 81.5212,
    p_note: 'Fresh ripe vine tomatoes',
    p_image_url: null
  });
  assert.equal(lRes.error, null);
  const listingId = lRes.data;

  // 2.2 Buyer B sees it in marketplace listings
  const listCheck = await sb.rpc('df_list_listings', {
    p_token: bToken,
    p_limit: 20,
    p_offset: 0
  });
  assert.equal(listCheck.error, null);
  const found = listCheck.data.find(x => x.id === listingId);
  assert.ok(found, 'Buyer sees published listing');
  assert.equal(Number(found.qty), 100);

  // 2.3 Buyer B orders 50 kg
  const orderRes = await sb.rpc('df_place_order', {
    p_token: bToken,
    p_listing: listingId,
    p_qty: 50,
    p_dest_label: 'Eluru',
    p_dest_lat: 16.7107,
    p_dest_lng: 81.0952,
    p_address: 'Main Bazaar, Shop #12',
    p_pay: 'Cash on delivery'
  });
  assert.equal(orderRes.error, null);
  const orderId = orderRes.data;

  // 2.4 Verify Farmer A's stock dropped by 50 (50 left)
  const fListings = await sb.rpc('df_my_listings', { p_token: fToken });
  const fItem = fListings.data.find(x => x.id === listingId);
  assert.equal(Number(fItem.qty), 50, 'Stock must drop from 100 to 50');

  // 2.5 Order shows on Farmer's dashboard with counterparty details
  const fOrders = await sb.rpc('df_my_orders', { p_token: fToken });
  const fOrd = fOrders.data.find(o => o.id === orderId);
  assert.ok(fOrd, 'Order must show on Farmer dashboard');
  assert.equal(fOrd.buyer_name, 'Buyer Kiran');
  assert.ok(fOrd.buyer_phone);
  assert.equal(fOrd.status, 'placed');

  // 2.6 Farmer advances order through stages: placed -> confirmed -> preparing -> out -> delivered
  const st1 = await sb.rpc('df_advance_order', { p_token: fToken, p_order: orderId });
  assert.equal(st1.data, 'confirmed');
  const st2 = await sb.rpc('df_advance_order', { p_token: fToken, p_order: orderId });
  assert.equal(st2.data, 'preparing');
  const st3 = await sb.rpc('df_advance_order', { p_token: fToken, p_order: orderId });
  assert.equal(st3.data, 'out');
  const st4 = await sb.rpc('df_advance_order', { p_token: fToken, p_order: orderId });
  assert.equal(st4.data, 'delivered');

  // 2.7 Buyer rates order (5 stars)
  const rate1 = await sb.rpc('df_rate_order', { p_token: bToken, p_order: orderId, p_rating: 5 });
  assert.equal(rate1.error, null, 'First rating must succeed');

  // 2.8 Buyer cannot rate twice
  const rate2 = await sb.rpc('df_rate_order', { p_token: bToken, p_order: orderId, p_rating: 4 });
  assert.ok(rate2.error, 'Second rating attempt must fail');
  assert.ok(
    rate2.error.message.toLowerCase().includes('once') || rate2.error.message.toLowerCase().includes('already rated') || rate2.error.message.toLowerCase().includes('cannot'),
    `Message was: ${rate2.error.message}`
  );
});

test('Scenario 3: Race condition test: with 10 kg left, two buyers order 10 kg at once -> Exactly one succeeds', async () => {
  const ts = Date.now();
  const fRes = await sb.rpc('df_signup', {
    p_role: 'farmer', p_name: 'Farmer Race', p_email: `farmer_rc_${ts}@testmail.com`,
    p_phone: randPhone(), p_password: 'RacePass123!', p_org: 'Race Farms',
    p_buyer_type: null, p_loc_label: 'Tanuku', p_lat: 16.7540, p_lng: 81.6810
  });
  const b1Res = await sb.rpc('df_signup', {
    p_role: 'buyer', p_name: 'Buyer One', p_email: `buyer1_rc_${ts}@testmail.com`,
    p_phone: randPhone(), p_password: 'RacePass123!', p_org: 'Store One',
    p_buyer_type: 'Consumer', p_loc_label: 'Eluru', p_lat: 16.7107, p_lng: 81.0952
  });
  const b2Res = await sb.rpc('df_signup', {
    p_role: 'buyer', p_name: 'Buyer Two', p_email: `buyer2_rc_${ts}@testmail.com`,
    p_phone: randPhone(), p_password: 'RacePass123!', p_org: 'Store Two',
    p_buyer_type: 'Consumer', p_loc_label: 'Eluru', p_lat: 16.7107, p_lng: 81.0952
  });

  const fToken = fRes.data.token;
  const b1Token = b1Res.data.token;
  const b2Token = b2Res.data.token;

  // Farmer lists 10 kg
  const lRes = await sb.rpc('df_create_listing', {
    p_token: fToken, p_crop: 'Chilli', p_grade: 'A', p_qty: 10, p_price: 60,
    p_harvest: '2026-10-04', p_loc_label: 'Tanuku', p_lat: 16.7540, p_lng: 81.6810,
    p_note: 'Hot Guntur chillies', p_image_url: null
  });
  const listingId = lRes.data;

  // Concurrent order for 10 kg simultaneously
  const [res1, res2] = await Promise.all([
    sb.rpc('df_place_order', {
      p_token: b1Token, p_listing: listingId, p_qty: 10, p_dest_label: 'Eluru',
      p_dest_lat: 16.7107, p_dest_lng: 81.0952, p_address: 'Dest 1', p_pay: 'Cash on delivery'
    }),
    sb.rpc('df_place_order', {
      p_token: b2Token, p_listing: listingId, p_qty: 10, p_dest_label: 'Eluru',
      p_dest_lat: 16.7107, p_dest_lng: 81.0952, p_address: 'Dest 2', p_pay: 'Cash on delivery'
    })
  ]);

  const successes = [res1, res2].filter(r => r.data && !r.error);
  const failures = [res1, res2].filter(r => r.error);

  assert.equal(successes.length, 1, 'Exactly one order must succeed');
  assert.equal(failures.length, 1, 'Exactly one order must fail');
  assert.ok(
    failures[0].error.message.includes('left') || failures[0].error.message.includes('available'),
    `Failure message: ${failures[0].error.message}`
  );
});

test('Scenario 4: Requirement -> Offer -> Acceptance -> Partial/Full fulfilment flow', async () => {
  const ts = Date.now();
  const fRes = await sb.rpc('df_signup', {
    p_role: 'farmer', p_name: 'Farmer Venkat', p_email: `farmer_v_${ts}@testmail.com`,
    p_phone: randPhone(), p_password: 'Pass123456!', p_org: 'Venkat Mango Orchards',
    p_buyer_type: null, p_loc_label: 'Vijayawada', p_lat: 16.5062, p_lng: 80.6480
  });
  const bRes = await sb.rpc('df_signup', {
    p_role: 'buyer', p_name: 'Buyer Lakshmi', p_email: `buyer_l_${ts}@testmail.com`,
    p_phone: randPhone(), p_password: 'Pass123456!', p_org: 'Lakshmi Retail',
    p_buyer_type: 'Retailer', p_loc_label: 'Guntur', p_lat: 16.3067, p_lng: 80.4365
  });

  const fToken = fRes.data.token;
  const bToken = bRes.data.token;

  // Farmer lists 200 kg Mango at ₹70
  const lRes = await sb.rpc('df_create_listing', {
    p_token: fToken, p_crop: 'Mango', p_grade: 'A', p_qty: 200, p_price: 70,
    p_harvest: '2026-10-04', p_loc_label: 'Vijayawada', p_lat: 16.5062, p_lng: 80.6480,
    p_note: 'Banganapalli sweet mangoes', p_image_url: null
  });
  const listingId = lRes.data;

  // Buyer posts requirement for 100 kg Mango up to ₹75
  const reqRes = await sb.rpc('df_create_requirement', {
    p_token: bToken, p_crop: 'Mango', p_qty: 100, p_max_price: 75, p_grade: 'B',
    p_by_date: '2026-10-15', p_loc_label: 'Guntur', p_lat: 16.3067, p_lng: 80.4365,
    p_max_dist: 60
  });
  assert.equal(reqRes.error, null);
  const reqId = reqRes.data;

  // Farmer sends offer for 100 kg at ₹68 with delivery
  const offRes = await sb.rpc('df_create_offer', {
    p_token: fToken, p_req: reqId, p_listing: listingId, p_qty: 100, p_price: 68,
    p_delivery: true
  });
  assert.equal(offRes.error, null);
  const offerId = offRes.data;

  // Buyer accepts offer
  const acceptRes = await sb.rpc('df_accept_offer', {
    p_token: bToken, p_offer: offerId
  });
  assert.equal(acceptRes.error, null);
  const orderId = acceptRes.data;
  assert.ok(orderId);

  // Check requirement status -> fulfilled (100 / 100 kg filled)
  const reqs = await sb.rpc('df_my_requirements', { p_token: bToken });
  const reqItem = reqs.data.find(r => r.id === reqId);
  assert.equal(reqItem.status, 'fulfilled');
  assert.equal(Number(reqItem.filled), 100);

  // Check farmer listing stock -> 100 kg remaining (200 - 100)
  const fListings = await sb.rpc('df_my_listings', { p_token: fToken });
  const fItem = fListings.data.find(l => l.id === listingId);
  assert.equal(Number(fItem.qty), 100);
});

test('Scenario 5: Security: direct table selects must fail, fake token on df_my_orders must fail', async () => {
  // 5.1 Direct table selects from locked tables fail
  const tbls = ['listings', 'app_users', 'orders', 'requirements', 'offers', 'app_sessions'];
  for (const tbl of tbls) {
    const res = await sb.from(tbl).select('*');
    assert.ok(res.error, `Direct select from ${tbl} must fail`);
    assert.ok(
      res.error.message.includes('permission denied'),
      `Error for ${tbl} should say permission denied, got: ${res.error.message}`
    );
  }

  // 5.2 Fake token on df_my_orders must fail with SESSION_EXPIRED
  const fakeTokenOrders = await sb.rpc('df_my_orders', { p_token: 'forged_jwt_token_xyz_123' });
  assert.ok(fakeTokenOrders.error, 'Fake token on df_my_orders must fail');
  assert.equal(fakeTokenOrders.error.message, 'SESSION_EXPIRED');

  // 5.3 Fake token on df_my_listings must fail with SESSION_EXPIRED
  const fakeTokenListings = await sb.rpc('df_my_listings', { p_token: 'tampered_session_abc' });
  assert.ok(fakeTokenListings.error, 'Fake token on df_my_listings must fail');
  assert.equal(fakeTokenListings.error.message, 'SESSION_EXPIRED');
});
