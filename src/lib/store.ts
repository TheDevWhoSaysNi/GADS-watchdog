import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  DeviceMemory,
  FarmEvent,
  HostSnapshot,
  Settings,
} from "./types";

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
    downGraceSeconds: 45,
    recoverNotify: true,
    ntfyServer: "https://ntfy.sh",
    ntfyTopic: "",
    discordWebhook: "",
    webhookUrl: "",
    collectorToken: randomBytes(18).toString("hex"),
  };
}

export function loadSettings(): Settings {
  const stored = readJson<Partial<Settings>>("settings.json", {});
  return { ...defaultSettings(), ...stored };
}

export function saveSettings(next: Settings) {
  writeJson("settings.json", next);
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

export function loadHostSnapshot(): HostSnapshot | null {
  return readJson<HostSnapshot | null>("host-snapshot.json", null);
}

export function saveHostSnapshot(snapshot: HostSnapshot) {
  writeJson("host-snapshot.json", snapshot);
}

export function tokenFromAuthHeader(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}
