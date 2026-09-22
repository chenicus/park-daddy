# Kitsilano South curb cross-check

Reviewed 2026-09-22. The [City Kitsilano South guide](https://vancouver.ca/files/cov/residential-permit-parking-kitsilano-south.pdf) maps curb bars, while the legacy `data/free.json` points are ticket-block centres with no curb side. The South feed replaces four side-less points where the guide has bars on both sides of the corresponding block: 2100 W 5th, 2000 W 6th, 2000 W 7th, and 1800 W 7th. This removes duplicate `Check signs` dots without turning a block centre into a parking rule.

At the 2600 Maple Street candidate, [August 2024 Street View](https://www.google.com/maps/@?api=1&map_action=pano&pano=do7xM2sSiPtPbJsnBlvTCw&heading=116&pitch=0&fov=15) shows a parking sign on the east side by the school. Its small text and arrows are not clear enough to assign a restriction; the west curb was not verified. The candidate remains unresolved. No free-parking inference was made from parked cars.
