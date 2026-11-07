#!/usr/bin/env bash
# Read iPhone battery levels on a USB host and ask Watchdog whether each
# phone should charge or rest. This does not cut power by itself.
# Set CHARGE_SWITCH_CMD to a program that accepts "<udid> <charge|rest>"
# once a per-port power switch is installed. Sabrent hubs have no such switch.
#
#   WATCH_URL=http://127.0.0.1:48080 COLLECTOR_TOKEN=… ./scripts/charge-window.sh
#   CHARGE_UDIDS=00008101-… ./scripts/charge-window.sh
set -euo pipefail

WATCH_URL="${WATCH_URL:-http://127.0.0.1:48080}"
COLLECTOR_TOKEN="${COLLECTOR_TOKEN:?Set COLLECTOR_TOKEN to the token from GADS Watchdog Settings}"
CHARGE_UDIDS="${CHARGE_UDIDS:-}"
CHARGE_MAX="${CHARGE_MAX:-8}"
CHARGE_SWITCH_CMD="${CHARGE_SWITCH_CMD:-}"

python3 - "$WATCH_URL" "$COLLECTOR_TOKEN" "$CHARGE_UDIDS" "$CHARGE_MAX" "$CHARGE_SWITCH_CMD" <<'PY'
import json, os, socket, subprocess, sys, urllib.error, urllib.request

watch_url, token, udid_filter, charge_max, switch_cmd = sys.argv[1:6]
os.environ["PATH"] = "/usr/local/bin:/opt/homebrew/bin:/usr/sbin:/sbin:/usr/bin:/bin:" + os.environ.get("PATH", "")
limit = max(1, int(charge_max or "8"))


def run(cmd, timeout):
    try:
        return subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL, timeout=timeout)
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return ""


def udids():
    wanted = [item.strip() for item in udid_filter.split(",") if item.strip()]
    if wanted:
        return wanted[:limit]
    listed = run(["ios", "list"], 12)
    found = []
    try:
        payload = json.loads(listed or "{}")
        device_list = payload.get("deviceList") if isinstance(payload, dict) else None
        if isinstance(device_list, list):
            found = [str(item) for item in device_list if str(item).strip()]
    except json.JSONDecodeError:
        found = []
    if not found:
        found = [line.strip() for line in run(["idevice_id", "-l"], 8).splitlines() if line.strip() and not line.startswith("{")]
    return found[:limit]


def percent_for(udid):
    raw = run(["ideviceinfo", "-u", udid, "-q", "com.apple.mobile.battery", "-k", "BatteryCurrentCapacity"], 8).strip()
    if raw.isdigit():
        return int(raw)
    info = run(["ios", "info", "--udid", udid], 15)
    for line in info.splitlines():
        if "BatteryCurrentCapacity" not in line:
            continue
        digits = "".join(ch for ch in line if ch.isdigit())
        if digits:
            value = int(digits)
            if 0 <= value <= 100:
                return value
    return None


batteries = [{"udid": udid, "percent": percent_for(udid)} for udid in udids()]
body = json.dumps({"hostname": socket.gethostname(), "batteries": batteries}).encode()
request = urllib.request.Request(
    watch_url.rstrip("/") + "/api/host/batteries",
    data=body,
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    method="POST",
)
try:
    with urllib.request.urlopen(request, timeout=20) as response:
        reply = json.loads(response.read().decode())
except urllib.error.URLError as exc:
    print(f"charge window post failed: {exc}", file=sys.stderr)
    sys.exit(1)

plan = reply.get("plan") if isinstance(reply.get("plan"), list) else []
print(json.dumps({"high": reply.get("high"), "low": reply.get("low"), "plan": plan, "switch": bool(switch_cmd)}))
if not switch_cmd:
    print("dry run: no CHARGE_SWITCH_CMD set, power was not changed", flush=True)
    sys.exit(0)

for item in plan:
    if not isinstance(item, dict):
        continue
    action = item.get("action")
    udid = str(item.get("udid") or "").strip()
    if action not in {"charge", "rest"} or not udid:
        continue
    subprocess.run([switch_cmd, udid, action], check=False)
PY
