import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chargeThresholds, planChargeWindow } from "./charge-window.ts";

describe("charge window", () => {
  const band = { high: 80, low: 40, previous: {} as Record<string, "charge" | "rest" | "hold"> };

  it("rests at the high mark and charges at the low mark", () => {
    const plan = planChargeWindow({
      ...band,
      samples: [
        { udid: "high", percent: 80 },
        { udid: "low", percent: 40 },
      ],
    });
    assert.equal(plan[0].action, "rest");
    assert.equal(plan[1].action, "charge");
  });

  it("keeps the last action while the battery is inside the window", () => {
    const plan = planChargeWindow({
      ...band,
      previous: { a: "rest", b: "charge" },
      samples: [
        { udid: "a", percent: 55 },
        { udid: "b", percent: 55 },
      ],
    });
    assert.deepEqual(
      plan.map((item) => item.action),
      ["rest", "charge"],
    );
  });

  it("holds when the first reading is inside the window", () => {
    const [only] = planChargeWindow({
      ...band,
      samples: [{ udid: "new", percent: 60 }],
    });
    assert.equal(only.action, "hold");
  });

  it("keeps power on while a phone is in use", () => {
    const [only] = planChargeWindow({
      ...band,
      previous: { busy: "rest" },
      samples: [{ udid: "busy", percent: 95, inUse: true }],
    });
    assert.equal(only.action, "charge");
  });

  it("holds when the percent is missing", () => {
    const [only] = planChargeWindow({
      ...band,
      samples: [{ udid: "unknown", percent: null }],
    });
    assert.equal(only.action, "hold");
  });

  it("falls back when the low threshold is not below the high one", () => {
    assert.deepEqual(chargeThresholds({ WATCHDOG_CHARGE_HIGH: "70", WATCHDOG_CHARGE_LOW: "70" }), {
      high: 80,
      low: 40,
    });
    assert.deepEqual(chargeThresholds({ WATCHDOG_CHARGE_HIGH: "70", WATCHDOG_CHARGE_LOW: "30" }), {
      high: 70,
      low: 30,
    });
  });
});
