#!/bin/sh
# Renders the README screenshot (assets/editor.png) at 2x with headless Chrome.
# Needs `pnpm dev` running on http://localhost:5173. Set CHROME to override the binary.
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT
"$CHROME" --headless=new --user-data-dir="$PROFILE" --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1600,890 --default-background-color=00000000 \
  --virtual-time-budget=10000 --screenshot="$PWD/assets/editor.png" \
  "file://$PWD/scripts/screenshot-frame.html" 2>/dev/null
echo "wrote assets/editor.png"
