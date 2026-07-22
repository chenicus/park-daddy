<div align="center">

# 🚗 Park Daddy

**Live street-parking rates for Vancouver, Seattle, San Francisco, San Jose & Kirkland — see prices update as you drive, and (in Kirkland) which stalls are free right now.**

[**▶ Live app — parkdaddy.app**](https://parkdaddy.app/)

![Zero build](https://img.shields.io/badge/build-none-brightgreen)
![Vanilla JS](https://img.shields.io/badge/js-vanilla%20ES%20modules-f7df1e)
![Data](https://img.shields.io/badge/data-5%20cities%20open%20data-blue)
![Hosting](https://img.shields.io/badge/hosting-GitHub%20Pages-181717)

</div>

---

## ✨ Features

| | |
|---|---|
| 🧭 **Drive mode** | Follow-me map showing each block's parking rate as you drive past it. Defaults on. |
| 🅿️ **Up-to-date meter data** | Every metered block across five cities, refreshable per city. |
| 🟢 **Live availability (Kirkland)** | Stall sensors show which spots are free vs. taken right now, straight from the city's live feed. |
| 🗺️ **Turn-by-turn to a spot** | Pick a spot, hand off to in-app navigation (Valhalla) or deep-link out to Google Maps. |
| 🚫 **No-park awareness** | Loading zones, no-stopping and permit-only windows hide the spot while active and show in its schedule. |
| ⚠️ **Crowd-sourced spot reports** | Drivers flag wrong spots (sign changed, permit-only, etc.); 1 report warns the pill, 3 hide it. |

---

## 🛠️ Tools & APIs

| Layer | What we use | For |
|---|---|---|
| **Map** | [MapLibre GL 4.7](https://maplibre.org/) + [CARTO vector styles](https://carto.com/basemaps/) | Rotatable vector map + light/dark styles (CDN). |
| **Parking data** | Open data from [Vancouver](https://opendata.vancouver.ca/), [Seattle](https://data.seattle.gov/), [San Francisco](https://datasf.org/), San Jose & Kirkland | Meter rates, limits, rush-hours, prohibition zones, geo. |
| **Live sensors** | [Kirkland parking-sensor feed (ArcGIS)](https://services2.arcgis.com/) | Real-time vacant/occupied status per stall, polled live. |
| **Routing** | [Valhalla](https://valhalla1.openstreetmap.de/) (public OSM server) | Drive-mode route geometry + maneuvers. |
| **Geocoding** | [Nominatim (OpenStreetMap)](https://nominatim.org/) | Address / place / street search + autocomplete. |
| **Fallback nav** | [Google Maps deep links](https://developers.google.com/maps/documentation/urls/get-started) | Hand off to native turn-by-turn. |
| **Backend** | [Supabase](https://supabase.com/) (Postgres + Storage, via REST from plain `fetch`) | Stores crowd reports + sign photos; RLS-guarded, no SDK. |
| **Analytics** | [PostHog](https://posthog.com/) | Anonymous product analytics. |
| **Browser APIs** | Geolocation, Wake Lock | Follow-me GPS, keep-screen-awake. |
| **Hosting** | GitHub Pages (static frontend) + Supabase (data) | Zero-build static site talking to a hosted backend. |

> **Stack:** plain HTML + vanilla ES modules. No framework, no bundler, no build step.

---

## 📍 Coverage

Park Daddy is multi-city: the "current city" is simply whichever city's bounds contain the map
center, so the map auto-loads the city you're in or pan to. Cities are declared in one registry
([`cities.js`](cities.js)) that every list in the app — the first-run picker, the menu, the
coverage sentence — is built from.

| City | Data shape | Notes |
|---|---|---|
| **Vancouver** 🇨🇦 | Point meters + free blocks | Only city with walk-cost spot suggestions (rich rate feed). |
| **Seattle** 🇺🇸 | Paid blockface lines | Demand-responsive rates. |
| **San Francisco** 🇺🇸 | Point meters, time-of-day bands | Both metered dots and free-block lines. |
| **San Jose** 🇺🇸 | Flat-rate point meters | Search-only (compact downtown); not in the pick-a-city list. |
| **Kirkland** 🇺🇸 | Point stalls + **live sensors** | Search-only; the one city showing real-time availability. |

San Jose and Kirkland are fully supported — search resolves there, the map draws them, the menu
lists them as covered — they're just small downtowns you'd be standing in, not destinations you'd
pick from a list, so they're kept out of the first-run picker only.

Coverage is gated by open data, not ambition. Cities that run metered parking on a closed
platform (e.g. PayByPhone, with no equivalent open dataset) would require scraping rather than
a clean data download, so they're out of scope for now. Around Vancouver that rules out
neighbours like **Burnaby**, **New Westminster** and **North Vancouver**, whose portals expose
parks and streets but not meter rates or locations.
