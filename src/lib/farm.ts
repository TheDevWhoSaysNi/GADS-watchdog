import { randomUUID } from "node:crypto";
import { dispatchAlert, hasAnyAlertChannel } from "./alerts";
import { classifyDevice, isCableSuspect, severityForCause } from "./classify";
import { buildDemoWorld } from "./demo";
import { formatDuration } from "./format";
import { GadsClient } from "./gads";
import {
  loadEvents,
  loadHostSnapshot,
  loadMemory,
  loadProviderQuiet,
  loadSettings,
  saveEvents,
  saveMemory,
  saveProviderQuiet,
} from "./store";
import {
  providerIsQuiet,
  providerKey,
  suppressAlertWhileQuiet,
  updateProviderQuiet,
} from "./provider-quiet";
import type {
  ClassifiedDevice,
  DeviceMemory,
  FarmEvent,
  FarmSnapshot,
  GadsDevice,
  Settings,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

let lastPollAt = 0;
let lastSnapshot: FarmSnapshot | null = null;
let pollInFlight: Promise<FarmSnapshot> | null = null;
let backgroundPollStarted = false;

export async function getFarmSnapshot(force = false): Promise<FarmSnapshot> {
  const settings = loadSettings();
  const intervalMs = Math.max(4, settings.pollSeconds) * 1000;
  if (!force && lastSnapshot && Date.now() - lastPollAt < intervalMs) {
    return lastSnapshot;
  }
  if (pollInFlight) return pollInFlight;
  pollInFlight = refreshFarm(settings).finally(() => {
    pollInFlight = null;
  });
  return pollInFlight;
}

export function startFarmPoller() {
  if (backgroundPollStarted) return;
  backgroundPollStarted = true;
  const loop = async () => {
    try {
      await getFarmSnapshot(true);
    } catch (error) {
      console.error("[watchdog] background poll failed", error);
    }
    const waitMs = Math.max(4, loadSettings().pollSeconds) * 1000;
    setTimeout(loop, waitMs);
  };
  void loop();
}

async function refreshFarm(settings: Settings): Promise<FarmSnapshot> {
  const now = Date.now();
  let devices: GadsDevice[] = [];
  let host = loadHostSnapshot();
  let hubOk = true;
  let hubError: string | null = null;

  if (settings.mode === "demo") {
    const world = buildDemoWorld(now);
    devices = world.devices;
    host = world.host;
  } else {
    try {
      const client = new GadsClient(
        settings.gadsUrl,
        settings.gadsUsername,
        settings.gadsPassword,
        settings.gadsAuthEnabled,
        settings.gadsOrigin,
      );
      hubOk = await client.health();
      const workspaceId = await client.resolveWorkspaceId(settings.workspaceId);
      devices = await client.listDevices(workspaceId);
      if (!devices.length && hubOk) {
        hubError = workspaceId
          ? "Hub is up, but no devices were returned for this workspace."
          : "Hub is up, but no devices were returned. Check GADS workspaces and the collector hosts.";
      }
    } catch (error) {
      hubOk = false;
      hubError = error instanceof Error ? error.message : "Failed to reach GADS";
    }
  }

  const memory = loadMemory();
  const events = loadEvents();
  const classified = devices.map((device) =>
    classifyDevice(
      device,
      host,
      hubOk,
      memoryExtras(memory[device.udid], now),
      now,
    ),
  );

  const settleMs = (settings.providerSettleSeconds || 60) * 1000;
  const quiet = updateProviderQuiet(loadProviderQuiet(), classified, now, settleMs);
  saveProviderQuiet(quiet);

  const newEvents: FarmEvent[] = [];
  for (const device of classified) {
    const prev = memory[device.udid];
    const nextMem = applyTransition(prev, device, now);
    memory[device.udid] = nextMem;
    device.downSince = nextMem.downSince;
    device.lastOnline = nextMem.lastOnline;
    device.dropCount24h = countDrops(nextMem, now);
    device.incidentAlerted = nextMem.incidentAlerted;

    const silenced = providerIsQuiet(quiet, providerKey(device), now, settleMs);
    const event = maybeBuildEvent(settings, prev, device, nextMem, now, silenced);
    if (event) newEvents.push(event);
  }

  const toSend = collapseBurstAlerts(newEvents, now);
  for (const event of toSend) {
    if (event.severity === "info") {
      event.notified = false;
      continue;
    }
    event.notified = await dispatchAlert(settings, event);
    if (!event.notified) {
      console.error("[watchdog] alert not delivered", event.severity, event.cause);
    }
  }
  const mergedEvents = [...toSend, ...events].slice(0, 400);
  saveMemory(memory);
  saveEvents(mergedEvents);

  const snapshot: FarmSnapshot = {
    generatedAt: now,
    mode: settings.mode,
    hubOk,
    hubError,
    collectorAgeMs: host ? now - host.receivedAt : null,
    collectorHostname: host?.hostname ?? null,
    devices: classified,
    events: mergedEvents.slice(0, 80),
    stats: summarize(classified),
    alertsConfigured: hasAnyAlertChannel(settings),
  };

  lastPollAt = now;
  lastSnapshot = snapshot;
  return snapshot;
}

function memoryExtras(
  memory: DeviceMemory | undefined,
  now: number,
): Pick<ClassifiedDevice, "downSince" | "lastOnline" | "dropCount24h" | "incidentAlerted"> {
  return {
    downSince: memory?.downSince ?? null,
    lastOnline: memory?.lastOnline ?? null,
    dropCount24h: memory ? countDrops(memory, now) : 0,
    incidentAlerted: memory?.incidentAlerted ?? false,
  };
}

function applyTransition(
  prev: DeviceMemory | undefined,
  device: ClassifiedDevice,
  now: number,
): DeviceMemory {
  const online = device.cause === "online";
  const dropTimestamps = (prev?.dropTimestamps ?? []).filter((ts) => now - ts < DAY_MS);
  const wasOnline = !prev || prev.lastCause === "online";

  if (online) {
    return {
      lastCause: "online",
      downSince: null,
      lastOnline: now,
      incidentAlerted: false,
      dropTimestamps,
    };
  }

  const downSince = prev?.downSince ?? now;
  if (wasOnline) dropTimestamps.push(now);

  return {
    lastCause: device.cause,
    downSince,
    lastOnline: prev?.lastOnline ?? null,
    incidentAlerted: prev?.incidentAlerted ?? false,
    dropTimestamps,
  };
}

function maybeBuildEvent(
  settings: Settings,
  prev: DeviceMemory | undefined,
  device: ClassifiedDevice,
  next: DeviceMemory,
  now: number,
  quiet: boolean,
): FarmEvent | null {
  const wasOnline = !prev || prev.lastCause === "online";
  const isOnline = device.cause === "online";
  const recoveryDue =
    isOnline &&
    prev != null &&
    prev.incidentAlerted &&
    prev.lastCause !== "online" &&
    settings.recoverNotify;

  if (suppressAlertWhileQuiet(quiet, recoveryDue)) return null;

  if (recoveryDue && prev) {
    return {
      id: randomUUID(),
      at: now,
      udid: device.udid,
      name: device.name,
      severity: "recovered",
      cause: "online",
      title: `${device.name} is back online`,
      detail: `Recovered after ${formatDuration(now - (prev.downSince ?? now))}. Previous cause: ${prev.lastCause.replaceAll("_", " ")}.`,
      notified: false,
    };
  }

  if (!isOnline && next.downSince && !next.incidentAlerted) {
    const elapsed = now - next.downSince;
    if (elapsed >= settings.downGraceSeconds * 1000) {
      next.incidentAlerted = true;
      const severity = severityForCause(device.cause);
      const title =
        device.cause === "ios_needs_attention"
          ? `${device.name} needs a hands-on fix`
          : `${device.name} is down`;
      return {
        id: randomUUID(),
        at: now,
        udid: device.udid,
        name: device.name,
        severity,
        cause: device.cause,
        title,
        detail: device.causeDetail,
        notified: false,
      };
    }
  }

  if (!isOnline && prev && !wasOnline && prev.lastCause !== device.cause) {
    const correctUnplug =
      prev.incidentAlerted &&
      prev.lastCause === "usb_disconnect" &&
      device.cause === "ios_needs_attention";
    return {
      id: randomUUID(),
      at: now,
      udid: device.udid,
      name: device.name,
      severity: correctUnplug ? "warning" : "info",
      cause: device.cause,
      title: correctUnplug
        ? `${device.name} needs a hands-on fix`
        : `${device.name} cause changed to ${device.causeLabel}`,
      detail: device.causeDetail,
      notified: false,
    };
  }

  return null;
}

function collapseBurstAlerts(events: FarmEvent[], now: number): FarmEvent[] {
  const downs = events.filter((event) => event.severity === "warning" || event.severity === "critical");
  const recovered = events.filter((event) => event.severity === "recovered");
  const rest = events.filter(
    (event) => event.severity !== "warning" && event.severity !== "critical" && event.severity !== "recovered",
  );
  const out = [...rest];

  if (downs.length >= 3) {
    out.push({
      id: randomUUID(),
      at: now,
      udid: "FARM",
      name: `${downs.length} phones`,
      severity: "warning",
      cause: "unknown_down",
      title: `${downs.length} phones are not live`,
      detail:
        "This often happens during a provider restart. Check the farm page. A collector on each provider is needed to tell unplugged vs setup failure.",
      notified: false,
    });
  } else {
    out.push(...downs);
  }

  if (recovered.length >= 3) {
    out.push({
      id: randomUUID(),
      at: now,
      udid: "FARM",
      name: `${recovered.length} phones`,
      severity: "recovered",
      cause: "online",
      title: `${recovered.length} phones are back online`,
      detail: "A batch of devices became live again.",
      notified: false,
    });
  } else {
    out.push(...recovered);
  }

  return out;
}

function countDrops(memory: DeviceMemory, now: number): number {
  return memory.dropTimestamps.filter((ts) => now - ts < DAY_MS).length;
}

function summarize(devices: ClassifiedDevice[]): FarmSnapshot["stats"] {
  return {
    total: devices.length,
    online: devices.filter((d) => d.cause === "online").length,
    down: devices.filter((d) => d.cause !== "online").length,
    inUse: devices.filter((d) => d.inUse).length,
    cableSuspects: devices.filter((d) => isCableSuspect(d.cause)).length,
    setupStuck: devices.filter(
      (d) => d.cause === "provider_setup" || d.cause === "ios_needs_attention",
    ).length,
  };
}

