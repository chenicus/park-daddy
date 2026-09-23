"""Attach reproducible historical observations without changing PDF rules or geometry."""
from copy import deepcopy
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
    for section in sections:
        audit = by_id.get(section['id'], {})
        if audit.get('scheduleOverride'):
            override = audit['scheduleOverride']
            section['schedule'] = {key: override[key] for key in ('days', 'start', 'end')}
            section['scheduleBasis'] = override['basis']
        if audit.get('mapVerification'):
            section['verification'] = audit['mapVerification']
            section.pop('bestJudgment', None)
    # Photographed signs identify a public portion and a Mobi/Modo reserved
    # portion. Keep only the public half in car-parking results. The midpoint
    # is illustrative; neither sign nor PDF supplies surveyed ends.
    for section in list(sections):
        split = by_id.get(section['id'], {}).get('mapSplit')
        if not split:
            continue
        fraction = split['fraction']
        assert 0 < fraction < 1 and len(split['parts']) in (1, 2)
        line = section['geometry']['coordinates']
        trace = section['schematicTrace']
        assert len(line) >= 2 and len(trace) == 2
        cut = (len(line)-1)*fraction
        cut_index = int(cut)
        cut_part = cut-cut_index
        if cut_part:
            middle = [round(a + (b-a)*cut_part, 6) for a,b in zip(line[cut_index],line[cut_index+1])]
            first_line = line[:cut_index+1]+[middle]
            second_line = [middle]+line[cut_index+1:]
        else:
            first_line = line[:cut_index+1]
            second_line = line[cut_index:]
        trace_middle = [a + (b-a)*fraction for a,b in zip(*trace)]
        template = deepcopy(section)
        for index, part in enumerate(split['parts']):
            piece = section if index == 0 else deepcopy(template)
            piece['id'] = part['id']
            piece['splitSourceId'] = template['id']
            piece['verification'] = part['verification']
            keep_second = index == 1 or split.get('keep') == 'second'
            piece['geometry']['coordinates'] = second_line if keep_second else first_line
            piece['schematicTrace'] = [trace_middle, trace[1]] if keep_second else [trace[0], trace_middle]
            piece['geometryStatus'] = 'approximate-sign-split'
            piece['splitBoundaryNote'] = split['boundary']
            piece.pop('bestJudgment', None)
            if part.get('accessOverride'):
                piece['accessOverride'] = part['accessOverride']
            if index == 1:
                sections.append(piece)
    # An observed accessible-space/sign/bike-dock sequence supports only a
    # short public pocket, not the full PDF curb bar.
    for section in sections:
        clip = by_id.get(section['id'], {}).get('mapSlice')
        if not clip:
            continue
        start, end = clip['startFraction'], clip['endFraction']
        assert 0 < start < end < 1
        def at(points, fraction):
            position = (len(points)-1)*fraction
            index = int(position)
            part = position-index
            return [round(a+(b-a)*part, 6) for a,b in zip(points[index],points[index+1])]
        line = section['geometry']['coordinates']
        inner = [point for i,point in enumerate(line) if start < i/(len(line)-1) < end]
        section['geometry']['coordinates'] = [at(line,start), *inner, at(line,end)]
        trace = section['schematicTrace']
        section['schematicTrace'] = [at(trace,start),at(trace,end)]
        section['geometryStatus'] = 'approximate-sign-slice'
        section['splitBoundaryNote'] = clip['boundary']
        section['verification'] = clip['verification']
        section.pop('bestJudgment', None)
