"use client";

import {
  Cable,
  PlugZap,
  ShieldAlert,
  Smartphone,
  Usb,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAge, formatDuration } from "@/lib/format";
import type { ClassifiedDevice, DropCause } from "@/lib/types";

const ICONS: Partial<Record<DropCause, typeof Smartphone>> = {
  online: Smartphone,
  usb_disconnect: Usb,
  adb_offline: Cable,
  charge_only_cable: PlugZap,
  adb_unauthorized: ShieldAlert,
  provider_setup: Wrench,
};

function tone(cause: DropCause): string {
  if (cause === "online") return "border-lime-400/30 bg-lime-400/5";
  if (cause === "usb_disconnect" || cause === "hub_unreachable") {
    return "border-rose-400/30 bg-rose-500/5";
  }
  return "border-amber-400/30 bg-amber-400/5";
}

function badgeClass(cause: DropCause): string {
  if (cause === "online") return "border-lime-400/40 bg-lime-400/15 text-lime-200";
  if (cause === "usb_disconnect" || cause === "hub_unreachable") {
    return "border-rose-400/40 bg-rose-400/15 text-rose-100";
  }
  return "border-amber-400/40 bg-amber-400/15 text-amber-100";
}

export function DeviceCard({
  device,
  now,
}: {
  device: ClassifiedDevice;
  now: number;
}) {
  const Icon = ICONS[device.cause] ?? Smartphone;
  return (
    <Card className={`bg-zinc-900/70 ${tone(device.cause)}`}>
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{device.name}</CardTitle>
            <p className="mt-0.5 font-mono text-xs text-zinc-400">
              {device.os} {device.osVersion} · {device.udid}
            </p>
          </div>
          <Badge className={badgeClass(device.cause)}>{device.causeLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-zinc-300">{device.causeDetail}</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
          <Signal
            label="GADS"
            value={device.connected ? device.providerState || "connected" : "down"}
          />
          <Signal label="ADB" value={device.adbStatus} />
          <Signal
            label="USB"
            value={
              device.usbPresent === null
                ? "no collector"
                : device.usbPresent
                  ? "present"
                  : "missing"
            }
          />
          <Signal label="Provider" value={device.provider || "—"} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <Icon className="size-3.5" />
          {device.inUse ? <span>In use by {device.inUseBy || "someone"}</span> : null}
          {device.downSince ? (
            <span>Down {formatDuration(now - device.downSince)}</span>
          ) : (
            <span>Heartbeat {formatAge(now - device.lastUpdatedTimestamp)}</span>
          )}
          {device.dropCount24h > 0 ? (
            <span>{device.dropCount24h} drop{device.dropCount24h === 1 ? "" : "s"} / 24h</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/25 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="truncate font-medium text-zinc-200">{value}</div>
    </div>
  );
}
