# Vancouver Street View review plan

## Active scope after user clarification

Focus on what the app currently labels **Check signs** or **verify**, plus explicitly documented sign conflicts. Do not re-audit all 612 curb sections simply because their geometry is approximate. At Monday 10am the active curb queue is 17 sections: 14 Kits Point paid/verify, one Davie/Beach conflict, one Denman West unresolved public curb, and one Mount Pleasant public curb with unreadable days. Separately, `data/free.json` contains 2,140 historical enforcement-derived candidates, of which 2,137 survive the app's named exclusions and render as older inferred Check signs markers. They are candidates, not known free parking.

Review order: (1) the 17 uncertain curb sections, starting near beaches and visitor streets; (2) older inferred markers near downtown/West End, Kits beaches and West 4th, then Mount Pleasant; (3) remaining inferred markers by visitor relevance and volume. If Street View cannot establish the exact side, sign, and restriction, retain Check signs. Preserve evidence links, image dates and uncertainty. Do not infer free parking from a vehicle parked at the curb.

The inventory below records the original 612-section data footprint for context. It is **not** the active verification queue.

The app has 612 mapped curb sections across nine files. These are line records, not 612 independently confirmed parking spaces. Priority uses beach, park, and commercial-street proximity as a visitor-demand proxy; it is not a measured foot-traffic ranking.

| Area / file | Total | Public timed | Paid | Residential permit (including permit windows) | No parking | Wave |
|---|---:|---:|---:|---:|---:|---:|
| Beach/Pacific | 3 | 3 | 0 | 0 | 0 | 1: waterfront |
| Davie/Beach | 104 | 11 | 0 | 93 | 0 | 1: waterfront/Davie |
| Denman West | 64 | 10 | 0 | 54 | 0 | 1: English Bay/Stanley Park access |
| West End Plateau | 174 | 22 | 0 | 152 | 0 | 1: English Bay/Davie |
| Robson North | 26 | 0 | 0 | 26 | 0 | 1: shopping corridor; lanes may lack imagery |
| Kitsilano Point | 26 | 0 | 14 | 12 | 0 | 1: beach/park |
| Kitsilano North | 118 | 42 | 0 | 68 | 8 | 1–2: beach/West 4th, then residential streets |
| Kitsilano South | 95 | 34 | 0 | 61 | 0 | 2: West 4th and residential streets |
| Mount Pleasant | 2 | 1 | 0 | 1 | 0 | 2: one public and one permit section |
| **Total** | **612** | **123** | **14** | **467** | **8** | |

First pass: inspect public and paid curbs nearest visitor destinations, then no-parking conflicts, then permit blocks in the same areas. Second pass: remaining residential side streets and lanes. Prioritize sections with no historical sign check, then recheck historical matches for side, arrows, and current applicability.

For each section, record the section ID, street and side, image date, direct panorama URL, visible sign text, arrow direction, and whether the observed sign covers the entire mapped line. Classify as confirmed only when the same-side sign and extent support the whole section; otherwise use partial, conflicting, or unresolved. A missing sign or parked vehicle is not proof of free parking. Historical imagery is evidence of the photographed date, not a guarantee of current rules. Preserve the City PDF citation alongside any Street View observation.

## First-pass progress, 2026-09-23

Twenty distinct sections were newly inspected across Davie/Beach (3), Kitsilano North (5), Kits Point/South (2), Denman West (4), Robson North (4), and West End Plateau (2). One Beach north section has a same-side sign conflict and is marked `historical-conflict` for review. The other 19 did not yield enough evidence to verify a whole mapped line; their classifications were not promoted. This is audit progress, not a claim that 20 sections are confirmed. Area-specific notes alongside this file retain the direct panorama links and observations.
