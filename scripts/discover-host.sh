#!/usr/bin/env bash
# Read-only snapshot of how GADS / Watchdog look on this machine.
# No secrets. Run on the hub first, then on each USB host.
set -euo pipefail

echo "hostname=$(hostname -s 2>/dev/null || hostname)"
echo "fqdn=$(hostname -f 2>/dev/null || hostname)"
echo "os=$(uname -s) arch=$(uname -m)"
echo "user=$(id -un) uid=$(id -u)"
echo "home=$HOME"
echo "pwd=$(pwd)"

if command -v node >/dev/null 2>&1; then
  echo "node=$(node -v)"
else
  echo "node=missing (need 20+)"
fi
command -v npm >/dev/null 2>&1 && echo "npm=$(npm -v)" || echo "npm=missing"
command -v git >/dev/null 2>&1 && echo "git=$(git --version)" || echo "git=missing"
command -v python3 >/dev/null 2>&1 && echo "python3=$(python3 --version 2>&1)" || echo "python3=missing"
command -v adb >/dev/null 2>&1 && echo "adb=$(command -v adb)" || echo "adb=missing"
command -v ios >/dev/null 2>&1 && echo "go-ios=$(command -v ios)" || echo "go-ios=missing"
command -v idevice_id >/dev/null 2>&1 && echo "idevice_id=$(command -v idevice_id)" || echo "idevice_id=missing"

echo "--- processes (name/args only) ---"
ps -ax -o args= 2>/dev/null | grep -Ei 'gads|watchdog' | grep -v grep | sed 's/password[^ ]*/password=***/Ig' | head -40 || true

echo "--- listen ports ---"
if command -v ss >/dev/null 2>&1; then
  ss -lptn 2>/dev/null | grep -E ':(8080|10000|43180|48080|27017)\b' || ss -lptn 2>/dev/null | head -20
elif command -v lsof >/dev/null 2>&1; then
  lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -E ':(8080|10000|43180|48080|27017)\b' || true
fi

echo "--- systemd (system) ---"
if command -v systemctl >/dev/null 2>&1; then
  systemctl list-unit-files --no-pager 2>/dev/null | grep -i gads || echo "(none)"
  echo "--- systemd (user) ---"
  systemctl --user list-unit-files --no-pager 2>/dev/null | grep -i gads || echo "(none)"
  for unit in gads-hub.service gads-provider.service gads-watchdog.service gads-watchdog-collector.service; do
    if systemctl cat "$unit" >/dev/null 2>&1; then
      echo "unit=$unit (system)"
      systemctl cat "$unit" 2>/dev/null | grep -E '^(ExecStart|Environment|User|WorkingDirectory)=' || true
    fi
    if systemctl --user cat "$unit" >/dev/null 2>&1; then
      echo "unit=$unit (user)"
      systemctl --user cat "$unit" 2>/dev/null | grep -E '^(ExecStart|Environment|WorkingDirectory)=' || true
    fi
  done
fi

echo "--- launchd ---"
if command -v launchctl >/dev/null 2>&1; then
  launchctl list 2>/dev/null | grep -Ei 'gads|watchdog' || echo "(none)"
fi

echo "--- docker ---"
if command -v docker >/dev/null 2>&1; then
  docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' 2>/dev/null | grep -i gads || echo "(none)"
fi

echo "--- hint ---"
echo "Watchdog is port 48080 (GADS-shaped). GADS hub --port is whatever ExecStart / docker / ps shows."
echo "If Watchdog runs on this box, GADS_URL=http://127.0.0.1:<gads-port>"
