"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Cable, LoaderCircle, Radio, Smartphone } from "lucide-react";
import { DeviceCard } from "@/components/device-card";
import { EventFeed } from "@/components/event-feed";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatAge } from "@/lib/format";
import type { FarmSnapshot } from "@/lib/types";

export function FarmDashboard() {
  const [farm, setFarm] = useState<FarmSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/farm", { cache: "no-store" });
        if (!res.ok) throw new Error(`Farm API ${res.status}`);
        const data = (await res.json()) as FarmSnapshot;
        if (!cancelled) {
          setFarm(data);
          setError(null);
          setNow(Date.now());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load farm");
        }
      }
    }

    load();
    const poll = setInterval(load, 4000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  if (!farm && !error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-zinc-400">
        <LoaderCircle className="size-6 animate-spin" />
        Reading the farm…
      </div>
    );
  }

  if (error && !farm) {
    return (
      <Card className="border-rose-400/30 bg-rose-500/5">
        <CardContent className="py-6 text-sm text-rose-100">
          Could not load GADS Watchdog: {error}
        </CardContent>
      </Card>
    );
  }

  if (!farm) return null;

  const downDevices = farm.devices.filter((d) => d.cause !== "online");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Device farm</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            GADS stays the control plane. This sidecar watches it, classifies drops, and
            pages you so you do not have to click through the UI every morning.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-white/15 text-zinc-200">
            {farm.mode === "demo" ? "Demo farm" : "Live GADS"}
          </Badge>
          <Badge
            variant="outline"
            className={
              farm.hubOk
                ? "border-lime-400/30 text-lime-200"
                : "border-rose-400/30 text-rose-200"
            }
          >
            {farm.hubOk ? "Hub reachable" : "Hub down"}
          </Badge>
          <Badge variant="outline" className="border-white/15 text-zinc-300">
            Collector{" "}
            {farm.collectorAgeMs === null
              ? "offline"
              : formatAge(farm.collectorAgeMs)}
          </Badge>
        </div>
      </div>

      {farm.mode === "demo" ? (
        <Card className="border-sky-400/20 bg-sky-400/5">
          <CardContent className="py-4 text-sm text-sky-50">
            Demo mode walks an 8-phone farm through real drop patterns on a 3-minute
            loop: USB unplug, ADB offline (bad cable), unauthorized, provider setup
            stuck, stale heartbeat, and a short blip that stays under the alert grace
            period. Point it at your hub in{" "}
            <Link href="/settings" className="underline underline-offset-2">
              Settings
            </Link>{" "}
            when you are ready.
          </CardContent>
        </Card>
      ) : null}

      {farm.hubError ? (
        <Card className="border-rose-400/30 bg-rose-500/5">
          <CardContent className="py-4 text-sm text-rose-50">{farm.hubError}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Smartphone}
          label="Online"
          value={`${farm.stats.online}/${farm.stats.total}`}
        />
        <Stat icon={AlertTriangle} label="Down" value={String(farm.stats.down)} />
        <Stat
          icon={Cable}
          label="Cable suspects"
          value={String(farm.stats.cableSuspects)}
        />
        <Stat
          icon={Radio}
          label="In use"
          value={String(farm.stats.inUse)}
        />
      </div>

      {farm.devices.length === 0 ? (
        <Card className="bg-zinc-900/70">
          <CardContent className="space-y-2 py-8 text-sm text-zinc-400">
            <p>No devices yet.</p>
            <p>
              In live mode, Watchdog logs into GADS, reads{" "}
              <code className="text-zinc-200">/available-devices</code>, and merges
              host ADB/USB snapshots from the collector.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {farm.devices.map((device) => (
            <DeviceCard key={device.udid} device={device} now={now} />
          ))}
        </div>
      )}

      {downDevices.length > 0 ? (
        <Card className="bg-zinc-900/70">
          <CardContent className="space-y-2 py-4 text-sm">
            <p className="font-medium text-zinc-100">What to check first</p>
            <ul className="list-disc space-y-1 pl-5 text-zinc-400">
              {downDevices.map((device) => (
                <li key={device.udid}>
                  <span className="text-zinc-200">{device.name}:</span> {device.causeLabel}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <EventFeed events={farm.events} />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Smartphone;
  label: string;
  value: string;
}) {
  return (
    <Card className="bg-zinc-900/70">
      <CardContent className="flex items-center gap-3 py-4">
        <span className="flex size-10 items-center justify-center rounded-lg bg-white/5">
          <Icon className="size-4 text-lime-300" />
        </span>
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
          <div className="text-xl font-semibold tracking-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
