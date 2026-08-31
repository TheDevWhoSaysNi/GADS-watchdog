import { saveHostSnapshot } from "@/lib/store";
import { loadSettings, tokenFromAuthHeader } from "@/lib/store";
import type { HostSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

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
  };
  saveHostSnapshot(snapshot);
  return Response.json({ ok: true, receivedAt: snapshot.receivedAt });
}

export async function GET() {
  return Response.json({
    hint: "POST ADB/USB snapshots from scripts/host-collector.sh",
  });
}
