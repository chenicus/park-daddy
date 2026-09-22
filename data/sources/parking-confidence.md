# Vancouver parking confidence and UX audit

## Evidence policy

All 42 PDF-derived timed sections have historical Street View observations in `pdf-street-view-audit.json`. Ten have readable matching local signs. Fourteen partial matches, nine conflicts and nine unresolved checks are displayed as **Check signs**, excluded from Free results, and retain original PDF schedules and approximate geometries. A match is local to a sign and its arrow, not proof of current restrictions or the complete schematic boundary. The card displays the imagery date and links to the observed panorama.

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
