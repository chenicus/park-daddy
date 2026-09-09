#!/usr/bin/env python3
# Build the Vancouver ticket-history layer: how heavily each block gets enforced.
#
# The ticket feed has NO coordinates — every citation is filed against a block number
# and a street name ("500 ABBOTT ST"). public-streets carries the matching `hblock` on
# real centreline geometry, so the join is block+street -> polyline. That lands 97.5%
# of citations on a line; the rest are streets renamed after the ticket was written
# (Trutch -> Musqueamview) or new River District curbs the street file hasn't got yet.
#
# Colour is DENSITY (tickets/yr per 100 m), not the raw count: Vancouver blocks run
# 100 m to 300 m, so a raw count just redraws the block-length map. The count is what
# the card shows, because "this block gets 2,600 tickets a year" is the sentence a
# driver actually understands.
#
# Output: data/vancouver-tickets.json
import json, urllib.parse, urllib.request, collections, math, datetime

BASE = "https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets"
UA = {"User-Agent": "van-parking/1.0 (hey.cchen@gmail.com)"}

HIST = "parking-tickets-2020-2025"   # closed years
LIVE = "parking-tickets"             # current year, partial
YEARS = ["2023", "2024", "2025"]     # full years only — a partial year would dilute the rate

# Only the two parking bylaws. 2849 = Street and Traffic, 2952 = Parking Meter; together
# 99.5% of the feed. The remainder is lawn-watering and other non-parking bylaws that
# happen to be issued by the same officers.
BYLAWS = (2849, 2952)

# A block is "quiet" below this and not worth drawing — half the city sits here, and
# painting 2 tickets a year the same as 2,000 would bury the signal.
MIN_PER_YEAR = 1.0

LAT0 = 49.26
MLAT = 111320.0
MLON = 111320.0 * math.cos(math.radians(LAT0))

# Density breaks, tickets/yr per 100 m of curb — a LOG scale, ×4 a step.
#
# The first cut of this was linear-ish (5/25/100/300) off the citywide spread, and it
# failed at both ends at once: half the city fell into band 0, while 58% of DOWNTOWN
# piled into the top two bands. Downtown is where you actually park, so the map went
# flat exactly where it needed to discriminate. Density is long-tailed (p50≈4, p90≈82,
# p99≈508, max 9820) and a long tail wants log steps. These put downtown at roughly
# 12/14/34/33/7 across the five bands instead of pinning at the top.
BREAKS = [10, 40, 160, 640]
BAND_LABEL = ["Rarely ticketed", "Some tickets", "Ticketed often",
              "Heavily ticketed", "Ticket magnet"]

# ---- when a rule is in force ------------------------------------------------
# The citation feed has NO time of day — `entrydate` is a bare date in all five ticket
# datasets, back to 2010 — so "what hour do they ticket" is not answerable from it, and
# officer shift rosters aren't published anywhere. What IS knowable: a ticket can only be
# written while the rule it cites is in force. An expired meter is impossible at 3am.
#
# So each block carries the window of its DOMINANT infraction, as minutes from midnight.
# (-1, -1) = in force around the clock. (None) = depends on a posted sign we can't read,
# which the UI says out loud rather than guessing. These are the bylaw-wide constants —
# several bylaws name their own hours in the offence text, which is where the exact
# numbers below come from.
ALWAYS = (-1, -1)
METER_HOURS = (540, 1320)        # 9am-10pm, the city-wide metered day (see rank.js)
DAYTIME_3H = (480, 1080)         # 8am-6pm — named verbatim in the 3-hour-limit bylaw
OVERNIGHT = (1320, 360)          # 10pm-6am — named verbatim in the large-vehicle bylaw
SIGN = None                      # posted sign; unknowable from the feed

