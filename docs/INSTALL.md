# Install GADS Watchdog

This sidecar watches an official [GADS](https://github.com/shamanec/GADS) hub and pages you when phones stay down. It does not replace GADS. iOS remote control uses shamanec’s [WebDriverAgent](https://github.com/shamanec/WebDriverAgent) fork — keep that on the official repo too.

You need **Node.js 20+** and `npm`. Watchdog listens on **port 43180**.

## Which machine gets what

```
phones --USB--> provider (Mac Mini / Linux USB host)
                     |
                     | collector only
                     v
              Watchdog  <---- polls ----  GADS hub
           (Linux / Mac / Windows)
```

- **Watchdog UI + alerts** go on the hub box, or any box that can reach the hub API. One Watchdog is enough.
- **Collectors** go on every machine the USB cables plug into. Do **not** install the Watchdog web app on each provider.
- Without a collector, alerts are only “phone is down.” With a collector, Watchdog can say unplugged vs ADB vs setup/WDA.

Official GADS often uses hub port **10000**. Some installs (including Ubuntu systemd units) use **8080**. Always read the hub’s `ExecStart` / `--port`. Do not assume 10000.

## Path 1 — new to phone farms (guided)

On the machine that will run Watchdog:

```bash
git clone https://github.com/TheDevWhoSaysNi/GADS-watchdog.git
cd GADS-watchdog
npm install
npm run dev
```

Windows PowerShell:

```powershell
git clone https://github.com/TheDevWhoSaysNi/GADS-watchdog.git
cd GADS-watchdog
npm install
npm run dev
```

Open [http://127.0.0.1:43180/setup](http://127.0.0.1:43180/setup).

1. Peek at the demo farm if you want.
2. Install [ntfy](https://ntfy.sh) on your phone (no account).
3. Generate a private topic, subscribe, send a test ping.
4. When ready, paste the real hub URL and turn demo mode off.

Grace is at least **15 seconds** (default **60**). A 5-second USB hiccup stays quiet.

## Path 2 — expert / service (Linux, Windows, macOS)

```bash
git clone https://github.com/TheDevWhoSaysNi/GADS-watchdog.git
cd GADS-watchdog
cp .env.example .env
```

Windows:

```powershell
git clone https://github.com/TheDevWhoSaysNi/GADS-watchdog.git
cd GADS-watchdog
Copy-Item .env.example .env
```

Edit `.env`. Leave unused notification variables **blank**. Filled ones all get the same alert.

Set at least:

```env
GADS_MODE=live
GADS_URL=http://127.0.0.1:8080
GADS_USERNAME=gads-watchdog-01
GADS_PASSWORD=your-hub-password
GADS_AUTH_ENABLED=true
WATCHDOG_DOWN_GRACE_SECONDS=90
```

Create a **dedicated hub user** for Watchdog (admin/read is enough). Do not reuse your personal GADS login in chat logs or tickets.

### Telegram (typical expert pager)

1. Telegram → [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token.
2. Message the bot (or add it to a group and send a message).
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `"chat":{"id": ...}`.
4. Put `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`.

Then install the service.

**Ubuntu / Linux (systemd)** — from the clone:

```bash
chmod +x scripts/*.sh
./scripts/install-linux.sh
```

If you installed as a normal user (not root):

```bash
sudo loginctl enable-linger "$USER"
```

Without linger, the user service dies when you log out. Check the hub port:

```bash
systemctl cat gads-hub.service | grep ExecStart
```

Restart after editing `.env`:

```bash
systemctl --user restart gads-watchdog
# or, if installed as root:
sudo systemctl restart gads-watchdog
```

**Windows (PowerShell as your user)**

If the script is blocked:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

```powershell
.\scripts\install-windows.ps1
```

That registers a Scheduled Task named `GADS Watchdog` at logon. After `.env` changes:

```powershell
Restart-ScheduledTask -TaskName "GADS Watchdog"
```

Uninstall:

```powershell
Unregister-ScheduledTask -TaskName "GADS Watchdog" -Confirm:$false
```

**macOS (Terminal / launchd)**

```bash
chmod +x scripts/*.sh
./scripts/install-macos.sh
```

After `.env` changes:

```bash
launchctl kickstart -k "gui/$(id -u)/com.gads.watchdog"
```

UI: [http://127.0.0.1:43180](http://127.0.0.1:43180). Send a test alert from Settings.

## Grace period and provider restarts

`WATCHDOG_DOWN_GRACE_SECONDS` is how long a phone must stay not-live before Telegram/ntfy fires. Floor is **15**. If you bounce the GADS provider on a timer, set grace **above that bounce** (90s is a safe start). If three or more phones cross grace at once, Watchdog sends **one** farm message instead of a stack. The service polls on its own; you do not need the dashboard open.

## Host collectors (why a phone is down)

Run a collector on each USB host. Watchdog merges snapshots by hostname. A host that stops posting for two minutes is dropped so stale USB data does not linger.

Print the token from the hub (Settings → collector token), or from the hub `.env` / `data/settings.json` field `collectorToken`.

**Linux provider or the hub’s local provider**

```bash
chmod +x scripts/*.sh
WATCH_URL=http://127.0.0.1:43180 \
COLLECTOR_TOKEN='paste-token' \
./scripts/install-collector-linux.sh
```

If the collector is on another machine, `WATCH_URL` is the Watchdog URL, e.g. `http://192.168.254.3:43180`. Port **43180** must be reachable on the LAN.

**macOS provider (Mac Mini, etc.)**

```bash
chmod +x scripts/*.sh
WATCH_URL=http://192.168.254.3:43180 \
COLLECTOR_TOKEN='paste-token' \
./scripts/install-collector-macos.sh
```

Needs `python3`. `idevice_id` (libimobiledevice) is how iPhones are listed. `adb` is used if you also have Androids. USB serials come from `system_profiler` on macOS and `/sys/bus/usb` on Linux.

**Windows providers** are uncommon. There is no USB sysfs collector for Windows yet. You can still run Watchdog on Windows and get “phone is down” from the hub.

Pilot **one** provider first. Unplug a spare phone, wait for grace, confirm the page says **USB unplugged**. Then repeat on the other USB hosts.

## What “good” looks like

- Farm page: live mode, hub reachable, device count matches the official GADS UI.
- Settings → Send test alert → you get a Telegram/ntfy ping.
- Collector badge shows the provider hostname(s), not “offline.”
- An unplug on a collected host becomes **USB unplugged**, not a generic down.

## Pitfalls from real installs

- Hub port is whatever GADS was started with (`--port 8080` is common on Ubuntu systemd). `.env.example` defaults to 10000.
- GADS `/health` may return 401 without a login. Watchdog logs in first. If the farm page hangs, rebuild after pulling; older builds could stall on the hub’s SSE device stream.
- GADS JWTs are origin-bound. Leave `GADS_ORIGIN` blank to use `GADS_URL`. If login works but later calls 401, set the origin GADS already trusts.
- Blank `GADS_WORKSPACE_ID` watches every workspace. Set it only if you want one workspace.
- Do not expose port 43180 to the internet. It has no login of its own.
- From Windows PowerShell, do not SSH with `"$HOME/..."` — PowerShell expands `$HOME` and can clone into a junk path on Linux. Use single-quoted remote commands or Linux paths.

## Upstream

- GADS hub/provider: [github.com/shamanec/GADS](https://github.com/shamanec/GADS)
- WDA (iOS): [github.com/shamanec/WebDriverAgent](https://github.com/shamanec/WebDriverAgent)

Agents installing this for a human should also read [AGENTS.md](../AGENTS.md).
