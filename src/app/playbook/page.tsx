import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PlaybookPage() {
  return (
    <div className="flex min-h-full flex-col">
      <Nav pathname="/playbook" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Farm playbook</h1>
          <p className="mt-1 text-sm text-zinc-400">
            How to keep a stable, hand-built GADS farm without forking the product,
            and how to tell a bad cable from a software stall.
          </p>
        </div>

        <Card className="bg-zinc-900/70">
          <CardHeader>
            <CardTitle>1. Do not fork GADS for UI tweaks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-zinc-300">
            <p>
              Your instinct to customize is right. The wrong place to do it is a
              full GADS fork. The official <code>hub-ui</code> is proprietary and
              shipped obfuscated. The README is explicit: Go code is AGPL and
              welcome to change; UI changes go through the core team. A fork that
              tries to replace that UI immediately loses upstream updates and
              cannot legally rebuild the control surface.
            </p>
            <p>Use this split instead:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-zinc-100">Keep GADS as an appliance.</strong>{" "}
                Upgrade the official binary when they ship useful provider fixes
                (they already added automatic <code>adb reconnect</code> for
                offline devices).
              </li>
              <li>
                <strong className="text-zinc-100">Sidecar for ops.</strong> This
                app is that sidecar: health, alerts, drop classification, and a
                UI you own.
              </li>
              <li>
                <strong className="text-zinc-100">Config and OS tweaks first.</strong>{" "}
                systemd, udev, USB autosuspend, powered hubs, stay-awake, and
                provider <code>--log-level=debug</code> fix more farms than a
                custom dashboard.
              </li>
              <li>
                <strong className="text-zinc-100">Upstream PRs for provider behavior.</strong>{" "}
                If you need a reconnect policy or setup backoff change, patch the
                Go provider and send it back. That is the part you are allowed to
                change.
              </li>
              <li>
                <strong className="text-zinc-100">Ask the core team only if you truly need a GADS UI change.</strong>{" "}
                Remote-control, streaming, and reservation stay in their UI. Rebuild
                those only if you are prepared to write a new frontend against the
                public APIs.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/70">
          <CardHeader>
            <CardTitle>2. Stop the morning UI check</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-zinc-300">
            <p>
              GADS already knows when a phone is not live. The hub SSE stream marks
              a device unavailable if <code>provider_state</code> is not{" "}
              <code>live</code>, or if the provider heartbeat is older than 3
              seconds. Watchdog polls that, waits for a grace period, then pages
              you via ntfy, Discord, or a webhook.
            </p>
            <p>
              That alone replaces the morning click-through. Add the host collector
              if you also want the <em>why</em>.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/70">
          <CardHeader>
            <CardTitle>3. Why phones drop, in practice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-zinc-300">
            <p>Most home-lab Android farms fail in a handful of ways:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-zinc-100">USB unplug / port power loss.</strong>{" "}
                Device vanishes from <code>adb devices</code> and from{" "}
                <code>/sys/bus/usb</code>. Cable, hub, or physical bump.
              </li>
              <li>
                <strong className="text-zinc-100">ADB offline with USB still there.</strong>{" "}
                Frozen transport. This is the signature of a marginal cable,
                unpowered hub, or flaky port. GADS now tries{" "}
                <code>adb reconnect</code> on a 30s cooldown. If it keeps
                repeating, replace the cable before you debug software.
              </li>
              <li>
                <strong className="text-zinc-100">Charge-only / USB mode.</strong>{" "}
                Kernel still sees the device; ADB does not. Swap the cable or set
                USB mode back to file transfer / default.
              </li>
              <li>
                <strong className="text-zinc-100">Unauthorized.</strong> The phone
                revoked the RSA prompt. Not a cable.
              </li>
              <li>
                <strong className="text-zinc-100">Provider stuck in init.</strong>{" "}
                ADB is fine, GADS-stream / auto-rotation / WDA / MIUI permissions
                are not. Read provider and per-device logs.
              </li>
              <li>
                <strong className="text-zinc-100">Stale heartbeat.</strong> Provider
                process or its path to the hub/Mongo died. Restart the provider
                service, not the phone.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/70">
          <CardHeader>
            <CardTitle>Hardening checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-zinc-300">
            <ul className="list-disc space-y-2 pl-5">
              <li>Powered USB hubs only. Unpowered hubs brown out under a stack of phones.</li>
              <li>Short, known-good data cables. Cheap charge-only cables look seated and still drop ADB.</li>
              <li>Disable USB autosuspend on the host.</li>
              <li>Stay-awake / never auto-lock. A locked Android screen also kills GADS video.</li>
              <li>Keep USB debugging authorized. On Xiaomi, also enable “USB debugging (Security settings)”.</li>
              <li>Run hub and provider as systemd services with restart-on-failure.</li>
              <li>Watch <code>dmesg</code> for <code>over-current</code> and <code>USB disconnect</code>.</li>
              <li>Upgrade GADS if you are older than the ADB offline auto-reconnect fix.</li>
            </ul>
            <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-zinc-300">
{`# Persist USB autosuspend off
echo 'SUBSYSTEM=="usb", ATTR{power/control}="on"' | sudo tee /etc/udev/rules.d/50-usb-always-on.rules
echo -1 | sudo tee /sys/module/usbcore/parameters/autosuspend

# Live USB noise
sudo dmesg -w | grep -Ei 'usb|over-current|disconnect'`}
            </pre>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
