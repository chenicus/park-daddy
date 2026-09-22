#!/usr/bin/env python3
# Derive free-parking blocks from enforcement data (no free-parking dataset exists).
# Bylaw 2849: unsigned residential/commercial streets are FREE with a 3h limit (8am-6pm).
# Historical tickets are only block-level evidence, not verified curb rules.
# Exclude permit-ticket blocks and manually reviewed unreliable estimates.
# Output: data/free.json.
import json, urllib.parse, urllib.request, collections
from pathlib import Path

BASE = "https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets"
UA = {"User-Agent": "van-parking/1.0 (hey.cchen@gmail.com)"}
TICKETS = "parking-tickets-2020-2025"

def export(dataset, select, where=None):
    q = {"select": select}
    if where:
        q["where"] = where
    url = f"{BASE}/{dataset}/exports/json?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)

# tickets and street geometry abbreviate street-types differently (AVE vs AV, RD vs
# ROAD) — collapse the trailing type token to one canonical form on both sides.
SUF = {
    "AVE": "AV", "AVENUE": "AV", "AV": "AV", "STREET": "ST", "ST": "ST",
    "ROAD": "RD", "RD": "RD", "DRIVE": "DR", "DR": "DR", "BOULEVARD": "BLVD",
    "BLVD": "BLVD", "CRESCENT": "CR", "CRES": "CR", "CR": "CR", "PLACE": "PL",
    "PL": "PL", "NORTH": "N", "N": "N", "SOUTH": "S", "S": "S",
    "PARKWAY": "PKWY", "PKWY": "PKWY",
}

def canon(hb):
    p = hb.strip().upper().split()
    if p:
        p[-1] = SUF.get(p[-1], p[-1])
    return " ".join(p)

def norm(block, street):
    return canon(f"{int(block)} {street}")

print("1/3  street geometry (public-streets)…")
geo = {}
for s in export("public-streets", "hblock,geo_point_2d"):
    hb, gp = s.get("hblock"), s.get("geo_point_2d")
    if hb and gp:
        geo[canon(hb)] = (gp["lat"], gp["lon"])
print(f"     {len(geo)} segments")

print("2/3  free-3h tickets…")
freec = collections.Counter()
for t in export(TICKETS, "block,street", where='infractiontext like "MORE THAN 3 HRS"'):
    if t.get("block") is not None and t.get("street"):
        freec[norm(t["block"], t["street"])] += 1
print(f"     {sum(freec.values())} tickets across {len(freec)} blocks")

print("3/3  permit-zone tickets (exclusion)…")
permit = set()
for t in export(TICKETS, "block,street", where='infractiontext like "FAIL TO DISPLAY THE PERMIT"'):
    if t.get("block") is not None and t.get("street"):
        permit.add(norm(t["block"], t["street"]))
print(f"     {len(permit)} permit blocks excluded")

excluded = {canon(r['h']) for r in json.loads((Path(__file__).parent /
    'data/sources/inferred-free-exclusions.json').read_text())['records']}
kit_ring = json.loads((Path(__file__).parent /
    'data/sources/kitsilano-local-area-boundary.json').read_text())['ring']

def inside_kitsilano(lon, lat):
    # Internal review filter only. The City local-area boundary is not a
    # residential permit zone and is never rendered on the parking map.
    hit = False
    for i, b in enumerate(kit_ring):
        a = kit_ring[i - 1]
        if (a[1] > lat) != (b[1] > lat) and lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]:
            hit = not hit
    return hit

out, unmatched = [], 0
for hb, n in freec.items():
    if hb in permit or hb in excluded:
        continue
    g = geo.get(hb)
    if not g:
        unmatched += 1
        continue
    if inside_kitsilano(g[1], g[0]):
        continue  # side-less ticket evidence cannot define a Kits curb rule
    out.append({"h": hb.title(), "lat": round(g[0], 6), "lon": round(g[1], 6), "n": n})

out.sort(key=lambda x: -x["n"])
json.dump(out, open("data/free.json", "w"), separators=(",", ":"))
print(f"\nWrote {len(out)} free blocks → data/free.json  ({unmatched} had no geometry match)")
