# Agent notes — GADS Watchdog

You are installing or changing a **sidecar**, not a GADS fork. The farm stays on official [GADS](https://github.com/shamanec/GADS) and [WebDriverAgent](https://github.com/shamanec/WebDriverAgent).

Humans follow [docs/INSTALL.md](docs/INSTALL.md). You should too. This file is the extra contract for Cursor, Claude Code, and similar tools.

## Do this

1. Read `docs/INSTALL.md` before touching a customer’s hub.
2. Install **one Watchdog** next to the hub (or anywhere that can reach it).
3. Install **collectors only** on USB hosts (Linux or Mac). Never install the Next.js app on every Mac Mini.
4. Discover the real hub port from systemd / launchd / the GADS command line. Do not assume `10000`.
5. Use a dedicated GADS user for Watchdog. Put secrets in `.env` on the server. Never echo tokens, passwords, or device phone numbers into chat.
6. After `.env` edits, restart the service. After TypeScript changes on a live box, `npm run build` then restart.
7. On Linux user systemd: remind the human to run `sudo loginctl enable-linger $USER`.
8. Pilot one provider collector, then the rest.

## Do not do this

- Do not fork or vendor GADS / WDA into this repo.
- Do not dump `data/settings.json`, `.env`, Mongo `users.bson`, or Telegram tokens into the transcript.
- Do not SSH with PowerShell double-quoted strings that contain `$HOME`, `` `id -u` ``, or `timeout=20`. PowerShell expands those and breaks Linux remotes. Use single-quoted remote scripts, or pipe a `.py` file over stdin.
- Do not clone this repo to a path like `C:UsersRyan` on Linux. That happens when `$HOME` is expanded on Windows before SSH.
- Do not tell the user an unplug is “USB unplugged” unless a collector on **that** USB host is posting.
- Do not set grace below 15 seconds. Hourly provider restarts are muted per provider until devices are live plus the settle window (default 60s).

## Layout

| Path | What |
|---|---|
| `src/lib/gads.ts` | Hub login + SSE `available-devices` (must tolerate a long `data:[...]` line with no blank line) |
| `src/lib/classify.ts` | Drop causes. No collector → `unknown_down` (“phone is down”) only |
| `src/lib/farm.ts` | Poll loop, grace, provider restart quiet window, burst collapse |
| `src/lib/alerts.ts` | ntfy, Telegram, Discord, Slack, Mattermost, Teams, Pushover, Gotify, webhook |
| `src/lib/store.ts` | `.env` overlay, persisted collector token, **merged** host snapshots by hostname |
| `scripts/install-linux.sh` | systemd (root → system unit, else user unit) |
| `scripts/install-windows.ps1` | Scheduled Task at logon |
| `scripts/install-macos.sh` | launchd Watchdog agent |
| `scripts/install-collector-linux.sh` | systemd collector |
| `scripts/install-collector-macos.sh` | launchd collector |
| `scripts/host-collector.sh` | Linux sysfs + macOS `system_profiler` + `adb` + `idevice_id` |

Watchdog port is **43180**. Collectors POST `/api/host/snapshot` with `Authorization: Bearer <token>`.

## Live-box checklist (Ubuntu-style hub)

```text
1. ssh user@hub
2. Confirm node -v is 20+, git, npm
3. Find hub: systemctl cat gads-hub.service  (note --port and --host-address)
4. Clone to ~/GADS-watchdog (never let Windows expand $HOME)
5. Copy .env.example → .env; set GADS_MODE=live, GADS_URL, user, password
6. ./scripts/install-linux.sh
7. sudo loginctl enable-linger $USER
8. curl -sS http://127.0.0.1:43180/api/farm  (should list devices; hubOk true)
9. Fill Telegram (or ntfy); restart; POST /api/alerts/test
10. Collectors last, one USB host at a time
```

If `/api/farm` hangs: the hub SSE is a long-lived stream. Current `gads.ts` times out the reader and parses `data:` JSON even without `\n\n`. Pull/rebuild if the box is on an older copy.

If every device is “Hub unreachable” but devices exist: `/health` likely 401 until login. Current `health()` logs in first.

If every device is “Stuck in provider setup” with no collector: you are on an old classifier. Current code uses “Phone down” until a collector proves USB/ADB.

## Notifications

Blank env vars are skipped. Filled channels all get the event. Test via `POST /api/alerts/test`. Do not paste bot tokens back to the user in full once they are saved.

## Tests

```bash
npm test
```

`classify.test.ts`, `alerts.test.ts`, `env.test.ts`.
