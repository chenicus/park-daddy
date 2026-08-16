// Crowd-sourced "this spot is wrong" reports.
//
// Backed by Supabase via its REST + Storage HTTP APIs (plain fetch, no SDK — keeps
// the zero-build ethos). When Supabase isn't configured yet (config.js still has
// placeholders), everything falls back to a localStorage stub so the flow works
// locally before the backend exists.
//
// Lifecycle (see app.js + labels.js for the UI):
//   >= FLAG_MIN reports → warning marker on the pill + banner on the spot card
//   >= HIDE_MIN reports → the pill drops off the map entirely (data is kept, just hidden)
//   resolved = true      → excluded from both counts (fixed the underlying data; report
//                          stays in the table for history, just stops flagging the pill).
//                          Flip it from the Supabase Table Editor — no public update policy,
//                          same as the rest of the table (see supabase-setup.sql).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=2';

export const FLAG_MIN = 1;
export const HIDE_MIN = 5;   // raised from 3: 3 open-insert reports was too cheap a way to hide a real block
const RECENT_DAYS = 365;          // signs change — only reports this recent count toward flag/hide
const BUCKET = 'report-photos';
const LKEY = 'pd_reports';        // localStorage stub key
const FKEY = 'pd_feedback';       // localStorage stub key for general feedback

const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY &&
  !/YOUR_/.test(SUPABASE_URL) && !/YOUR_/.test(SUPABASE_ANON_KEY));

const H = () => ({ apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY });

// Stable per-block key. Block ids are array indexes (rebuilt every data refresh), so
// we key on the physical location instead: the hundred-block for free blocks, else
// lat/lon rounded to ~11 m. A report thus re-attaches to the same block face after a
// weekly refresh even though the block's numeric id changed.
export function rptKey(b) {
  if (b.hblock) return 'h:' + String(b.hblock).trim().toUpperCase();
  return 'g:' + b.lat.toFixed(4) + ',' + b.lon.toFixed(4);
}

// ---- local stub (used until Supabase is configured) --------------------------
function loadLocal() { try { return JSON.parse(localStorage.getItem(LKEY)) || []; } catch { return []; } }
function saveLocal(row) { const a = loadLocal(); a.unshift(row); try { localStorage.setItem(LKEY, JSON.stringify(a)); } catch {} }

// ---- read: aggregate reports into a Map(block_key -> { count, items[] }) ------
async function apiReports() {
  const since = new Date(Date.now() - RECENT_DAYS * 864e5).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/reports` +
    `?select=block_key,block_label,reason,detail,photo_url,created_at` +
    `&created_at=gte.${since}&resolved=eq.false&order=created_at.desc`;
  const r = await fetch(url, { headers: H() });
  if (!r.ok) throw new Error('reports fetch ' + r.status);
  return r.json();
}

export async function fetchFlags() {
  let rows;
  try { rows = configured ? await apiReports() : loadLocal(); }
  catch (e) { console.warn('[reports] flag load failed', e); return new Map(); }
  const m = new Map();
  for (const r of rows) {
    let f = m.get(r.block_key);
    if (!f) { f = { count: 0, items: [] }; m.set(r.block_key, f); }
    f.count++; f.items.push(r);
  }
  return m;
}

// ---- general app feedback (menu → Leave feedback) ----------------------------
// Separate table from `reports`: reports are attached to a block and drive the map's
// flag/hide logic; this is free-form "the app is broken / add my city" mail. Same
// public-insert + guard-trigger shape (see supabase-setup.sql). Falls back to the
// localStorage stub when Supabase isn't configured, so the flow still works offline.
export async function submitFeedback({ message, contact }) {
  const row = {
    message: String(message || '').slice(0, 1000),
    contact: (contact || '').trim().slice(0, 120) || null,
    page: location.pathname + location.search,
  };
  if (!configured) {
    const a = (() => { try { return JSON.parse(localStorage.getItem(FKEY)) || []; } catch { return []; } })();
    a.unshift({ ...row, created_at: new Date().toISOString() });
    try { localStorage.setItem(FKEY, JSON.stringify(a)); } catch {}
    return;
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
    method: 'POST',
    headers: { ...H(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const err = new Error('feedback insert ' + r.status + (body ? ': ' + body : ''));
    err.status = r.status;
    throw err;
  }
}

// ---- write: optional photo upload, then insert the report row ----------------
async function uploadPhoto(key, file) {
  const ext = ((file.type.split('/')[1] || 'jpg')).replace('jpeg', 'jpg');
  const safe = key.replace(/[^a-z0-9]/gi, '_');
  const path = `${safe}/${Date.now()}.${ext}`;      // folder + filename are sanitized → no URL-encoding needed
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: { ...H(), 'Content-Type': file.type || 'image/jpeg' }, body: file,
  });
  if (!r.ok) throw new Error('photo upload ' + r.status);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// `accuracy` is the GPS confidence radius in metres (Geolocation coords.accuracy) and `samples`
// is how many readings were combined to produce the coordinate — see currentFix() in scan.html.
// Both are optional: only the field-scan flow has a live fix to report, since a report filed
// from the map is attached to a block we already know the coordinates of, so it sends null.
// Read them together: 8 m from one reading and 8 m from six combined readings are not the
// same measurement, and the threshold work needs to tell them apart.
export async function submitReport({ block, reason, detail, photoFile, accuracy, samples }) {
  const key = rptKey(block);
  const base = {
    block_key: key, block_label: block._label || null,
    reason, detail: detail || null, lat: block.lat, lon: block.lon,
    gps_accuracy_m: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
    gps_samples: Number.isFinite(samples) ? samples : null,
  };

  if (!configured) {
    saveLocal({ ...base, photo_url: photoFile ? '#local' : null, created_at: new Date().toISOString() });
    return;
  }

  let photo_url = null;
  if (photoFile) { try { photo_url = await uploadPhoto(key, photoFile); } catch (e) { console.warn('[reports] photo failed, saving without it', e); } }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/reports`, {
    method: 'POST',
    headers: { ...H(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ ...base, photo_url }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    let msg = '';
    try { msg = JSON.parse(body).message || ''; } catch {}
    const err = new Error('report insert ' + r.status + (body ? ': ' + body : ''));
    err.status = r.status;
    err.serverMessage = msg;     // the guard's own words — see serverRefused() below
    throw err;
  }
}

// ---- telling a refusal apart from a network problem --------------------------
// The abuse guard in supabase-setup.sql raises plpgsql exceptions; PostgREST answers those
// as 400 with the message in the body. Two of its refusals mean different things to a caller:
// the per-minute flood cap means "come back in a moment", everything else (dedup, per-block
// cap, field validation) means "this exact row is never going in". Only the first is worth a
// retry — retrying the rest just sends identical bytes for an identical answer, and reporting
// them as "check your connection" blames the network for a decision the server made.
// These matchers are coupled to the `raise exception` strings in supabase-setup.sql.
const RETRYABLE_GUARD = /rate limited/i;
const guardMsg = (err) => (err && (err.serverMessage || err.message)) || '';

export function serverRefused(err) {
  const s = err && err.status;
  if (typeof s !== 'number' || s < 400 || s >= 500) return false;
  if (s === 408 || s === 429) return false;         // "later", not "no"
  return !RETRYABLE_GUARD.test(guardMsg(err));
}

// The dedup arm specifically: the row it collided with is already in the table, so nothing
// was lost and the user shouldn't be told their scan failed.
export function isDuplicateReport(err) {
  return serverRefused(err) && /duplicate report/i.test(guardMsg(err));
}
