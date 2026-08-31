# GADS Watchdog

Device checker and troubleshooter for [GADS](https://github.com/shamanec/GADS) phone farms.

It watches the hub you already run, pages you when a phone stays down, and classifies the drop as USB, ADB, provider setup, or a dead heartbeat.

This is not a GADS fork. Your farm stays on the official hub and provider. Watchdog sits next to it.

Public repo: [github.com/TheDevWhoSaysNi/GADS-watchdog](https://github.com/TheDevWhoSaysNi/GADS-watchdog)

## Why a sidecar instead of a fork

GADS is two pieces: an AGPL Go hub/provider, and a proprietary `hub-ui` that ships obfuscated. The project is explicit that UI changes go through the core team. Forking to rebuild the UI means you lose upstream provider fixes (they recently added automatic `adb reconnect` for offline devices).

Keep GADS as the appliance. Put ops work here:

1. **This sidecar** for health, alerts, and drop diagnosis.
2. **Host/OS hardening** (powered hubs, USB autosuspend, stay-awake, systemd).
3. **Upstream PRs** only when you need provider behavior changes.
4. **Ask the GADS team** only if you truly need a change inside their remote-control UI.

The Playbook page in the app expands on that.

## What it does

- Polls GADS `POST /authenticate` and `GET /available-devices` (the same SSE the hub UI uses).
- Merges host signals from a collector: `adb devices -l`, `/sys/bus/usb` serials, optional `idevice_id`, recent USB `dmesg`.
- Classifies each down phone:
  - USB unplugged
  - ADB offline while USB is still present (classic bad cable / underpowered hub)
  - ADB unauthorized
  - USB present but no ADB (charge-only cable or charging-only mode)
  - Provider stuck in `init`
  - Stale provider heartbeat (>3s, which GADS itself treats as unavailable)
- Alerts after a grace period via [ntfy](https://ntfy.sh), Discord, or a generic webhook, and can notify on recovery.
- Ships a demo farm so you can see the classifications before pointing it at production.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43180](http://127.0.0.1:43180). Demo mode is on by default.

```bash
npm test
npm run build && npm start
```

## Point it at your GADS hub

On the same machine as the hub, or anywhere that can reach it:

1. Open **Settings** and turn **Demo mode** off.
2. Set the hub URL (`http://127.0.0.1:10000` is the usual default).
3. Enter an admin username/password if hub auth is on.
4. Save. The farm page should start listing real devices.

GADS JWTs are origin-bound. Watchdog sends `Origin` as the hub URL. If login works but later calls 401, either add Watchdog’s origin as a GADS secret key or set **JWT origin override** to an origin the hub already trusts.

Settings, including the hub password and collector token, live in `data/settings.json` on disk. Do not expose this app to the internet without your own auth in front of it.

## Alerts

The fastest home-lab path:

1. Install the ntfy app on your phone.
2. Subscribe to a long random topic name.
3. Paste that topic in Settings and send a test alert.

Drops shorter than the grace period (45s by default) stay silent so a 5-second USB hiccup does not page you. A generic webhook is there so other farms can plug Slack, Discord, n8n, or Telegram.

## Host collector

GADS alone can tell you *that* a phone is down. The collector tells you *why*.

On the provider host (the box the USB cables plug into):

```bash
chmod +x scripts/host-collector.sh
WATCH_URL=http://127.0.0.1:43180 \
COLLECTOR_TOKEN='from-settings' \
./scripts/host-collector.sh
```

Needs `adb` on `PATH`. `idevice_id` is optional for iPhones. Example systemd units are in `scripts/`.

## USB hardening

Random drops on a hand-built farm are usually electrical, not GADS:

- Powered hubs only. A stack of phones on an unpowered hub will brown out.
- Short data cables you have tested. Charge-only cables look fine and still kill ADB.
- Turn off USB autosuspend (the Playbook page has the udev rule).
- Stay-awake / never auto-lock. A locked Android screen also kills GADS video.
- Keep USB debugging authorized. Xiaomi needs the extra “USB debugging (Security settings)” toggle.
- Run hub and provider as systemd services with `Restart=on-failure`.
- Upgrade GADS if you do not yet have the ADB offline auto-reconnect fix.

```bash
sudo dmesg -w | grep -Ei 'usb|over-current|disconnect'
```

If the same UDID keeps landing on **ADB offline — likely cable or hub**, replace that cable or move that port before you touch GADS config.

## License

[AGPL-3.0](./LICENSE)
