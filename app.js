import { rankMeters } from './rank.js';

const $ = (id) => document.getElementById(id);
let meters = [];
let map, tileLayer, markers = [], destMarker, lastLoc = null, selMarker = null;

const params = new URLSearchParams(location.search);

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

const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};
const attribution = '© OpenStreetMap © CARTO';

map = L.map('map', { zoomControl: false }).setView([49.2606, -123.114], 13);
function setTiles() {
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(darkMedia.matches ? TILES.dark : TILES.light, {
    maxZoom: 20, attribution,
  }).addTo(map);
}
setTiles();
darkMedia.addEventListener('change', setTiles);

fetch('data/meters.json')
  .then((r) => r.json())
  .then((d) => {
    meters = d;
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
function tier(r) {
  if (r.free) return 'free';
  if (r.cost <= 2) return 'cheap';
  if (r.cost <= 5) return 'mid';
  return 'high';
}
const navUrl = (r) => `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}&travelmode=driving`;
const NAV_SVG = '<svg viewBox="0 0 24 24"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>';

function clearMap() { markers.forEach((m) => map.removeLayer(m)); markers = []; selMarker = null; }

function pinLabel(r) { return r.free ? 'Free' : '$' + r.cost.toFixed(2); }

async function run(preLoc) {
  const q = $('dest').value.trim();
  if (!q && !preLoc) return;
  let loc = preLoc;
  if (!loc) {
    setStatus('Locating…');
    try { loc = await geocode(q); } catch { loc = null; }
  }
  if (!loc) { setStatus('Could not find that place. Try an address or nearby landmark.'); return; }
  lastLoc = loc;

  const arrival = arriveMins();
  const duration = Math.round(parseFloat($('dur').value) * 60);
  const maxWalkMin = parseInt($('walk').value);
  const sort = document.querySelector('.seg button.active')?.dataset.sort || 'balanced';

  const ranked = rankMeters(meters, { lat: loc.lat, lon: loc.lon, arrival, duration, maxWalkMin, sort });

  clearMap();
  if (destMarker) map.removeLayer(destMarker);
  destMarker = L.marker([loc.lat, loc.lon], {
    icon: L.divIcon({ className: '', html: '<div class="destpin"></div>', iconSize: [0, 0] }),
  }).addTo(map);
  map.setView([loc.lat, loc.lon], 16);

  const top = ranked.slice(0, 40);
  top.forEach((r, i) => {
    const mk = L.marker([r.lat, r.lon], {
      icon: L.divIcon({ className: '', html: `<div class="pricepin ${tier(r)}" data-i="${i}">${pinLabel(r)}</div>`, iconSize: [0, 0] }),
      zIndexOffset: 1000 - i,
    }).addTo(map);
    mk.on('click', () => select(i, top, true));
    markers.push(mk);
    r._marker = mk;
  });

  renderList(top);
  $('go') && ($('go').disabled = false);
}

function select(i, top, fromMap) {
  document.querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', +c.dataset.i === i));
  document.querySelectorAll('.pricepin').forEach((p) => p.classList.toggle('sel', +p.dataset.i === i));
  const card = document.querySelector(`.card[data-i="${i}"]`);
  if (card && !fromMap) card.scrollIntoView({ block: 'nearest' });
  if (fromMap) map.panTo([top[i].lat, top[i].lon]);
}

function renderList(top) {
  if (!top.length) { setStatus('No meters within that walk time. Try a longer walk.'); return; }
  const html = top.map((r, i) => {
    const price = r.free ? 'FREE' : '$' + r.cost.toFixed(2);
    const tags = [];
    if (r.free) tags.push('<span class="tag free">free your whole stay</span>');
    else if (r.freeAfter) tags.push('<span class="tag free">free after 10 PM</span>');
    if (r.blockCount >= 6) tags.push(`<span class="tag">${r.blockCount} spots on block</span>`);
    if (r.flat != null) tags.push(`<span class="tag">$${r.flat.toFixed(2)} flat</span>`);
    if (r.overLimit) tags.push(`<span class="tag">over ${r.limit / 60}h limit</span>`);
    return `<div class="card" data-i="${i}">
      <div class="body">
        <div class="price ${r.free ? 'free' : ''}">${price}<span class="sub" style="display:inline;margin-left:8px">${r.hourlyNow ? '$' + r.hourlyNow.toFixed(2) + '/hr now' : 'free now'}</span></div>
        <div class="sub">${r.walkMin} min walk ${r.dir} · ${r.distM} m away</div>
        <div class="tags">${tags.join('')}</div>
      </div>
      <a class="dir" href="${navUrl(r)}" target="_blank" rel="noopener" aria-label="Navigate">
        <span class="btn">${NAV_SVG}</span><span class="t">${r.walkMin} min</span>
      </a>
    </div>`;
  }).join('');
  $('results').innerHTML = html;
  document.querySelectorAll('.card').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.dir')) return;
      const i = +el.dataset.i;
      select(i, top, false);
      map.setView([top[i].lat, top[i].lon], 17);
    });
  });
}

document.querySelectorAll('.seg button').forEach((el) => el.addEventListener('click', () => {
  document.querySelectorAll('.seg button').forEach((s) => s.classList.remove('active'));
  el.classList.add('active');
  if (lastLoc) run(lastLoc);
}));

$('here').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => { $('dest').value = 'My location'; run({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'My location' }); },
    () => alert('Could not get your location.')
  );
});

$('dest').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.target.blur(); run(); } });
