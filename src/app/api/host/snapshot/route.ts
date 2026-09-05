import {
  loadHostSnapshots,
  loadProviderRestart,
  loadSettings,
  saveHostSnapshot,
  saveProviderRestart,
  tokenFromAuthHeader,
} from "@/lib/store";
import { markRestartDelivered, pendingRestartForHost } from "@/lib/provider-restart";
import type { HostSnapshot, HostVitals, ProviderControl } from "@/lib/types";

export const dynamic = "force-dynamic";

function readVitals(raw: unknown): HostVitals | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<HostVitals>;
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
  return {
    hostname: typeof value.hostname === "string" ? value.hostname : undefined,
    cpuPercent: num(value.cpuPercent),
    memPercent: num(value.memPercent),
    diskPercent: num(value.diskPercent),
    load1: num(value.load1),
    uptimeSeconds: num(value.uptimeSeconds),
  };
}

function readProviderControl(raw: unknown): ProviderControl | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<ProviderControl>;
  const kind = value.kind === "launchd" || value.kind === "systemd" ? value.kind : "none";
  return {
    allowed: Boolean(value.allowed),
    kind,
    unit: typeof value.unit === "string" ? value.unit : "",
    nickname: typeof value.nickname === "string" ? value.nickname : "",
  };
}

export async function POST(request: Request) {
  const settings = loadSettings();
  const token = tokenFromAuthHeader(request.headers.get("authorization"));
  if (!token || token !== settings.collectorToken) {
    return Response.json({ error: "Invalid collector token" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<HostSnapshot>;
  const snapshot: HostSnapshot = {
    receivedAt: Date.now(),
    hostname: body.hostname || "unknown-host",
    adb: Array.isArray(body.adb) ? body.adb : [],
    usb: Array.isArray(body.usb) ? body.usb : [],
    ios: Array.isArray(body.ios) ? body.ios : [],
    dmesg: Array.isArray(body.dmesg) ? body.dmesg : [],
    providerControl: readProviderControl(body.providerControl),
    vitals: readVitals(body.vitals),
  };
  saveHostSnapshot(snapshot);

  let restartProvider = false;
  if (settings.providerRestartEnabled) {
    const restarts = loadProviderRestart();
    const provider = pendingRestartForHost(
      loadHostSnapshots(),
      restarts,
      snapshot.hostname,
      Date.now(),
    );
    if (provider) {
      saveProviderRestart(markRestartDelivered(restarts, provider, Date.now()));
      restartProvider = true;
    }
  }

  return Response.json({
    ok: true,
    receivedAt: snapshot.receivedAt,
    restartProvider,
  });
}

export async function GET() {
  return Response.json({
    hint: "POST ADB/USB snapshots from scripts/host-collector.sh",
  });
}
