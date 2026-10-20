# TomTom search rollout

## Status

The TomTom server secret, monthly quota migration, search-pass migration, and
protected function are deployed. The Cloudflare managed widget “Park Daddy search”
is created for parkdaddy.app. Web/mobile verification screens and pass-aware
clients are implemented locally. Client endpoints remain disabled.

The Cloudflare verification secret is saved and the legacy JWT gate is disabled
for place-search, with user approval. SEARCH_TRUSTED_IP_HEADER is cf-connecting-ip.
Two requests carrying forged CF-Connecting-IP values were rejected by the gateway
with HTTP 403 (Cloudflare code 1000). A normal diagnostic request confirmed the
header was present. The temporary diagnostic was removed: it now returns HTTP 400
Invalid operation. Unverified search and an invalid challenge return HTTP 403
verification_required. These checks consumed no TomTom allowance.

The hosted verification page was committed and pushed in d4d5c3f. Client activation
still awaits an end-to-end browser verification and search check.

Earlier live Suggest and Details calls (before adding the new gate) returned
Under the Rose Club, 1024 Main Street, Vancouver, for “Under the Rose Sauna”.
Current local checks pass for server validation, pass reuse and search cancellation.
A rollback-only live database check passed for missing/expired passes, wrong-IP
passes, the per-minute limit, pass-issuance limits, and private RPC/table access.
No mobile build or activated website search release has been published.

## Flow

Both clients use Places Search v3 Suggest, biased toward the map center without a
country filter. Choosing a suggestion fetches Details to obtain its coordinates.
Submitting a business name uses the same Suggest → Details flow. This is deliberate:
in the live API Explorer trial, “Under the Rose Sauna” resolved through Suggest,
while Discover returned no results for that exact query.

The shared `place-search.js` client is copied to `../park-daddy-mobile/`.
`test-tomtom.mjs` checks that the copies match. Suggestions are debounced and
superseded requests cancelled. Provider categories are not displayed.
TomTom recent destinations are kept in memory for the current session, with no
provider coordinates written to persistent storage. Existing saved destinations
continue to work. Persistent TomTom history should be added only after confirming
the account's storage terms.

## Backend installation and remaining activation steps

Use Park's existing Supabase project `atgkbgekwluimgcrvbxr`, already configured for
community reports in `config.js`.

1. Confirm Supabase and TomTom account plans and current usage support the user's
   no-payment requirement. Do not add a payment method or enable paid overages.
2. Apply `supabase/migrations/202610200001_place_search_budget.sql`.
3. Store the existing TomTom API key as the **server secret** `TOMTOM_API_KEY`.
   Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to its function
   runtime. Neither secret belongs in a client bundle or repository.
4. Deploy `supabase/functions/place-search/index.ts` as `place-search`, with JWT
   verification disabled for public search. This function does not access user
   records. It validates requests and reserves an allowance before each API call.
5. Configure `SEARCH_ALLOWED_ORIGINS` with the exact production/preview origins
   required, comma separated. Defaults: `https://parkdaddy.app` and
   `https://www.parkdaddy.app`. Native requests without an Origin are supported.
   CORS is not an authentication or abuse-prevention boundary.
6. Verify the deployed function with the real account: Suggest and Details for
   Under the Rose Sauna, a street address, a city outside coverage, and an empty
   result. Verify the budget RPC denies over-cap requests in an isolated test
   transaction. Confirm response attributes work with the live API.
7. Set `PLACE_SEARCH_URL` in both clients' `search-config.js` files to
   `https://atgkbgekwluimgcrvbxr.supabase.co/functions/v1/place-search`.
   Increment the web import cache version if the config was previously published.
8. Review and publish the web changes and build/release the mobile app through its
   existing workflow. Recheck business search on both released clients.

## Free allowance protection

The database atomically reserves at most **9,000 Suggest** and **4,500 Details**
requests per UTC calendar month, combined across both apps. Failed calls still
consume a reservation. Database errors stop search. No automatic retry or paid
fallback is used. Aggregate counters contain no queries or user identifiers.

TomTom currently lists 10,000 Suggest and 5,000 Details free requests monthly:
[official pricing](https://docs.tomtom.com/pricing).
The app cap leaves headroom, but it cannot account for requests made outside this
function, other projects sharing an account allowance, plan changes, or hosting
charges. Confirm the account's billing cycle before activation. Keep the account
on its no-payment plan. Public callers can consume the shared allowance; reaching
the cap temporarily disables search with an explanatory error.

Rollback: empty both client endpoints (and republish/rebuild). This returns search
to the existing Photon/Nominatim setup without deleting the server budget table.

## Local checks

From `park-daddy-mobile`: `npm run typecheck`, `npm test`.
The TomTom suite uses synthetic responses and exercises the actual proxy handler,
including quota denial and database failures. It does not validate a deployed
database, real credentials, or a released app.

API references: [Suggest](https://docs.tomtom.com/places-search-api/documentation/places-search/suggest)
and [Details](https://docs.tomtom.com/places-search-api/documentation/places-search/details).

## Bot protection and limits

- Server verifies Turnstile success, exact allowed hostname, and `park-search` action.
- Opaque 256-bit passes expire after 10 minutes; the database stores their hashes.
- A pass is bound to a daily keyed IP digest and allows at most 100 requests.
- IP limits: 30 searches/minute and 250/day, across all passes and both clients.
- Verification attempts: 3/minute and 20/day per IP, including failed challenges.
- Existing monthly Suggest/Details caps still apply. No retries bypass a limit.
- Shared networks share an IP limit. Moving networks requires a fresh pass.
- Expired passes and counters older than two days are cleaned on subsequent calls.
- No signup is required. Distributed bots and challenge-solving services can still
  consume allowance; these controls reduce abuse and do not guarantee zero misuse.

### Remaining deployment settings and checks

1. `TURNSTILE_SECRET_KEY` is saved in Supabase (completed with approval).
   `SEARCH_TRUSTED_IP_HEADER=cf-connecting-ip` is configured after the gateway check.
2. Validate the managed gateway's IP header with spoofed-header requests before
   setting `SEARCH_TRUSTED_IP_HEADER` to `cf-connecting-ip` or `x-forwarded-for`.
   Never configure a header that callers can override. If the gateway cannot
   guarantee this, use a trusted proxy that authenticates the forwarded IP.
3. `TURNSTILE_HOSTNAMES` defaults to parkdaddy.app and www.parkdaddy.app.
4. Publish search-verify.html, search-verify.js, search-config.js, and the web client.
   Native verification uses the hosted page in react-native-webview 13.16.0;
   rebuild the native app to include the dependency.
5. Confirm bot verification and successful search end to end on web and mobile,
   plus rejection of missing/replayed challenge tokens, forged passes, expiry,
   and IP-header spoof attempts. Only then enable public clients.

The new database check is in `supabase/tests/search-passes.sql`. Its transaction
rolls back all test rows and quota reservations; it sends no requests to TomTom.

### Latest verification

Web syntax, mobile type checking, and targeted TomTom and web search suites pass.
Earlier external merge conflicts are resolved. The hosted verification page was
pushed separately from concurrent parking edits. Full client activation and mobile
release remain pending end-to-end verification.

## Activation

The live browser preview successfully resolved Under the Rose Sauna to Under the
Rose Club at 1024 Main Street after Turnstile verification. Both client configs
now point to the protected endpoint. The web integration is being published;
mobile requires a new native build and release before installed apps use it.

## Popup rollback

User rejected the verification dialog. Both client endpoints are disabled again,
restoring Photon/Nominatim search. The backend protections remain intact. Do not
reactivate TomTom with a visible verification prompt.
