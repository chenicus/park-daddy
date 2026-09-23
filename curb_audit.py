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
        if audit.get('accessOverride'):
            section['accessOverride'] = audit['accessOverride']
        section['spotChecks'].extend({
            'status': observation.get('status', audit['status']),
            'checkedOn': observation.get('checkedOn', audit['checkedOn']),
            'imageryDate': observation['imageryDate'], 'url': observation['url'],
            'finding': observation['text'],
            **({'restrictions': observation['restrictions']} if observation.get('restrictions') else {}),
            **({'readableSchedule': observation['readableSchedule']} if observation.get('readableSchedule') else {}),
            'scope': 'Historical local observation only; current rules and complete curb boundaries unverified.',
        } for observation in audit['observations'])
    # A reviewed crowd report can refine the map label without turning an
    # approximate PDF line into a verified whole-block parking claim.
    reviews = json.loads((Path(__file__).parent / 'data/sources/downtown-report-reviews.json').read_text())
    for section in sections:
        review = reviews.get(section['id'])
        if review:
            if review.get('verification'):
                section['verification'] = review['verification']
            section['bestJudgment'] = review['bestJudgment']
            section['reviewedReportsThrough'] = review['reviewedReportsThrough']
            section['reportReview'] = review['reports']
            if review.get('verification'):
                section['spotChecks'].append({
                    'status': review['verification'], 'checkedOn': '2026-09-22',
                    'imageryDate': '2024-08', 'url': review['bestJudgment']['streetViewUrl'],
                    'finding': review['bestJudgment']['summary'],
                    'scope': 'Historical local sign matched to the PDF-traced side and segment; exact endpoints and current rule remain unverified.',
                })