WINDOW = {
    "Meter time ran out": METER_HOURS,
    "Meter never paid": METER_HOURS,
    "Stayed past the posted limit": METER_HOURS,
    "Over the 3-hour limit": DAYTIME_3H,
    "Parked in a rush-hour lane": SIGN,       # per-sign; varies block to block
    "Parked in a no-stopping zone": SIGN,
    "Ignored a posted restriction": SIGN,
    "Parked where signs say no parking": SIGN,
    "Parked in a reserved space": SIGN,
    "Parked in a loading zone": SIGN,
    "Blocked a commercial lane": SIGN,
    "Large vehicle where it's not allowed": OVERNIGHT,
    "Left too long — treated as derelict": ALWAYS,
    "Too close to the corner": ALWAYS,
    "Blocked a driveway or crossing": ALWAYS,
    "Parked too far from the curb": ALWAYS,
    "Parked facing the wrong way": ALWAYS,
    "Parked in a bus stop": ALWAYS,
    "Too close to a stop sign": ALWAYS,
    "Parked in a passenger zone": SIGN,
    "Parked in a tour-bus zone": SIGN,
    "Too close to a hydrant": ALWAYS,
    "Parked in an accessible space": ALWAYS,
    "Blocked a lane entrance": ALWAYS,
    "Blocked a lane": ALWAYS,
    "Too close to a crosswalk": ALWAYS,
    "Parked on the boulevard": ALWAYS,
}

# A day-of-week or month profile is only worth showing when it actually leans. Measured as
# the busiest slot over the block's own average: a flat block scores 1.0, Canada Place's
# cruise-season August scores 2.3. Below the threshold it's noise dressed as a finding, and
# drawing a near-flat bar chart claims precision the sample doesn't support.
LEAN = 1.4
MIN_FOR_PROFILE = 60             # too few tickets and the ratio is just small numbers


def export(dataset, select, where=None, group_by=None):
    q = {"select": select}
    if where:
        q["where"] = where
    if group_by:
        q["group_by"] = group_by
    url = f"{dataset and BASE}/{dataset}/exports/json?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


# ---- street-name canonicalisation ------------------------------------------
# Same idea as build-free.py (tickets say AVE, the street file says AV) — extended
# with the suffixes that only show up once you join the whole feed rather than the
# one infraction that script cares about.
SUF = {
    "AVE": "AV", "AVENUE": "AV", "AV": "AV", "STREET": "ST", "ST": "ST",
    "ROAD": "RD", "RD": "RD", "DRIVE": "DR", "DR": "DR", "BOULEVARD": "BLVD",
    "BLVD": "BLVD", "CRESCENT": "CR", "CRES": "CR", "CR": "CR", "PLACE": "PL",
    "PL": "PL", "NORTH": "N", "N": "N", "SOUTH": "S", "S": "S",
    "PARKWAY": "PKWY", "PKWY": "PKWY", "LANE": "LN", "LN": "LN",
    "COURT": "CT", "CT": "CT", "SQUARE": "SQ", "SQ": "SQ",
    "HIGHWAY": "HWY", "HWY": "HWY", "GROVE": "GR", "GR": "GR",
    "WALK": "WK", "WK": "WK", "DIVERSION": "DIVR", "DIVR": "DIVR",
}


def canon(hb):
    p = hb.strip().upper().split()
    # a trailing " P" marks a private road in the ticket feed; public-streets has no
    # such marker, so drop it before matching the street type
    if len(p) > 1 and p[-1] == "P":
        p = p[:-1]
    if p:
        p[-1] = SUF.get(p[-1], p[-1])
    return " ".join(p)


def norm(block, street):
    return canon(f"{int(block)} {street}")


def hblock_keys(hb):
    """'6500-6600 BALSAM ST' covers two block numbers — index it under both."""
    p = hb.strip().upper().split()
    if len(p) < 2 or not p[0].replace("-", "").isdigit():
        return []
    name = canon(" ".join(p[1:]))
    return [f"{int(t)} {name}" for t in p[0].split("-") if t.isdigit()]


def line_len(coords):
    return sum(math.dist((a[0] * MLON, a[1] * MLAT), (b[0] * MLON, b[1] * MLAT))
               for a, b in zip(coords, coords[1:]))


