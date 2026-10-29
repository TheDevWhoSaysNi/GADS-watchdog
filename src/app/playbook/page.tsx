import Link from "next/link";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PlaybookPage() {
  return (
    <div className="flex min-h-full flex-col">
      <Nav pathname="/playbook" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Playbook</h1>
          <p className="mt-1 text-sm text-zinc-400">
            How alerts work, and what the drop labels mean.
          </p>
        </div>

        <Card className="bg-zinc-900/70">
          <CardHeader>
            <CardTitle>Getting paged</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-zinc-300">
            <p>
              New to farms? Use{" "}
              <Link href="/setup" className="underline underline-offset-2">
                Start here
              </Link>{" "}
              to set up ntfy.
            </p>
            <p>
              Already have Telegram or Discord? Add them in{" "}
              <Link href="/settings" className="underline underline-offset-2">
                Settings
              </Link>{" "}
              or <code>.env</code>. Blank channels are skipped.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/70">
          <CardHeader>
            <CardTitle>What the labels mean</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-zinc-300">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-zinc-100">USB unplugged.</strong> The Mac/Linux
                USB tree no longer sees this phone. Reseat or replace the cable.
                Watchdog does not restart the provider for this.
              </li>
              <li>
                <strong className="text-zinc-100">ADB offline.</strong> Still on USB,
                transport frozen. Often a cable or hub.
              </li>
              <li>
                <strong className="text-zinc-100">USB present, no ADB.</strong> Charge-only
                cable or USB mode set to charging.
              </li>
              <li>
                <strong className="text-zinc-100">ADB unauthorized.</strong> Re-accept
                the USB debugging prompt.
              </li>
              <li>
                <strong className="text-zinc-100">Stuck in provider setup.</strong> The
                host can see the phone; GADS has not reached live.
              </li>
              <li>
                <strong className="text-zinc-100">Needs a hands-on fix.</strong> The
                iPhone is still plugged in — GADS can see the UDID — but pairing or
                setup is failing (often Lockdown error 3). Unlock it, tap Trust, or
                hard-restart the phone.
              </li>
              <li>
                <strong className="text-zinc-100">Stale heartbeat.</strong> Provider
                stopped refreshing. Restart the provider, not the phone.
              </li>
            </ul>
            <p>
              Watchdog does not restart providers. GADS v6 reconnects offline ADB
              devices and backs off setup. A provider restart drops every session
              on that host. Leave auto-restart off. host-main is never restarted
              automatically. Pairing, setup, and other drops GADS retries must stay
              down for 10 minutes before a page, so a one- or two-minute self-heal
              stays quiet. A USB unplug, unauthorized phone, or charge-only cable
              still pages after the grace period. Those pages are not a restart.
            </p>
            <p>
              A daily health check goes out at 4:00 on the Watchdog host clock:
              how many phones are online, hub and provider CPU / RAM / disk, and
              any phones that dropped in the last 24 hours and are still down.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/70">
          <CardHeader>
            <CardTitle>Host checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-zinc-300">
            <ul className="list-disc space-y-2 pl-5">
              <li>Powered USB hubs and known-good data cables.</li>
              <li>USB debugging authorized; stay-awake on.</li>
              <li>Disable USB autosuspend on Linux hosts.</li>
              <li>Run hub and provider as services with restart-on-failure.</li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
