import { defaultSettings, loadSettings, saveSettings } from "@/lib/store";
import type { PublicSettings, Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

function toPublic(settings: Settings): PublicSettings {
  const { gadsPassword, ...rest } = settings;
  return {
    ...rest,
    hasPassword: Boolean(gadsPassword),
  };
}

export async function GET() {
  return Response.json(toPublic(loadSettings()));
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Settings>;
  const current = loadSettings();
  const defaults = defaultSettings();
  const next: Settings = {
    ...current,
    ...body,
    gadsPassword:
      body.gadsPassword === undefined || body.gadsPassword === ""
        ? current.gadsPassword
        : body.gadsPassword,
    collectorToken: body.collectorToken || current.collectorToken || defaults.collectorToken,
    pollSeconds: clamp(body.pollSeconds ?? current.pollSeconds, 4, 120),
    downGraceSeconds: clamp(body.downGraceSeconds ?? current.downGraceSeconds, 10, 600),
  };
  saveSettings(next);
  return Response.json(toPublic(next));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(value) || min));
}
