#!/bin/sh
# usage: tools/pp_search.sh <query> [max]  -> id | title | licence | glb  (poly.pizza; CC0 only shown first)
q="$1"; max="${2:-12}"; tmp="${TMPDIR:-/tmp}/pp_$$"; mkdir -p "$tmp"
curl -s -m 60 "https://poly.pizza/search/$(echo "$q" | sed 's/ /%20/g')" -o "$tmp/s.html"
for id in $(grep -oE '/m/[A-Za-z0-9_-]+' "$tmp/s.html" | sort -u | head -n "$max" | cut -d/ -f3); do
  curl -s -m 60 "https://poly.pizza/m/$id" -o "$tmp/m.html"
  t=$(grep -oE 'og:title" content="[^"]*' "$tmp/m.html" | head -1 | sed 's/.*content="//; s/ - Free Model//')
  l=$(grep -oE "\"Licence\":\"[^\"]+\"" "$tmp/m.html" | head -1 | cut -d\" -f4)
  g=$(grep -oE 'https://static.poly.pizza/[^"]+\.glb' "$tmp/m.html" | head -1)
  echo "$id | $t | $l | $g"
done
rm -rf "$tmp"
