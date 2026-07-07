#!/usr/bin/env python3
# Derive free-parking blocks from enforcement data (no free-parking dataset exists).
# Bylaw 2849: unsigned residential/commercial streets are FREE with a 3h limit (8am-6pm).
# A "MORE THAN 3 HRS" ticket is ground-truth proof a block is free-3h (you can't get one
# on a metered or permit-only street). We join those blocks to street geometry and drop
# any block that also shows permit-zone tickets. Output: data/free.json.
import json, urllib.parse, urllib.request, collections

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

out, unmatched = [], 0
for hb, n in freec.items():
    if hb in permit:
        continue
    g = geo.get(hb)
    if not g:
        unmatched += 1
        continue
    out.append({"h": hb.title(), "lat": round(g[0], 6), "lon": round(g[1], 6), "n": n})

out.sort(key=lambda x: -x["n"])
json.dump(out, open("data/free.json", "w"), separators=(",", ":"))
print(f"\nWrote {len(out)} free blocks → data/free.json  ({unmatched} had no geometry match)")
