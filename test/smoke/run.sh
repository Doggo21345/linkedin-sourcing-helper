#!/usr/bin/env bash
# Loads the real popup in jsdom with a fake chrome.* API and clicks through the
# Job, Person (Write message / Mark as messaged), and Saved (follow-ups) flows.
# Needs node 18+; installs jsdom into a temp folder on first run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${TMPDIR:-/tmp}/sourcing-helper-smoke"
mkdir -p "$WORK"
[ -d "$WORK/node_modules/jsdom" ] || (cd "$WORK" && npm install --silent jsdom@24 >/dev/null)
rm -rf "$WORK/ext" && mkdir -p "$WORK/ext"
# The extension's files are ES modules; a package.json lets node load them as such.
(cd "$ROOT" && tar --exclude=.git -cf - .) | (cd "$WORK/ext" && tar -xf -)
echo '{"type":"module"}' > "$WORK/ext/package.json"
cp "$ROOT/test/smoke/popup_smoke.mjs" "$WORK/smoke.mjs"
cd "$WORK"
for s in job profile saved; do node smoke.mjs "$s"; echo; done
