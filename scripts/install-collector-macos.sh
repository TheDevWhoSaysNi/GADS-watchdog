#!/usr/bin/env bash
# Install only the host collector on a Mac provider. Do not install the Watchdog UI here.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.gads.watchdog.collector"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
WATCH_URL="${WATCH_URL:?Set WATCH_URL to the hub Watchdog, e.g. http://HUB_LAN_IP:48080}"
COLLECTOR_TOKEN="${COLLECTOR_TOKEN:?Set COLLECTOR_TOKEN from the hub Watchdog settings}"
INTERVAL="${INTERVAL:-15}"
ALLOW_PROVIDER_RESTART="${ALLOW_PROVIDER_RESTART:-}"
PROVIDER_UNIT="${PROVIDER_UNIT:-}"

chmod +x "$ROOT/scripts/host-collector.sh" "$ROOT/scripts/restart-gads-provider.sh"
mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/data"

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
    <string>$ROOT/scripts/host-collector.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>WATCH_URL</key>
    <string>$WATCH_URL</string>
    <key>COLLECTOR_TOKEN</key>
    <string>$COLLECTOR_TOKEN</string>
    <key>INTERVAL</key>
    <string>$INTERVAL</string>
    <key>ALLOW_PROVIDER_RESTART</key>
    <string>$ALLOW_PROVIDER_RESTART</string>
    <key>PROVIDER_UNIT</key>
    <string>$PROVIDER_UNIT</string>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/sbin:/sbin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$ROOT/data/collector.log</string>
  <key>StandardErrorPath</key>
  <string>$ROOT/data/collector.err.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "Collector posting to $WATCH_URL from $(hostname)"
echo "Uninstall: launchctl bootout gui/$(id -u)/$LABEL"
