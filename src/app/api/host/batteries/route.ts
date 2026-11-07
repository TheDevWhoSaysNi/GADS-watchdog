import { chargeThresholds, planChargeWindow, type ChargeAction, type ChargeSample } from "@/lib/charge-window";
import { loadChargeActions, saveChargeActions, loadSettings, tokenFromAuthHeader } from "@/lib/store";

export const dynamic = "force-dynamic";

function readSamples(raw: unknown): ChargeSample[] {
  if (!Array.isArray(raw)) return [];
  const samples: ChargeSample[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const value = item as { udid?: unknown; percent?: unknown; inUse?: unknown };
    if (typeof value.udid !== "string" || !value.udid.trim()) continue;
    const percent =
      typeof value.percent === "number" && Number.isFinite(value.percent)
        ? Math.round(value.percent)
        : null;
    samples.push({
      udid: value.udid.trim(),
      percent,
      inUse: value.inUse === true,
    });
  }
  return samples;
}

export async function POST(request: Request) {
  const settings = loadSettings();
  const token = tokenFromAuthHeader(request.headers.get("authorization"));
  if (!token || token !== settings.collectorToken) {
    return Response.json({ error: "Invalid collector token" }, { status: 401 });
  }

  const body = (await request.json()) as { hostname?: unknown; batteries?: unknown };
  const { high, low } = chargeThresholds();
  const previous = loadChargeActions();
  const plan = planChargeWindow({
    samples: readSamples(body.batteries),
    previous,
    high,
    low,
  });

  const next: Record<string, ChargeAction> = { ...previous };
  for (const decision of plan) {
    if (decision.action === "charge" || decision.action === "rest") {
      next[decision.udid] = decision.action;
    }
  }
  saveChargeActions(next);

  return Response.json({
    ok: true,
    hostname: typeof body.hostname === "string" ? body.hostname : "",
    high,
    low,
    plan,
    hardwareRequired: true,
  });
}
