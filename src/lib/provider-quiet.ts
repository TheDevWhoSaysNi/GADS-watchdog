import type { ClassifiedDevice, DropCause } from "./types";

export type ProviderQuietState = {
  startedAt: number;
  liveSince: number | null;
};

export type ProviderQuietMap = Record<string, ProviderQuietState>;

const RESTART_MIN_DOWN = 3;
const RESTART_FRACTION = 0.35;

export function providerKey(device: { provider?: string; host?: string }): string {
  return (device.provider || device.host || "unknown").trim() || "unknown";
}

export function isSoftwareBounceCause(cause: DropCause): boolean {
  return (
    cause === "provider_setup" ||
    cause === "ios_needs_attention" ||
    cause === "stale_heartbeat" ||
    cause === "unknown_down" ||
    cause === "ios_disconnected"
  );
}

export function looksLikeProviderRestart(devices: ClassifiedDevice[]): boolean {
  if (devices.length < RESTART_MIN_DOWN) return false;
  const down = devices.filter(
    (device) => device.cause !== "online" && isSoftwareBounceCause(device.cause),
  ).length;
  return down >= RESTART_MIN_DOWN && down / devices.length >= RESTART_FRACTION;
}

export function updateProviderQuiet(
  prev: ProviderQuietMap,
  devices: ClassifiedDevice[],
  now: number,
  settleMs: number,
): ProviderQuietMap {
  const groups = new Map<string, ClassifiedDevice[]>();
  for (const device of devices) {
    const key = providerKey(device);
    const list = groups.get(key) ?? [];
    list.push(device);
    groups.set(key, list);
  }

  const next: ProviderQuietMap = {};
  for (const [key, group] of groups) {
    const bouncing = looksLikeProviderRestart(group);
    const existing = prev[key];
    if (bouncing) {
      next[key] = {
        startedAt: existing?.startedAt ?? now,
        liveSince: null,
      };
      continue;
    }
    if (!existing) continue;
    const liveSince = existing.liveSince ?? now;
    if (now - liveSince < settleMs) {
      next[key] = { startedAt: existing.startedAt, liveSince };
    }
  }
  return next;
}

export function providerIsQuiet(
  quiet: ProviderQuietMap,
  provider: string,
  now: number,
  settleMs: number,
): boolean {
  const state = quiet[provider];
  if (!state) return false;
  if (state.liveSince == null) return true;
  return now - state.liveSince < settleMs;
}

/** Bounce noise stays silent. A phone we already paged as down still gets its recovery. */
export function suppressAlertWhileQuiet(
  quiet: boolean,
  recoveryOfPagedDown: boolean,
): boolean {
  return quiet && !recoveryOfPagedDown;
}
