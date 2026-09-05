import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClassifiedDevice, HostSnapshot } from "./types.ts";
import {
  collectorCanRestart,
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
    provider: "suncoast-macmini-03",
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
    hostname: "suncoast-macmini-03.local",
    adb: [],
    usb: [],
    ios: [],
    dmesg: [],
    providerControl: {
      allowed: true,
      kind: "launchd",
      unit: "com.gads.provider",
      nickname: "suncoast-macmini-03",
    },
    ...partial,
  };
}

describe("provider restart matching", () => {
  it("matches nickname to hostname without the .local suffix", () => {
    assert.equal(hostMatchesProvider("suncoast-macmini-03.local", "suncoast-macmini-03"), true);
    assert.equal(hostMatchesProvider("other-mini", "suncoast-macmini-03"), false);
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
        devices: [phone()],
        state: undefined,
        afterMs,
        now,
      }),
      false,
    );
  });

  it("skips a second attempt during cooldown or an hourly bounce quiet window", () => {
    const state = markRestartRequested({}, "suncoast-macmini-03", now, cooldownMs)[
      "suncoast-macmini-03"
    ];
    assert.equal(
      shouldRequestRestart({
        enabled: true,
        canRestart: true,
        quiet: false,
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
        devices: [phone()],
        state: undefined,
        afterMs,
        now,
      }),
      false,
    );
  });
});

describe("provider restart alerts", () => {
  it("holds the down page until a restart has been tried and settled", () => {
    assert.equal(
      shouldHoldDownAlert({
        enabled: true,
        canRestart: true,
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
        cause: "ios_needs_attention",
        downSince: now - afterMs,
        state: delivered,
        settleMs,
        afterMs,
        now: now + settleMs + 1,
      }),
      false,
    );
  });

  it("does not hold USB-unplug pages", () => {
    assert.equal(
      shouldHoldDownAlert({
        enabled: true,
        canRestart: true,
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
    const requested = markRestartRequested({}, "suncoast-macmini-03", now, cooldownMs);
    const provider = pendingRestartForHost(
      [host()],
      requested,
      "suncoast-macmini-03.local",
      now + 5_000,
    );
    assert.equal(provider, "suncoast-macmini-03");
    const delivered = markRestartDelivered(requested, provider!, now + 5_000);
    assert.equal(
      pendingRestartForHost([host()], delivered, "suncoast-macmini-03.local", now + 6_000),
      null,
    );
  });
});
