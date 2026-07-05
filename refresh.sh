#!/bin/bash
# Re-download the Vancouver parking-meters dataset (updates weekly).
set -e
cd "$(dirname "$0")"
echo "Downloading latest meter data…"
curl -s "https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/parking-meters/exports/json" -o data/meters.json
count=$(python3 -c "import json;print(len(json.load(open('data/meters.json'))))")
echo "Saved $count meters to data/meters.json"
