// lib/routing.js - Multi-stop delivery routing with nearest-neighbour + 2-opt optimization
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    var pricing = require('./pricing');
    module.exports = factory(pricing);
  } else {
    root.DFRouting = factory(root.DFPricing);
  }
})(typeof self !== 'undefined' ? self : this, function (pricing) {
  'use strict';

  var km = pricing.km;

  /**
   * Calculates naive sequential distance through stops in arrival order.
   */
  function naiveDist(origin, stops) {
    if (!origin || !stops || !stops.length) return 0;
    var cur = origin;
    var t = 0;
    stops.forEach(function (s) {
      var loc = s.loc || { lat: s.lat, lng: s.lng };
      t += km(cur, loc);
      cur = loc;
    });
    return t;
  }

  /**
   * Measures total distance for an ordered tour starting from origin.
   */
  function tourDistance(origin, tour) {
    var cur = origin;
    var total = 0;
    for (var i = 0; i < tour.length; i++) {
      var loc = tour[i].loc || { lat: tour[i].lat, lng: tour[i].lng };
      total += km(cur, loc);
      cur = loc;
    }
    return total;
  }

  /**
   * 2-Opt local search improvement for tour ordering.
   */
  function twoOpt(origin, initialTour) {
    if (initialTour.length < 3) return initialTour;
    var bestTour = initialTour.slice();
    var bestDist = tourDistance(origin, bestTour);
    var improved = true;
    var maxIterations = 50;
    var iter = 0;

    while (improved && iter < maxIterations) {
      improved = false;
      iter++;
      for (var i = 0; i < bestTour.length - 1; i++) {
        for (var k = i + 1; k < bestTour.length; k++) {
          // Reverse segment between i and k
          var newTour = bestTour.slice(0, i)
            .concat(bestTour.slice(i, k + 1).reverse())
            .concat(bestTour.slice(k + 1));
          var newDist = tourDistance(origin, newTour);
          if (newDist < bestDist - 0.01) {
            bestTour = newTour;
            bestDist = newDist;
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
    }
    return bestTour;
  }

  /**
   * Plans route: Nearest-neighbour initialization + 2-opt refinement.
   */
  function planRoute(origin, stops) {
    if (!origin || !stops || !stops.length) {
      return { route: [], total: 0 };
    }

    var rem = stops.slice();
    var nnTour = [];
    var cur = origin;

    // 1. Nearest Neighbour Pass
    while (rem.length > 0) {
      var bestIdx = 0;
      var bestDist = Infinity;
      for (var i = 0; i < rem.length; i++) {
        var loc = rem[i].loc || { lat: rem[i].lat, lng: rem[i].lng };
        var d = km(cur, loc);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      var picked = rem.splice(bestIdx, 1)[0];
      nnTour.push(picked);
      cur = picked.loc || { lat: picked.lat, lng: picked.lng };
    }

    // 2. 2-Opt Optimization Pass
    var optimized = twoOpt(origin, nnTour);

    // 3. Annotate legs and cumulative totals
    var finalRoute = [];
    var total = 0;
    cur = origin;

    for (var j = 0; j < optimized.length; j++) {
      var item = optimized[j];
      var itemLoc = item.loc || { lat: item.lat, lng: item.lng };
      var legDist = km(cur, itemLoc);
      total += legDist;
      finalRoute.push(Object.assign({}, item, { leg: legDist }));
      cur = itemLoc;
    }

    return {
      route: finalRoute,
      total: total
    };
  }

  return {
    naiveDist: naiveDist,
    planRoute: planRoute,
    twoOpt: twoOpt
  };
});
