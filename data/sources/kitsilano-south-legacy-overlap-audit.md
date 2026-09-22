# Kitsilano South legacy-marker overlap audit

Reviewed 2026-09-22 against [the City's Kitsilano South curb guide](https://vancouver.ca/files/cov/residential-permit-parking-kitsilano-south.pdf), `data/kitsilano-south.json`, and the side-less enforcement candidate coordinates in `data/free.json`. Curb bars are approximate schematic geometry. A block-centre point cannot decide which side a driver can use.

## Older points replaced by mapped curb faces

| Legacy point | Existing PDF lines at the point | Assessment |
| --- | --- | --- |
| `2000 W 6Th Av` (`49.266397,-123.151632`) | North `kits-south-959141f84e7d`, resident-permit window; south `kits-south-7b4d3b39cf89`, full-time permit | Both curb faces mapped near the candidate; the old Check signs dot is redundant. South bar is near its schematic endpoint, so this is not a whole-block assertion. |
| `2000 W 7Th Av` (`49.265559,-123.151663`) | North `kits-south-53224094480b`, resident-permit window; south `kits-south-e17a446666fb`, full-time permit | Both curb faces mapped at the candidate. North bar begins at this approximate point; do not infer exact sign boundary. |
| `2100 W 5Th Av` (`49.267293,-123.153983`) | Both faces split near the candidate between permit-only and 2-hour sections. North: `kits-south-15549d08033f` then `kits-south-f41d2cc19f1d`; south: `kits-south-3e8043865e09` then `kits-south-4aec57e73048` | Existing lines show side-specific choices. The candidate falls at a schematic split; retire the side-less dot, retaining uncertainty about the precise split. |
| `1800 W 7Th Av` (`49.265490,-123.147345`) | North `kits-south-be6914fa6200`, full-time permit; south `kits-south-d7de61ec74c4`, full-time permit | Both faces mapped at the candidate, but north line starts nearby and another south 2-hour line starts farther east. Do not generalize to the whole block. |

Other points in the South PDF's geographic envelope do not have clearly mapped curb bars on both sides at the point; they should not be removed as PDF duplicates solely from proximity.

## Street View spot checks

- [W 5th south curb near 2154, August 2024](https://www.google.com/maps/@?api=1&map_action=pano&pano=-_W4wgUbgQbmQZuVS4zELQ&heading=115&pitch=0&fov=15): a green 2-hour, 9am–6pm sign with a permit exception is visible on the south side, supporting local `kits-south-4aec57e73048`. The day and arrow text is not sharp enough in this frame to establish an independent precise schedule or boundary; retain the PDF's Mon–Sat days and approximate geometry as PDF evidence.
- [W 6th near 2050, November 2020](https://www.google.com/maps/@?api=1&map_action=pano&pano=vKz3kBdDk5TyrqS-WQKaNQ&heading=90&pitch=0&fov=50): parked vehicles and a distant sign are visible; no sign face can be read reliably. Do not upgrade either PDF curb's verification from this old view.
- [W 7th near 2048, August 2024](https://www.google.com/maps/@?api=1&map_action=pano&pano=KLcAiO4bQ5blRXKxgF-epQ&heading=270&pitch=0&fov=50): views along the road show sign backs and school-crossing signs, but no readable curb legend for nearby north/south permit bars.
