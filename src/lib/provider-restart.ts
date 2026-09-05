import type { ClassifiedDevice, DropCause, HostSnapshot } from "./types";

export type ProviderRestartState = {
  requestedAt: number;
  deliveredAt: number | null;
  cooldownUntil: number;
};

export type ProviderRestartMap = Record<string, ProviderRestartState>;

const COLLECTOR_PICKUP_MS = 45_000;

export function isRestartableCause(cause: DropCause): boolean {
  return (
    cause === "ios_needs_attention" ||
    cause === "provider_setup" ||
    cause === "stale_heartbeat"
  );
}

export function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.local$/, "");
}

export function hostMatchesProvider(hostname: string, provider: string): boolean {
  const host = normalizeHost(hostname);
  const name = normalizeHost(provider);
  if (!host || !name) return false;
  return host === name || host.startsWith(`${name}.`) || name.startsWith(`${host}.`);
}

export function collectorCanRestart(host: HostSnapshot | undefined): boolean {
  const control = host?.providerControl;
  if (!control?.allowed) return false;
  return control.kind === "launchd" || control.kind === "systemd";
}

export function findCollectorForProvider(
  hosts: HostSnapshot[],
  provider: string,
): HostSnapshot | undefined {
  return hosts.find((host) => {
    const nick = host.providerControl?.nickname || "";
    return hostMatchesProvider(host.hostname, provider) || hostMatchesProvider(nick, provider);
  });
}

export function stuckRestartable(
  devices: ClassifiedDevice[],
  now: number,
  afterMs: number,
): ClassifiedDevice[] {
  return devices.filter((device) => {
    if (!isRestartableCause(device.cause)) return false;
    if (!device.downSince) return false;
    return now - device.downSince >= afterMs;
  });
}

export function shouldRequestRestart(input: {
  enabled: boolean;
  canRestart: boolean;
  quiet: boolean;
  devices: ClassifiedDevice[];
  state: ProviderRestartState | undefined;
  afterMs: number;
  now: number;
}): boolean {
  if (!input.enabled || !input.canRestart || input.quiet) return false;
  if (input.state && input.now < input.state.cooldownUntil) return false;
  return stuckRestartable(input.devices, input.now, input.afterMs).length > 0;
}

export function markRestartRequested(
  prev: ProviderRestartMap,
  provider: string,
  now: number,
  cooldownMs: number,
): ProviderRestartMap {
  return {
    ...prev,
    [provider]: {
      requestedAt: now,
      deliveredAt: null,
      cooldownUntil: now + cooldownMs,
    },
  };
}

export function pendingRestartForHost(
  hosts: HostSnapshot[],
  restarts: ProviderRestartMap,
  hostname: string,
  now: number,
): string | null {
  for (const [provider, state] of Object.entries(restarts)) {
    if (state.deliveredAt) continue;
    if (now - state.requestedAt > COLLECTOR_PICKUP_MS * 4) continue;
    const host = findCollectorForProvider(hosts, provider);
    if (!host) continue;
    if (normalizeHost(host.hostname) !== normalizeHost(hostname)) continue;
    if (!collectorCanRestart(host)) continue;
    return provider;
  }
  return null;
}

export function markRestartDelivered(
  prev: ProviderRestartMap,
  provider: string,
  now: number,
): ProviderRestartMap {
  const current = prev[provider];
  if (!current) return prev;
  return {
    ...prev,
    [provider]: { ...current, deliveredAt: now },
  };
}

export function shouldHoldDownAlert(input: {
  enabled: boolean;
  canRestart: boolean;
  cause: DropCause;
  downSince: number | null;
  state: ProviderRestartState | undefined;
  settleMs: number;
  afterMs: number;
  now: number;
}): boolean {
  if (!input.enabled || !input.canRestart || !isRestartableCause(input.cause)) {
    return false;
  }
  const downSince = input.downSince ?? input.now;
  if (!input.state?.deliveredAt) {
    return input.now - downSince < input.afterMs + input.settleMs + COLLECTOR_PICKUP_MS;
  }
  return input.now - input.state.deliveredAt < input.settleMs;
}

export function restartKey(device: Pick<ClassifiedDevice, "provider" | "host">): string {
  return (device.provider || device.host || "unknown").trim() || "unknown";
}
