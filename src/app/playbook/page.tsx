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
                <strong className="text-zinc-100">USB unplugged.</strong> Gone from
                USB and ADB / iOS listing.
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
                <strong className="text-zinc-100">Stale heartbeat.</strong> Provider
                stopped refreshing. Restart the provider, not the phone.
              </li>
            </ul>
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
