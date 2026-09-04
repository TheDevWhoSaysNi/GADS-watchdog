import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { applyEnv, loadDotEnv } from "./env";
import type {
  DeviceMemory,
  FarmEvent,
  HostSnapshot,
  Settings,
} from "./types";
import type { ProviderQuietMap } from "./provider-quiet";

const DATA_DIR = join(process.cwd(), "data");

function pathFor(name: string) {
  return join(DATA_DIR, name);
}

function ensureDir(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(pathFor(file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  const full = pathFor(file);
  ensureDir(full);
  const tmp = `${full}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, full);
}

export function defaultSettings(): Settings {
  return {
    mode: "demo",
    gadsUrl: "http://127.0.0.1:10000",
    gadsUsername: "admin",
    gadsPassword: "",
    gadsAuthEnabled: true,
    gadsOrigin: "",
    workspaceId: "",
    pollSeconds: 8,
    downGraceSeconds: 60,
    providerSettleSeconds: 60,
    recoverNotify: true,
    ntfyServer: "https://ntfy.sh",
    ntfyTopic: "",
    ntfyToken: "",
    discordWebhook: "",
    telegramBotToken: "",
    telegramChatId: "",
    slackWebhook: "",
    mattermostWebhook: "",
    teamsWebhook: "",
    pushoverUserKey: "",
    pushoverApiToken: "",
    gotifyUrl: "",
    gotifyToken: "",
    webhookUrl: "",
    collectorToken: randomBytes(18).toString("hex"),
  };
}

export function loadStoredSettings(): Settings {
  const stored = readJson<Partial<Settings>>("settings.json", {});
  const merged = { ...defaultSettings(), ...stored };
  if (!stored.collectorToken) {
    writeJson("settings.json", merged);
  }
  return merged;
}

export function loadSettingsMeta(): { settings: Settings; fromEnv: (keyof Settings)[] } {
  loadDotEnv();
  const loaded = applyEnv(loadStoredSettings());
  loaded.settings.downGraceSeconds = Math.min(
    600,
    Math.max(15, loaded.settings.downGraceSeconds || 60),
  );
  loaded.settings.providerSettleSeconds = Math.min(
    300,
    Math.max(15, loaded.settings.providerSettleSeconds || 60),
  );
  return loaded;
}

export function loadSettings(): Settings {
  return loadSettingsMeta().settings;
}

export function saveSettings(next: Settings) {
  const stored = loadStoredSettings();
  const { fromEnv } = applyEnv(stored);
  const locked = Object.fromEntries(fromEnv.map((key) => [key, stored[key]]));
  writeJson("settings.json", { ...next, ...locked });
}

export function loadEvents(): FarmEvent[] {
  return readJson<FarmEvent[]>("events.json", []);
}

export function saveEvents(events: FarmEvent[]) {
  writeJson("events.json", events.slice(0, 400));
}

export function loadMemory(): Record<string, DeviceMemory> {
  return readJson<Record<string, DeviceMemory>>("memory.json", {});
}

export function saveMemory(memory: Record<string, DeviceMemory>) {
  writeJson("memory.json", memory);
}

export function loadProviderQuiet(): ProviderQuietMap {
  return readJson("provider-quiet.json", {});
}

export function saveProviderQuiet(quiet: ProviderQuietMap) {
  writeJson("provider-quiet.json", quiet);
}

const HOST_SNAPSHOT_STALE_MS = 120_000;

export function loadHostSnapshots(): HostSnapshot[] {
  const raw = readJson<HostSnapshot[] | HostSnapshot | null>("host-snapshot.json", null);
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export function loadHostSnapshot(): HostSnapshot | null {
  const fresh = loadHostSnapshots().filter(
    (host) => Date.now() - host.receivedAt < HOST_SNAPSHOT_STALE_MS,
  );
  if (!fresh.length) return null;
  return {
    receivedAt: Math.max(...fresh.map((host) => host.receivedAt)),
    hostname: fresh.map((host) => host.hostname).join(", "),
    adb: fresh.flatMap((host) => host.adb),
    usb: fresh.flatMap((host) => host.usb),
    ios: fresh.flatMap((host) => host.ios ?? []),
    dmesg: fresh.flatMap((host) => host.dmesg).slice(-20),
  };
}

export function saveHostSnapshot(snapshot: HostSnapshot) {
  const byHost = new Map(loadHostSnapshots().map((host) => [host.hostname, host]));
  byHost.set(snapshot.hostname, snapshot);
  writeJson("host-snapshot.json", [...byHost.values()]);
}

export function tokenFromAuthHeader(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}
