# Vancouver parking confidence and UX audit

## Evidence policy

All 42 PDF-derived timed sections have historical Street View observations in `pdf-street-view-audit.json`. Results: 26 readable local sign matches; 8 partial matches; 6 conflicts; 2 unresolved. All 16 partial matches, conflicts, and unresolved sections are withheld from Free results and displayed as Check signs. Their PDF schedules and approximate geometry remain preserved. The 26 readable local sign matches retain timed parking eligibility only during their documented schedules; the imagery date and link are displayed in the table. These historical spot-checks do not establish current rules or exact boundaries. A matching sign applies only in its indicated direction; no missing restrictions or precise endpoints were inferred.

All 2,399 remaining enforcement-derived Vancouver records are **unverified candidates**, not free parking. Their ticket counts locate candidate blocks but cannot establish price, eligibility, hours or time limits. They use amber markers, unknown schedule cards, and the Check signs filter; they never contribute to area price minimums. These candidates have not all been visually checked. Previously removed downtown estimates remain excluded.

Vancouver meter rates retain the City feed and time-based schedules. The inspected feed has explicit positive rates for every daytime and evening entry. Active loading/prohibition and rush periods suppress map markers and show **No parking now** when a card is reached directly. This audit does not assert that historical imagery establishes present-day conditions.

## UX changes and verification

- Separate Free, Paid, Permit only and Check signs filters. Checkmarks, pressed accessibility state, visible unselected styling, keyboard focus, stable widths and larger mobile tap targets.
- Mobile 390px: toggling Permit only removed 32 permit markers to zero while four Check signs markers remained; toggling Check signs then removed those to zero.
- Mobile 320px: no horizontal overflow; prices separated from time limits, with maximum stays on their own line. PDF schedule and dated Street View link inspected.
- Desktop: loading-zone deep link at 10am displays No parking now and highlights the 7am–noon loading period. The paid schedule retains subsequent hourly rates and maximum stays.
- An enforcement-derived Hudson candidate displays Check signs / Hours and eligibility unknown rather than a fabricated free schedule.
- Automated tests cover permit exclusion, all-day unknown/conflict exclusion, independent filters, inferred amber dots, rebuild data evidence, unknown off-hours, imagery links, and preserving source schedules.

Scope is Vancouver parking confidence and the shared rate/filter interface. Other cities’ source feeds were not re-audited or changed.

## Closer recheck

All 32 initially uncertain PDF records received a second pass with closer or reverse-angle panoramas. The audit now has 26 local schedule matches and 16 records retained as Check signs (8 partial, 6 conflicts, 2 unresolved). Public schedules beside Modo, Mobi, permit, and accessible bays are recorded separately; known bike-dock overlap and unresolved marker-to-reserved-boundary positions remain excluded from Free. Previous observations keep their original status rather than being silently relabeled.

Local UI checks confirm Chilco displays 9am–8pm Mon–Sat and Pacific displays 9am–3pm Mon–Sat with the new dated panorama links. All 12 automated tests pass, including Pacific off-hours exclusion and preservation of its observed 3pm–6pm weekday no-stopping rule in the evidence. All source schedules and geometries remain unchanged.
