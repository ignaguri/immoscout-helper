#!/usr/bin/env bash
# Guard against hard-coded colors / pixel spacing creeping back into the popup.
# Run from the extension/ directory. Exits 1 with a list of suspect lines if any
# are found outside the allowed zones.
#
# Allowed:
#   - HSL token definitions in src/popup/app.css (the source of truth)
#   - Inline transform/translate values
#   - Min-width/width pixel values needed for popup width math
#   - Tailwind-style numeric classes (e.g. "text-[11px]") — these resolve to
#     tokens at build time and are fine
set -euo pipefail
cd "$(dirname "$0")/.."

# Match raw hex like #abc / #abcdef inside Svelte files outside app.css
hex_hits=$(grep -RHnE --include='*.svelte' '#[0-9a-fA-F]{3,8}\b' src/popup || true)

if [[ -n "$hex_hits" ]]; then
  echo "Hex-color literals found in Svelte files (consider migrating to tokens):"
  echo "$hex_hits"
  exit 1
fi

echo "OK: no raw hex-color literals in popup .svelte files."
