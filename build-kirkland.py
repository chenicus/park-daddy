#!/usr/bin/env python3
# Build Kirkland's downtown parking layer from the city's live stall-sensor feed.
#
# Kirkland is UNIQUE among Park Daddy cities: every record is a single PHYSICAL STALL fitted
# with an in-ground occupancy sensor (the city runs it as a public "Real-Time Parking
# Availability" pilot). 531 stalls across downtown streets + waterfront lots, each carrying a
# time limit, a paid/free flag, and a live occupied/vacant status.
#
# Shape-wise it's closest to San Jose: POINT stalls priced by bands (drawn as dots). But most
# stalls here are FREE-but-time-limited (PAY=null) with a paid minority (PAY=1). We cluster
# stalls into curb faces per zone (like build-sf/sanjose) and emit paid faces with a rate band,
# free faces with empty bands + a time limit.
#
# NOTE ON LIVE STATUS: the feed's headline feature is real-time `status` (occupied/vacant),
# which a static JSON build necessarily FREEZES. We deliberately DROP it here and bake only the
# stable attributes (geometry / type / limit / paid). If we want real-time vacancy in the app,
# that must be a client-side fetch of the service below, not this snapshot. See the summary in
# chat for that fork.
#
# Source: City of Kirkland "Kirkland_Parking_Sensors__wStatus" (ArcGIS FeatureServer, no key).
#   Service: https://services2.arcgis.com/loGMwowmR0OPlOQb/arcgis/rest/services/Kirkland_Parking_Sensors__wStatus/FeatureServer/0
#   Map:     https://www.kirklandwa.gov/.../Downtown-Parking-Information/Real-Time-Parking-Availability-Map
# Rate/hours model (city Downtown Parking page — NOT in the feed, baked in here):
#   • Paid stalls (PAY=1): $1.00/hr, enforced 8am–8pm Mon–Sat, free Sundays + holidays.
#   • Free stalls: no charge, but a posted time limit (DURATION) — 15/30 min, 1/2/4 hr.
#   • Downtown lots also give 3 free hours 9am–5pm M–F; that promo overlaps paid hours in a way
#     the feed can't distinguish per-stall, so we don't model it (would be a guess).
import json, math, urllib.parse, urllib.request
from collections import Counter

BASE = ("https://services2.arcgis.com/loGMwowmR0OPlOQb/arcgis/rest/services"
        "/Kirkland_Parking_Sensors__wStatus/FeatureServer/0/query")
UA = {"User-Agent": "park-daddy/1.0 (hey.cchen@gmail.com)"}
PAGE = 1000

OPEN, CLOSE = 480, 1200    # 8:00am–8:00pm paid-enforcement window (minutes from midnight)
PAID_RATE = 1.00           # flat $1/hr on paid stalls (city Downtown Parking page)
CLUSTER_M = 40             # greedy curb-face clustering radius (stalls are ~5m apart in a face)

# DURATION coded-value domain (TRN_DURATION) -> minutes. 5='Other', 6='Unspecified' -> no limit.
DUR_MIN = {1: 30, 2: 60, 3: 120, 4: 240, 7: 15}

# STALL_TYPE we treat as general public parking. Loading Zone / Permit are excluded (not
# available to a visitor); ADA / EV are kept but tagged so the app can style/caveat them.
PARKABLE = {"Regulated Parking", "Regulated Parking Short Term", "ADA", "EV"}
SPECIAL = {"ADA": "ada", "EV": "ev"}

FIELDS = "ZoneName,STALL_TYPE,DURATION,PAY,In_Service,stall_name"


def fetch_all():
    """In-service stalls only. outSR=4326 so the service reprojects WA State Plane (EPSG:2285)
    to lat/lon for us — no local pyproj needed."""
    feats, off = [], 0
    while True:
        q = {"where": "In_Service=1", "outFields": FIELDS, "outSR": "4326",
             "returnGeometry": "true", "f": "json",
             "resultOffset": off, "resultRecordCount": PAGE}
        url = BASE + "?" + urllib.parse.urlencode(q)
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=120) as r:
            page = json.load(r)
        f = page.get("features", [])
        feats.extend(f)
        print(f"  fetched {len(feats)} …")
        if len(f) < PAGE:
            break
        off += PAGE
    return feats