def simplify(coords, tol_m):
    """Douglas-Peucker in local metres. Centrelines are near-straight but the file ships
    them at survey resolution — National Ave alone arrives as 1,448 points. At the zooms
    this layer is visible, a few metres of deviation is invisible and the saving is most
    of the payload."""
    if len(coords) < 3:
        return coords
    pts = [(x * MLON, y * MLAT) for x, y in coords]

    def dp(lo, hi, keep):
        ax, ay = pts[lo]
        bx, by = pts[hi]
        dx, dy = bx - ax, by - ay
        seg = math.hypot(dx, dy)
        worst, wi = -1.0, -1
        for i in range(lo + 1, hi):
            px, py = pts[i]
            if seg == 0:
                dist = math.hypot(px - ax, py - ay)
            else:
                # perpendicular distance to the segment's infinite line
                dist = abs(dy * (px - ax) - dx * (py - ay)) / seg
            if dist > worst:
                worst, wi = dist, i
        if worst > tol_m:
            dp(lo, wi, keep)
            keep.add(wi)
            dp(wi, hi, keep)

    keep = {0, len(pts) - 1}
    dp(0, len(pts) - 1, keep)
    return [coords[i] for i in sorted(keep)]


# Display names. canon() folds every street type onto one token so the join works; this
# puts them back the way a street sign writes them, and un-mangles the ordinals that a
# plain .title() turns into "4Th".
DISPLAY_SUF = {
    "ST": "St", "AV": "Ave", "RD": "Rd", "DR": "Dr", "BLVD": "Blvd", "CR": "Cres",
    "PL": "Place", "PKWY": "Pkwy", "LN": "Lane", "CT": "Court", "SQ": "Square",
    "HWY": "Hwy", "GR": "Grove", "WK": "Walk", "DIVR": "Diversion", "N": "N", "S": "S",
}
ORDINAL = {"ST": "st", "ND": "nd", "RD": "rd", "TH": "th"}


def pretty(key):
    words = key.split()
    out = []
    for i, w in enumerate(words):
        if i == len(words) - 1 and w in DISPLAY_SUF and i > 0:
            out.append(DISPLAY_SUF[w])
        elif w in ("W", "E", "N", "S", "NE", "NW", "SE", "SW"):
            out.append(w)                       # a compass prefix is not a word
        elif len(w) > 2 and w[:-2].isdigit() and w[-2:] in ORDINAL:
            out.append(w[:-2] + ORDINAL[w[-2:]])   # 4TH -> 4th
        elif w.isdigit():
            out.append(w)
        else:
            out.append(w.title())
    return " ".join(out)


# ---- 1. street geometry -----------------------------------------------------
print("1/5  street geometry (public-streets)…")
segs = collections.defaultdict(list)     # key -> [ [[lon,lat],…], … ]
raw = export("public-streets", "hblock,geom")
for s in raw:
    hb, gj = s.get("hblock"), s.get("geom")
    if not hb or not gj:
        continue
    g = gj.get("geometry") or gj
    if g["type"] == "LineString":
        parts = [g["coordinates"]]
    elif g["type"] == "MultiLineString":
        parts = g["coordinates"]
    else:
        continue
    for k in hblock_keys(hb):
        segs[k] += parts
print(f"     {len(raw)} segments → {len(segs)} blocks")

# ---- 2. tickets per block ---------------------------------------------------
print(f"2/5  tickets {YEARS[0]}–{YEARS[-1]}…")
bylaw_f = " or ".join(f"bylaw = {b}" for b in BYLAWS)
counts = collections.Counter()
for y in YEARS:
    rows = export(HIST, "block,street,count(*) as n", group_by="block,street",
                  where=f'year = "{y}" and ({bylaw_f})')
    for r in rows:
        if r.get("block") is not None and r.get("street"):
            counts[norm(r["block"], r["street"])] += r["n"]
    print(f"     {y}: {sum(r['n'] for r in rows):>8,} tickets")
total = sum(counts.values())
print(f"     {total:,} tickets across {len(counts)} blocks")

