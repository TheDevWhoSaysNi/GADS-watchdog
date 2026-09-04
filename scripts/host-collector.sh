#!/usr/bin/env bash
# Collect ADB, USB (Linux sysfs or macOS system_profiler), optional idevice_id,
# and recent USB kernel lines. Run on the provider USB host, not as a second UI.
# Linux: ./scripts/install-collector-linux.sh
# macOS: ./scripts/install-collector-macos.sh
set -euo pipefail

WATCH_URL="${WATCH_URL:-http://127.0.0.1:48080}"
COLLECTOR_TOKEN="${COLLECTOR_TOKEN:?Set COLLECTOR_TOKEN to the token from GADS Watchdog Settings}"
INTERVAL="${INTERVAL:-15}"
ONCE="${ONCE:-0}"

collect_once() {
  python3 - "$WATCH_URL" "$COLLECTOR_TOKEN" <<'PY'
import json, os, re, socket, subprocess, sys, urllib.error, urllib.request

watch_url, token = sys.argv[1], sys.argv[2]


os.environ["PATH"] = "/usr/local/bin:/opt/homebrew/bin:" + os.environ.get("PATH", "")


def run(cmd, timeout=None):
    try:
        return subprocess.check_output(
            cmd, text=True, stderr=subprocess.DEVNULL, timeout=timeout
        )
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return ""


def hex_id(value):
    token = str(value or "").split()[0]
    if token.lower().startswith("0x"):
        return token[2:]
    return token


adb = []
for line in run(["adb", "devices", "-l"], timeout=8).splitlines():
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

def ios_from_goios():
    found = []
    for line in run(["ios", "list"], timeout=20).splitlines():
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and obj.get("deviceList"):
            return [str(item) for item in obj["deviceList"]]
        if isinstance(obj, list):
            return [str(item) for item in obj]
    return found


# go-ios is the reliable listing on large Mac farms. libimobiledevice can hang.
ios = ios_from_goios()
if not ios:
    ios = [
        line.strip()
        for line in run(["idevice_id", "-l"], timeout=8).splitlines()
        if line.strip() and not line.startswith("{")
    ]

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
elif sys.platform == "darwin" and not ios:
    # system_profiler is very slow on large iPhone farms; skip when go-ios already listed them.
    try:
        raw = run(["system_profiler", "SPUSBDataType", "-json"], timeout=25)
        tree = json.loads(raw or "{}")
    except json.JSONDecodeError:
        tree = {}

    def walk_usb(node, bus="?"):
        if not isinstance(node, dict):
            return
        serial = node.get("serial_num") or node.get("serial_number")
        vendor = str(node.get("vendor_id") or "")
        product = str(node.get("product_id") or "")
        if serial or (vendor and product):
            usb.append({
                "bus": str(node.get("location_id") or bus),
                "sysName": str(node.get("_name") or "usb"),
                "vendorId": hex_id(vendor),
                "productId": hex_id(product),
                "manufacturer": node.get("manufacturer"),
                "product": node.get("_name"),
                "serial": serial or None,
            })
        for child in node.get("_items") or []:
            walk_usb(child, str(node.get("location_id") or bus))

    for top in tree.get("SPUSBDataType") or []:
        walk_usb(top)

dmesg = []
if sys.platform != "darwin":
    kernel = run(["dmesg", "-T"], timeout=3) or run(["dmesg"], timeout=3)
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
