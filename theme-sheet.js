// Keep the map controls above sheets as they open, resize, or are dragged.
const toggle = document.getElementById('themetoggle');
const controls = [toggle, document.getElementById('compass'), document.getElementById('recenter')].filter(Boolean);
const sheets = [...document.querySelectorAll('.tripcard, .spotcard, .rlpanel, #welcome .wc-sheet, #navwarn .wc-card')];
let frame = 0;
let followUntil = 0;
function update() {
  frame = 0;
  let clearance = 0;
  const button = toggle.getBoundingClientRect();
  for (const sheet of sheets) {
    const style = getComputedStyle(sheet);
    if (style.display === 'none' || style.visibility === 'hidden' || !sheet.getClientRects().length) continue;
    const rect = sheet.getBoundingClientRect();
    if (rect.right <= button.left || rect.left >= button.right || rect.top >= innerHeight || rect.bottom <= 0) continue;
    clearance = Math.max(clearance, innerHeight - rect.top + 12);
  }
  for (const control of controls) control.style.setProperty('--sheet-clearance', `${Math.ceil(clearance)}px`);
  if (performance.now() < followUntil) frame = requestAnimationFrame(update);
}
function schedule() {
  // Follow the actual animated edge, including closing transitions and swipe gestures.
  followUntil = performance.now() + 700;
  if (!frame) frame = requestAnimationFrame(update);
}
const sizes = new ResizeObserver(schedule);
const changes = new MutationObserver(schedule);
for (const sheet of sheets) {
  sizes.observe(sheet);
  changes.observe(sheet, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
}
for (const el of [document.body, document.getElementById('welcome'), document.getElementById('navwarn')]) {
  if (el) changes.observe(el, { attributes: true, attributeFilter: ['class'] });
}
window.addEventListener('resize', schedule);
window.visualViewport?.addEventListener('resize', schedule);
window.visualViewport?.addEventListener('scroll', schedule);
schedule();
