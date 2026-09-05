import { formatDuration } from "./format.ts";
import { findCollectorForProvider } from "./provider-restart.ts";
import { providerKey } from "./provider-quiet.ts";
import { formatVitals } from "./vitals.ts";
import type { ClassifiedDevice, FarmEvent, HostSnapshot, HostVitals } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DOWN_LINES = 25;

export function localDateKey(now: number): string {
  const date = new Date(now);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dailyHealthDue(
  now: number,
  hour: number,
  lastSentAt: number | null,
): boolean {
  if (new Date(now).getHours() < hour) return false;
  if (!lastSentAt) return true;
  return localDateKey(lastSentAt) !== localDateKey(now);
}

export function unrecoveredDrops(
  devices: ClassifiedDevice[],
  now: number,
  windowMs = DAY_MS,
): ClassifiedDevice[] {
  return devices
    .filter((device) => {
      if (device.cause === "online") return false;
      if (!device.downSince) return false;
      return now - device.downSince <= windowMs;
    })
    .sort((a, b) => (a.downSince ?? 0) - (b.downSince ?? 0));
}

export function buildDailyHealthEvent(input: {
  now: number;
  hubOk: boolean;
  hubError: string | null;
  hubVitals: HostVitals;
  hosts: HostSnapshot[];
  devices: ClassifiedDevice[];
}): FarmEvent {
  const online = input.devices.filter((device) => device.cause === "online").length;
  const total = input.devices.length;
  const down = unrecoveredDrops(input.devices, input.now);
  const lines = [
    `${online} of ${total} phones are online.`,
    `Hub ${input.hubVitals.hostname || "watchdog-host"}: ${input.hubOk ? "reachable" : "unreachable"}${input.hubError ? ` (${input.hubError})` : ""}. ${formatVitals(input.hubVitals)}`,
  ];

  const providerLines = listProviderVitals(input.devices, input.hosts, input.now);
  if (!providerLines.length) {
    lines.push("Providers: none seen.");
  } else {
    lines.push("Providers:");
    lines.push(...providerLines);
  }

  if (!down.length) {
    lines.push("No unrecovered drops in the last 24 hours.");
  } else {
    lines.push(`Still down from the last 24 hours (${down.length}):`);
    for (const device of down.slice(0, MAX_DOWN_LINES)) {
      const since = device.downSince ? formatDuration(input.now - device.downSince) : "unknown";
      lines.push(`- ${device.name} · ${device.causeLabel} · ${since}`);
    }
    if (down.length > MAX_DOWN_LINES) {
      lines.push(`- and ${down.length - MAX_DOWN_LINES} more`);
    }
  }

  return {
    id: `daily-${localDateKey(input.now)}`,
    at: input.now,
    udid: "DAILY",
    name: `${online}/${total} online`,
    severity: "info",
    cause: "unknown_down",
    title: `Daily farm check · ${online}/${total} online`,
    detail: lines.join("\n"),
    notified: false,
  };
}

function listProviderVitals(
  devices: ClassifiedDevice[],
  hosts: HostSnapshot[],
  now: number,
): string[] {
  const names = [
    ...new Set(devices.map((device) => providerKey(device)).filter((name) => name && name !== "unknown")),
  ].sort((a, b) => a.localeCompare(b));
  const used = new Set<string>();
  const lines: string[] = [];

  for (const name of names) {
    const host = findCollectorForProvider(hosts, name);
    if (host) used.add(host.hostname);
    const onHost = devices.filter((device) => providerKey(device) === name);
    const online = onHost.filter((device) => device.cause === "online").length;
    lines.push(`- ${providerLabel(name, host)}: ${online}/${onHost.length} online · ${hostNote(host, now)}`);
  }

  for (const host of hosts.slice().sort((a, b) => a.hostname.localeCompare(b.hostname))) {
    if (used.has(host.hostname)) continue;
    lines.push(`- ${providerLabel(host.hostname, host)}: ${hostNote(host, now)}`);
  }
  return lines;
}

function providerLabel(name: string, host: HostSnapshot | undefined): string {
  if (!host) return `${name} (no collector)`;
  const nick = host.providerControl?.nickname;
  if (nick && nick !== host.hostname && nick !== name) {
    return `${name} · ${host.hostname} (${nick})`;
  }
  if (host.hostname !== name) return `${name} · ${host.hostname}`;
  return name;
}

function hostNote(host: HostSnapshot | undefined, now: number): string {
  if (!host) return "no vitals";
  const ageMin = Math.round((now - host.receivedAt) / 60_000);
  const stale = ageMin >= 3 ? ` · collector ${ageMin}m stale` : "";
  return `${formatVitals(host.vitals)}${stale}`;
}
