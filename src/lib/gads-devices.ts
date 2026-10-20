import { normalizeUdid } from "./classify.ts";
import type { GadsDevice } from "./types.ts";

export type RawHubDevice = {
  info?: {
    udid?: string;
    name?: string;
    os?: string;
    os_version?: string;
    provider?: string;
    usage?: string;
    workspace_id?: string;
  };
  udid?: string;
  UDID?: string;
  name?: string;
  os?: string;
  os_version?: string;
  provider?: string;
  usage?: string;
  workspace_id?: string;
  host?: string;
  Host?: string;
  connected?: boolean;
  Connected?: boolean;
  available?: boolean;
  Available?: boolean;
  provider_state?: string;
  providerState?: string;
  ProviderState?: string;
  last_updated_timestamp?: number;
  lastUpdatedTimestamp?: number;
  in_use?: boolean;
  in_use_by?: string;
};

export type ParsedAdmin = {
  devices: GadsDevice[];
  providers: string[];
  hasLiveRuntime: boolean;
};

export type RawProviderSync = {
  udid?: string;
  host?: string;
  connected?: boolean;
  provider_state?: string;
  providerState?: string;
  in_use?: boolean;
  has_appium_session?: boolean;
  ephemeral?: boolean;
  ephemeral_device?: {
    udid?: string;
    name?: string;
    os?: string;
    os_version?: string;
    provider?: string;
    usage?: string;
    workspace_id?: string;
  };
};

export type ProviderSyncRead = {
  provider: string;
  sync: RawProviderSync[] | null;
};

const LIVE_KEYS = [
  "connected",
  "Connected",
  "provider_state",
  "providerState",
  "ProviderState",
  "available",
  "Available",
  "last_updated_timestamp",
  "lastUpdatedTimestamp",
  "in_use",
  "inUse",
];

/** Read-only hub calls. Device control refreshes the admin lock and kicks the open session. */
export function assertWatchOnly(method: string, path: string): void {
  const normalized = path.split("?")[0] ?? path;
  if (/\/devices\/control\//i.test(normalized) || /\/device\//i.test(normalized)) {
    throw new Error("Watchdog does not call device control routes");
  }
  if (method !== "GET" && method !== "HEAD" && !normalized.endsWith("/authenticate")) {
    throw new Error("Watchdog does not call device control routes");
  }
}

export function normalizeHubDevice(raw: RawHubDevice): GadsDevice {
  const info = raw.info ?? {};
  const record = raw as unknown as Record<string, unknown>;
  const udid = info.udid ?? raw.udid ?? raw.UDID ?? "";
  const inUseKnown = hasOwn(record, "in_use") || hasOwn(record, "inUse");
  const runtimeKnown = LIVE_KEYS.some((key) => hasOwn(record, key));
  return {
    udid,
    name: info.name ?? raw.name ?? udid ?? "Unknown device",
    os: info.os ?? raw.os ?? "android",
    osVersion: info.os_version ?? raw.os_version ?? "",
    provider: info.provider ?? raw.provider ?? "",
    workspaceId: info.workspace_id ?? raw.workspace_id ?? "",
    usage: info.usage ?? raw.usage ?? "",
    host: raw.host ?? raw.Host ?? "",
    connected: Boolean(raw.connected ?? raw.Connected),
    available: Boolean(raw.available ?? raw.Available),
    providerState: raw.provider_state ?? raw.providerState ?? raw.ProviderState ?? "",
    lastUpdatedTimestamp: raw.last_updated_timestamp ?? raw.lastUpdatedTimestamp ?? 0,
    inUse: Boolean(raw.in_use),
    inUseBy: raw.in_use_by ?? "",
    runtimeKnown,
    inUseKnown,
  };
}

export function filterWorkspace(devices: GadsDevice[], workspaceId: string): GadsDevice[] {
  const id = workspaceId.trim();
  if (!id) return devices;
  return devices.filter((device) => device.workspaceId === id);
}

export function providerNames(listed: string[], devices: GadsDevice[]): string[] {
  const names = new Set<string>();
  for (const name of listed) {
    const trimmed = name.trim();
    if (trimmed) names.add(trimmed);
  }
  for (const device of devices) {
    const trimmed = device.provider.trim();
    if (trimmed) names.add(trimmed);
  }
  return [...names];
}