# ---- 2b. day-of-week and month shape per block ------------------------------
# The only timing the feed genuinely carries. Citywide it's a shrug — Thursday runs 111%
# of the mean and Sunday 86% — but individual blocks can lean hard: 900 Canada Place
# writes 19x more tickets in August than November, because that's the cruise season.
# Grouping by date rather than by year is the whole download (~200k rows/yr), which is
# fine at build time and never reaches the browser: it collapses to two small arrays.
print(f"3/5  day-of-week + season shape…")
dow_n = collections.defaultdict(lambda: [0] * 7)
mon_n = collections.defaultdict(lambda: [0] * 12)
for y in YEARS:
    rows = export(HIST, "block,street,entrydate,count(*) as n",
                  group_by="block,street,entrydate",
                  where=f'year = "{y}" and ({bylaw_f})')
    for r in rows:
        if r.get("block") is None or not r.get("street") or not r.get("entrydate"):
            continue
        k = norm(r["block"], r["street"])
        d = datetime.date.fromisoformat(r["entrydate"][:10])
        dow_n[k][d.weekday()] += r["n"]
        mon_n[k][d.month - 1] += r["n"]
    print(f"     {y}: {len(rows):>7,} block×date rows")

# How many of each weekday the window actually contained, so a 53-Monday year doesn't
# read as a Monday problem. Counted per block off the dates that block appears on, then
# filled from the calendar for weekdays it never saw.
CAL = collections.Counter()
for y in YEARS:
    d = datetime.date(int(y), 1, 1)
    while d.year == int(y):
        CAL[d.weekday()] += 1
        d += datetime.timedelta(days=1)


def profile(counts_by_slot, per_slot_days=None):
    """Reduce a slot histogram to the three numbers a SENTENCE needs: which slot peaks,
    which bottoms out, and how many times bigger the peak is. The card says "19x more in
    August than November" — it does not draw a twelve-bar chart, so shipping twelve
    normalised values per block would be 70 KB of payload nothing reads.

    Returns ([peak, low, ratio], lean). ratio 0 means the quiet slot is empty — a
    stronger story than any finite multiple, and the copy says so in words.

    `lean` is peak-over-MEAN, not peak-over-trough: blocks near the 60-ticket floor will
    have an empty slot somewhere, and peak/trough would divide by zero and wave every
    sparse block through as a discovery."""
    if per_slot_days:
        rate = [c / d if d else 0.0 for c, d in zip(counts_by_slot, per_slot_days)]
    else:
        rate = list(map(float, counts_by_slot))
    base = sum(rate) / len(rate)
    if base <= 0:
        return None, 0.0
    hi = max(range(len(rate)), key=lambda i: rate[i])
    lo = min(range(len(rate)), key=lambda i: rate[i])
    ratio = round(rate[hi] / rate[lo]) if rate[lo] > 0 else 0
    return [hi, lo, min(ratio, 999)], rate[hi] / base


# ---- 3. the usual reason on each block --------------------------------------
# One representative year is enough to name the dominant infraction, and it keeps this
# from being a 3x larger download for a field that barely moves year to year.
print("4/5  dominant infraction per block…")
reason_n = collections.defaultdict(collections.Counter)
rows = export(HIST, "block,street,infractiontext,count(*) as n",
              group_by="block,street,infractiontext",
              where=f'year = "{YEARS[-1]}" and ({bylaw_f})')
for r in rows:
    if r.get("block") is not None and r.get("street") and r.get("infractiontext"):
        reason_n[norm(r["block"], r["street"])][r["infractiontext"]] += r["n"]
print(f"     {len(rows)} block×infraction pairs")

