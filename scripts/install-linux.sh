#!/usr/bin/env bash
# Install GADS Watchdog as a systemd service from this clone.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_NAME="gads-watchdog.service"

if [[ ! -f "$ROOT/.env" && -f "$ROOT/.env.example" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "Created $ROOT/.env from the example. Fill GADS_URL, login, and any pager vars. Leave the rest blank."
fi

if command -v systemctl >/dev/null 2>&1 && systemctl cat gads-hub.service >/dev/null 2>&1; then
  echo "Found gads-hub.service — set GADS_URL to this --port (often 10000 or 8080):"
  systemctl cat gads-hub.service | grep -E 'ExecStart|--port' || true
fi

chmod +x "$ROOT/scripts/"*.sh

if [[ ! -d "$ROOT/node_modules" ]]; then
  (cd "$ROOT" && npm install)
fi
if [[ ! -d "$ROOT/.next" ]]; then
  (cd "$ROOT" && npm run build)
fi

UNIT=$(cat <<EOF
[Unit]
Description=GADS Watchdog sidecar
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT
EnvironmentFile=-$ROOT/.env
# 43180 is Watchdog's own port — unused by GADS (8080/10000) and not a well-known service.
Environment=PORT=43180
ExecStart=$ROOT/scripts/run-watchdog.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
)

if [[ "$(id -u)" -eq 0 ]]; then
  UNIT_PATH="/etc/systemd/system/$UNIT_NAME"
  echo "$UNIT" | sed 's/WantedBy=default.target/WantedBy=multi-user.target/' > "$UNIT_PATH"
  systemctl daemon-reload
  systemctl enable --now "$UNIT_NAME"
  echo "Installed system service $UNIT_PATH"
  systemctl --no-pager --full status "$UNIT_NAME" || true
else
  UNIT_DIR="$HOME/.config/systemd/user"
  mkdir -p "$UNIT_DIR"
  UNIT_PATH="$UNIT_DIR/$UNIT_NAME"
  echo "$UNIT" > "$UNIT_PATH"
  systemctl --user daemon-reload
  systemctl --user enable --now "$UNIT_NAME"
  echo "Installed user service $UNIT_PATH"
  echo "To keep it running after logout: sudo loginctl enable-linger $USER"
  systemctl --user --no-pager --full status "$UNIT_NAME" || true
fi

echo
echo "Watchdog should be on http://127.0.0.1:43180"
echo "Guided: open /setup    Expert: edit .env and restart"
echo "Full steps: docs/INSTALL.md    Agents: AGENTS.md"
