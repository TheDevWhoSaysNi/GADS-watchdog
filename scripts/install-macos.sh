#!/usr/bin/env bash
# Install GADS Watchdog as a launchd agent from this clone.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.gads.watchdog"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [[ ! -f "$ROOT/.env" && -f "$ROOT/.env.example" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "Created $ROOT/.env from the example. Fill any notification variables you want, leave the rest blank."
fi

chmod +x "$ROOT/scripts/run-watchdog.sh" "$ROOT/scripts/host-collector.sh"
mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/data"

if [[ ! -d "$ROOT/node_modules" ]]; then
  (cd "$ROOT" && npm install)
fi
if [[ ! -d "$ROOT/.next" ]]; then
  (cd "$ROOT" && npm run build)
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ROOT/scripts/run-watchdog.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>43180</string>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$ROOT/data/watchdog.log</string>
  <key>StandardErrorPath</key>
  <string>$ROOT/data/watchdog.err.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "Installed launchd agent $PLIST"
echo "Watchdog should be on http://127.0.0.1:43180"
echo "Guided: open /setup    Expert: edit .env then: launchctl kickstart -k gui/$(id -u)/$LABEL"
echo "Full steps: docs/INSTALL.md    Agents: AGENTS.md"