# The bylaw text is written for a courtroom. These are the same offences said out loud.
# Ordered — first match wins — because several share opening clauses.
REASON = [
    ("PARK IN A METERED SPACE IF THE TIME RECORDED", "Meter time ran out"),
    ("PARK IN A METERED SPACE IF THE PARKING METER HEAD", "Meter never paid"),
    ("PARK ON ANY PORTION OF A STREET FOR A LONGER PERIOD", "Stayed past the posted limit"),
    ("PARK ON A STREET ABUTTING RESIDENTIAL OR COMMERCIAL PREMISES FOR MORE THAN 3", "Over the 3-hour limit"),
    ("STOP AT A PLACE WHERE A TRAFFIC SIGN PROHIBITS STOPPING", "Parked in a no-stopping zone"),
    ("PARK ON A STREET WHERE A TRAFFIC SIGN RESTRICTS PARKING", "Ignored a posted restriction"),
    ("PARK AT A PLACE ON A STREET WHERE A TRAFFIC SIGN PROHIBITS PARKING", "Parked where signs say no parking"),
    ("STOP ON ANY STREET OR PORTION OF A STREET DESIGNATED AS A PRIORITY CONGESTION", "Parked in a rush-hour lane"),
    ("STOP WITHIN 6 METRES OF THE NEAREST EDGE OF THE CLOSEST SIDEWALK", "Too close to the corner"),
    ("STOP WITHIN 2 METRES OF THE APPROACH SIDE", "Too close to the corner"),
    ("STOP WITHIN 9 METRES OF THE NEAREST EDGE OF THE PAVEMENT", "Too close to the corner"),
    ("STOP IN COMMERCIAL LOADING ZONE", "Parked in a loading zone"),
    ("STOP IN LOADING ZONE", "Parked in a loading zone"),
    ("STOP ON EITHER SIDE OF A LANE WHICH ABUTS COMMERCIALLY", "Blocked a commercial lane"),
    ("STOP ON ANY PORTION OF A STREET INDICATED BY A SIGN OR OTHER MARKER AS RESERVED", "Parked in a reserved space"),
    ("STOP IN FRONT OF OR WITHIN 1.5 METRES OF THE NEAREST SIDE OF A PRIVATE ROAD", "Blocked a driveway or crossing"),
    ("STOP ON A LANE WITHIN AN AREA 1.5M", "Blocked a driveway or crossing"),
    ("NO PERSON SHALL PLACE, LEAVE, ABANDON ANY DERELICT", "Left too long — treated as derelict"),
    ("STOP OR PARK OTHER THAN WITH THE CURBSIDE WHEELS", "Parked too far from the curb"),
    ("STOP OR PARK OTHER THAN HEADED IN THE DIRECTION", "Parked facing the wrong way"),
    ("LARGE VEHICLE", "Large vehicle where it's not allowed"),
    ("STOP ON ANY PORTION OF A STREET DESIGNATED AS A BUS STOP", "Parked in a bus stop"),
    ("STOP WITHIN 6 METRES OF THE APPROACH SIDE OF A STOP SIGN", "Too close to a stop sign"),
    ("STOP IN PASSENGER ZONE", "Parked in a passenger zone"),
    ("STOP IN TOUR BUS ZONE", "Parked in a tour-bus zone"),
    ("STOP WITHIN 5 METRES OF A FIRE HYDRANT", "Too close to a hydrant"),
    ("STOP ON ANY PORTION OF A STREET THAT IS DESIGNATED FOR PARKING USE BY VEHICLES DISPLAYING A DISABLED", "Parked in an accessible space"),
    ("STOP WITHIN 1.5 METRES OF THAT PORTION OF AN INTERSECTING LANE", "Blocked a lane entrance"),
    ("STOP ON A LANE IN SUCH A MANNER", "Blocked a lane"),
    ("STOP WITHIN 6 METRES OF EITHER SIDE OF A CROSSWALK", "Too close to a crosswalk"),
    ("STOP ON BOULEVARD", "Parked on the boulevard"),
]


def say(text):
    t = (text or "").upper()
    for pre, label in REASON:
        if t.startswith(pre):
            return label
    return None


