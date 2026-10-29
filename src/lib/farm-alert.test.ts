import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alertGraceSeconds, downLongEnough, SELF_HEAL_GRACE_SECONDS } from "./alert-grace.ts";

describe("self-heal alert grace", () => {
  it("keeps a two-minute pairing flap silent", () => {
    const twoMinutes = 2 * 60 * 1000 + 18_000;
    assert.equal(downLongEnough("ios_needs_attention", twoMinutes, 60), false);
    assert.equal(downLongEnough("provider_setup", 90_000, 60), false);
    assert.equal(downLongEnough("adb_offline", 2 * 60 * 1000, 60), false);
  });

  it("pages a pairing failure that is still stuck after 10 minutes", () => {
    assert.equal(
      downLongEnough("ios_needs_attention", SELF_HEAL_GRACE_SECONDS * 1000, 60),
      true,
    );
    assert.equal(
      downLongEnough("unknown_down", SELF_HEAL_GRACE_SECONDS * 1000 - 1, 60),
      false,
    );
  });

  it("still pages a cable unplug at the configured grace", () => {
    assert.equal(downLongEnough("usb_disconnect", 59_000, 60), false);
    assert.equal(downLongEnough("usb_disconnect", 60_000, 60), true);
    assert.equal(downLongEnough("adb_unauthorized", 90_000, 90), true);
    assert.equal(downLongEnough("charge_only_cable", 60_000, 60), true);
    assert.equal(downLongEnough("hub_unreachable", 60_000, 60), true);
  });

  it("uses at least 10 minutes for drops GADS retries, and longer if grace is higher", () => {
    for (const cause of [
      "ios_needs_attention",
      "provider_setup",
      "adb_offline",
      "stale_heartbeat",
      "ios_disconnected",
      "unknown_down",
    ] as const) {
      assert.equal(alertGraceSeconds(cause, 60), SELF_HEAL_GRACE_SECONDS);
    }
    assert.equal(alertGraceSeconds("ios_needs_attention", 900), 900);
    assert.equal(alertGraceSeconds("usb_disconnect", 60), 60);
  });
});
