import { configuredChannels } from "@/lib/alerts";
import { defaultSettings, loadSettingsMeta, saveSettings } from "@/lib/store";
import type { PublicSettings, Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

function toPublic(settings: Settings, fromEnv: (keyof Settings)[]): PublicSettings {
  const { gadsPassword, ...rest } = settings;
  return {
    ...rest,
    hasPassword: Boolean(gadsPassword),
    fromEnv: fromEnv as string[],
    alertChannels: configuredChannels(settings),
  };
}

export async function GET() {
  const { settings, fromEnv } = loadSettingsMeta();
  return Response.json(toPublic(settings, fromEnv));
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Settings>;
  const { settings: current } = loadSettingsMeta();
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
    downGraceSeconds: clamp(body.downGraceSeconds ?? current.downGraceSeconds, 15, 600),
    providerSettleSeconds: clamp(
      body.providerSettleSeconds ?? current.providerSettleSeconds ?? 60,
      15,
      300,
    ),
  };
  saveSettings(next);
  const loaded = loadSettingsMeta();
  return Response.json(toPublic(loaded.settings, loaded.fromEnv));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(value) || min));
}
