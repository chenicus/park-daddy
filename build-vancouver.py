#!/usr/bin/env python3
# PROTOTYPE: synthesize Vancouver blockface LINES from point-per-meter data, so
# Vancouver can render like Seattle instead of as 3,700 pins.
#
# Vancouver's open data gives one Point per meter with NO street name and NO block id
# (direction is null on ~53% of meters), so we can't group by address. We reconstruct
# blockfaces purely from geometry: union meters that are close AND share a rate, order
# each cluster along its principal axis, and draw a polyline. Same-rate linking keeps
# every line rate-homogeneous (a rate change naturally breaks the line) and stops two
# differently-priced curbs from fusing.
#
# This writes a geojson for eyeballing + prints quality metrics. It does NOT touch
# production data — it's a proof of concept to judge how clean the lines come out.
import json, math, collections

SRC = "data/meters.json"
OUT_GEOJSON = "data/vancouver-lines-preview.geojson"

LINK_M = 32.0        # link two same-rate meters within this many metres
MAX_DEV_M = 14.0     # a cluster whose points deviate more than this from its fitted
                     # axis is "bent" — likely a corner or two parallel streets merged
LAT0 = 49.26
MLAT = 111320.0
MLON = 111320.0 * math.cos(math.radians(LAT0))


def rate_num(s):
    if not s:
        return None
    try:
        return round(float(s.replace("$", "").strip()), 2)
    except ValueError:
        return None


def load():
    d = json.load(open(SRC))
    pts = []
    for x in d:
        if x.get("service_status") != "In Service":
            continue
        gp = x.get("geo_point_2d")
        if not gp:
            continue
        r = rate_num(x.get("rate_9am_6pm"))
        pts.append({
            "lon": gp["lon"], "lat": gp["lat"],
            "x": gp["lon"] * MLON, "y": gp["lat"] * MLAT,
            "rate": r,
            "load": x.get("prohibition_1_zone") == "LOADING ZONE",
        })
    return pts


class UF:
    def __init__(self, n): self.p = list(range(n))
    def find(self, a):
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]; a = self.p[a]
        return a
    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb: self.p[ra] = rb


def cluster(pts):
    # grid bucket by LINK_M so each meter only compares against nearby ones
    cell = LINK_M
    grid = collections.defaultdict(list)
    for i, p in enumerate(pts):
        grid[(int(p["x"] // cell), int(p["y"] // cell))].append(i)
    uf = UF(len(pts))
    for i, p in enumerate(pts):
        cx, cy = int(p["x"] // cell), int(p["y"] // cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grid.get((cx + dx, cy + dy), ()):
                    if j <= i:
                        continue
                    q = pts[j]
                    if p["rate"] != q["rate"]:          # same-rate link only
                        continue
                    if (p["x"] - q["x"]) ** 2 + (p["y"] - q["y"]) ** 2 <= LINK_M ** 2:
                        uf.union(i, j)
    comps = collections.defaultdict(list)
    for i in range(len(pts)):
        comps[uf.find(i)].append(i)
    return list(comps.values())


def order_and_fit(members, pts):
    """Project cluster onto its principal axis, order along it. Return ordered
    [lon,lat] polyline, length(m), and max perpendicular deviation(m)."""
    xs = [pts[i]["x"] for i in members]
    ys = [pts[i]["y"] for i in members]
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    # principal axis via 2x2 covariance eigenvector
    sxx = sum((x - cx) ** 2 for x in xs)
    syy = sum((y - cy) ** 2 for y in ys)
    sxy = sum((x - cx) * (y - cy) for x, y in zip(xs, ys))
    theta = 0.5 * math.atan2(2 * sxy, sxx - syy)
    ux, uy = math.cos(theta), math.sin(theta)     # axis direction
    order = sorted(members, key=lambda i: (pts[i]["x"] - cx) * ux + (pts[i]["y"] - cy) * uy)
    dev = max(abs(-(pts[i]["x"] - cx) * uy + (pts[i]["y"] - cy) * ux) for i in members)
    line = [[round(pts[i]["lon"], 6), round(pts[i]["lat"], 6)] for i in order]
    length = sum(math.dist((pts[a]["x"], pts[a]["y"]), (pts[b]["x"], pts[b]["y"]))
                 for a, b in zip(order, order[1:]))
    return line, length, dev


def main():
    pts = load()
    comps = cluster(pts)
    lines = [c for c in comps if len(c) >= 2]
    singles = [c for c in comps if len(c) == 1]

    feats, sizes, devs, bent, load_mixed = [], [], [], 0, 0
    for c in lines:
        line, length, dev = order_and_fit(c, pts)
        sizes.append(len(c)); devs.append(dev)
        if dev > MAX_DEV_M:
            bent += 1
        loads = [pts[i]["load"] for i in c]
        if any(loads) and not all(loads):
            load_mixed += 1
        feats.append({
            "type": "Feature",
            "properties": {"meters": len(c), "rate": pts[c[0]]["rate"],
                           "len_m": round(length), "dev_m": round(dev, 1),
                           "bent": dev > MAX_DEV_M},
            "geometry": {"type": "LineString", "coordinates": line},
        })
    # keep singletons visible as points in the preview
    for c in singles:
        p = pts[c[0]]
        feats.append({
            "type": "Feature",
            "properties": {"meters": 1, "rate": p["rate"], "single": True},
            "geometry": {"type": "Point", "coordinates": [round(p["lon"], 6), round(p["lat"], 6)]},
        })

    json.dump({"type": "FeatureCollection", "features": feats},
              open(OUT_GEOJSON, "w"), separators=(",", ":"))

    n = len(pts)
    in_lines = sum(sizes)
    print(f"meters (in service):        {n}")
    print(f"blockface lines (>=2):      {len(lines)}")
    print(f"  meters absorbed:          {in_lines}  ({100*in_lines/n:.0f}%)")
    print(f"  leftover singletons:      {len(singles)}  ({100*len(singles)/n:.0f}%)")
    if sizes:
        sizes.sort()
        print(f"  meters/line  min/med/max: {sizes[0]} / {sizes[len(sizes)//2]} / {sizes[-1]}")
        print(f"  median line length:       {sorted(round(f['properties']['len_m']) for f in feats if f['geometry']['type']=='LineString')[len(lines)//2]} m")
    print(f"  'bent' lines (dev>{MAX_DEV_M:.0f}m):   {bent}  ({100*bent/max(len(lines),1):.0f}%)  <- likely corner/parallel-street merges")
    print(f"  lines mixing loading+normal: {load_mixed}")
    print(f"\npreview -> {OUT_GEOJSON}")


if __name__ == "__main__":
    main()
