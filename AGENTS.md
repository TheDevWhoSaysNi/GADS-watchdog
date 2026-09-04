# Agent notes — GADS Watchdog

You are installing or changing a **sidecar**, not a GADS fork. The farm stays on official [GADS](https://github.com/shamanec/GADS) and [WebDriverAgent](https://github.com/shamanec/WebDriverAgent).

Humans: [docs/INSTALL.md](docs/INSTALL.md). This file is the install contract for Cursor, Claude Code, Codex, and similar CLI agents.

**Every farm is different.** Discover the box in front of you. Do not copy ports, usernames, hostnames, or unit names from another customer.

## Hard rules

- One Watchdog UI. Collectors only on USB hosts. Never install the Next.js app on every Mac Mini / provider.
- Watchdog listens on **48080** (8080-shaped sidecar). The GADS hub port is **not** always `10000` (Ubuntu units are often `--port 8080`). Read it.
- Dedicated GADS hub user for Watchdog. Secrets live in `.env` on the server.
- Never print `.env`, `data/settings.json`, Mongo dumps, bot tokens, collector tokens, or device phone numbers.
- After `.env` edits: restart the service. After TypeScript changes on a live box: `npm run build` then restart.
- Do not fork or vendor GADS / WDA into this repo.
- Do not set `WATCHDOG_DOWN_GRACE_SECONDS` below **15**. Hourly provider restarts are muted until that provider is live plus `WATCHDOG_PROVIDER_SETTLE_SECONDS` (default 60).
- Do not call a drop “USB unplugged” unless a collector on **that** USB host is posting.
- From **Windows PowerShell SSH**: do not double-quote remotes that contain `$HOME`, `` `id -u` ``, or `timeout=20`. PowerShell expands those. Use single-quoted remote scripts, or pipe a `.py` file over stdin. Never clone to a path like `C:UsersRyan` on Linux.

## Phase 0 — discover (before writing `.env`)

Ask the human: hub SSH target, whether Watchdog should live on the hub, USB host list (or “find them”), pager (Telegram / ntfy / Discord / …).

On the **hub** (and later each USB host), clone or copy `scripts/discover-host.sh` and run it, or run the same checks by hand:

1. OS, arch, login user, `$HOME`.
2. `node -v` is **20+**, plus `git`, `npm`. Install Node 20 if missing; do not fight a distro Node 12.
3. How GADS actually runs — try all of these, keep what exists:
   - `systemctl cat gads-hub.service` (name may differ: `gads.service`, custom name)
   - `systemctl --user cat …`
   - `launchctl list` / `~/Library/LaunchAgents`
   - `docker ps` / compose
   - `ps` for a `GADS hub` / `GADS provider` command line
4. Record `--port`, `--host-address`, working directory, and the service user.
5. If Watchdog will run **on the hub**, `GADS_URL=http://127.0.0.1:<that-port>`. If Watchdog is elsewhere, use a URL that box can reach (LAN IP or hostname), and set `GADS_ORIGIN` only if JWT origin checks fail.
6. USB hosts are wherever cables plug in. Clues: GADS provider nicknames, `admin` devices’ `provider` field, machines that run `GADS provider`. Confirm with the human. The hub itself may also be a provider.

`scripts/discover-host.sh` prints hostname, Node, GADS-related processes, listen ports, systemd/launchd/docker — **no secrets**.

## Phase 1 — Watchdog on one machine

Pick **one** box that can reach the hub API (usually the hub).

```text
clone → ~/GADS-watchdog   (Linux/macOS path; never a Windows-expanded $HOME)
cp .env.example .env
fill GADS_MODE=live, GADS_URL, dedicated user, password
leave unused pager vars blank
chmod +x scripts/*.sh
./scripts/install-linux.sh | install-macos.sh | install-windows.ps1
```

| OS | Watchdog | Notes |
|---|---|---|
| Linux | `./scripts/install-linux.sh` | Root → system unit. Else user unit. Then `sudo loginctl enable-linger $USER`. |
| macOS | `./scripts/install-macos.sh` | launchd agent |
| Windows | `.\scripts\install-windows.ps1` | Scheduled Task at logon |

Create the GADS user in the hub UI if needed (read/admin is enough). Do not reuse the human’s personal login in tickets.

Blank `GADS_WORKSPACE_ID` = **all** workspaces. Set an id only to watch one.

Restart:

- Linux user: `XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user restart gads-watchdog`
- Linux root: `sudo systemctl restart gads-watchdog`
- macOS: `launchctl kickstart -k "gui/$(id -u)/com.gads.watchdog"`
- Windows: `Restart-ScheduledTask -TaskName "GADS Watchdog"`

Verify (summarize counts, not device names/numbers):

```bash
curl -sS --max-time 40 http://127.0.0.1:48080/api/farm
```

Expect `hubOk: true` and a device total in the same ballpark as the GADS UI. UI: `http://<watchdog-host>:48080`. Do not expose 48080 to the internet (no login of its own).

## Phase 2 — alerts

Fill **one** channel first (Telegram is common for labs; ntfy for guided phone push). Restart. Then:

```bash
curl -sS -X POST http://127.0.0.1:48080/api/alerts/test
```

Confirm the human got the ping. Do not paste the token back. Extra channels: leave blank to skip; filled ones all get the same event.

The service **polls in the background**. The dashboard does not need to stay open.

## Phase 3 — collectors (USB hosts only)

Skip if they only want “phone is down” from the hub. Collectors are required to say unplug vs setup/WDA.

1. Read the collector token on the hub from Settings or `data/settings.json` — **do not echo it**.
2. `WATCH_URL` is the Watchdog base URL from the USB host (`http://127.0.0.1:48080` if local, else `http://<hub-lan>:48080`). Port 48080 must be reachable on the LAN.
3. Clone **this repo** (or copy `scripts/host-collector.sh` + install-collector-*) on the USB host. `npm install` is not required for collectors.
4. Linux: `WATCH_URL=… COLLECTOR_TOKEN=… ./scripts/install-collector-linux.sh`
5. macOS: same with `install-collector-macos.sh`. launchd PATH must include `/usr/local/bin:/opt/homebrew/bin` (the install script sets this). Prefer `ios list` (go-ios); `idevice_id` can hang on large farms — current `host-collector.sh` tries go-ios first.
6. **Pilot one host.** Confirm `/api/farm` `collectorHostname` includes it and an unplug becomes **USB unplugged**. Then the rest.

Windows USB hosts: no collector yet. Watchdog still pages “phone down.”

## Phase 4 — tune

- Provider bounce on a timer: keep grace ≥ 15s (90s is a common start) and settle at 60s unless they want longer.
- Recovery pages fire only for phones that already crossed grace, including during a restart quiet window.
- `GADS_ORIGIN`: leave blank unless authenticate works and later calls 401.

## If something looks wrong

| Symptom | Likely cause |
|---|---|
| `/api/farm` hangs | Old build stalling on GADS SSE. Pull, `npm run build`, restart. Current `gads.ts` times out and parses `data:[…]` without `\n\n`, and polls every workspace id on the admin roster. |
| All “Hub unreachable” but devices exist | `/health` 401. Current `health()` logs in first. |
| All “Stuck in provider setup” with no collector | Old classifier. Current code is “Phone down” until a collector exists. |
| Live GADS phones look setup-stuck | Watchdog user missing those workspaces’ SSE. Current code overlays admin devices with per-workspace SSE. Rebuild if the box is old. |
| No overnight pages | Old build only polled when the UI was open. Current `instrumentation.ts` starts a background poller. |
| Collector never posts on a Mac | `system_profiler` / `idevice_id` hang. Update `host-collector.sh`; check `data/collector.log`. |
| PowerShell SSH broke Linux paths | `$HOME` expanded locally. Retry with single quotes. |

## Layout

| Path | What |
|---|---|
| `src/lib/gads.ts` | Hub login + SSE `available-devices` |
| `src/lib/classify.ts` | Drop causes |
| `src/lib/farm.ts` | Poll loop, grace, provider quiet window, burst collapse |
| `src/lib/provider-quiet.ts` | Hourly restart mute + settle |
| `src/lib/alerts.ts` | ntfy, Telegram, Discord, Slack, Mattermost, Teams, Pushover, Gotify, webhook |
| `src/lib/store.ts` | `.env` overlay, collector token, merged host snapshots |
| `src/instrumentation.ts` | Background poller (no UI required) |
| `scripts/discover-host.sh` | Read-only farm discovery |
| `scripts/install-linux.sh` | systemd Watchdog |
| `scripts/install-windows.ps1` | Scheduled Task Watchdog |
| `scripts/install-macos.sh` | launchd Watchdog |
| `scripts/install-collector-linux.sh` | systemd collector |
| `scripts/install-collector-macos.sh` | launchd collector |
| `scripts/host-collector.sh` | Linux sysfs, macOS USB, `adb`, `ios list` / `idevice_id` |

Collectors POST `/api/host/snapshot` with `Authorization: Bearer <token>`.

## Tests

```bash
npm test
```

`classify.test.ts`, `alerts.test.ts`, `env.test.ts`, `provider-quiet.test.ts`. Hub Node may be 20 and lack `--experimental-strip-types`; run tests on a Node 22+ box if needed. Production only needs `npm run build`.
