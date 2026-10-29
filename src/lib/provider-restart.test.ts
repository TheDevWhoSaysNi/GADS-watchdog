import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClassifiedDevice, HostSnapshot } from "./types.ts";
import {
  collectorCanRestart,
  guardedRestartForCollector,
  hostMatchesProvider,
  markRestartDelivered,
  markRestartRequested,
  pendingRestartForHost,
  shouldHoldDownAlert,
  shouldRequestRestart,
} from "./provider-restart.ts";

const now = 1_700_000_000_000;
const afterMs = 180_000;
const settleMs = 60_000;
const cooldownMs = 900_000;

function phone(partial: Partial<ClassifiedDevice> = {}): ClassifiedDevice {
  return {
    udid: "phone",
    name: "phone",
    os: "ios",
    osVersion: "17",
    provider: "usb-host-03",
    workspaceId: "",
    usage: "enabled",
    host: "",
    connected: true,
    available: false,
    providerState: "init",
    lastUpdatedTimestamp: now,
    inUse: false,
    inUseBy: "",
    adbStatus: "absent",
    usbPresent: false,
    iosPresent: false,
    cause: "ios_needs_attention",
    causeLabel: "Needs a hands-on fix",
    causeDetail: "",
    downSince: now - afterMs,
    lastOnline: now - afterMs - 1_000,
    dropCount24h: 1,
    incidentAlerted: false,
    ...partial,
  };
}

function host(partial: Partial<HostSnapshot> = {}): HostSnapshot {
  return {
    receivedAt: now,
    hostname: "usb-host-03.local",
    adb: [],
    usb: [],
    ios: [],
    dmesg: [],
    providerControl: {
      allowed: true,
      kind: "launchd",
      unit: "com.gads.provider",
      nickname: "usb-host-03",
    },
    ...partial,
  };
}

describe("provider restart matching", () => {
  it("matches nickname to hostname without the .local suffix", () => {
    assert.equal(hostMatchesProvider("usb-host-03.local", "usb-host-03"), true);
    assert.equal(hostMatchesProvider("other-mini", "usb-host-03"), false);
  });

  it("requires an explicit allow on a discovered unit", () => {
    assert.equal(collectorCanRestart(host()), true);
    assert.equal(
      collectorCanRestart(host({ providerControl: { allowed: false, kind: "launchd", unit: "com.gads.provider" } })),
      false,
    );
    assert.equal(collectorCanRestart(host({ providerControl: undefined })), false);
  });
});

describe("provider restart timing", () => {
  it("does not restart a 2-minute flap", () => {
    assert.equal(
      shouldRequestRestart({
        enabled: true,
        canRestart: true,
        quiet: false,
        provider: "usb-host-03",
        inUse: "idle",
        devices: [phone({ downSince: now - 120_000 })],
        state: undefined,
        afterMs,
        now,
      }),
      false,
    );
  });

  it("requests one restart after 3 minutes when the collector can do it", () => {
    assert.equal(
      shouldRequestRestart({
        enabled: true,
        canRestart: true,
        quiet: false,
        provider: "usb-host-03",
        inUse: "idle",
        devices: [phone()],
        state: undefined,
        afterMs,
        now,
      }),
      true,
    );
  });

  it("does not restart unplugged phones or when the farm did not opt in", () => {
    assert.equal(
      shouldRequestRestart({
        enabled: true,
        canRestart: true,
        quiet: false,
        provider: "usb-host-03",
        inUse: "idle",
        devices: [phone({ cause: "usb_disconnect", connected: false })],
        state: undefined,
        afterMs,
        now,
      }),
      false,
    );
    assert.equal(
      shouldRequestRestart({
        enabled: false,
        canRestart: true,
        quiet: false,
        provider: "usb-host-03",
        inUse: "idle",
        devices: [phone()],
        state: undefined,
        afterMs,
        now,
      }),
      false,
    );
  });

  it("skips a second attempt during cooldown or an hourly bounce quiet window", () => {
    const state = markRestartRequested({}, "usb-host-03", now, cooldownMs)[
      "usb-host-03"
    ];
    assert.equal(
      shouldRequestRestart({
        enabled: true,
        canRestart: true,
        quiet: false,
        provider: "usb-host-03",
        inUse: "idle",
        devices: [phone()],
        state,
        afterMs,
        now: now + 60_000,
      }),
      false,
    );
    assert.equal(
      shouldRequestRestart({
        enabled: true,
        canRestart: true,
        quiet: true,
        provider: "usb-host-03",
        inUse: "idle",
        devices: [phone()],
        state: undefined,
        afterMs,
        now,
      }),
      false,
    );
  });

  it("does not loop kickstarts for the same stuck phones after cooldown", () => {
    const delivered = markRestartDelivered(
      markRestartRequested({}, "usb-host-04", now, cooldownMs),
      "usb-host-04",
      now + 5_000,
    )["usb-host-04"];
    assert.equal(
      shouldRequestRestart({
        enabled: true,
        canRestart: true,
        quiet: false,
        provider: "usb-host-03",
        inUse: "idle",
        devices: [phone({ downSince: now - afterMs })],
        state: delivered,
        afterMs,
        now: now + cooldownMs + 1,
      }),
      false,
    );
  });

  it("will kickstart again if a different phone goes down after the last restart", () => {
    const delivered = markRestartDelivered(
      markRestartRequested({}, "usb-host-04", now, cooldownMs),
      "usb-host-04",
      now + 5_000,
    )["usb-host-04"];
    assert.equal(
      shouldRequestRestart({
        enabled: true,
        canRestart: true,
        quiet: false,
        provider: "usb-host-03",
        inUse: "idle",
        devices: [phone({ downSince: now + cooldownMs + 60_000 })],
        state: delivered,
        afterMs,
        now: now + cooldownMs + 60_000 + afterMs,
      }),
      true,
    );
  });
});

