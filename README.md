# GADS Watchdog

Device checker and troubleshooter for [GADS](https://github.com/shamanec/GADS) phone farms.

It watches the hub you already run, pages you when a phone stays down, and — with a collector on the USB host — classifies the drop as unplugged, ADB, provider setup, or a dead heartbeat.

This is not a GADS fork. Your farm stays on the official hub, provider, and [WebDriverAgent](https://github.com/shamanec/WebDriverAgent). Watchdog sits next to them.

Public repo: [github.com/TheDevWhoSaysNi/GADS-watchdog](https://github.com/TheDevWhoSaysNi/GADS-watchdog)

**Install (humans):** [docs/INSTALL.md](docs/INSTALL.md)
**Install (Cursor / Claude Code / other CLI agents):** [AGENTS.md](AGENTS.md) — discover the hub first; farms are not identical.

## Why a sidecar instead of a fork

GADS is two pieces: an AGPL Go hub/provider, and a proprietary `hub-ui` that ships obfuscated. UI changes go through the core team. Forking means you lose upstream provider fixes (they already added automatic `adb reconnect` for offline devices).

Keep GADS as the appliance. Put ops here: this sidecar, host/OS hardening, and upstream PRs only when you need provider behavior changes.

## What it does

- Polls GADS `POST /authenticate` and `GET /available-devices` (the same SSE the hub UI uses).
- Merges host snapshots from one or more collectors: `adb`, USB serials (Linux sysfs or macOS `ioreg`), and `ios list` (go-ios).
- Without a collector, a down phone is just **phone down**. With a collector it can say USB unplugged, ADB offline, unauthorized, charge-only cable, or setup/WDA.
- Pages after a grace period (minimum 15s, default 60s). Fill any mix of [ntfy](https://ntfy.sh), Telegram, Discord, Slack, Mattermost, Teams, Pushover, Gotify, or a generic webhook — blank ones stay silent.
- If several phones drop at once (provider restart), you get one farm alert instead of a stack.
- A daily health check (default 4am on the Watchdog host) reports online count, hub and provider CPU / RAM / disk, and phones that dropped in the last 24 hours and are still down.
- Demo farm is on until you point it at a live hub.

## Two ways to run it

### 1. Guided (new to phone farms)

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:48080/setup](http://127.0.0.1:48080/setup). Install ntfy, generate a topic, test, then paste your hub URL.

### 2. Service (Linux / Windows PowerShell / macOS Terminal)

```bash
cp .env.example .env
# fill GADS_URL, login, and any pager vars — leave the rest blank
```

| OS | Watchdog service | Collector on a USB host |
|---|---|---|
| Linux | `./scripts/install-linux.sh` | `./scripts/install-collector-linux.sh` |
| Windows | `.\scripts\install-windows.ps1` | Hub-only “phone down” (no USB collector yet) |
| macOS | `./scripts/install-macos.sh` | `./scripts/install-collector-macos.sh` |

Full commands, Telegram, grace, linger, and pitfalls: [docs/INSTALL.md](docs/INSTALL.md).

Hub port is **not always 10000**. Read the GADS `ExecStart` `--port` (8080 is common on Ubuntu).

```bash
npm test
npm run build && npm start
```

## Architecture

```
phones --USB--> provider host(s) --network--> GADS hub
                     |                           ^
              collector only              Watchdog polls
                     +------ POST /api/host/snapshot ------+
```

One Watchdog. A collector on every USB box. Do not install the web app on each Mac Mini.

## Companion software on USB hosts

The collector is a shell script plus Python 3. It does **not** need `npm` or the Watchdog UI. Install these on each machine the cables plug into:

| Tool | Who needs it | Notes |
|---|---|---|
| **Python 3** | Every USB host | Collector runtime. macOS: Xcode CLT or [python.org](https://www.python.org/). Linux: distro `python3`. |
| **[go-ios](https://github.com/danielpaulus/go-ios)** (`ios` on `PATH`) | Mac Mini / iPhone providers | Same CLI GADS uses. `ios list` is pairing/Lockdown. Prefer this over `idevice_id`. |
| **macOS `ioreg`** | Mac iPhone providers | Built in (IOKit). This is how Watchdog tells “still on the cable” vs yanked/bad cable. Do not use `system_profiler` on large farms — it hangs. |
| **`adb`** | Android USB hosts | [platform-tools](https://developer.android.com/tools/releases/platform-tools). |
| **libimobiledevice** (`idevice_id`) | Optional fallback | Skip on large iPhone farms; it can hang. Only used if `ios list` is missing. |

GADS Mac providers often already have `ios`. Check with `ios list` and `python3 --version`. Then install the collector (`scripts/install-collector-macos.sh` / `install-collector-linux.sh`).

## License

[AGPL-3.0](./LICENSE)
