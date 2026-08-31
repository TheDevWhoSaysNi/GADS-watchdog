import { randomUUID } from "node:crypto";
import { dispatchAlert } from "./alerts";
import { classifyDevice, isCableSuspect, severityForCause } from "./classify";
import { buildDemoWorld } from "./demo";
import { formatDuration } from "./format";
import { GadsClient } from "./gads";
import {
  loadEvents,
  loadHostSnapshot,
  loadMemory,
  loadSettings,
  saveEvents,
  saveMemory,
} from "./store";
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
          : "Hub is up, but Watchdog could not find a workspace id. Set it in Settings.";
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

  const newEvents: FarmEvent[] = [];
  for (const device of classified) {
    const prev = memory[device.udid];
    const nextMem = applyTransition(prev, device, now);
    memory[device.udid] = nextMem;
    device.downSince = nextMem.downSince;
    device.lastOnline = nextMem.lastOnline;
    device.dropCount24h = countDrops(nextMem, now);
    device.incidentAlerted = nextMem.incidentAlerted;

    const event = maybeBuildEvent(settings, prev, device, nextMem, now);
    if (event) newEvents.push(event);
  }

  for (const event of newEvents) {
    event.notified = await dispatchAlert(settings, event);
  }

  const mergedEvents = [...newEvents, ...events].slice(0, 400);
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
): FarmEvent | null {
  const wasOnline = !prev || prev.lastCause === "online";
  const isOnline = device.cause === "online";

  if (isOnline && prev && prev.lastCause !== "online" && settings.recoverNotify) {
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
      return {
        id: randomUUID(),
        at: now,
        udid: device.udid,
        name: device.name,
        severity,
        cause: device.cause,
        title: `${device.name} has been down for ${formatDuration(elapsed)}`,
        detail: device.causeDetail,
        notified: false,
      };
    }
  }

  if (!isOnline && prev && !wasOnline && prev.lastCause !== device.cause) {
    return {
      id: randomUUID(),
      at: now,
      udid: device.udid,
      name: device.name,
      severity: "info",
      cause: device.cause,
      title: `${device.name} cause changed to ${device.causeLabel}`,
      detail: device.causeDetail,
      notified: false,
    };
  }

  return null;
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
    setupStuck: devices.filter((d) => d.cause === "provider_setup").length,
  };
}

