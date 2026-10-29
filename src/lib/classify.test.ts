import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyCause, holdPreviousDown } from "./classify.ts";
import type { GadsDevice, HostSnapshot } from "./types.ts";

const now = 1_700_000_000_000;

function device(partial: Partial<GadsDevice> = {}): GadsDevice {
  return {
    udid: "ABC123",
    name: "Pixel 7",
    os: "android",
    osVersion: "14",
    provider: "home-lab",
    workspaceId: "",
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
      classifyCause(
        device({ connected: false, available: false, providerState: "init" }),
        snap,
        true,
        now,
      ),
      "adb_offline",
    );
  });

  it("flags unauthorized ADB separately from a cable drop", () => {
    const snap = host({
      adb: [{ udid: "ABC123", status: "unauthorized" }],
    });
    assert.equal(
      classifyCause(
        device({ connected: false, available: false, providerState: "init" }),
        snap,
        true,
        now,
      ),
      "adb_unauthorized",
    );
  });

  it("flags USB present with no ADB as a charge-only / data-line issue", () => {
    const snap = host({ adb: [] });
    assert.equal(
      classifyCause(device({ connected: false, available: false }), snap, true, now),
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
      classifyCause(
        device({ available: false, lastUpdatedTimestamp: now - 10_000 }),
        null,
        true,
        now,
      ),
      "stale_heartbeat",
    );
  });

  it("without a collector, a non-live phone is simply down", () => {
    assert.equal(
      classifyCause(
        device({ connected: false, available: false, providerState: "init" }),
        null,
        true,
        now,
      ),
      "unknown_down",
    );
  });

  it("flags hub outage above per-device causes", () => {
    assert.equal(classifyCause(device(), host(), false, now), "hub_unreachable");
  });

  it("does not treat a missed provider read as a recovery", () => {
    assert.equal(holdPreviousDown(false, "online", "unknown_down"), true);
    assert.equal(holdPreviousDown(false, "online", "usb_disconnect"), true);
    assert.equal(holdPreviousDown(false, "online", "online"), false);
    assert.equal(holdPreviousDown(false, "online", undefined), false);
    assert.equal(holdPreviousDown(false, "usb_disconnect", "unknown_down"), false);
    assert.equal(holdPreviousDown(true, "online", "unknown_down"), false);
  });

  it("does not mark a phone down when hub runtime was not read", () => {
    const snap = host({
      adb: [],
      usb: [
        {
          bus: "1",
          sysName: "1-2",
          vendorId: "05ac",
          productId: "12a8",
          serial: "00008030-00000000000000AA",
        },
      ],
      ios: ["00008030-00000000000000AA"],
    });
    assert.equal(
      classifyCause(
        device({
          udid: "00008030-00000000000000AA",
          os: "ios",
          connected: false,
          available: false,
          providerState: "",
          runtimeKnown: false,
        }),
        snap,
        true,
        now,
      ),
      "online",
    );
  });

  it("still reports a proved unplug when hub runtime was not read", () => {
    const snap = host({
      adb: [],
      usb: [
        {
          bus: "1",
          sysName: "1-2",
          vendorId: "05ac",
          productId: "12a8",
          serial: "00008030-00000000000000AA",
        },
      ],
      ios: [],
    });
    assert.equal(
      classifyCause(
        device({
          udid: "00008020-00000000000000BB",
          os: "ios",
          connected: false,
          available: false,
          providerState: "",
          runtimeKnown: false,
        }),
        snap,
        true,
        now,
      ),
      "usb_disconnect",
    );
  });

  it("treats GADS available as online even without a connected flag", () => {
    assert.equal(
      classifyCause(
        device({ connected: false, available: true, providerState: "live" }),
        host(),
        true,
        now,
      ),
      "online",
    );
  });

  it("does not treat available as live while the provider is still in setup", () => {
    assert.equal(
      classifyCause(
        device({ connected: true, available: true, providerState: "init" }),
        host(),
        true,
        now,
      ),
      "provider_setup",
    );
  });

  it("does not call a collector-visible iPhone unplugged when GADS has no runtime", () => {
    const snap = host({
      adb: [],
      usb: [],
      ios: ["00008030-00000000000000AA"],
    });
    assert.equal(
      classifyCause(
        device({
          udid: "00008030-00000000000000AA",
          os: "ios",
          connected: false,
          available: false,
          providerState: "unknown",
        }),
        snap,
        true,
        now,
      ),
      "ios_needs_attention",
    );
  });

  it("treats dashed and dashless iOS UDIDs as the same phone", () => {
    const snap = host({
      adb: [],
      usb: [],
      ios: ["00008030-00000000000000AA"],
    });
    assert.equal(
      classifyCause(
        device({
          udid: "0000803000000000000000AA",
          os: "ios",
          connected: false,
          available: false,
          providerState: "init",
        }),
        snap,
        true,
        now,
      ),
      "ios_needs_attention",
    );
  });

  it("does not call GADS-connected iPhones unplugged when ios list misses them", () => {
    const snap = host({ adb: [], usb: [], ios: [] });
    assert.equal(
      classifyCause(
        device({
          udid: "00008020-00000000000000BB",
          os: "ios",
          connected: true,
          available: false,
          providerState: "init",
        }),
        snap,
        true,
        now,
      ),
      "ios_needs_attention",
    );
  });

  it("does not call iOS unplugged when the collector has no USB serials", () => {
    const snap = host({ adb: [], usb: [], ios: [] });
    assert.equal(
      classifyCause(
        device({
          udid: "00008020-00000000000000BB",
          os: "ios",
          connected: false,
          available: false,
          providerState: "init",
        }),
        snap,
        true,
        now,
      ),
      "ios_disconnected",
    );
  });

  it("still calls iOS unplugged when USB serials exist and this phone vanished", () => {
    const snap = host({
      adb: [],
      usb: [
        {
          bus: "1",
          sysName: "1-2",
          vendorId: "05ac",
          productId: "12a8",
          serial: "00008030-00000000000000AA",
        },
      ],
      ios: [],
    });
    assert.equal(
      classifyCause(
        device({
          udid: "00008020-00000000000000BB",
          os: "ios",
          connected: false,
          available: false,
          providerState: "init",
        }),
        snap,
        true,
        now,
      ),
      "usb_disconnect",
    );
  });

  it("treats an ioreg-visible iPhone as still plugged in even if ios list missed it", () => {
    const snap = host({
      adb: [],
      usb: [
        {
          bus: "1",
          sysName: "iPhone",
          vendorId: "05ac",
          productId: "12a8",
          product: "iPhone",
          serial: "00008020-00000000000000BB",
        },
      ],
      ios: [],
    });
    assert.equal(
      classifyCause(
        device({
          udid: "00008020-00000000000000BB",
          os: "ios",
          connected: false,
          available: false,
          providerState: "init",
        }),
        snap,
        true,
        now,
      ),
      "ios_needs_attention",
    );
  });

  it("does not treat a non-Apple hub serial as iPhone USB inventory", () => {
    const snap = host({
      adb: [],
      usb: [
        {
          bus: "1",
          sysName: "hub",
          vendorId: "2109",
          productId: "2817",
          serial: "HUBSERIAL123",
        },
      ],
      ios: [],
    });
    assert.equal(
      classifyCause(
        device({
          udid: "00008020-00000000000000BB",
          os: "ios",
          connected: false,
          available: false,
          providerState: "init",
        }),
        snap,
        true,
        now,
      ),
      "ios_disconnected",
    );
  });
});
