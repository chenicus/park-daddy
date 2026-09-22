#!/usr/bin/env python3
"""Build conservative curb lines from the Kitsilano South and Point guides."""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GRID = json.loads((ROOT / 'data/sources/kitsilano-additional-street-grid.json').read_text())
SOURCES = {
    'south': ROOT / 'data/sources/kits-south-bars.json',
    'point': ROOT / 'data/sources/kits-point-bars.json',
}
RULES = {
    'south': {
        'p': ('permit', None, {'days': list(range(7)), 'start': 0, 'end': 1440, 'label': 'Every day'}),
        'rmf': ('permit-window', None, {'days': [1, 2, 3, 4, 5], 'start': 540, 'end': 1080, 'label': 'Mon–Fri'}),
        '2ms': ('time-limited', 120, {'days': [1, 2, 3, 4, 5, 6], 'start': 540, 'end': 1080, 'label': 'Mon–Sat'}),
        '2mf': ('time-limited', 120, {'days': [1, 2, 3, 4, 5], 'start': 540, 'end': 1080, 'label': 'Mon–Fri'}),
        '2m8': ('time-limited', 120, {'days': [1, 2, 3, 4, 5, 6], 'start': 540, 'end': 1200, 'label': 'Mon–Sat'}),
    },
    'point': {
        'p': ('permit', None, {'days': list(range(7)), 'start': 0, 'end': 1440, 'label': 'Every day'}),
        'pay-split': ('paid', None, {'days': None, 'start': 540, 'end': 1020, 'label': 'Days not specified in PDF'}),
        'pay-exempt': ('paid', None, {'days': None, 'start': 540, 'end': 1320, 'label': 'Days not specified in PDF'}),
        'pay': ('paid', None, {'days': None, 'start': 540, 'end': 1320, 'label': 'Days not specified in PDF'}),
    },
}


def point(a, b, f):
    return [a[i] + (b[i] - a[i]) * f for i in range(2)]


def curb_line(bar):
    street, first, second = bar['street'], *bar['between']
    horizontal = bar['orientation'] == 'horizontal'
    assert bar['orientation'] in ('horizontal', 'vertical')
    assert bar['side'] in (('north', 'south') if horizontal else ('east', 'west'))
    names = (f'{street}|{first}', f'{street}|{second}') if horizontal else (f'{first}|{street}', f'{second}|{street}')
    a, b = (GRID['intersections'][name] for name in names)
    assert b[0] > a[0] if horizontal else b[1] < a[1], bar
    start, end = (point(a, b, bar[key]) for key in ('from', 'to'))
    sign = 1 if bar['side'] in ('north', 'east') else -1
    latitude = (start[1] + end[1]) / 2
    dx = (end[0] - start[0]) * math.cos(math.radians(latitude)) * 111320
    dy = (end[1] - start[1]) * 111320
    length = math.hypot(dx, dy)
    east, north = -dy / length * 6 * sign, dx / length * 6 * sign
    return [[round(p[0] + east / (111320 * math.cos(math.radians(p[1]))), 6),
             round(p[1] + north / 111320, 6)] for p in (start, end)]


def street_view_url(bar, line):
    lon = (line[0][0] + line[-1][0]) / 2
    lat = (line[0][1] + line[-1][1]) / 2
    heading = {'north': 0, 'east': 90, 'south': 180, 'west': 270}[bar['side']]
    return f'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={lat:.6f},{lon:.6f}&heading={heading}'


def build(area, path):
    document = json.loads(path.read_text())
    sections, seen = [], set()
    for bar in document['bars']:
        assert 0 <= bar['from'] < bar['to'] <= 1, bar
        category, limit, schedule = RULES[area][bar['rule']]
        assert bar['category'] in (category, 'permit' if category == 'permit-window' else category), bar
        key = (bar['street'], bar['side'], *bar['between'], bar['rule'], bar['from'], bar['to'])
        assert key not in seen, key
        seen.add(key)
        line = curb_line(bar)
        ident = 'kits-' + area + '-' + hashlib.sha256(repr(key).encode()).hexdigest()[:12]
        sections.append({
            'id': ident, 'street': bar['street'], 'side': bar['side'], 'between': bar['between'],
            'category': category, 'limitMinutes': limit, 'schedule': schedule, 'pdfSchedule': schedule,
            'outsideSchedule': 'permit-only' if bar['rule'] == 'pay-split' else 'unknown' if category != 'permit' else 'not-applicable',
            'permitException': bar['rule'] in ('2ms', '2mf', '2m8', 'pay-split', 'pay-exempt'),
            'verification': 'pdf-guide', 'spotChecks': [],
            'streetViewUrl': street_view_url(bar, line) if category in ('time-limited', 'paid') else None,
            'pdfBar': {'page': 1, 'from': bar['from'], 'to': bar['to'], 'rule': bar['rule']},
            'geometryStatus': 'approximate-schematic', 'geometry': {'type': 'LineString', 'coordinates': line},
            'sourceIds': ['city-pdf', 'city-intersections'],
        })
    output = {
        'version': 1,
        'sources': {
            'city-pdf': {'url': document['source'], 'title': f'City of Vancouver Kitsilano {area.title()} Residential Permit Zone guide', 'retrieved': '2026-09-22'},
            'city-intersections': {'url': GRID['source'], 'title': 'City of Vancouver street intersections (location reference only)', 'retrieved': GRID['retrieved']},
        },
        'geometryNote': 'Approximate curb sections traced from a schematic guide. Endpoints and sign arrows are not surveyed; check posted signs.',
        'restrictionNote': 'Only clearly readable bars are included. Rules outside listed hours, days omitted by the guide, and paid rates are unverified. Purple resident-eligibility shading is excluded.',
        'sections': sections,
    }
    target = ROOT / f'data/kitsilano-{area}.json'
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(f'Wrote {len(sections)} Kitsilano {area.title()} curb sections')


for area, path in SOURCES.items():
    build(area, path)