def haversine(a, b):
    R, rad = 6371000, math.pi / 180
    dlat, dlon = (b[0] - a[0]) * rad, (b[1] - a[1]) * rad
    h = math.sin(dlat / 2) ** 2 + math.cos(a[0] * rad) * math.cos(b[0] * rad) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def cluster(pts):
    """Greedy curb-face clustering (same as build-sf/sanjose): each unused stall seeds a group
    grabbing every other stall within CLUSTER_M. Returns lists of original indices."""
    used = [False] * len(pts)
    groups = []
    for i in range(len(pts)):
        if used[i]:
            continue
        used[i] = True
        grp = [i]
        for j in range(i + 1, len(pts)):
            if not used[j] and haversine(pts[i], pts[j]) <= CLUSTER_M:
                used[j] = True
                grp.append(j)
        groups.append(grp)
    return groups


def build():
    print("Fetching Kirkland stalls (ArcGIS live sensor feed)…")
    rows = fetch_all()
    stalls = []
    kinds = Counter()
    for feat in rows:
        a = feat.get("attributes", {})
        g = feat.get("geometry") or {}
        kinds[a.get("STALL_TYPE")] += 1
        if a.get("STALL_TYPE") not in PARKABLE:
            continue
        try:
            lon, lat = float(g["x"]), float(g["y"])
        except (KeyError, ValueError, TypeError):
            continue
        stalls.append({
            "lat": lat, "lon": lon,
            "name": a.get("stall_name"),     # join key for the live status poll (app.js)
            "zone": a.get("ZoneName"),
            "paid": a.get("PAY") == 1,
            "limit": DUR_MIN.get(a.get("DURATION")),
            "special": SPECIAL.get(a.get("STALL_TYPE")),
        })
    print(f"  {len(stalls)} parkable stalls  (all types: {dict(kinds)})")

    # Cluster WITHIN a zone so a Central Way face never merges with an adjacent lot's face.
    by_zone = {}
    for s in stalls:
        by_zone.setdefault(s["zone"], []).append(s)

    out = []
    for zone, group in by_zone.items():
        pts = [[s["lat"], s["lon"]] for s in group]
        for grp in cluster(pts):
            g = [group[i] for i in grp]
            c = [round(sum(s["lat"] for s in g) / len(g), 6),
                 round(sum(s["lon"] for s in g) / len(g), 6)]
            paid = Counter(s["paid"] for s in g).most_common(1)[0][0]
            limits = [s["limit"] for s in g if s["limit"]]
            limit = Counter(limits).most_common(1)[0][0] if limits else None
            band = [{"r": PAID_RATE, "s": OPEN, "e": CLOSE}] if paid else []
            out.append({
                "h": zone,
                "lat": c[0], "lon": c[1],
                # per-stall {name, lat, lon}: drawn as dots AND joined to the live sensor
                # feed by `n` so the app can colour each stall vacant/occupied in real time.
                "stalls": [{"n": s["name"], "lat": round(s["lat"], 6), "lon": round(s["lon"], 6)} for s in g],
                "spaces": len(g),
                "limit": limit,
                "paid": paid,
                "wkd": band,
                "sat": band,     # paid enforcement runs Mon–Sat
                "sun": [],       # free Sundays + holidays
            })

    out.sort(key=lambda x: -x["spaces"])
    json.dump(out, open("data/kirkland-meters.json", "w"), separators=(",", ":"))
    n_paid = sum(1 for x in out if x["paid"])
    print(f"\nWrote {len(out)} curb faces ({n_paid} paid, {len(out) - n_paid} free) "
          f"-> data/kirkland-meters.json  ({sum(len(x['stalls']) for x in out)} stalls)")


if __name__ == "__main__":
    build()
