// lib/pricing.js - Pure pricing & distance calculations
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.DFPricing = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CROPS = {
    Tomato: { cat: 'Vegetable', ref: 26, t: ['#f8dccb', '#efb59b'], d: [78, 70, 60, 55, 50, 45, 58, 65, 72, 80, 88, 85] },
    Chilli: { cat: 'Spice', ref: 90, t: ['#f6d3c4', '#e6a38a'], d: [60, 65, 72, 80, 78, 70, 62, 58, 60, 68, 75, 70] },
    Onion: { cat: 'Vegetable', ref: 24, t: ['#efd6e0', '#dcaabf'], d: [70, 66, 60, 55, 52, 58, 66, 74, 82, 86, 80, 74] },
    Rice: { cat: 'Grain', ref: 34, t: ['#f3e6bd', '#e3cb86'], d: [74, 72, 70, 68, 66, 64, 66, 70, 76, 84, 88, 80] },
    Banana: { cat: 'Fruit', ref: 30, t: ['#f6ecb8', '#e8d170'], d: [60, 62, 66, 70, 75, 72, 68, 64, 66, 78, 84, 70] },
    Mango: { cat: 'Fruit', ref: 60, t: ['#f8e1ae', '#eeb862'], d: [30, 35, 60, 88, 95, 80, 50, 30, 25, 25, 28, 30] },
    Okra: { cat: 'Vegetable', ref: 40, t: ['#dfe8c4', '#b4cb86'], d: [50, 52, 60, 70, 78, 80, 76, 70, 64, 58, 52, 50] },
    Brinjal: { cat: 'Vegetable', ref: 30, t: ['#e3d3e6', '#bd9bc7'], d: [64, 62, 60, 58, 56, 55, 60, 66, 72, 76, 78, 72] },
    Coconut: { cat: 'Fruit', ref: 35, t: ['#ecdcc3', '#cfb28a'], d: [68, 70, 72, 74, 76, 74, 70, 72, 78, 86, 84, 76] },
    Turmeric: { cat: 'Spice', ref: 120, t: ['#f8e0b0', '#ecb55a'], d: [64, 68, 76, 80, 70, 60, 56, 58, 64, 72, 82, 86] }
  };

  /**
   * Road distance approximation via haversine formula with a 1.25x road factor.
   * Matches Postgres public.haversine_km exactly.
   */
  function km(a, b) {
    if (!a || !b || typeof a.lat !== 'number' || typeof b.lat !== 'number') return 0;
    var toRad = function (x) { return x * Math.PI / 180; };
    var dLat = toRad(b.lat - a.lat);
    var dLng = toRad(b.lng - a.lng);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.25;
  }

  /**
   * Delivery fee: greatest(40, round((30 + haversine_km * 2.5)/10)*10).
   * Matches Postgres public.delivery_fee exactly.
   */
  function deliveryFee(a, b) {
    var dist = km(a, b);
    return Math.max(40, Math.round((30 + dist * 2.5) / 10) * 10);
  }

  /**
   * Market reference calculation with live listings fallback.
   */
  function marketRef(crop, listings, excludeId) {
    var validListings = (listings || []).filter(function (l) {
      return l.crop === crop && l.status === 'active' && l.qty > 0 && l.id !== excludeId;
    });
    if (validListings.length >= 2) {
      var sum = validListings.reduce(function (acc, l) { return acc + Number(l.price); }, 0);
      return {
        ref: sum / validListings.length,
        src: 'average of ' + validListings.length + ' live listings',
        live: true
      };
    }
    var cropData = CROPS[crop] || CROPS.Tomato;
    return {
      ref: cropData.ref,
      src: 'reference market estimate',
      live: false
    };
  }

  /**
   * Price badge evaluator.
   */
  function priceBadge(price, ref) {
    var p = Number(price);
    var r = Number(ref);
    if (!r || r <= 0) return { c: 'b-neutral', t: 'Market price', d: 0 };
    var d = (p - r) / r;
    if (d <= -0.05) return { c: 'b-good', t: 'Great deal', d: d };
    if (d <= 0.05) return { c: 'b-good', t: 'Fair price', d: d };
    if (d <= 0.15) return { c: 'b-warn', t: 'Slightly high', d: d };
    return { c: 'b-bad', t: 'Above market', d: d };
  }

  return {
    CROPS: CROPS,
    km: km,
    deliveryFee: deliveryFee,
    marketRef: marketRef,
    priceBadge: priceBadge
  };
});
