// lib/matching.js - Pure smart matching and combination logic
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    var pricing = require('./pricing');
    module.exports = factory(pricing);
  } else {
    root.DFMatching = factory(root.DFPricing);
  }
})(typeof self !== 'undefined' ? self : this, function (pricing) {
  'use strict';

  var km = pricing.km;
  var GR = { A: 3, B: 2, C: 1 };

  /**
   * Evaluates match score for a buyer requirement and a farmer listing.
   * Score 0..1 = 30% price + 25% quantity + 20% distance + 15% quality + 10% reliability
   */
  function matchScore(req, listing, farmerProfile, sellerStats) {
    if (!req || !listing) return null;
    if (listing.crop !== req.crop) return null;
    if (listing.status !== 'active') return null;
    if (!(Number(listing.qty) > 0)) return null;

    var reqLoc = req.loc || { lat: req.lat, lng: req.lng };
    var listLoc = listing.loc || { lat: listing.lat, lng: listing.lng };
    var dist = km(reqLoc, listLoc);

    var maxDist = Number(req.maxDist || req.max_dist || 50);
    if (dist > maxDist) return null;

    var reqGradeVal = GR[req.grade] || 2;
    var listGradeVal = GR[listing.grade] || 2;
    if (listGradeVal < reqGradeVal - 1) return null;

    var maxPrice = Number(req.maxPrice || req.max_price || 0);
    var listPrice = Number(listing.price || 0);
    if (maxPrice <= 0 || listPrice <= 0) return null;
    if (listPrice > maxPrice * 1.2) return null;

    var priceScore = listPrice <= maxPrice
      ? Math.min(1, 0.85 + 0.15 * (1 - listPrice / maxPrice) * 4)
      : Math.max(0, 1 - (listPrice - maxPrice) / (maxPrice * 0.2));

    var reqQty = Number(req.qty) || 1;
    var listQty = Number(listing.qty) || 0;
    var qtyScore = Math.min(listQty / reqQty, 1);

    var distScore = Math.max(0, 1 - dist / maxDist);
    var qualScore = listGradeVal >= reqGradeVal ? 1 : 0.6;

    var stats = sellerStats || {};
    var relScore = 0.6;
    if (stats.rating && Number(stats.rating) > 0) {
      relScore = (Number(stats.rating) / 5) * 0.7 + Math.min(Number(stats.done) || 0, 10) / 10 * 0.3;
    }

    var total = 0.30 * Math.min(priceScore, 1) +
                0.25 * qtyScore +
                0.20 * distScore +
                0.15 * qualScore +
                0.10 * relScore;

    return {
      l: listing,
      f: farmerProfile,
      dist: dist,
      total: total,
      pct: Math.round(total * 100),
      sub: {
        Price: priceScore,
        Quantity: qtyScore,
        Distance: distScore,
        Quality: qualScore,
        Reliability: relScore
      }
    };
  }

  /**
   * Greedy best combination algorithm to fulfill requirement from multiple matches.
   */
  function bestCombo(req, matches) {
    var need = (Number(req.qty) || 0) - (Number(req.filled) || 0);
    var pick = [];
    var cost = 0;
    var got = 0;

    var sorted = (matches || []).slice().sort(function (a, b) {
      return a.l.price - b.l.price || b.total - a.total;
    });

    sorted.forEach(function (m) {
      if (need <= 0) return;
      var avail = Number(m.l.qty) || 0;
      var q = Math.min(avail, need);
      if (q > 0) {
        pick.push({ m: m, q: q });
        cost += q * Number(m.l.price);
        got += q;
        need -= q;
      }
    });

    return {
      pick: pick,
      got: got,
      avg: got > 0 ? cost / got : 0,
      short: Math.max(0, need)
    };
  }

  /**
   * Smart Matching System: Score a listing for buyer recommendations (MVP Spec 37-43)
   * Produce match: 35%
   * Price suitability: 30% (compared against official market average)
   * Distance: 20%
   * Available quantity: 10%
   * Seller rating: 5%
   */
  function smartBuyerScore(listing, queryCrop, buyerLoc, officialRefPrice) {
    if (!listing || listing.status !== 'active' || Number(listing.qty) <= 0) return null;

    // 1. Produce match (35%)
    var produceScore = 0;
    var lCrop = (listing.crop || '').toLowerCase();
    var qCrop = (queryCrop || '').toLowerCase();
    if (!qCrop || qCrop === 'all' || lCrop === qCrop) {
      produceScore = 1.0;
    } else if (lCrop.includes(qCrop) || qCrop.includes(lCrop)) {
      produceScore = 0.8;
    } else {
      return null;
    }

    // 2. Price suitability (30%) compared to official market average
    var ref = Number(officialRefPrice);
    if (!ref || ref <= 0) {
      var off = pricing.getOfficialPrice ? pricing.getOfficialPrice(listing.crop) : null;
      ref = off && off.averageMandiReferencePriceKg ? Number(off.averageMandiReferencePriceKg) : (pricing.CROPS[listing.crop] ? pricing.CROPS[listing.crop].ref : 30);
    }
    var listPrice = Number(listing.price || 0);
    var priceScore = 0.5;
    if (ref > 0 && listPrice > 0) {
      if (listPrice <= ref) {
        priceScore = Math.min(1.0, 0.75 + 0.25 * ((ref - listPrice) / ref) * 2);
      } else {
        var overRatio = (listPrice - ref) / ref;
        priceScore = Math.max(0.1, 0.75 - overRatio * 1.5);
      }
    }

    // 3. Distance (20%)
    var listLoc = listing.loc || { lat: listing.lat, lng: listing.lng };
    var dist = km(buyerLoc, listLoc);
    var maxDist = 150;
    var distScore = Math.max(0.1, 1 - (dist / maxDist));

    // 4. Available quantity (10%)
    var qty = Number(listing.qty) || 0;
    var qtyScore = Math.min(1.0, Math.max(0.2, qty / 500));

    // 5. Seller rating (5%)
    var rating = Number(listing.ratingAvg || (listing.farmer && listing.farmer.rating) || 4.5);
    var ratingScore = Math.min(1.0, rating / 5);

    var total = 0.35 * produceScore +
                0.30 * priceScore +
                0.20 * distScore +
                0.10 * qtyScore +
                0.05 * ratingScore;

    return {
      listing: listing,
      dist: dist,
      total: total,
      pct: Math.round(total * 100),
      breakdown: {
        produceMatch: Math.round(produceScore * 100),
        priceSuitability: Math.round(priceScore * 100),
        distance: Math.round(distScore * 100),
        quantity: Math.round(qtyScore * 100),
        sellerRating: Math.round(ratingScore * 100)
      }
    };
  }

  function recommendListingsForBuyer(listings, queryCrop, buyerLoc, officialRefPrice) {
    var scored = (listings || [])
      .map(function (l) { return smartBuyerScore(l, queryCrop, buyerLoc, officialRefPrice); })
      .filter(function (s) { return s !== null; });

    return scored.sort(function (a, b) { return b.total - a.total; });
  }

  return {
    GR: GR,
    matchScore: matchScore,
    bestCombo: bestCombo,
    smartBuyerScore: smartBuyerScore,
    recommendListingsForBuyer: recommendListingsForBuyer
  };
});
