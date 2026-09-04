#!/usr/bin/env bash
# Install only the host collector on a Linux USB host. Do not install the Watchdog UI here.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_NAME="gads-watchdog-collector.service"
WATCH_URL="${WATCH_URL:?Set WATCH_URL to the Watchdog URL, e.g. http://127.0.0.1:48080}"
COLLECTOR_TOKEN="${COLLECTOR_TOKEN:?Set COLLECTOR_TOKEN from the hub Watchdog settings}"
INTERVAL="${INTERVAL:-15}"

chmod +x "$ROOT/scripts/host-collector.sh"

UNIT=$(cat <<EOF
[Unit]
Description=GADS Watchdog host collector
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT
Environment=WATCH_URL=$WATCH_URL
Environment=COLLECTOR_TOKEN=$COLLECTOR_TOKEN
Environment=INTERVAL=$INTERVAL
ExecStart=$ROOT/scripts/host-collector.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
)

if [[ "$(id -u)" -eq 0 ]]; then
  echo "$UNIT" | sed 's/WantedBy=default.target/WantedBy=multi-user.target/' > "/etc/systemd/system/$UNIT_NAME"
  systemctl daemon-reload
  systemctl enable --now "$UNIT_NAME"
  systemctl --no-pager --full status "$UNIT_NAME" || true
else
  mkdir -p "$HOME/.config/systemd/user"
  echo "$UNIT" > "$HOME/.config/systemd/user/$UNIT_NAME"
  systemctl --user daemon-reload
  systemctl --user enable --now "$UNIT_NAME"
  echo "User service installed. Keep it after logout: sudo loginctl enable-linger $USER"
  systemctl --user --no-pager --full status "$UNIT_NAME" || true
fi

echo "Collector posting to $WATCH_URL from $(hostname)"
