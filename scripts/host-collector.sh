#!/usr/bin/env bash
# Collect ADB, USB (Linux sysfs or macOS ioreg/IOKit), go-ios `ios list`,
# and recent USB kernel lines. Run on the provider USB host, not as a second UI.
# Linux: ./scripts/install-collector-linux.sh
# macOS: ./scripts/install-collector-macos.sh
set -euo pipefail

WATCH_URL="${WATCH_URL:-http://127.0.0.1:48080}"
COLLECTOR_TOKEN="${COLLECTOR_TOKEN:?Set COLLECTOR_TOKEN to the token from GADS Watchdog Settings}"
INTERVAL="${INTERVAL:-15}"
ONCE="${ONCE:-0}"
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"

collect_once() {
  python3 - "$WATCH_URL" "$COLLECTOR_TOKEN" "$SCRIPTS" <<'PY'
import json, os, re, socket, subprocess, sys, time, urllib.error, urllib.request

watch_url, token, scripts_dir = sys.argv[1], sys.argv[2], sys.argv[3]


os.environ["PATH"] = "/usr/local/bin:/opt/homebrew/bin:/usr/sbin:/sbin:/usr/bin:/bin:" + os.environ.get("PATH", "")


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


def as_usb_hex(value):
    text = str(value or "").strip()
    if not text:
        return ""
    if text.lower().startswith("0x"):
        return text[2:].lower()
    if text.isdigit():
        return format(int(text), "04x")
    return hex_id(text).lower()


def looks_like_udid(serial):
    compact = re.sub(r"[^0-9A-Fa-f]", "", serial or "")
    return 16 <= len(compact) <= 40


def usb_from_ioreg():
    """macOS IOKit USB tree. Built-in; unlike system_profiler this stays fast on large farms."""
    if sys.platform != "darwin":
        return []
    raw = run(["ioreg", "-p", "IOUSB", "-l", "-w", "0"], timeout=8)
    devices = []
    current = {}

    def flush():
        if not current:
            return
        serial = (current.get("serial") or "").strip() or None
        vendor = current.get("vendorId") or ""
        product_id = current.get("productId") or ""
        name = current.get("name") or "usb"
        if serial or vendor or product_id:
            devices.append({
                "bus": current.get("location") or "?",
                "sysName": name,
                "vendorId": vendor,
                "productId": product_id,
                "manufacturer": current.get("manufacturer"),
                "product": current.get("product") or name,
                "serial": serial,
            })
        current.clear()

    for line in raw.splitlines():
        # Intel T2 minis: AppleUSBDevice. Apple silicon: IOUSBHostDevice.
        if re.search(r"\+-o\s+\S+", line) and re.search(r"<class (AppleUSB|IOUSB)", line):
            flush()
            named = re.search(r"\+-o\s+(\S+)", line)
            current["name"] = named.group(1).split("@")[0] if named else "usb"
            loc = re.search(r"@([0-9a-fA-F]+)", line)
            if loc:
                current["location"] = loc.group(1)
            continue
        serial = re.search(r'"USB Serial Number"\s*=\s*"([^"]+)"', line)
        if serial:
            current["serial"] = serial.group(1)
        vendor = re.search(r'"idVendor"\s*=\s*(\d+)', line)
        if vendor:
            current["vendorId"] = as_usb_hex(vendor.group(1))
        product_id = re.search(r'"idProduct"\s*=\s*(\d+)', line)
        if product_id:
            current["productId"] = as_usb_hex(product_id.group(1))
        product = re.search(r'"USB Product Name"\s*=\s*"([^"]+)"', line)
        if product:
            current["product"] = product.group(1)
        manufacturer = re.search(r'"USB Vendor Name"\s*=\s*"([^"]+)"', line)
        if manufacturer:
            current["manufacturer"] = manufacturer.group(1)
    flush()
    return devices


# go-ios is pairing/Lockdown. ioreg is the cable. Lockdown can hide a seated phone
# from `ios list` while IOKit still has the USB serial.
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
elif sys.platform == "darwin":
    usb = usb_from_ioreg()

ios = list(
    dict.fromkeys(
        [
            *ios,
            *[
                item["serial"]
                for item in usb
                if item.get("serial") and looks_like_udid(item["serial"])
            ],
        ]
    )
)

dmesg = []
if sys.platform != "darwin":
    kernel = run(["dmesg", "-T"], timeout=3) or run(["dmesg"], timeout=3)
    for line in kernel.splitlines()[-200:]:
        if re.search(r"usb|over-current|disconnect|xhci", line, re.I):
            dmesg.append(line[-240:])
    dmesg = dmesg[-20:]

def provider_nickname():
    for line in run(["ps", "-ax", "-o", "args="], timeout=5).splitlines():
        if "gads" in line.lower() and "provider" in line and "--nickname" in line:
            parts = line.split()
            if "--nickname" in parts:
                idx = parts.index("--nickname")
                if idx + 1 < len(parts):
                    return parts[idx + 1]
    return os.environ.get("GADS_PROVIDER_NICKNAME", "").strip()


def provider_control():
    allowed = os.environ.get("ALLOW_PROVIDER_RESTART", "").strip().lower() in {
        "1", "true", "yes", "on",
    }
    unit = os.environ.get("PROVIDER_UNIT", "").strip()
    kind = "none"
    if sys.platform == "darwin":
        default = "com.gads.provider"
        if unit or os.path.exists("/Library/LaunchDaemons/com.gads.provider.plist"):
            kind = "launchd"
            unit = unit or default
    elif run(["systemctl", "cat", unit or "gads-provider.service"], timeout=4) or run(
        ["systemctl", "--user", "cat", unit or "gads-provider.service"], timeout=4
    ):
        kind = "systemd"
        unit = unit or "gads-provider.service"
    return {
        "allowed": allowed,
        "kind": kind,
        "unit": unit,
        "nickname": provider_nickname(),
    }


def host_vitals():
    vitals = {
        "hostname": socket.gethostname(),
        "cpuPercent": None,
        "memPercent": None,
        "diskPercent": None,
        "load1": None,
        "uptimeSeconds": None,
    }
    try:
        vitals["load1"] = round(os.getloadavg()[0], 2)
    except OSError:
        pass
    cores = os.cpu_count() or 1
    cpu_sum = 0.0
    for token in run(["ps", "-A", "-o", "%cpu="], timeout=8).split():
        try:
            cpu_sum += float(token)
        except ValueError:
            pass
    if cpu_sum:
        vitals["cpuPercent"] = max(0, min(100, round(cpu_sum / cores)))
    if sys.platform == "darwin":
        try:
            total = int(run(["sysctl", "-n", "hw.memsize"], timeout=4) or 0)
            page = 4096
            avail = 0
            for line in run(["vm_stat"], timeout=5).splitlines():
                match = re.search(r"page size of (\d+)", line)
                if match:
                    page = int(match.group(1))
                if line.startswith(
                    ("Pages free", "Pages speculative", "Pages inactive", "Pages purgeable")
                ):
                    digits = re.search(r"(\d+)", line)
                    if digits:
                        avail += int(digits.group(1)) * page
            if total:
                vitals["memPercent"] = max(0, min(100, round((total - avail) / total * 100)))
        except Exception:
            pass
        boot = run(["sysctl", "-n", "kern.boottime"], timeout=4)
        sec = re.search(r"sec = (\d+)", boot)
        if sec:
            vitals["uptimeSeconds"] = max(0, int(time.time()) - int(sec.group(1)))
    else:
        try:
            info = {}
            with open("/proc/meminfo", encoding="utf-8") as fh:
                for line in fh:
                    key, value = line.split(":", 1)
                    info[key] = int(value.strip().split()[0])
            total = info.get("MemTotal") or 0
            avail = info.get("MemAvailable") or info.get("MemFree") or 0
            if total:
                vitals["memPercent"] = max(0, min(100, round((total - avail) / total * 100)))
        except OSError:
            pass
        try:
            with open("/proc/uptime", encoding="utf-8") as fh:
                vitals["uptimeSeconds"] = int(float(fh.read().split()[0]))
        except OSError:
            pass
    df = run(["df", "-P", "/"], timeout=5).splitlines()
    if len(df) >= 2:
        pct = re.search(r"(\d+)%", df[-1])
        if pct:
            vitals["diskPercent"] = int(pct.group(1))
    return vitals


payload = {
    "hostname": socket.gethostname(),
    "adb": adb,
    "usb": usb,
    "ios": ios,
    "dmesg": dmesg,
    "providerControl": provider_control(),
    "vitals": host_vitals(),
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
        raw = resp.read().decode()
        print(raw, flush=True)
        try:
            reply = json.loads(raw)
        except json.JSONDecodeError:
            reply = {}
        if reply.get("restartProvider"):
            script = os.path.join(scripts_dir, "restart-gads-provider.sh")
            if os.path.isfile(script):
                print(run(["bash", script], timeout=30) or "provider restart requested", flush=True)
            else:
                print("restart-gads-provider.sh missing", file=sys.stderr)
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
