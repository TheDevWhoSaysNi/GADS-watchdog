#!/usr/bin/env bash
# Start GADS Watchdog from a clone. Used by systemd and launchd.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  npm install
fi

if [[ ! -d .next ]]; then
  npm run build
fi

exec npm start
