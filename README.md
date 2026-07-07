# 🚗 Park Daddy

Find street parking rates across Vancouver. Finds the cheapest street-meter parking near a
destination, ranked by price then walk distance, with "free after 10 PM" detection.
Zero build — plain HTML + Leaflet + vanilla JS.

Live: https://chenicus.github.io/park-daddy/

## Run
```
python3 -m http.server 3450 --directory Parking   # from ~/Projects
```
Then open http://localhost:3450  (or use the `parking` preview config).

## How it works
- **Data:** City of Vancouver open data — per-meter rates, time limits, rush-hours, geo.
  3,758 meters cached in `data/meters.json`. Refresh weekly with `./refresh.sh`.
- **Enforcement:** meters run 9am–10pm (two rate windows). Free 10pm–9am, so evening
  stays get a "free after 10 PM" tag and only the pre-10pm portion is charged.
- **Scoring** (`rank.js`): filters to in-service, any-vehicle meters within the walk
  radius (walk ≈ 80 m/min); excludes rush-hour tow-away conflicts; costs the stay across
  rate windows; uses the flat-rate option when cheaper; flags over-time-limit spots and
  sinks them. Sort = free → cheapest → closest.
- **Navigation:** each spot has a Google Maps deep link
  (`google.com/maps/dir/?api=1&destination=lat,lng`) that opens turn-by-turn driving.
- **Geocoding:** Nominatim (OSM). Handles addresses, place names, streets. Intersections
  ("A & B") fall back to the first street — Nominatim can't resolve cross-streets.

## Not included (v1)
- Parkades (dataset is street meters only — which is the preferred option anyway).
- Genuinely-free unmetered residential zones (not reliably in open data).
- Swap OSM tiles → Google Maps tiles later by adding a Maps JS API key.
