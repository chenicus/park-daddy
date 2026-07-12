// Turn-by-turn navigation via the free Valhalla server (valhalla1.openstreetmap.de).
// fetchRoute() returns geometry + maneuvers; createNav() draws the route line
// and turns GPS fixes into progress: current step, ETA, off-route, arrival.
// (Was OSRM; the public OSRM demo servers proved too flaky — Valhalla also
// ships ready-made English instructions.)
import { distMeters } from './rank.js?v=11';

const VALHALLA = 'https://valhalla1.openstreetmap.de/route';

// Valhalla maneuver type → banner arrow
const ARROWS = {
  4: '⚑', 5: '⚑', 6: '⚑',                       // destination
  9: '↗', 10: '↱', 11: '↱', 12: '⤸', 13: '⤸',   // rights / u-turns
  14: '↰', 15: '↰', 16: '↖',                     // lefts
  18: '↗', 20: '↗', 23: '↗', 37: '↗',            // ramps/exits right
  19: '↖', 21: '↖', 24: '↖', 38: '↖',            // ramps/exits left
  26: '⟳', 27: '⟳',                              // roundabout
};

// polyline6 decoder (Valhalla shape encoding)
function decodeShape(str) {
  let i = 0, lat = 0, lon = 0;
  const out = [];
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (which === 0) lat += d; else lon += d;
    }
    out.push([lat / 1e6, lon / 1e6]);
  }
  return out;
}

export async function fetchRoute(from, to) {
  const q = JSON.stringify({
    locations: [{ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon }],
    costing: 'auto', units: 'kilometers',
  });
  const j = await fetch(`${VALHALLA}?json=${encodeURIComponent(q)}`).then((r) => r.json());
  const leg = j.trip?.legs?.[0];
  if (!leg) throw new Error(j.error || 'no route');
  const coords = decodeShape(leg.shape);
  const cum = [0];
  for (let i = 1; i < coords.length; i++)
    cum.push(cum[i - 1] + distMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]));
  const steps = leg.maneuvers.map((m) => ({
    text: m.instruction.replace(/\.$/, ''),
    arrow: ARROWS[m.type] || '↑',
    along: cum[Math.min(m.begin_shape_index, cum.length - 1)],
  }));
  return { coords, cum, steps, distance: j.trip.summary.length * 1000, duration: j.trip.summary.time };
}

export function createNav({ map }) {
  let route = null, offCount = 0;
  // The 'route' GL source (with casing + line layers) is installed once by app.js and re-added on
  // theme swap; we only push geometry into it. coords are [lat,lon] → GeoJSON needs [lon,lat].
  const setRoute = (fc) => { const s = map.getSource('route'); if (s) s.setData(fc); };

  function begin(r) {
    route = r;
    offCount = 0;
    setRoute({ type: 'FeatureCollection', features: [{
      type: 'Feature', geometry: { type: 'LineString', coordinates: r.coords.map(([la, lo]) => [lo, la]) },
    }] });
  }
  function clear() {
    route = null;
    offCount = 0;
    setRoute({ type: 'FeatureCollection', features: [] });
  }

  // project the fix onto the route: meters off it, meters along it, and the snapped point
  // (the foot of the perpendicular — the spot on the road nearest the raw GPS fix).
  function locate(lat, lon) {
    const { coords, cum } = route;
    const M = 111320, cosLat = Math.cos(lat * Math.PI / 180);
    let best = { off: Infinity, along: 0, lat, lon };
    for (let i = 1; i < coords.length; i++) {
      const ax = (coords[i - 1][1] - lon) * cosLat * M, ay = (coords[i - 1][0] - lat) * M;
      const bx = (coords[i][1] - lon) * cosLat * M, by = (coords[i][0] - lat) * M;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const off = Math.hypot(ax + dx * t, ay + dy * t);
      if (off < best.off) best = {
        off, along: cum[i - 1] + Math.sqrt(len2) * t,
        lat: coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
        lon: coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
      };
    }
    return best;
  }

  // The on-route point to DRAW the car at — the nearest spot on the route, but only when the
  // raw fix is close enough (<=25 m) to clearly be on it. Beyond that we're genuinely off the
  // route (a wrong turn, a parallel street), so return null and let the raw GPS show instead of
  // lying about which road you're on. This is the "snap to road" that keeps the puck off buildings.
  function snap(pos) {
    if (!route) return null;
    const loc = locate(pos.lat, pos.lon);
    return loc.off <= 25 ? { lat: loc.lat, lon: loc.lon } : null;
  }

  function update(pos) {
    if (!route) return null;
    const { off, along } = locate(pos.lat, pos.lon);
    offCount = off > 50 ? offCount + 1 : 0;
    // next maneuver ahead of the car (depart at along=0 never qualifies)
    let step = route.steps[route.steps.length - 1];
    for (const s of route.steps) if (s.along > along + 15) { step = s; break; }
    const remainM = Math.max(0, route.distance - along);
    return {
      step,
      stepDist: Math.max(0, Math.round(step.along - along)),
      remainM,
      remainS: route.duration * (route.distance ? remainM / route.distance : 0),
      offRoute: offCount >= 3,
      arrived: remainM < 25,
    };
  }

  return { begin, clear, update, snap, isActive: () => !!route };
}

export const fmtDist = (m) => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.max(10, Math.round(m / 10) * 10) + ' m';
