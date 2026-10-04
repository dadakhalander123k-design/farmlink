// tests/rpc.test.js - Verification of custom RPC-based security and atomic workflows
const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://ykymwiyleohoxluderod.supabase.co',
  'sb_publishable_1fdznVkRU4PkwcmZ3bwxEg_bOBcN5y4'
);

test('Security check: direct table selects must fail with permission denied', async () => {
  const lRes = await sb.from('listings').select('*');
  assert.ok(lRes.error, 'Direct select from listings must error');
  assert.ok(lRes.error.message.includes('permission denied'), 'Error should be permission denied');

  const uRes = await sb.from('app_users').select('*');
  assert.ok(uRes.error, 'Direct select from app_users must error');
  assert.ok(uRes.error.message.includes('permission denied'), 'Error should be permission denied');

  const oRes = await sb.from('orders').select('*');
  assert.ok(oRes.error, 'Direct select from orders must error');
  assert.ok(oRes.error.message.includes('permission denied'), 'Error should be permission denied');
});

test('Session check: invalid or fake token triggers SESSION_EXPIRED', async () => {
  const res = await sb.rpc('df_me', { p_token: 'fake-token-' + Date.now() });
  assert.ok(res.error);
  assert.equal(res.error.message, 'SESSION_EXPIRED');
});

test('Custom auth flow: farmer signup, login, and me() session verification', async () => {
  const email = 'farmer_qa_' + Date.now() + '@example.com';
  const password = 'TestPassword123!';

  // Sign up
  const su = await sb.rpc('df_signup', {
    p_role: 'farmer',
    p_name: 'QA Farmer',
    p_email: email,
    p_phone: '9988776655',
    p_password: password,
    p_org: 'QA Green Farms',
    p_buyer_type: null,
    p_loc_label: 'Bhimavaram',
    p_lat: 16.5449,
    p_lng: 81.5212
  });
  assert.equal(su.error, null);
  assert.ok(su.data.token);
  assert.equal(su.data.user.email, email);
  assert.equal(su.data.user.role, 'farmer');

  // Verify df_me with token
  const meRes = await sb.rpc('df_me', { p_token: su.data.token });
  assert.equal(meRes.error, null);
  assert.equal(meRes.data.email, email);

  // Login with correct credentials
  const loginRes = await sb.rpc('df_login', {
    p_email: email,
    p_password: password,
    p_role: 'farmer'
  });
  assert.equal(loginRes.error, null);
  assert.ok(loginRes.data.token);

  // Login with wrong password
  const wrongPw = await sb.rpc('df_login', {
    p_email: email,
    p_password: 'wrong_password',
    p_role: 'farmer'
  });
  assert.ok(wrongPw.error);
  assert.equal(wrongPw.error.message, 'Wrong email or password');

  // Login with wrong role
  const wrongRole = await sb.rpc('df_login', {
    p_email: email,
    p_password: password,
    p_role: 'buyer'
  });
  assert.ok(wrongRole.error);
  assert.equal(wrongRole.error.message, 'This email belongs to a farmer account. Use the farmer login.');

  // Logout invalidates session
  await sb.rpc('df_logout', { p_token: loginRes.data.token });
  const meAfter = await sb.rpc('df_me', { p_token: loginRes.data.token });
  assert.ok(meAfter.error);
  assert.equal(meAfter.error.message, 'SESSION_EXPIRED');
});

test('Atomic stock handling and race-condition prevention', async () => {
  // Farmer creates listing with 10 kg
  const fSu = await sb.rpc('df_signup', {
    p_role: 'farmer',
    p_name: 'Race Farmer',
    p_email: 'race_f_' + Date.now() + '@example.com',
    p_phone: '9988776651',
    p_password: 'Password123!',
    p_org: 'Race Farm',
    p_buyer_type: null,
    p_loc_label: 'Bhimavaram',
    p_lat: 16.5449,
    p_lng: 81.5212
  });
  const fToken = fSu.data.token;

  const lRes = await sb.rpc('df_create_listing', {
    p_token: fToken,
    p_crop: 'Tomato',
    p_grade: 'A',
    p_qty: 10,
    p_price: 30,
    p_harvest: '2026-10-04',
    p_loc_label: 'Bhimavaram',
    p_lat: 16.5449,
    p_lng: 81.5212,
    p_note: 'Last 10 kg',
    p_image_url: null
  });
  const listId = lRes.data;

  // Buyer 1 and Buyer 2 sign up
  const b1Su = await sb.rpc('df_signup', {
    p_role: 'buyer',
    p_name: 'Buyer 1',
    p_email: 'b1_' + Date.now() + '@example.com',
    p_phone: '9988776652',
    p_password: 'Password123!',
    p_org: 'Buyer 1 Bistro',
    p_buyer_type: 'Restaurant or hotel',
    p_loc_label: 'Vijayawada',
    p_lat: 16.5062,
    p_lng: 80.6480
  });
  const b1Token = b1Su.data.token;

  const b2Su = await sb.rpc('df_signup', {
    p_role: 'buyer',
    p_name: 'Buyer 2',
    p_email: 'b2_' + Date.now() + '@example.com',
    p_phone: '9988776653',
    p_password: 'Password123!',
    p_org: 'Buyer 2 Cafe',
    p_buyer_type: 'Restaurant or hotel',
    p_loc_label: 'Vijayawada',
    p_lat: 16.5062,
    p_lng: 80.6480
  });
  const b2Token = b2Su.data.token;

  // Both attempt to buy all 10 kg simultaneously
  const [res1, res2] = await Promise.all([
    sb.rpc('df_place_order', {
      p_token: b1Token,
      p_listing: listId,
      p_qty: 10,
      p_dest_label: 'Vijayawada',
      p_dest_lat: 16.5062,
      p_dest_lng: 80.6480,
      p_address: 'Main Road',
      p_pay: 'Cash on delivery'
    }),
    sb.rpc('df_place_order', {
      p_token: b2Token,
      p_listing: listId,
      p_qty: 10,
      p_dest_label: 'Vijayawada',
      p_dest_lat: 16.5062,
      p_dest_lng: 80.6480,
      p_address: 'Cross Street',
      p_pay: 'Cash on delivery'
    })
  ]);

  const successes = [res1, res2].filter(r => !r.error);
  const failures = [res1, res2].filter(r => r.error);

  assert.equal(successes.length, 1, 'Exactly one order must succeed');
  assert.equal(failures.length, 1, 'Exactly one order must fail');
  assert.ok(
    failures[0].error.message.includes('left') ||
    failures[0].error.message.includes('available') ||
    failures[0].error.message.includes('sold'),
    'Failed order must state that stock is exhausted'
  );
});