export function parseAdminDevices(body: unknown): ParsedAdmin | null {
  const root = asRecord(body);
  if (!root) return null;
  const resultRecord = asRecord(root.result);
  const devicesRaw =
    (resultRecord && Array.isArray(resultRecord.devices) ? resultRecord.devices : null) ??
    (Array.isArray(root.result) ? root.result : null) ??
    (Array.isArray(root.devices) ? root.devices : null);
  if (!devicesRaw) return null;
  const providerSource =
    (resultRecord && Array.isArray(resultRecord.providers) ? resultRecord.providers : null) ??
    (Array.isArray(root.providers) ? root.providers : []);
  const providers = providerSource.filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  );
  const raws = devicesRaw.filter(
    (item): item is RawHubDevice => Boolean(item) && typeof item === "object",
  );
  return {
    devices: raws.map((raw) => normalizeHubDevice(raw)).filter((device) => device.udid),
    providers,
    hasLiveRuntime: raws.length > 0 && raws.every((raw) => LIVE_KEYS.some((key) => hasOwn(raw, key))),
  };
}

export function extractProviderSync(body: unknown): RawProviderSync[] | null {
  const root = asRecord(body);
  if (!root) return null;
  if (Array.isArray(root.result)) return root.result as RawProviderSync[];
  const record = asRecord(root.result) ?? root;
  if (Array.isArray(record.device_data)) return record.device_data as RawProviderSync[];
  return null;
}

export function applyProviderSync(
  devices: GadsDevice[],
  reads: ProviderSyncRead[],
  now: number,
): GadsDevice[] {
  const byUdid = new Map<string, GadsDevice>();
  for (const device of devices) {
    if (!device.udid) continue;
    byUdid.set(normalizeUdid(device.udid), {
      ...device,
      runtimeKnown: false,
      inUseKnown: false,
    });
  }

  const failed = new Set<string>();
  for (const read of reads) {
    if (read.sync == null) {
      failed.add(read.provider);
      continue;
    }
    const seen = new Set<string>();
    for (const row of read.sync) {
      const udid = row.udid || row.ephemeral_device?.udid || "";
      const key = normalizeUdid(udid);
      if (!key) continue;
      seen.add(key);
      const base = byUdid.get(key);
      const ephemeral = row.ephemeral_device;
      if (!base && !ephemeral) continue;
      const connected = Boolean(row.connected);
      const providerState = String(row.provider_state ?? row.providerState ?? "");
      const hubInUse = typeof row.in_use === "boolean";
      const automation = row.has_appium_session === true;
      byUdid.set(key, {
        udid: base?.udid || ephemeral?.udid || udid,
        name: base?.name || ephemeral?.name || udid,
        os: base?.os || ephemeral?.os || "android",
        osVersion: base?.osVersion || ephemeral?.os_version || "",
        provider: base?.provider || ephemeral?.provider || read.provider,
        workspaceId: base?.workspaceId || ephemeral?.workspace_id || "",
        usage: base?.usage || ephemeral?.usage || "",
        host: row.host || base?.host || "",
        connected,
        available: connected && providerState.toLowerCase() === "live",
        providerState,
        lastUpdatedTimestamp: now,
        inUse: automation || (hubInUse && row.in_use === true),
        inUseBy: base?.inUseBy ?? "",
        runtimeKnown: true,
        inUseKnown: hubInUse || automation,
      });
    }
    for (const [key, device] of byUdid) {
      if (device.provider !== read.provider || seen.has(key) || device.runtimeKnown === true) continue;
      byUdid.set(key, {
        ...device,
        connected: false,
        available: false,
        providerState: "",
        lastUpdatedTimestamp: now,
        inUse: false,
        runtimeKnown: true,
        inUseKnown: false,
      });
    }
  }

  for (const [key, device] of byUdid) {
    if (!failed.has(device.provider)) continue;
    byUdid.set(key, { ...device, runtimeKnown: false, inUseKnown: false });
  }
  return [...byUdid.values()];
}

function hasOwn(raw: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(raw, key);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
