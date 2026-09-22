# Strathcona permit-parking source audit

Source: [City of Vancouver Strathcona residential permit zone map](https://vancouver.ca/files/cov/residential-permit-parking-strathcona.pdf), linked from the [City's permit-purchase page](https://vancouver.ca/streets-transportation/buy-your-annual-or-short-term-or-visitor-parking-permit.aspx). The indexed PDF is one page. It identifies the purple area only as residents eligible to apply for a parking decal. That shading is **not a curb restriction**.

## Printed legend

The PDF text identifies these distinct curb rules:

| Marking | Printed schedule |
| --- | --- |
| Full-time permit parking | All times |
| Resident permit parking | 8am-6pm Mon-Fri |
| 2-hour parking, except with permit | 8am-6pm Mon-Fri |
| 2-hour parking, except with permit | 8am-3pm Mon-Fri |
| 2-hour parking, except with permit | 9am-6pm Mon-Fri |
| 2-hour parking, except with permit | 9am-6pm Mon-Sat |
| 2-hour parking | 9am-6pm; days not specified in extracted legend |
| 1-hour parking | 9am-6pm Mon-Fri |
| No parking | 8am-5pm school days |

The map explicitly states that it is a guide and drivers should refer to posted street signs. Outside a printed timed rule, do not infer unrestricted/free parking without checking signs.

## Curb transcription and Street View

No curb records were emitted. The City's PDF is discoverable through web search, but its binary returned HTTP 403 to the local environment and the in-app browser's PDF canvas did not render. Without a legible view of the individual patterned bars, their street sides and endpoints cannot be transcribed reliably. A direct Google Maps location near Strathcona also did not provide a selected panorama or sign view. There is therefore **no Street View-confirmed sign, imagery date, or side-specific curb classification** from this audit. The map legend alone must not be applied to whole blocks or the purple eligibility area.

Next step: obtain a legible render of the source PDF; transcribe only visible side-specific curb bars, then spot-check a sampled sign on each rule type in Street View and record panorama URLs and imagery dates. Flag any conflict with the PDF instead of silently overriding it.
