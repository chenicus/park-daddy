#!/usr/bin/env python3
"""Build Park Daddy's Surrey street-parking layer from the City of Surrey GIS service.

The City publishes the actual locations of pay stations and their zone-level price, hours,
maximum stay, address, and payment-zone data. It does *not* publish the curb-block geometry
that each station covers, so this intentionally emits one visible map point per public
on-street pay station. That makes the coverage useful while avoiding made-up boundaries.

Source: https://gisservices.surrey.ca/arcgis/rest/services/ParkingStations/MapServer/0
Run:   python3 build-surrey.py
"""
import json
import re
import urllib.parse
import urllib.request

BASE = "https://gisservices.surrey.ca/arcgis/rest/services/ParkingStations/MapServer/0/query"
UA = {"User-Agent": "park-daddy/1.0 (parking-data refresh)"}
FIELDS = ("ZONE_NAME,METER_ID,OPERATION_HOURS,OPERATION_DAYS,HOURLY_RATE,DAILY_RATE,"
          "MAXIMUM_HOURS,PAY_BY_PHONE,NUMBER_SPACES,ADDRESS")
CURBS = "data/surrey-curbs.json"


def fetch():
    q = {
        "where": "ON_OFF_STREET = 'On' AND METER_TYPE = 'Paystation'",
        "outFields": FIELDS,
        "outSR": "4326",
        "returnGeometry": "true",
        "f": "json",
    }
    req = urllib.request.Request(BASE + "?" + urllib.parse.urlencode(q), headers=UA)
    with urllib.request.urlopen(req, timeout=120) as response:
        data = json.load(response)
    if "error" in data:
        raise RuntimeError(data["error"])
    return data.get("features", [])


def minutes(value):
    """Parse the City's e.g. '8:00 AM' into minutes after midnight."""
    m = re.fullmatch(r"\s*(\d{1,2})(?::(\d{2}))?\s*([AP]M)\s*", value or "", re.I)
    if not m:
        return None
    hour, minute, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3).upper()
    return (hour % 12) * 60 + minute + (720 if ap == "PM" else 0)


def hours(value):
    """'8:00 AM to 6:00 PM' -> [480, 1080]; '24 Hours' -> [0, 1440]."""
    if (value or "").strip().lower() == "24 hours":
        return [0, 1440]
    parts = re.split(r"\s+to\s+", value or "", flags=re.I)
    if len(parts) != 2:
        return None
    start, end = minutes(parts[0]), minutes(parts[1])
    return [start, end] if start is not None and end is not None and end > start else None


def rate_per_hour(value):
    """Normalize '$0.75 each 30 Minutes' and '$3.00' to a dollar/hour float."""
    amount = re.search(r"\$?\s*(\d+(?:\.\d+)?)", value or "")
    if not amount:
        return None
    rate = float(amount.group(1))
    duration = re.search(r"each\s+(\d+)\s+minutes?", value or "", re.I)
    return round(rate * 60 / int(duration.group(1)), 2) if duration else round(rate, 2)


def max_minutes(value):
    m = re.search(r"(\d+)\s*hours?", value or "", re.I)
    if m:
        return int(m.group(1)) * 60
    # The City represents the Marine Drive six-hour maximum simply as "6".
    return int(value.strip()) * 60 if (value or "").strip().isdigit() else None


def day_bands(rate, window, days):
    if rate is None or not window:
        return [], [], []
    band = [{"r": rate, "s": window[0], "e": window[1]}]
    day_text = (days or "").lower()
    weekday = band if "mon" in day_text or "days/week" in day_text else []
    saturday = band if "sat" in day_text or "days/week" in day_text else []
    sunday = band if "sun" in day_text or "days/week" in day_text else []
    return weekday, saturday, sunday


def build():
    print("Fetching City of Surrey on-street pay stations…")
    # The official feed has no curb geometry. Curbs are maintained separately only when a
    # Street View audit can see paid-stall signs and a defensible end condition; this lets
    # refreshes update rates/stations without silently discarding or inventing geometry.
    try:
        with open(CURBS) as f:
            curbs = {c["station"]: c for c in json.load(f)}
    except FileNotFoundError:
        curbs = {}
    out = []
    for feature in fetch():
        a, g = feature.get("attributes", {}), feature.get("geometry") or {}
        try:
            lat, lon = round(float(g["y"]), 6), round(float(g["x"]), 6)
        except (KeyError, TypeError, ValueError):
            continue
        rate, window = rate_per_hour(a.get("HOURLY_RATE")), hours(a.get("OPERATION_HOURS"))
        wkd, sat, sun = day_bands(rate, window, a.get("OPERATION_DAYS"))
        if not (wkd or sat or sun):
            print("Skipping station with unparseable rules:", a.get("METER_ID"), a.get("HOURLY_RATE"))
            continue
        record = {
            "h": a.get("ADDRESS") or a.get("ZONE_NAME") or "Surrey pay station",
            "zone": a.get("ZONE_NAME"),
            "station": a.get("METER_ID"),
            "lat": lat, "lon": lon,
            "spaces": int(a.get("NUMBER_SPACES") or 0),
            "limit": max_minutes(a.get("MAXIMUM_HOURS")),
            "wkd": wkd, "sat": sat, "sun": sun,
        }
        curb = curbs.get(record["station"])
        if curb:
            record["line"] = curb["line"]
            record["curbConfidence"] = curb["confidence"]
            record["curbEvidence"] = curb["evidence"]
        out.append(record)
    out.sort(key=lambda x: (x["zone"] or "", x["station"] or ""))
    with open("data/surrey-meters.json", "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {len(out)} on-street pay stations to data/surrey-meters.json")


if __name__ == "__main__":
    build()
