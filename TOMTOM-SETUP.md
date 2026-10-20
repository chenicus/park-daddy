# Current search configuration

TomTom is enabled without browser challenges or search passes. Server-only keys,
validated gateway IPs, daily keyed IP digests, 30 searches/minute and 250/day per IP,
and atomic monthly caps (9000 Suggest, 4500 Details) remain. Database failures
stop search. Distributed automated traffic can still exhaust the shared allowance.

Apply migrations in order, including 202610200003_search_without_challenge.sql.
The final migration supersedes pass validation in guard_place_search. Its RPC
remains service-role-only. The old pass tables and Turnstile widget are unused.

The web and mobile clients call suggest/details directly. No verification UI is
invoked. Mobile changes require a new build/release to reach installed apps.
