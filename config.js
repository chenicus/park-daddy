// Supabase project credentials for crowd-sourced "this spot is wrong" reports.
//
// The anon key is SAFE to commit — it's a public, browser-side key. Row Level
// Security (see supabase-setup.sql) is what actually controls access, not secrecy
// of this key. Do NOT put the service_role key here — that one is a real secret.
//
// Until these are filled in, reports fall back to a localStorage stub so the whole
// flow still works locally (reports persist in your own browser only).
//
// Setup: create a project at supabase.com → run supabase-setup.sql in the SQL editor
// → paste the Project URL + anon key from Settings → API below.
export const SUPABASE_URL = 'https://atgkbgekwluimgcrvbxr.supabase.co';   // base only — code appends /rest/v1 etc.
export const SUPABASE_ANON_KEY = 'sb_publishable_8urymaEblfUtzG9qGQZE9A_SO-mtAtC';

// PostHog product analytics — which cities get used, where people drop out of the
// search → spot → navigate funnel, and whether anyone comes back. Like the Supabase
// anon key above, the project key is public by design (it can only write events).
//
// Empty = analytics off, and every track() call in analytics.js becomes a no-op, so
// the app runs fine without it. To turn on: posthog.com → new project → pick the
// **US** cloud region (data stays stateside) → paste the Project API Key below.
export const POSTHOG_KEY = 'phc_nCGv4pr8Re2VatSnyJ3NbjsrzGYwgHfL3tQ2Y96HsPS5';
export const POSTHOG_HOST = 'https://us.i.posthog.com'; // match the region you picked
