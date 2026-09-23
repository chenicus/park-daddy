# Robson North Street View audit — 2026-09-23

The Robson North PDF produces 26 approximate permit-curb sections. These are map segments, not counted stalls. This batch inspected three of them; `robson-north-ff2022f024b4` at 1728 Alberni was handled in a separate audit and is excluded here. No section was promoted to fully Street View verified: a readable sign at one point does not establish the full schematic curb extent.

| Section | Street View observation | Result |
| --- | --- | --- |
| `robson-north-8546d28482c2`, Alberni north, Bidwell–Cardero | [July 2024 image near 1684 Alberni](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=49.29105,-123.1324&heading=0) shows a construction work zone occupying the north curb. | No permanent same-side parking sign or continuous usable curb can be verified from this image. Keep PDF-only and flag the construction/current-condition issue for later checking. |
| `robson-north-e4fc0a2deaaf`, Alberni north, Nicola–Broughton | [July 2024 image near 1444 Alberni](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=49.28914,-123.12955&heading=0) shows adjacent signs on the apparent north curb: a permit-exception no-parking sign and a separate no-parking sign. | Local sign text is visible, but the signs are at a driveway and their directional scope and relationship to the mapped PDF bar are not resolved. No full-section confirmation. |
| `robson-north-81791eb43962`, Bidwell west, Alberni–Robson | [August 2024 image near 735 Bidwell](https://www.google.com/maps/@?api=1&map_action=pano&pano=Pew1L2uE1v1-qD0NiyCXAA&heading=315&pitch=0&fov=15) clearly shows “No parking except with permit,” arrows both directions, on the **east/opposite curb**. Panning to the west side did not show a readable sign. | Do not transfer the east-side rule to the mapped west curb. West curb remains PDF-only. |

Batch result: 3 inspected, 0 full-section confirmations, 3 unresolved. The remaining 22 sections outside this batch and the separately handled Alberni section require their own same-side sign and endpoint checks. No changes were made to `robson-north.json`.
