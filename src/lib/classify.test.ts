import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyCause } from "./classify.ts";
import type { GadsDevice, HostSnapshot } from "./types.ts";

const now = 1_700_000_000_000;

function device(partial: Partial<GadsDevice> = {}): GadsDevice {
  return {
    udid: "ABC123",
    name: "Pixel 7",
    os: "android",
    osVersion: "14",
    provider: "home-lab",
    usage: "enabled",
    host: "192.168.1.10:10001",
    connected: true,
    available: true,
    providerState: "live",
    lastUpdatedTimestamp: now - 500,
    inUse: false,
    inUseBy: "",
    ...partial,
  };
}

function host(partial: Partial<HostSnapshot> = {}): HostSnapshot {
  return {
    receivedAt: now,
    hostname: "homeserver",
    adb: [{ udid: "ABC123", status: "device" }],
    usb: [
      {
        bus: "1",
        sysName: "1-3",
        vendorId: "18d1",
        productId: "4ee7",
        serial: "ABC123",
      },
    ],
    dmesg: [],
    ...partial,
  };
}

describe("classifyCause", () => {
  it("marks a live GADS device online", () => {
    assert.equal(classifyCause(device(), host(), true, now), "online");
  });

  it("detects a USB unplug when ADB and USB both vanish", () => {
    const snap = host({ adb: [], usb: [] });
    assert.equal(
      classifyCause(device({ connected: false, available: false }), snap, true, now),
      "usb_disconnect",
    );
  });

  it("flags ADB offline while USB is still present as a cable/hub problem", () => {
    const snap = host({
      adb: [{ udid: "ABC123", status: "offline" }],
    });
    assert.equal(
      classifyCause(device({ connected: false, providerState: "init" }), snap, true, now),
      "adb_offline",
    );
  });

  it("flags unauthorized ADB separately from a cable drop", () => {
    const snap = host({
      adb: [{ udid: "ABC123", status: "unauthorized" }],
    });
    assert.equal(
      classifyCause(device({ connected: false, providerState: "init" }), snap, true, now),
      "adb_unauthorized",
    );
  });

  it("flags USB present with no ADB as a charge-only / data-line issue", () => {
    const snap = host({ adb: [] });
    assert.equal(
      classifyCause(device({ connected: false }), snap, true, now),
      "charge_only_cable",
    );
  });

  it("flags ADB device + non-live provider as setup stuck", () => {
    assert.equal(
      classifyCause(device({ providerState: "init", available: false }), host(), true, now),
      "provider_setup",
    );
  });

  it("flags a stale provider heartbeat", () => {
    assert.equal(
      classifyCause(device({ lastUpdatedTimestamp: now - 10_000 }), null, true, now),
      "stale_heartbeat",
    );
  });

  it("flags hub outage above per-device causes", () => {
    assert.equal(classifyCause(device(), host(), false, now), "hub_unreachable");
  });
});
