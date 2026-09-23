# East Vancouver permit-map and Street View audit

Checked 2026-09-22. This is source research, not imported curb data. The City's maps say they are guides and posted signs control. Purple shading shows eligibility to apply for a decal; it is **not** a curb parking rule and must not be drawn as a parking zone.

## Official maps and printed legends

The [City's zone list](https://vancouver.ca/streets-transportation/buy-your-annual-or-short-term-or-visitor-parking-permit.aspx) links these maps. The distinct rules below come from the legend on each PDF, not from assumptions about shaded blocks.

| Map | Curb rules printed in legend | Scope or caveat |
| --- | --- | --- |
| [Commercial Drive](https://vancouver.ca/files/cov/residential-permit-parking-commercial-drive.pdf) | Full-time permit; 2 hours 8am–8pm Mon–Sat except with permit; 2 hours 9am–6pm Mon–Sat except with permit; 2 hours 9am–8pm except with permit (the legend does not print days for this third rule) | Venables to E 1st, roughly Woodland to Victoria. The curb bars are legible visually in Chrome's PDF viewer, but black permit bars, patterned public bars, and purple eligibility fill overlap in places. Do not treat an unmarked side as free. |
| [Boundary](https://vancouver.ca/files/cov/residential-permit-parking-boundary.pdf) | Full-time permit; resident permit parking 8am–6pm Mon–Fri; 2 hours 8am–6pm Mon–Fri except with permit | Around Kingsway and Boundary Road, with irregular streets. The resident-permit rule is distinct from a two-hour public rule. |
| [Joyce Station](https://vancouver.ca/files/cov/residential-permit-parking-joyce-station.pdf) | Full-time permit; 2 hours 8am–6pm Mon–Sat except with permit; 2 hours 8am–6pm Mon–Fri except with permit | Around Joyce and Vanness; do not merge the Mon–Fri and Mon–Sat bars. |
| [PNE](https://vancouver.ca/files/cov/residential-permit-parking-pne.pdf) | Full-time permit; no parking anytime; no parking 8am–5pm school days | Around Slocan, Renfrew and Kaslo north of Hastings. School-day restriction must not be represented as free outside school hours without confirming other signs. |

Other East Vancouver entries on the [City list](https://vancouver.ca/streets-transportation/buy-your-annual-or-short-term-or-visitor-parking-permit.aspx) include Broadway Station, Guelph, Industrial, Mount Pleasant and Sunset. Their map legends and curb bars have not been audited here.

## Street View spot-check

- [1470 Commercial Drive, at Grant Street](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=49.271500,-123.069500): Google Maps resolved this vicinity to an **August 2024** Street View panorama. A no-parking symbol was visible on the east-side corner pole, but its arrows and any time panel were not readable at that viewing angle. The link selects the nearest available panorama, which may change over time. This is **not** confirmation of a PDF curb bar or a basis to mark the surrounding side free.
- [810 Commercial Drive vicinity](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=49.277200,-123.069200): Google Maps selected **May 2019** imagery facing private property away from the curb. The link selects the nearest available panorama, which may change over time. No parking sign could be read; this is not a verification.

These two Street View attempts did not establish side-specific sign text matching a map bar. Any imported sections from these PDFs should retain PDF-guide verification until a sign on the correct side, with arrows and schedule visible, is checked. The exact curb endpoints on the small-format PDFs are also approximate; use the bars only where street, side, pattern, and endpoints can all be resolved visually.

No `east-van-bars.json` was generated because the checked Street View scenes did not confirm any coherent run of map bars, and the Commercial Drive map contains closely overlapping bar patterns. A transcription made without a street-side and pattern pass would risk claiming the wrong restriction on the wrong curb.
