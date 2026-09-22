# West End Plateau curb transcription

Source: [City parking guide](https://vancouver.ca/files/cov/west-end-plateau-residential-permit-parking-map.pdf), one-page schematic, accessed September 22, 2026 (UTC). The PDF carries no publication date. It says to refer to posted signs. Its purple fill describes permit **eligibility**, not a curb regulation; it is not imported or rendered.

`build-west-end.py` contains the manually reviewed horizontal/vertical stroke inventory. Run `python3 build-west-end.py` from any directory to regenerate `data/west-end-plateau.json`. `schematicTrace` records the endpoints on a 1780 × 1376 rendering of the PDF, making every imported stroke auditable against the source. Categories: solid = full-time permit, diagonal = 2 hours 9am–8pm Mon–Sat, stippled = 1 hour 9am–6pm (days missing). Stair-step hatching is paid parking and remains with the existing meter feed.

## Approximate display geometry

The snapshot `west-end-street-grid.json` contains intersections derived from matching endpoints in the City's [public-streets dataset](https://opendata.vancouver.ca/explore/dataset/public-streets/). Its coordinates locate the schematic; they do not supply parking regulations. The builder interpolates traced extents between neighbouring street intersections, with a symbolic 6 m curb-side offset (3 m for lane sides). Lanes use an interpolated midpoint centreline. These offsets are display conventions, not measured curb widths. The schematic is distorted, so all output is explicitly `approximate-schematic`: lengths, lateral positions, lane positions, and endpoints are illustrative, **not** measurements of curb/sign boundaries. Six-decimal coordinates are serialization precision, not positional accuracy. Short strokes must not be extended to a whole block.

Burrard/Haro and Burrard/Pendrell are null in the grid because those streets do not continue through. The builder rejects any trace needing a missing intersection. East-of-Thurlow strokes near Smithe and unidentified interior school/courtyard strokes are deliberately omitted because the schematic cannot be reliably assigned there. Blank stretches do not imply free parking. This is a transcription of identifiable sections, not exhaustive or current parking coverage. Lanes are labelled descriptively between named streets; their geometry is especially approximate.

## Evidence and schedules

Each section retains both `pdfSchedule` and the effective `schedule`. Missing days are `null`, never silently all days. Unlisted hours are `unknown`; no nighttime/Sunday access or permit-holder exemption is inferred. Full-time permit records have no public/free rate and never enter the paid/free rate resolver or area-minimum clusters.

Two observations were supplied by the project owner, **not independently inspected** during this import:

- Barclay south, just east of Denman: August 2024 Street View imagery shows 1 hour, 9am–6pm, **Mon–Sat**. Only that stippled section receives the day correction; its PDF days remain null.
- Bidwell west, just north of Nelson: August 2024 imagery **appears** to match 2 hours, 9am–8pm, Mon–Sat. Stored as a tentative match, not verified current signage.

No panorama URLs were supplied; `url: null` preserves that absence rather than inventing a Street View evidence link. Both observations are local sign checks, not verification of the full drawn extent. Every other section is `pdf-only`.

## App behaviour

- Dashed curb lines and plain labels; tap a line even when its pill is decluttered.
- Purple “Permit only” always requires a permit. Blue “Free · 1h/2h” appears only during a known listed day/time; amber “1h/2h · Verify” means days or off-hours access are unknown.
- The Restrictions chip controls permit/unknown sections separately from Free/Paid. Approximate curbs appear at street zoom and never determine zoomed-out “Free” minima or meter-ranking suggestions.
- Timed-parking cards preserve source links, schedules, historical spot checks, and uncertainty. Permit cards show only “Permit required at all times, every day, all hours.”; their full source and verification metadata remains in the data feed. Reports use a stable section ID rather than applying one report to every curb with the same street name.
- The generated feed is separate from `free.json`, so refresh scripts cannot overwrite it with an inferred 3-hour residential rule. No current inferred free blocks overlap this footprint.

Validation: `node --test tests/west-end.test.mjs` (Node 22+), plus local browser smoke testing.
