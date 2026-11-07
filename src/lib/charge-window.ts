export type ChargeAction = "charge" | "rest" | "hold";

export type ChargeSample = {
  udid: string;
  percent: number | null;
  inUse?: boolean;
};

export type ChargeDecision = {
  udid: string;
  percent: number | null;
  action: ChargeAction;
  reason: string;
};

export const DEFAULT_CHARGE_HIGH = 80;
export const DEFAULT_CHARGE_LOW = 40;

export function chargeThresholds(env: NodeJS.ProcessEnv = process.env): { high: number; low: number } {
  const high = readPercent(env.WATCHDOG_CHARGE_HIGH, DEFAULT_CHARGE_HIGH);
  const low = readPercent(env.WATCHDOG_CHARGE_LOW, DEFAULT_CHARGE_LOW);
  if (low >= high) return { high: DEFAULT_CHARGE_HIGH, low: DEFAULT_CHARGE_LOW };
  return { high, low };
}

function readPercent(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100) return fallback;
  return value;
}

export function nextChargeAction(input: {
  percent: number | null;
  previous: ChargeAction | null;
  inUse: boolean;
  high: number;
  low: number;
}): { action: ChargeAction; reason: string } {
  if (input.inUse) {
    return { action: "charge", reason: "Phone is in use, so power stays on." };
  }
  if (input.percent == null || input.percent < 0 || input.percent > 100) {
    return { action: "hold", reason: "Battery percent is unknown, so the port is left as-is." };
  }
  if (input.percent >= input.high) {
    return { action: "rest", reason: `Battery is ${input.percent}%, at or above ${input.high}%.` };
  }
  if (input.percent <= input.low) {
    return { action: "charge", reason: `Battery is ${input.percent}%, at or below ${input.low}%.` };
  }
  if (input.previous === "charge" || input.previous === "rest") {
    return {
      action: input.previous,
      reason: `Battery is ${input.percent}%, inside ${input.low}–${input.high}%, so the last action stays.`,
    };
  }
  return {
    action: "hold",
    reason: `Battery is ${input.percent}%, inside ${input.low}–${input.high}%, with no previous action.`,
  };
}

export function planChargeWindow(input: {
  samples: ChargeSample[];
  previous: Record<string, ChargeAction>;
  high: number;
  low: number;
}): ChargeDecision[] {
  const seen = new Set<string>();
  const decisions: ChargeDecision[] = [];
  for (const sample of input.samples) {
    const udid = sample.udid.trim();
    if (!udid || seen.has(udid)) continue;
    seen.add(udid);
    const decision = nextChargeAction({
      percent: sample.percent,
      previous: input.previous[udid] ?? null,
      inUse: sample.inUse === true,
      high: input.high,
      low: input.low,
    });
    decisions.push({ udid, percent: sample.percent, ...decision });
  }
  return decisions;
}
