// Manual review overlays identify evidence problems, never parking eligibility.
export const REVIEW_GROUPS = {
  resolved: { label: 'Verified / updated', color: '#15803d' },
  conflict: { label: 'Conflicting restriction', color: '#dc2626' },
  schedule: { label: 'Incomplete schedule', color: '#d97706' },
  boundary: { label: 'Uncertain boundary', color: '#7c3aed' },
  unmatched: { label: 'No matching sign found', color: '#087f8c' },
};
const boundaries = new Set(['davie-beach-99cd6fc2597d', 'denman-west-8a345fd5d337', 'wep-b7bd3d236123']);
export function reviewGroup(row) {
  if (row.status === 'city-meter-confirmed') return 'resolved';
  if (row.status === 'historical-prohibited' || row.status === 'historical-reserved') return 'resolved';
  if (row.status === 'user-confirmed-prohibited') return 'resolved';
  if (row.status === 'user-confirmed-hours') return 'resolved';
  if (row.status === 'user-confirmed-permit') return 'resolved';
  if (row.status === 'historical-sign-match') return null;
  if (row.status === 'historical-conflict') return 'conflict';
  if (row.status === 'unresolved') return 'unmatched';
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
  document.body.classList.add('review-mode');
  const panel = document.createElement('section'); panel.className = 'review-legend mat'; panel.setAttribute('aria-label','Manual parking review');
  panel.textContent = 'Loading review locations…'; document.body.append(panel);
  try {
    const response = await fetch('data/sources/pdf-street-view-audit.json?v=8');
    if (!response.ok) throw new Error('Review data unavailable');
    const rows = (await response.json()).filter(row => reviewGroup(row));
    const entries = rows.map(row => ({row, block: blocks.find(b => b.id === row.id)})).filter(e => e.block);
    panel.textContent = '';
    const title = document.createElement('strong'); title.textContent = `Manual review · ${entries.length} locations`; panel.append(title);
    const note = document.createElement('p'); note.textContent = 'Dots mark approximate PDF locations, not exact parking boundaries. Tap a numbered dot for the finding and Street View link.'; panel.append(note);
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
      const button = document.createElement('button'); button.className = 'review-dot'; button.style.background = REVIEW_GROUPS[group].color;
      button.textContent = number; button.title = label; button.setAttribute('aria-label',label);
      const open = () => { select.value = String(i); onTap(block); };
      button.addEventListener('click', e => {e.stopPropagation(); open();});
      new maplibregl.Marker({element:button, anchor:'center'}).setLngLat([block.lon,block.lat]).addTo(map);
      const option = document.createElement('option'); option.value = i; option.textContent = label; select.append(option);
    });
    select.addEventListener('change', () => { if (select.value !== '') { const block = entries[Number(select.value)].block; map.easeTo({center:[block.lon,block.lat],zoom:17}); onTap(block); } });
    panel.append(select);
    if (entries.length && !new URLSearchParams(location.search).has('spot')) {
      const bounds = new maplibregl.LngLatBounds(); entries.forEach(({block}) => bounds.extend([block.lon,block.lat]));
      map.fitBounds(bounds,{padding:{top:290,bottom:60,left:45,right:45},maxZoom:15.5,duration:0});
    }
  } catch (error) { panel.textContent = 'Could not load review locations. Reload to try again.'; console.error(error); }
}