describe("provider restart alerts", () => {
  it("holds the down page until a restart has been tried and settled", () => {
    assert.equal(
      shouldHoldDownAlert({
        enabled: true,
        canRestart: true,
        provider: "usb-host-03",
        inUse: "idle",
        cause: "ios_needs_attention",
        downSince: now - afterMs,
        state: undefined,
        settleMs,
        afterMs,
        now,
      }),
      true,
    );
    const delivered = markRestartDelivered(
      markRestartRequested({}, "p", now, cooldownMs),
      "p",
      now,
    ).p;
    assert.equal(
      shouldHoldDownAlert({
        enabled: true,
        canRestart: true,
        provider: "usb-host-03",
        inUse: "idle",
        cause: "ios_needs_attention",
        downSince: now - afterMs,
        state: delivered,
        settleMs,
        afterMs,
        now: now + 10_000,
      }),
      true,
    );
    assert.equal(
      shouldHoldDownAlert({
        enabled: true,
        canRestart: true,
        provider: "usb-host-03",
        inUse: "idle",
        cause: "ios_needs_attention",
        downSince: now - afterMs,
        state: delivered,
        settleMs,
        afterMs,
        now: now + 120_000,
      }),
      true,
    );
    assert.equal(
      shouldHoldDownAlert({
        enabled: true,
        canRestart: true,
        provider: "usb-host-03",
        inUse: "idle",
        cause: "ios_needs_attention",
        downSince: now - afterMs,
        state: delivered,
        settleMs,
        afterMs,
        now: now + afterMs + 1,
      }),
      false,
    );
  });

  it("does not treat a previous hour's restart as already settled", () => {
    const stale = markRestartDelivered(
      markRestartRequested({}, "p", now - cooldownMs - 60_000, cooldownMs),
      "p",
      now - cooldownMs - 50_000,
    ).p;
    assert.equal(
      shouldHoldDownAlert({
        enabled: true,
        canRestart: true,
        provider: "usb-host-03",
        inUse: "idle",
        cause: "ios_needs_attention",
        downSince: now - 90_000,
        state: stale,
        settleMs,
        afterMs,
        now,
      }),
      true,
    );
    assert.equal(
      shouldHoldDownAlert({
        enabled: true,
        canRestart: true,
        provider: "usb-host-03",
        inUse: "idle",
        cause: "ios_disconnected",
        downSince: now - 90_000,
        state: stale,
        settleMs,
        afterMs,
        now,
      }),
      true,
    );
  });

  it("does not keep holding a phone because a later restart targeted someone else", () => {
    const later = markRestartDelivered(
      markRestartRequested({}, "p", now + cooldownMs + 30_000, cooldownMs),
      "p",
      now + cooldownMs + 35_000,
    ).p;
    assert.equal(
      shouldHoldDownAlert({
        enabled: true,
        canRestart: true,
        provider: "usb-host-03",
        inUse: "idle",
        cause: "ios_needs_attention",
        downSince: now - afterMs,
        state: later,
        settleMs,
        afterMs,
        now: now + cooldownMs + 40_000,
      }),
      false,
    );
  });

  it("does not hold USB-unplug pages", () => {
    assert.equal(
      shouldHoldDownAlert({
        enabled: true,
        canRestart: true,
        provider: "usb-host-03",
        inUse: "idle",
        cause: "usb_disconnect",
        downSince: now - 90_000,
        state: undefined,
        settleMs,
        afterMs,
        now,
      }),
      false,
    );
  });

  it("hands a pending restart to the matching collector once", () => {
    const requested = markRestartRequested({}, "usb-host-03", now, cooldownMs);
    const provider = pendingRestartForHost(
      [host()],
      requested,
      "usb-host-03.local",
      now + 5_000,
    );
    assert.equal(provider, "usb-host-03");
    const delivered = markRestartDelivered(requested, provider!, now + 5_000);
    assert.equal(
      pendingRestartForHost([host()], delivered, "usb-host-03.local", now + 6_000),
      null,
    );
  });

});

describe("provider restart guards", () => {
  it("does not restart a busy provider or an unknown in-use state", () => {
    const eligible = {
      enabled: true,
      canRestart: true,
      quiet: false,
      devices: [phone()],
      state: undefined,
      afterMs,
      now,
    };
    assert.equal(
      shouldRequestRestart({ ...eligible, provider: "usb-host-03", inUse: "busy" }),
      false,
    );
    assert.equal(
      shouldRequestRestart({ ...eligible, provider: "usb-host-03", inUse: "unknown" }),
      false,
    );
  });

  it("does not delay the down page when a restart is refused", () => {
    for (const inUse of ["busy", "unknown"] as const) {
      assert.equal(
        shouldHoldDownAlert({
          enabled: true,
          canRestart: true,
          provider: "usb-host-03",
          inUse,
          cause: "ios_needs_attention",
          downSince: now - afterMs,
          state: undefined,
          settleMs,
          afterMs,
          now,
        }),
        false,
      );
    }
  });

  it("approves a collector restart only when the provider is known idle", () => {
    assert.deepEqual(
      guardedRestartForCollector({ pendingProvider: "usb-host-03", inUse: "idle" }),
      { approved: true, provider: "usb-host-03", manual: false },
    );
    assert.equal(
      guardedRestartForCollector({ pendingProvider: "usb-host-03", inUse: "unknown" }).approved,
      false,
    );
    assert.equal(
      guardedRestartForCollector({ pendingProvider: "usb-host-03", inUse: "busy" }).approved,
      false,
    );
    assert.equal(guardedRestartForCollector({ pendingProvider: null, inUse: "idle" }).approved, false);
  });
});