# ---- 5. join and write ------------------------------------------------------
print("5/5  joining…")
nyears = len(YEARS)
blocks, matched, unmatched = [], 0, 0
n_window, n_sign, n_dow, n_mon = 0, 0, 0, 0
for key, n in counts.items():
    parts = segs.get(key)
    if not parts:
        unmatched += n
        continue
    matched += n
    per_year = n / nyears
    if per_year < MIN_PER_YEAR:
        continue
    length = sum(line_len(p) for p in parts)
    if length < 10:                      # a stub too short to give density any meaning
        continue
    dens = per_year / (length / 100.0)
    band = sum(1 for b in BREAKS if dens >= b)
    top = reason_n.get(key)
    reason = None
    if top:
        for text, _ in top.most_common(6):
            reason = say(text)
            if reason:
                break
    # centroid for the zoomed-out heatmap layer: midpoint of the longest part
    longest = max(parts, key=line_len)
    mid = longest[len(longest) // 2]
    # the quiet half of the city is a hairline you never tap — it doesn't need the
    # same fidelity as the blocks the layer exists to point at
    tol = 8.0 if band == 0 else 3.0
    geom = [[[round(x, 5), round(y, 5)] for x, y in simplify(p, tol)] for p in parts]

    # When the dominant rule is in force. Absent = we don't know (posted sign), which the
    # card states plainly instead of inventing hours.
    win = WINDOW.get(reason, SIGN) if reason else SIGN
    if win is None:
        n_sign += 1
    elif win != ALWAYS:
        n_window += 1

    rec = {
        "h": pretty(key),
        "n": round(per_year),
        "d": round(dens),
        "b": band,
        "r": reason,
        "c": [round(mid[0], 5), round(mid[1], 5)],
        "g": geom,
    }
    if win is not None:
        rec["w0"], rec["w1"] = win

    # Shape only rides along when it leans hard enough to mean something — see LEAN.
    if n >= MIN_FOR_PROFILE:
        # denominator is how many Mondays (etc.) the WINDOW held, not how many the block
        # happened to be ticketed on — the latter divides the signal out of existence
        dw, dlean = profile(dow_n[key], [CAL[i] for i in range(7)])   # CAL = weekdays in window
        if dw and dlean >= LEAN:
            rec["dw"] = dw
            n_dow += 1
        mo, mlean = profile(mon_n[key])
        if mo and mlean >= LEAN:
            rec["mo"] = mo
            n_mon += 1

    blocks.append(rec)

blocks.sort(key=lambda x: -x["d"])
out = {
    "meta": {
        "source": "City of Vancouver open data — parking tickets",
        "years": YEARS,
        "tickets": total,
        "matched_pct": round(100 * matched / total, 1),
        "breaks": BREAKS,
        "bands": BAND_LABEL,
        "built": datetime.date.today().isoformat(),
    },
    "blocks": blocks,
}
json.dump(out, open("data/vancouver-tickets.json", "w"), separators=(",", ":"))

hist = collections.Counter(b["b"] for b in blocks)
print(f"\n  matched to geometry: {matched:,}/{total:,}  ({100*matched/total:.1f}%)")
print(f"  blocks drawn (>={MIN_PER_YEAR}/yr): {len(blocks):,}")
for i, label in enumerate(BAND_LABEL):
    lo = 0 if i == 0 else BREAKS[i - 1]
    hi = BREAKS[i] if i < len(BREAKS) else None
    rng = f">={lo}" if hi is None else f"{lo}–{hi}"
    print(f"    band {i} {label:<18} {rng:>9}/100m  {hist[i]:>5} blocks")
missing_reason = sum(1 for b in blocks if not b["r"])
print(f"  blocks with no plain-English reason: {missing_reason}")

vol = sum(b["n"] for b in blocks)
win_vol = sum(b["n"] for b in blocks if b.get("w0", -1) >= 0)
hot = [b for b in blocks if b["b"] >= 3]
hot_win = sum(1 for b in hot if b.get("w0", -1) >= 0)
print(f"\n  timing:")
print(f"    blocks with a known in-force window: {n_window:,}  "
      f"({100*win_vol/max(vol,1):.0f}% of tickets/yr)")
print(f"    among band 3-4 ({len(hot)} blocks):    {100*hot_win/max(len(hot),1):.0f}%")
print(f"    'depends on the sign' blocks:        {n_sign:,}")
print(f"    day-of-week profile emitted:         {n_dow:,}")
print(f"    season profile emitted:              {n_mon:,}")
print(f"\nWrote data/vancouver-tickets.json")
