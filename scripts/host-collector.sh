#!/usr/bin/env bash
# Collect ADB, USB sysfs, optional iOS UDIDs, and recent USB kernel lines.
# Run this on the GADS provider host — the machine the phones are plugged into.
set -euo pipefail

WATCH_URL="${WATCH_URL:-http://127.0.0.1:43180}"
COLLECTOR_TOKEN="${COLLECTOR_TOKEN:?Set COLLECTOR_TOKEN to the token from GADS Watchdog Settings}"
INTERVAL="${INTERVAL:-15}"
ONCE="${ONCE:-0}"

collect_once() {
  python3 - "$WATCH_URL" "$COLLECTOR_TOKEN" <<'PY'
import json, os, re, socket, subprocess, sys, urllib.error, urllib.request

watch_url, token = sys.argv[1], sys.argv[2]


def run(cmd):
    try:
        return subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""


adb = []
for line in run(["adb", "devices", "-l"]).splitlines():
    if not line.strip() or line.startswith("List of devices"):
        continue
    parts = line.split()
    if len(parts) < 2:
        continue
    udid, status = parts[0], parts[1]
    extra = {}
    for item in parts[2:]:
        if ":" in item:
            key, value = item.split(":", 1)
            extra[key] = value
    adb.append({
        "udid": udid,
        "status": status if status in {"device", "offline", "unauthorized"} else "unknown",
        "usb": extra.get("usb"),
        "product": extra.get("product"),
        "model": extra.get("model"),
    })

usb = []
root = "/sys/bus/usb/devices"
if os.path.isdir(root):
    for name in sorted(os.listdir(root)):
        path = os.path.join(root, name)
        vendor = os.path.join(path, "idVendor")
        product = os.path.join(path, "idProduct")
        if not (os.path.isfile(vendor) and os.path.isfile(product)):
            continue

        def read(filename):
            try:
                with open(os.path.join(path, filename), encoding="utf-8", errors="ignore") as fh:
                    return fh.read().strip()
            except OSError:
                return ""

        usb.append({
            "bus": read("busnum") or "?",
            "sysName": name,
            "vendorId": read("idVendor"),
            "productId": read("idProduct"),
            "manufacturer": read("manufacturer"),
            "product": read("product"),
            "serial": read("serial") or None,
        })

ios = [line.strip() for line in run(["idevice_id", "-l"]).splitlines() if line.strip()]

dmesg = []
kernel = run(["dmesg", "-T"]) or run(["dmesg"])
for line in kernel.splitlines()[-200:]:
    if re.search(r"usb|over-current|disconnect|xhci", line, re.I):
        dmesg.append(line[-240:])
dmesg = dmesg[-20:]

payload = {
    "hostname": socket.gethostname(),
    "adb": adb,
    "usb": usb,
    "ios": ios,
    "dmesg": dmesg,
}

req = urllib.request.Request(
    watch_url.rstrip("/") + "/api/host/snapshot",
    data=json.dumps(payload).encode(),
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(resp.read().decode(), flush=True)
except urllib.error.URLError as exc:
    print(f"collector post failed: {exc}", file=sys.stderr)
    sys.exit(1)
PY
}

if [[ "$ONCE" == "1" ]]; then
  collect_once
  exit 0
fi

echo "Posting host snapshots to ${WATCH_URL} every ${INTERVAL}s"
while true; do
  collect_once || true
  sleep "$INTERVAL"
done
