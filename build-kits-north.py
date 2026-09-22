#!/usr/bin/env python3
"""Build approximate curb lines traced from Vancouver's Kitsilano North PDF.

The source files record only printed curb bars. The shaded resident-eligibility
area is deliberately not used as parking geometry.
"""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = 'https://vancouver.ca/files/cov/residential-permit-parking-kitsilano-north.pdf'
GRID = ROOT / 'data/sources/kitsilano-north-street-grid.json'
BAR_FILES = [ROOT / f'data/sources/kits-north-{part}-bars.json' for part in ('west', 'central', 'east')]
OUT = ROOT / 'data/kitsilano-north.json'

RULES = {
    'p': ('permit', None, {'days': [0, 1, 2, 3, 4, 5, 6], 'start': 0, 'end': 1440, 'label': 'Every day'}),
    '2mf': ('time-limited', 120, {'days': [1, 2, 3, 4, 5], 'start': 540, 'end': 1080, 'label': 'Mon–Fri'}),
    '2ms': ('time-limited', 120, {'days': [1, 2, 3, 4, 5, 6], 'start': 540, 'end': 1080, 'label': 'Mon–Sat'}),
    '1mf': ('time-limited', 60, {'days': [1, 2, 3, 4, 5], 'start': 540, 'end': 1080, 'label': 'Mon–Fri'}),
    'npmf': ('no-parking', None, {'days': [1, 2, 3, 4, 5], 'start': 540, 'end': 1080, 'label': 'Mon–Fri; except with permit'}),
    'school': ('no-parking', None, {'days': None, 'start': 480, 'end': 1020, 'label': 'School days; permit required at other times'}),
}


def interpolate(a, b, fraction):
    return [a[i] + (b[i] - a[i]) * fraction for i in range(2)]


def curb_line(bar, intersections):
    street, first, second = bar['street'], *bar['between']
    horizontal = bar['orientation'] == 'horizontal'
    assert bar['orientation'] in ('horizontal', 'vertical')
    assert bar['side'] in (('north', 'south') if horizontal else ('east', 'west'))
    names = (f'{street}|{first}', f'{street}|{second}') if horizontal else (f'{first}|{street}', f'{second}|{street}')
    a, b = (intersections[name] for name in names)
    start, end = (interpolate(a, b, bar[key]) for key in ('from', 'to'))
    # Left normal of west-to-east is north; left normal of north-to-south is east.
    sign = 1 if bar['side'] in ('north', 'east') else -1
    lat0 = (start[1] + end[1]) / 2
    mx = (end[0] - start[0]) * math.cos(math.radians(lat0)) * 111320
    my = (end[1] - start[1]) * 111320
    length = math.hypot(mx, my)
    assert length > 0
    east = -my / length * 6 * sign
    north = mx / length * 6 * sign
    return [[round(p[0] + east / (111320 * math.cos(math.radians(p[1]))), 6),
             round(p[1] + north / 111320, 6)] for p in (start, end)]


def street_view_url(bar, geometry):
    """Open the nearest panorama looking toward this side; no sign is verified."""
    lon = (geometry[0][0] + geometry[-1][0]) / 2
    lat = (geometry[0][1] + geometry[-1][1]) / 2
    heading = {'north': 0, 'east': 90, 'south': 180, 'west': 270}[bar['side']]
    return f'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={lat:.6f},{lon:.6f}&heading={heading}'


def main():
    grid = json.loads(GRID.read_text())
    bars = []
    for path in BAR_FILES:
        if path.exists():
            document = json.loads(path.read_text())
            if isinstance(document, list):
                assert all(bar.get('sourcePdfPage') == 1 for bar in document)
                bars.extend(document)
            else:
                assert document['source'] == SOURCE and document['page'] == 1
                bars.extend(document.get('bars', document.get('records', [])))
    if not bars:
        raise ValueError('No transcribed curb bars are available')

    sections = []
    seen = set()
    for bar in bars:
        assert 0 <= bar['from'] < bar['to'] <= 1, bar
        category, limit, schedule = RULES[bar['rule']]
        assert bar['category'] == category, bar
        key = (bar['street'], bar['side'], *bar['between'], bar['rule'], bar['from'], bar['to'])
        assert key not in seen, key
        seen.add(key)
        geometry = curb_line(bar, grid['intersections'])
        ident = 'kits-north-' + hashlib.sha256(repr(key).encode()).hexdigest()[:12]
        sections.append({
            'id': ident, 'street': bar['street'], 'side': bar['side'],
            'between': bar['between'], 'category': category, 'limitMinutes': limit,
            'schedule': schedule, 'pdfSchedule': schedule, 'outsideSchedule': 'unknown' if category == 'time-limited' else 'not-applicable',
            'permitException': bar['rule'] not in ('p',), 'verification': 'pdf-guide',
            'spotChecks': [], 'streetViewUrl': street_view_url(bar, geometry) if category == 'time-limited' else None,
            'pdfBar': {'page': 1, 'from': bar['from'], 'to': bar['to'], 'rule': bar['rule']},
            'geometryStatus': 'approximate-schematic', 'geometry': {'type': 'LineString', 'coordinates': geometry},
            'sourceIds': ['city-kits-north-pdf', 'city-intersections'],
        })

    result = {
        'version': 1,
        'sources': {
            'city-kits-north-pdf': {'url': SOURCE, 'title': 'City of Vancouver Kitsilano North Residential Permit Zone guide', 'retrieved': '2026-09-22'},
            'city-intersections': {'url': grid['source'], 'title': 'City of Vancouver street intersections (location reference only)', 'retrieved': grid['retrieved']},
        },
        'geometryNote': 'Approximate curb sections traced from a schematic guide. Endpoints and sign arrows are not surveyed; check posted signs.',
        'restrictionNote': 'The PDF gives the listed schedule and permit exception. Rules outside listed hours are not stated, so they remain unknown. Purple resident-eligibility shading is excluded.',
        'sections': sections,
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Wrote {len(sections)} Kitsilano North curb sections')


if __name__ == '__main__':
    main()
