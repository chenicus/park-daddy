# Additional West End curb guides

Retrieved September 22, 2026:

| City PDF | Mapped curb sections | Unresolved markings |
|---|---:|---:|
| [Davie–Beach](https://vancouver.ca/files/cov/davie-beach-residential-permit-parking-map.pdf) | 104 | 3 |
| [Denman West](https://vancouver.ca/files/cov/denman-west-residential-permit-parking-map.pdf) | 63 | 11 |
| [Robson North](https://vancouver.ca/files/cov/residential-permit-parking-robson-north.pdf) | 26 | 0 |

These are schematic guides, not surveyed sign locations or proof of current restrictions.
The source legends distinguish full-time permits from two-hour public parking,
9am–8pm Monday–Saturday. Davie–Beach additionally marks two-hour parking
9am–3pm Monday–Saturday on Pacific's north side between Jervis and Bute.
All new records are `pdf-only`; the historical Plateau Street View checks do not apply.
Unlisted periods and additional restrictions remain unknown.

`build-west-end-expansion.py` contains the manually transcribed source strokes.
Coordinates reference page renders with the dimensions and rotation stored alongside
each PDF's URL, retrieval date and SHA-256 in the generated data. Publication dates
are unknown. Positions interpolate schematic fractions along the City's street
centreline snapshot in `west-end-expansion-streets.json`. Nine samples follow curves;
6m road and 3m lane offsets are symbolic. Lane positions average adjacent roads.
Neither line endpoints nor offsets represent precise curb boundaries.

Unmatched intersections and ambiguous street ends are preserved with source traces,
schedules and reasons in `unmappedSections`, with null geometry; they are not drawn.
Small markings whose street alignment cannot be identified are not transcribed.
Coverage is therefore incomplete. No residential-zone polygons are generated.

The more specific Davie–Beach guide suppresses old inferred free-parking estimates
for 1100 Burnaby St and 1300 Broughton St. This does not assign restrictions to
unmapped portions of those blocks. All mapped records use the existing curb layer,
restriction/free filters and shared schedule table.

Rebuild: `python3 build-west-end-expansion.py` (standard library, offline snapshot).
Test: `node --test tests/west-end.test.mjs`.
