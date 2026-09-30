// Manual review overlays identify evidence problems, never parking eligibility.
export const REVIEW_GROUPS = {
  resolved: { label: 'Street View cross-checked', color: '#15803d' },
  conflict: { label: 'Conflicting restriction', color: '#dc2626' },
  schedule: { label: 'Incomplete schedule', color: '#d97706' },
  boundary: { label: 'Uncertain boundary', color: '#7c3aed' },
  unmatched: { label: 'Street View inspected · not verified', color: '#087f8c' },
};
// These audits were written before every observation was copied into a curb record.
// Keep their IDs here so the visual audit map includes the work without implying that
// an inspected view establishes a current parking rule or a full curb boundary.
const KITS_INSPECTED_IDS = new Set([
  // Kits North 2026-09-23
  'kits-north-3c3c4f5e85e6', 'kits-north-0d54cc1d1a47', 'kits-north-53832e089887',
  'kits-north-e977563b7a47', 'kits-north-9c9579612ba7',
  // Kits Point paid-curb audit 2026-09-22
  'kits-point-3ab8c81351fc', 'kits-point-cb41b6a31097', 'kits-point-c86bfe75434b',
  'kits-point-09d8373ec66f', 'kits-point-5612162ed11c', 'kits-point-254412cc8890',
  'kits-point-ee8e5ba1f8d8', 'kits-point-4357f6e486b8', 'kits-point-0d3e42ce57f4',
  'kits-point-cbb1df77af94', 'kits-point-5588b2017710',
  // South Kits follow-up 2026-09-23
  'kits-south-f41ac2c359da', 'kits-south-7a4effb8bb66',
]);
// Planning-only coverage candidates for the next Street View pass. These are
// public-road corridors with no mapped audit segment in the local data. They
// intentionally exclude the prior Science World sample views (E 2nd, W 1st,
// Athletes Way, Western, and Quebec), which are already audit evidence.
const FALSE_CREEK_PLAN = [
  { name: 'Main Street · Terminal to E 1st', line: [[-123.1010,49.2735],[-123.1014,49.2707]] },
  { name: 'Main Street · E 1st to E 2nd', line: [[-123.1014,49.2707],[-123.1018,49.2694]] },
  { name: 'E 1st Avenue · Main to Ontario', line: [[-123.1014,49.2707],[-123.1042,49.2705],[-123.1068,49.2704]] },
  { name: 'E 2nd Avenue · Main to Ontario', line: [[-123.1018,49.2694],[-123.1048,49.2692],[-123.1068,49.2691]] },
  { name: 'Ontario Street · E 1st to E 2nd', line: [[-123.1068,49.2704],[-123.1068,49.2691]] },
  { name: 'Columbia Street · Pacific to E 1st', line: [[-123.1101,49.2730],[-123.1095,49.2715],[-123.1087,49.2704]] },
  { name: 'Pacific Boulevard · Cambie to Main', line: [[-123.1164,49.2732],[-123.1125,49.2730],[-123.1085,49.2731],[-123.1045,49.2733],[-123.1010,49.2735]] },
  { name: 'Expo Boulevard · Carrall to Main', line: [[-123.1087,49.2745],[-123.1050,49.2745],[-123.1010,49.2744]] },
  { name: 'National Avenue · Quebec to Main', line: [[-123.1080,49.2686],[-123.1047,49.2685],[-123.1018,49.2687]] },
  { name: 'Terminal Avenue frontage · Main to Quebec', line: [[-123.1010,49.2751],[-123.1045,49.2750],[-123.1080,49.2749]] },
];
const PLAN_HIGHLIGHTS_KEY = 'pd_false_creek_street_view_plan';
const MANUAL_HIGHLIGHTS_KEY = 'pd_street_view_manual_highlights';
const boundaries = new Set(['davie-beach-99cd6fc2597d', 'denman-west-8a345fd5d337', 'wep-b7bd3d236123']);
export function reviewGroup(row) {
  if (row.status === 'city-meter-confirmed') return 'resolved';
  if (row.status === 'historical-prohibited' || row.status === 'historical-reserved') return 'resolved';
  if (row.status === 'user-confirmed-prohibited') return 'resolved';
  if (row.status === 'user-confirmed-hours') return 'resolved';
  if (row.status === 'user-confirmed-permit') return 'resolved';
  // This is a visual audit view, so include the ordinary sign matches as well as
  // the exceptions.  The marker is deliberately at the approximate mapped
  // blockface—not a surveyed sign or legal parking boundary.
  if (row.status === 'historical-sign-match') return 'resolved';
  if (row.status === 'historical-conflict') return 'conflict';
  if (row.status === 'unresolved') return 'unmatched';
  if (row.status === 'street-view-inspected') return 'unmatched';
  return boundaries.has(row.id) ? 'boundary' : 'schedule';
}
export function renderReviewDetail(block, container) {
  if (!block.review) return;
  const { number, group, observation } = block.review;
  const box = document.createElement('div'); box.className = 'review-detail';
  const heading = document.createElement('strong');
  heading.textContent = `Review #${number} · ${REVIEW_GROUPS[group].label}`;
  const text = document.createElement('p'); text.textContent = observation.text.replace(/^Second pass: /, '');
  box.append(heading, text); container.prepend(box);
}
export async function initReview(map, blocks, onTap) {
  if (new URLSearchParams(location.search).get('review') !== '1') return;
  if (new URLSearchParams(location.search).get('overlay') !== '1') document.body.classList.add('review-mode');
  const panel = document.createElement('section'); panel.className = 'review-legend mat'; panel.setAttribute('aria-label','Manual parking review');
  panel.textContent = 'Loading review locations…'; document.body.append(panel);
  try {
    const [response, sourceResponse, completedResponse] = await Promise.all([
      fetch('data/sources/pdf-street-view-audit.json?v=8'),
      fetch('data/street-view-audit-source-points.json?v=1'),
      fetch('data/street-view-completed-traces.json?v=4'),
    ]);
    if (!response.ok) throw new Error('Review data unavailable');
    const rows = await response.json();
    const sourcePoints = sourceResponse.ok ? await sourceResponse.json() : [];
    const completedTraces = completedResponse.ok ? await completedResponse.json() : [];
    const documentedKits = blocks.filter(block => KITS_INSPECTED_IDS.has(block.id))
      .map(block => ({
        id: block.id, status: 'street-view-inspected', street: block.curb.street,
        side: block.curb.side, between: block.curb.between,
        observations: [{ text: 'Street View was inspected for this mapped curb in the Kitsilano audit. No complete current parking rule or surveyed curb endpoint was established from that view.' }],
      }));
    // A directly attached spot check is more specific than the old audit index.
    // This intentionally covers every Vancouver data feed, not only Kits: each
    // session that added a Street View audit writes its evidence onto the curb
    // record, and this overlay reconciles those records at display time.
    for (const block of blocks) {
      if (!block.curb?.spotChecks?.length || documentedKits.some(row => row.id === block.id)) continue;
      const check = block.curb.spotChecks.at(-1);
      documentedKits.push({
        id: block.id, status: check.status || 'street-view-inspected', street: block.curb.street,
        side: block.curb.side, between: block.curb.between,
        observations: [{ text: check.finding || 'Street View was inspected for this mapped curb.' }],
      });
    }
    const entries = [...rows, ...documentedKits].filter(row => reviewGroup(row))
      .map(row => ({row, block: blocks.find(b => b.id === row.id)})).filter(e => e.block);
    // The audit happened along these curb faces, not at a single pin.  Draw one
    // red overlay for the complete audited street geometry; this is evidence
    // coverage only and deliberately says nothing about the parking rule.
    const auditLines = {
      type: 'FeatureCollection', features: [
        ...entries.filter(({block}) => block.line?.length > 1).map(({block}) => ({
        type: 'Feature', properties: { id: block.id },
        geometry: { type: 'LineString', coordinates: block.line.map(([lat, lon]) => [lon, lat]) },
        })),
        ...completedTraces.map(trace => ({ type: 'Feature', properties: { id: trace.id, name: trace.name, status: trace.status },
          geometry: { type: trace.geometryType || 'LineString', coordinates: trace.coordinates } })),
      ],
    };
    if (map.getSource('street-view-audit-lines')) map.getSource('street-view-audit-lines').setData(auditLines);
    else map.addSource('street-view-audit-lines', { type: 'geojson', data: auditLines });
    if (!map.getLayer('street-view-audit-lines')) map.addLayer({
      id: 'street-view-audit-lines', type: 'line', source: 'street-view-audit-lines',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#dc2626', 'line-width': ['step', ['zoom'], 4, 15, 6], 'line-opacity': 0.9 },
    });
    // One ordinary Park Daddy-style price pill represents the Island-wide
    // operator parking rule. It is a discovery shortcut, not a claimed curb face.
    if (!map.__granvilleIslandParkingPill) {
      map.__granvilleIslandParkingPill = true;
      const pill = document.createElement('button');
      pill.type = 'button'; pill.className = 'plabel p2';
      const updatePillLabel = () => {
        // Match ordinary price pills: clusters use a compact price, while closer
        // block-face labels show a visually subdued per-hour suffix.
        const detailed = map.getZoom() >= 16;
        const price = window.granvilleIslandParkingPriceLabel?.(false) || 'Paid';
        pill.innerHTML = detailed && price !== 'Paid' ? `${price}<span class="plim">/hr</span>` : price;
      };
      updatePillLabel(); map.on('zoomend', updatePillLabel);
      pill.setAttribute('aria-label', 'Granville Island paid parking details');
      pill.addEventListener('click', () => window.openGranvilleIslandParking?.());
      new maplibregl.Marker({ element: pill, anchor: 'bottom' }).setLngLat([-123.13455, 49.27070]).addTo(map);
    }
    // The circle/queue experiment was removed: it intercepted map gestures and
    // was not a reliable way to submit audits. In overlay mode retain only the
    // completed red audit trails and the normal parking map beneath them.
    if (new URLSearchParams(location.search).get('overlay') === '1') {
      panel.remove();
      return;
    }
    if (new URLSearchParams(location.search).get('overlay') === '1') {
      // Compact area-audit control: click once for the centre, once for the edge.
      // A queued circle is written into the URL so it is visible to the audit worker.
      panel.className = 'audit-toolbar mat'; panel.textContent = '';
      const draw = document.createElement('button'); draw.type = 'button'; draw.className = 'audit-tool'; draw.textContent = 'Draw audit area';
      const go = document.createElement('button'); go.type = 'button'; go.className = 'audit-go'; go.textContent = 'Queue audit'; go.disabled = true;
      const status = document.createElement('span'); status.className = 'audit-status'; status.textContent = 'Circle an area to audit';
      panel.append(draw, go, status);
      let drawing = false, centre = null, area = null, handle = null, deleteHandle = null;
      const circle = (c, radius) => Array.from({length:65}, (_, i) => {
        const a = i / 64 * Math.PI * 2, dLat = radius / 111111, dLon = radius / (111111 * Math.cos(c[1] * Math.PI / 180));
        return [c[0] + Math.cos(a) * dLon, c[1] + Math.sin(a) * dLat];
      });
      const paintArea = () => {
        const data = { type:'FeatureCollection', features: area ? [{ type:'Feature', properties:{}, geometry:{type:'Polygon',coordinates:[circle(area.centre, area.radius)]} }] : [] };
        if (map.getSource('street-view-audit-area')) map.getSource('street-view-audit-area').setData(data);
        else map.addSource('street-view-audit-area', {type:'geojson', data});
        if (!map.getLayer('street-view-audit-area-fill')) {
          map.addLayer({id:'street-view-audit-area-fill',type:'fill',source:'street-view-audit-area',paint:{'fill-color':'#2563eb','fill-opacity':0.12}});
          map.addLayer({id:'street-view-audit-area-line',type:'line',source:'street-view-audit-area',paint:{'line-color':'#2563eb','line-width':3}});
        }
      };
      const installHandle = () => {
        if (!area) return;
        if (!handle) {
          const el = document.createElement('div'); el.className = 'audit-area-handle';
          handle = new maplibregl.Marker({element:el, anchor:'center'}).addTo(map);
        }
        handle.setLngLat(area.centre);
        const top = [area.centre[0], area.centre[1] + area.radius / 111111];
        if (!deleteHandle) {
          const del = document.createElement('button'); del.type = 'button'; del.className = 'audit-area-delete'; del.textContent = '×'; del.setAttribute('aria-label','Delete audit area');
          del.addEventListener('click', event => {
            event.preventDefault(); event.stopPropagation(); map.dragPan.enable(); area = null; centre = null; go.disabled = true;
            handle?.remove(); deleteHandle?.remove(); handle = null; deleteHandle = null; status.textContent = 'Circle an area to audit'; paintArea();
          });
          deleteHandle = new maplibregl.Marker({element:del, anchor:'center'}).addTo(map);
        }
        deleteHandle.setLngLat(top);
      };
      draw.addEventListener('click', () => {
        drawing = true; centre = null; area = null; go.disabled = true;
        if (handle) { handle.remove(); handle = null; }
        if (deleteHandle) { deleteHandle.remove(); deleteHandle = null; }
        map.dragPan.disable(); status.textContent = 'Press and drag from the area centre'; map.getCanvas().style.cursor = 'crosshair'; paintArea();
      });
      const radiusTo = point => {
        const latScale = 111111, lonScale = 111111 * Math.cos(centre[1] * Math.PI / 180);
        return Math.hypot((point.lng - centre[0]) * lonScale, (point.lat - centre[1]) * latScale);
      };
      const canvasPoint = event => {
        const rect = map.getCanvas().getBoundingClientRect();
        return map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
      };
      const beginCircle = event => {
        if (!drawing) return;
        event.preventDefault(); event.stopPropagation(); const point = canvasPoint(event); centre = [point.lng, point.lat];
        area = {centre, radius:1}; paintArea(); status.textContent = 'Drag to size the audit area';
      };
      const resizeCircle = event => {
        if (!drawing || !centre || !area) return;
        event.preventDefault(); const point = canvasPoint(event); area.radius = radiusTo(point); paintArea();
      };
      const finishCircle = event => {
        if (!drawing || !centre || !area) return;
        event.preventDefault(); const point = canvasPoint(event); area.radius = Math.max(20, radiusTo(point)); drawing = false; map.dragPan.enable(); map.getCanvas().style.cursor = '';
        go.disabled = false; status.textContent = `${Math.round(area.radius)} m area ready · drag the centre to move`; paintArea(); installHandle();
      };
      // Capture-phase pointer events beat MapLibre's pan handler while drawing.
      const canvas = map.getCanvas();
      canvas.addEventListener('pointerdown', beginCircle, true);
      window.addEventListener('pointermove', resizeCircle, true);
      window.addEventListener('pointerup', finishCircle, true);
      // The container sees presses on the centre marker as well as the canvas.
      map.getContainer().addEventListener('pointerdown', start => {
        if (drawing || !area) return;
        const rect = map.getCanvas().getBoundingClientRect(), center = map.project(area.centre);
        const dx = start.clientX - rect.left - center.x, dy = start.clientY - rect.top - center.y;
        if (Math.hypot(dx, dy) > 24) return;
        start.preventDefault(); start.stopPropagation(); map.dragPan.disable();
        const move = event => {
          event.preventDefault(); const point = canvasPoint(event); area.centre = [point.lng, point.lat]; paintArea(); installHandle();
        };
        const end = event => {
          event.preventDefault(); map.dragPan.enable();
          window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', end, true);
          status.textContent = `${Math.round(area.radius)} m area ready · drag the centre to move`;
        };
        window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', end, true);
      }, true);
      go.addEventListener('click', () => {
        const url = new URL(location.href); url.searchParams.set('auditArea', btoa(JSON.stringify(area))); history.replaceState(null, '', url);
        status.textContent = 'Queued for Street View audit'; go.disabled = true;
      });
      paintArea();
      return;
    }
    // PayByPhone/meter coverage is stored as individual meter locations. Joining
    // each local meter cluster makes that live coverage read as green curb strokes
    // without inventing a full legal parking boundary beyond the recorded meters.
    const meterLines = { type: 'FeatureCollection', features: blocks
      .filter(block => block.payByPhoneCodes?.length && block.pts?.length)
      .map(block => ({ type: 'Feature', properties: { id: block.id }, geometry: {
        type: 'LineString', coordinates: block.pts.length > 1
          ? block.pts.map(([lat, lon]) => [lon, lat])
          : [[block.lon - 0.00005, block.lat], [block.lon + 0.00005, block.lat]],
      }})) };
    if (new URLSearchParams(location.search).get('coverage') === '1') {
      if (map.getSource('meter-coverage-lines')) map.getSource('meter-coverage-lines').setData(meterLines);
      else map.addSource('meter-coverage-lines', { type: 'geojson', data: meterLines });
      if (!map.getLayer('meter-coverage-lines')) map.addLayer({
        id: 'meter-coverage-lines', type: 'line', source: 'meter-coverage-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#16a34a', 'line-width': ['step', ['zoom'], 3, 15, 5], 'line-opacity': 0.8 },
      });
    }
    if (new URLSearchParams(location.search).get('plan') === '1') {
      const planLines = { type: 'FeatureCollection', features: FALSE_CREEK_PLAN.map((corridor, index) => ({
        type: 'Feature', properties: { name: corridor.name, index },
        geometry: { type: 'LineString', coordinates: corridor.line },
      })) };
      if (map.getSource('street-view-plan-lines')) map.getSource('street-view-plan-lines').setData(planLines);
      else map.addSource('street-view-plan-lines', { type: 'geojson', data: planLines });
      if (!map.getLayer('street-view-plan-lines')) map.addLayer({
        id: 'street-view-plan-lines', type: 'line', source: 'street-view-plan-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': ['step', ['zoom'], 3, 15, 5], 'line-opacity': 0.88, 'line-dasharray': [1.2, 1.2] },
      });
    }
    panel.textContent = '';
    const title = document.createElement('strong'); title.textContent = `Street View audit map · ${entries.length + completedTraces.length} audited street segments`; panel.append(title);
    const note = document.createElement('p'); note.textContent = `Red lines show every audited mapped curb/street segment. The normal Park Daddy paid and free markings remain visible underneath. Yellow lines are streets you manually select for a later Street View pass; trace a street by clicking along it, then choose Finish highlighted street.`; panel.append(note);
    for (const [key, group] of Object.entries(REVIEW_GROUPS)) {
      const line = document.createElement('div'); const dot = document.createElement('span'); dot.className = 'review-key'; dot.style.background = group.color;
      line.append(dot, `${group.label} (${entries.filter(e => reviewGroup(e.row) === key).length})`); panel.append(line);
    }
    const select = document.createElement('select'); select.setAttribute('aria-label','Choose a review location');
    const placeholder = document.createElement('option'); placeholder.textContent = 'Choose a location…'; placeholder.value = ''; select.append(placeholder);
    entries.forEach(({row,block}, i) => {
      const group = reviewGroup(row), number = i + 1;
      block.review = {number, group, observation: row.observations.at(-1)};
      const label = `#${number} ${row.street}, ${row.side}, ${row.between.join('–')} · ${REVIEW_GROUPS[group].label}`;
      const open = () => { select.value = String(i); onTap(block); };
      const option = document.createElement('option'); option.value = i; option.textContent = label; select.append(option);
    });
    select.addEventListener('change', () => { if (select.value !== '') { const block = entries[Number(select.value)].block; map.easeTo({center:[block.lon,block.lat],zoom:17}); onTap(block); } });
    panel.append(select);
    if (new URLSearchParams(location.search).get('overlay') === '1') {
      let drawing = false, draft = [];
      let highlights = [];
      const encodedHighlights = new URLSearchParams(location.search).get('highlight');
      try {
        highlights = encodedHighlights
          ? JSON.parse(atob(encodedHighlights))
          : JSON.parse(localStorage.getItem(MANUAL_HIGHLIGHTS_KEY) || '[]');
      } catch {}
      const isCompletedHighlight = line => completedTraces.some(trace =>
        line.length === trace.coordinates.length && line.every((point, index) =>
          Math.abs(point[0] - trace.coordinates[index][0]) < 1e-7 &&
          Math.abs(point[1] - trace.coordinates[index][1]) < 1e-7));
      const syncHighlights = () => {
        try { localStorage.setItem(MANUAL_HIGHLIGHTS_KEY, JSON.stringify(highlights)); } catch {}
        const url = new URL(location.href);
        if (highlights.length) url.searchParams.set('highlight', btoa(JSON.stringify(highlights)));
        else url.searchParams.delete('highlight');
        history.replaceState(null, '', url);
      };
      // Finished audits leave the manual queue entirely. This updates both the
      // browser's local state and its shareable URL, so yellow cannot mask red.
      if (highlights.some(isCompletedHighlight)) {
        highlights = highlights.filter(line => !isCompletedHighlight(line));
        syncHighlights();
      }
      const paintHighlights = () => {
        // A finished audit moves a selected route from yellow (queue) to red
        // (completed coverage) while retaining its history in the share URL.
        const lines = [...highlights.filter(line => !isCompletedHighlight(line)), ...(draft.length > 1 ? [draft] : [])];
        const data = { type: 'FeatureCollection', features: lines.map((coordinates, index) => ({
          type: 'Feature', properties: { index }, geometry: { type: 'LineString', coordinates },
        })) };
        if (map.getSource('street-view-highlight-lines')) map.getSource('street-view-highlight-lines').setData(data);
        else map.addSource('street-view-highlight-lines', { type: 'geojson', data });
        if (!map.getLayer('street-view-highlight-lines')) map.addLayer({
          id: 'street-view-highlight-lines', type: 'line', source: 'street-view-highlight-lines',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#facc15', 'line-width': ['step', ['zoom'], 6, 15, 9], 'line-opacity': 0.95 },
        });
      };
      const highlight = document.createElement('button'); highlight.type = 'button'; highlight.className = 'review-highlight';
      highlight.textContent = 'Highlight streets'; highlight.setAttribute('aria-pressed', 'false');
      const finish = document.createElement('button'); finish.type = 'button'; finish.className = 'review-highlight'; finish.textContent = 'Finish highlighted street';
      const undo = document.createElement('button'); undo.type = 'button'; undo.className = 'review-highlight'; undo.textContent = 'Undo last point';
      const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'review-highlight'; clear.textContent = 'Clear highlights';
      highlight.addEventListener('click', () => {
        drawing = !drawing; highlight.setAttribute('aria-pressed', String(drawing));
        highlight.textContent = drawing ? 'Click along a street to trace it' : 'Highlight streets';
        map.getCanvas().style.cursor = drawing ? 'crosshair' : '';
      });
      finish.addEventListener('click', () => {
        if (draft.length > 1) { highlights.push(draft); syncHighlights(); }
        draft = []; paintHighlights();
      });
      undo.addEventListener('click', () => { draft.pop(); paintHighlights(); });
      clear.addEventListener('click', () => { highlights = []; draft = []; syncHighlights(); paintHighlights(); });
      map.on('click', event => {
        if (!drawing) return;
        draft.push([event.lngLat.lng, event.lngLat.lat]); paintHighlights();
      });
      // Migrate a prior browser-only selection to the shareable map URL on load.
      if (!encodedHighlights && highlights.length) syncHighlights();
      paintHighlights();
      panel.append(highlight, finish, undo, clear);
    }
    if (entries.length && !new URLSearchParams(location.search).has('spot') && new URLSearchParams(location.search).get('overlay') !== '1') {
      const bounds = new maplibregl.LngLatBounds();
      const planning = new URLSearchParams(location.search).get('plan') === '1';
      if (planning) FALSE_CREEK_PLAN.forEach(corridor => corridor.line.forEach(point => bounds.extend(point)));
      else {
        entries.forEach(({block}) => bounds.extend([block.lon,block.lat]));
        sourcePoints.forEach(point => bounds.extend([point.lon, point.lat]));
      }
      map.fitBounds(bounds,{padding:{top:290,bottom:60,left:45,right:45},maxZoom:15.5,duration:0});
    }
  } catch (error) { panel.textContent = 'Could not load review locations. Reload to try again.'; console.error(error); }
}
