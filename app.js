import { rankMeters } from './rank.js';

const $ = (id) => document.getElementById(id);
let meters = [];
let map, markers = [], destMarker, lastLoc = null;

const params = new URLSearchParams(location.search);

// prefill from URL (?dest= / ?lat=&lon= / ?arrive= / ?dur= / ?walk=) — powers the share shortcut
if (params.get('dest')) $('dest').value = params.get('dest');
if (params.get('dur')) $('dur').value = params.get('dur');
if (params.get('walk')) { $('walk').value = params.get('walk'); $('walkval').textContent = params.get('walk'); }
if (params.get('arrive')) {
  $('arrive').value = params.get('arrive');
} else {
  const d = new Date();
  const mins = Math.round(d.getMinutes() / 5) * 5;
  $('arrive').value = `${String(d.getHours()).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

$('walk').addEventListener('input', (e) => $('walkval').textContent = e.target.value);

map = L.map('map').setView([49.2606, -123.114], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© OpenStreetMap',
}).addTo(map);

fetch('data/meters.json')
  .then((r) => r.json())
  .then((d) => {
    meters = d;
    // auto-run if the share shortcut handed us a destination
    if (params.get('lat') && params.get('lon')) {
      run({ lat: +params.get('lat'), lon: +params.get('lon'), name: params.get('dest') || 'Dropped pin' });
    } else if (params.get('dest')) {
      run();
    }
  })
  .catch(() => setStatus('Failed to load meter data. Run ./refresh.sh'));

function setStatus(msg) { $('results').innerHTML = `<div class="status">${msg}</div>`; }

async function geocodeOne(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=${encodeURIComponent(q + ', Vancouver, BC')}`;
  const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const j = await r.json();
  return j.length ? { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon), name: j[0].display_name } : null;
}

async function geocode(q) {
  let loc = await geocodeOne(q);
  if (!loc && /\s(&|and|at|@|\/|x)\s|\s?&\s?/i.test(q)) {
    const first = q.split(/\s*(?:&|@|\/|\bat\b|\band\b|\bx\b)\s*/i)[0].trim();
    if (first) loc = await geocodeOne(first);
  }
  return loc;
}

function arriveMins() {
  const [h, m] = $('arrive').value.split(':').map(Number);
  return h * 60 + m;
}

function pinColor(r) {
  if (r.overLimit) return '#ff5b5b';
  if (r.free) return '#2ecc71';
  if (r.cost <= 3) return '#4aa3ff';
  return '#ff9f43';
}

function navUrl(r) {
  return `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}&travelmode=driving`;
}

function clearMap() {
  markers.forEach((m) => map.removeLayer(m));
  markers = [];
}

async function run(preLoc) {
  const q = $('dest').value.trim();
  if (!q && !preLoc) return;
  $('go').disabled = true;
  let loc = preLoc;
  if (!loc) {
    setStatus('Locating destination…');
    try { loc = await geocode(q); } catch { loc = null; }
  }
  if (!loc) { setStatus('Could not find that address. Try adding a cross-street.'); $('go').disabled = false; return; }
  lastLoc = loc;

  const arrival = arriveMins();
  const duration = Math.round(parseFloat($('dur').value) * 60);
  const maxWalkMin = parseInt($('walk').value);
  const sort = document.querySelector('.seg.active')?.dataset.sort || 'balanced';

  const ranked = rankMeters(meters, { lat: loc.lat, lon: loc.lon, arrival, duration, maxWalkMin, sort });

  clearMap();
  if (destMarker) map.removeLayer(destMarker);
  destMarker = L.marker([loc.lat, loc.lon], {
    icon: L.divIcon({ className: '', html: '<div style="font-size:26px">📍</div>', iconSize: [26, 26], iconAnchor: [13, 26] }),
  }).addTo(map).bindPopup(loc.name || 'Destination');
  map.setView([loc.lat, loc.lon], 16);

  const top = ranked.slice(0, 60);
  top.forEach((r) => {
    const mk = L.circleMarker([r.lat, r.lon], {
      radius: 7, color: '#0b0d10', weight: 1, fillColor: pinColor(r), fillOpacity: .95,
    }).addTo(map);
    const price = r.free ? 'FREE' : '$' + r.cost.toFixed(2);
    mk.bindPopup(
      `<b>${price}</b> · ${r.walkMin} min walk ${r.dir}<br>` +
      `${r.blockCount} meters on this block<br>` +
      (r.freeAfter ? '🆓 free portion after 10 PM<br>' : '') +
      (r.overLimit ? `⚠️ over the ${r.limit / 60}h limit<br>` : '') +
      `<a href="${navUrl(r)}" target="_blank">Navigate in Google Maps →</a>`
    );
    markers.push(mk);
    r._marker = mk;
  });

  renderList(top);
  $('go').disabled = false;
}

function renderList(top) {
  if (!top.length) {
    setStatus('No meters within that walk time. Try increasing max walk minutes.');
    return;
  }
  const html = top.slice(0, 25).map((r, i) => {
    const price = r.free ? 'FREE' : '$' + r.cost.toFixed(2);
    const cls = r.free ? 'free' : '';
    const tags = [];
    if (r.free) tags.push('<span class="tag free">free your whole stay</span>');
    else if (r.freeAfter) tags.push('<span class="tag free">free after 10 PM</span>');
    if (r.blockCount >= 6) tags.push(`<span class="tag good">${r.blockCount} spots on block</span>`);
    if (r.flat != null) tags.push(`<span class="tag flat">$${r.flat.toFixed(2)} flat option</span>`);
    if (r.overLimit) tags.push(`<span class="tag warn">over ${r.limit / 60}h limit</span>`);
    return `<div class="card" data-i="${i}">
      <div class="top">
        <span><span class="rank">#${i + 1}</span><span class="price ${cls}">${price}</span></span>
        <span class="walk">${r.walkMin} min ${r.dir} · ${r.distM} m</span>
      </div>
      <div class="meta">${r.hourlyNow ? '$' + r.hourlyNow.toFixed(2) + '/hr on arrival' : 'free on arrival'}${r.limit && r.limit !== Infinity ? ' · ' + (r.limit / 60) + 'h limit' : ''}</div>
      <div>${tags.join(' ')}</div>
      <a class="nav" href="${navUrl(r)}" target="_blank">Navigate →</a>
    </div>`;
  }).join('');
  $('results').innerHTML = html;
  document.querySelectorAll('.card').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('nav')) return;
      const r = top[parseInt(el.dataset.i)];
      map.setView([r.lat, r.lon], 18);
      r._marker.openPopup();
    });
  });
}

// sort toggle
document.querySelectorAll('.seg').forEach((el) => el.addEventListener('click', () => {
  document.querySelectorAll('.seg').forEach((s) => s.classList.remove('active'));
  el.classList.add('active');
  if (lastLoc) run(lastLoc);
}));

// use my location
$('here').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  $('here').textContent = '…';
  navigator.geolocation.getCurrentPosition(
    (pos) => { $('here').innerHTML = '<i></i>📍'; $('dest').value = 'My location';
      run({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'My location' }); },
    () => { $('here').textContent = '📍'; alert('Could not get your location.'); }
  );
});

$('go').addEventListener('click', () => run());
$('dest').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
