# Install GADS Watchdog

This sidecar watches an official [GADS](https://github.com/shamanec/GADS) hub and pages you when phones stay down. It does not replace GADS. iOS remote control uses shamanec’s [WebDriverAgent](https://github.com/shamanec/WebDriverAgent) fork — keep that on the official repo too.

You need **Node.js 20+** and `npm`. Watchdog listens on **port 48080** (8080-shaped, not the GADS hub port).

CLI agents (Cursor, Claude Code, and similar): follow [AGENTS.md](../AGENTS.md). Run `scripts/discover-host.sh` on the hub (and each USB host) before writing `.env`. Do not assume GADS is on port 10000 or that every farm looks like the last one.

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

Open [http://127.0.0.1:48080/setup](http://127.0.0.1:48080/setup).

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
GADS_USERNAME=watchdog
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

UI: [http://127.0.0.1:48080](http://127.0.0.1:48080). Send a test alert from Settings.

## Daily health check

By default Watchdog sends one digest after **04:00** on the Watchdog host clock (catch-up on the first poll if the box was down at 4). It reports how many phones are online, hub and provider CPU / RAM / disk / load / uptime, and phones that dropped in the last 24 hours and are still down. Long-abandoned registered phones are omitted.

Turn it off with `WATCHDOG_DAILY_HEALTH=false`, or change the hour with `WATCHDOG_DAILY_HEALTH_HOUR`. Settings has **Send daily check now** for a one-off (that does not consume the 4am slot). Provider vitals come from collectors, so update `host-collector.sh` on each USB host.

## Grace period and provider restarts

`WATCHDOG_DOWN_GRACE_SECONDS` is how long a cable unplug, unauthorized phone, or charge-only cable must stay down before Telegram/ntfy fires. Floor is **15**. Setup, pairing (including Lockdown error 3), ADB offline, a stale heartbeat, and a plain "phone down" with no unplug evidence wait at least **10 minutes**. GADS usually clears those in a minute or two; a page means it is still stuck and worth a physical check. A recovery is sent only after that page. Hourly provider restarts are detected separately: if several phones on the same provider go into setup/init together, Watchdog stays quiet until they are live again plus `WATCHDOG_PROVIDER_SETTLE_SECONDS` (default 60), and for **five minutes** from the start of the bounce so one slow phone does not page. Leave `WATCHDOG_PROVIDER_RESTART=false`. GADS v6 reconnects offline ADB devices and backs off setup on its own. Restarting a provider drops every session on that host. `host-main` is never restarted automatically. If that flag is on, Watchdog still refuses while any phone on the provider is in use, and it pages instead of restarting when it cannot tell. Recoveries are only sent for phones that already crossed grace. If three or more phones still page at once after that, Watchdog sends **one** farm message. The service polls on its own; you do not need the dashboard open.

## Host collectors (why a phone is down)

Run a collector on each USB host. Watchdog merges snapshots by hostname. A host that stops posting for two minutes is dropped so stale USB data does not linger.

Print the token from the hub (Settings → collector token), or from the hub `.env` / `data/settings.json` field `collectorToken`.

**Linux provider or the hub’s local provider**

```bash
chmod +x scripts/*.sh
WATCH_URL=http://127.0.0.1:48080 \
COLLECTOR_TOKEN='paste-token' \
./scripts/install-collector-linux.sh
```

If the collector is on another machine, `WATCH_URL` is the Watchdog URL on the LAN, e.g. `http://<hub-lan-ip>:48080`. Discover that IP; do not assume a previous farm’s address. Port **48080** must be reachable from the USB host.

**macOS provider (Mac Mini, etc.)**

```bash
chmod +x scripts/*.sh
WATCH_URL=http://<hub-lan-ip>:48080 \
COLLECTOR_TOKEN='paste-token' \
./scripts/install-collector-macos.sh
```

Leave `ALLOW_PROVIDER_RESTART` unset. The collector posts USB, ADB, and iOS state. It runs `scripts/restart-gads-provider.sh` only when Watchdog answers with `providerRestart.approved: true`. That approval stays off unless `WATCHDOG_PROVIDER_RESTART=true` on the hub, every phone on that provider is known idle, and the provider is not `host-main`. A bare `restartProvider: true` is ignored.

Needs **Python 3**. On iPhone Macs also put **[go-ios](https://github.com/danielpaulus/go-ios)** on `PATH` (`ios list`) — GADS usually already has it. USB presence on macOS comes from built-in **`ioreg`** (IOKit), not `system_profiler` (too slow on large farms). `idevice_id` is only a fallback and can hang. Android hosts need **`adb`**. See the companion-software table in the [README](../README.md).

**Windows providers** are uncommon. There is no USB sysfs collector for Windows yet. You can still run Watchdog on Windows and get “phone is down” from the hub.

Pilot **one** provider first. Unplug a spare phone, wait for grace, confirm the page says **USB unplugged**. Then repeat on the other USB hosts.

## What “good” looks like

- Farm page: live mode, hub reachable, device count matches the official GADS UI.
- Settings → Send test alert → you get a Telegram/ntfy ping.
- Collector badge shows the provider hostname(s), not “offline.”
- An unplug on a collected host becomes **USB unplugged**, not a generic down.

## Pitfalls from real installs

- Hub port is whatever GADS was started with (`--port 8080` is common on Ubuntu systemd). `.env.example` defaults to 10000.
- GADS `/health` may return 401 without a login. Watchdog logs in first. Current builds poll `GET /admin/devices` once. Older builds could stall on a per-workspace SSE device stream and load the hub.
- GADS JWTs are origin-bound. Leave `GADS_ORIGIN` blank to use `GADS_URL`. If login works but later calls 401, set the origin GADS already trusts.
- Blank `GADS_WORKSPACE_ID` watches every workspace. Set it only if you want one workspace.
- Do not expose port 48080 to the internet. It has no login of its own.
- From Windows PowerShell, do not SSH with `"$HOME/..."` — PowerShell expands `$HOME` and can clone into a junk path on Linux. Use single-quoted remote commands or Linux paths.

## Upstream

- GADS hub/provider: [github.com/shamanec/GADS](https://github.com/shamanec/GADS)
- WDA (iOS): [github.com/shamanec/WebDriverAgent](https://github.com/shamanec/WebDriverAgent)

Agents installing this for a human should also read [AGENTS.md](../AGENTS.md).
