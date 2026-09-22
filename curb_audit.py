"""Attach reproducible historical observations without changing PDF rules or geometry."""
import json
from pathlib import Path

def apply_audit(sections):
    rows = json.loads((Path(__file__).parent / 'data/sources/pdf-street-view-audit.json').read_text())
    by_id = {row['id']: row for row in rows}
    for section in sections:
        audit = by_id.get(section['id'])
        if not audit:
            continue
        section['verification'] = audit['status']
        section['spotChecks'].extend({
            'status': audit['status'], 'checkedOn': audit['checkedOn'],
            'imageryDate': observation['imageryDate'], 'url': observation['url'],
            'finding': observation['text'],
            'scope': 'Historical local observation only; current rules and complete curb boundaries unverified.',
        } for observation in audit['observations'])
