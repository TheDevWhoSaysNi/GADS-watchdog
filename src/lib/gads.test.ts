import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyProviderSync,
  assertWatchOnly,
  extractProviderSync,
  parseAdminDevices,
} from "./gads-devices.ts";

const inventory = {
  success: true,
  message: "Successfully retrieved devices data",
  result: {
    devices: [
      {
        udid: "00008110-001A4D2E0A88801E",
        os: "ios",
        name: "Phone A",
        os_version: "18.0",
        provider: "usb-host-03",
        usage: "enabled",
        workspace_id: "ws-1",
      },
      {
        udid: "AABBCCDD",
        os: "android",
        name: "Phone B",
        provider: "host-main",
        usage: "enabled",
        workspace_id: "ws-1",
      },
    ],
    providers: ["host-main", "usb-host-03"],
    device_stream_types: [],
  },
};

describe("admin device inventory", () => {
  it("reads one GADS v6 admin payload without treating it as live runtime", () => {
    const parsed = parseAdminDevices(inventory);
    assert.ok(parsed);
    assert.equal(parsed.hasLiveRuntime, false);
    assert.deepEqual(parsed.providers, ["host-main", "usb-host-03"]);
    assert.equal(parsed.devices.length, 2);
    const phone = parsed.devices[0];
    assert.equal(phone?.name, "Phone A");
    assert.equal(phone?.provider, "usb-host-03");
    assert.equal(phone?.workspaceId, "ws-1");
    assert.equal(phone?.runtimeKnown, false);
    assert.equal(phone?.inUseKnown, false);
  });

  it("keeps live hub fields when the admin payload already includes them", () => {
    const parsed = parseAdminDevices({
      result: {
        devices: [
          {
            info: {
              udid: "PHONE1",
              name: "Phone",
              os: "ios",
              provider: "usb-host-03",
              workspace_id: "ws-1",
            },
            host: "10.0.0.5:11001",
            connected: true,
            provider_state: "live",
            available: true,
            last_updated_timestamp: 1_700_000_000_000,
            in_use: false,
            in_use_by: "",
          },
        ],
        providers: ["usb-host-03"],
      },
    });
    assert.equal(parsed?.hasLiveRuntime, true);
    assert.equal(parsed?.devices[0]?.connected, true);
    assert.equal(parsed?.devices[0]?.providerState, "live");
    assert.equal(parsed?.devices[0]?.inUse, false);
    assert.equal(parsed?.devices[0]?.inUseKnown, true);
    assert.equal(parsed?.devices[0]?.runtimeKnown, true);
  });
});

describe("provider runtime overlay", () => {
  it("applies provider sync and does not invent an in-use flag", () => {
    const parsed = parseAdminDevices(inventory);
    assert.ok(parsed);
    const merged = applyProviderSync(
      parsed.devices,
      [
        {
          provider: "usb-host-03",
          sync: [
            {
              udid: "00008110-001A4D2E0A88801E",
              host: "10.0.0.8:10001",
              connected: true,
              provider_state: "init",
              has_appium_session: false,
            },
          ],
        },
        {
          provider: "host-main",
          sync: null,
        },
      ],
      1_700_000_000_000,
    );
    const ios = merged.find((device) => device.provider === "usb-host-03");
    const hub = merged.find((device) => device.provider === "host-main");
    assert.equal(ios?.connected, true);
    assert.equal(ios?.providerState, "init");
    assert.equal(ios?.available, false);
    assert.equal(ios?.runtimeKnown, true);
    assert.equal(ios?.inUseKnown, false);
    assert.equal(hub?.runtimeKnown, false);
  });

  it("reads the provider /devices and /info envelopes", () => {
    assert.equal(
      extractProviderSync({
        result: [{ udid: "A", connected: false, provider_state: "init" }],
      })?.[0]?.udid,
      "A",
    );
    assert.equal(
      extractProviderSync({
        result: { provider: { nickname: "usb-host-03" }, device_data: [] },
      })?.length,
      0,
    );
  });

  it("marks a phone busy when the provider reports an Appium session", () => {
    const parsed = parseAdminDevices(inventory);
    assert.ok(parsed);
    const merged = applyProviderSync(
      parsed.devices.filter((device) => device.provider === "usb-host-03"),
      [
        {
          provider: "usb-host-03",
          sync: [
            {
              udid: "00008110-001A4D2E0A88801E",
              connected: true,
              provider_state: "live",
              has_appium_session: true,
            },
          ],
        },
      ],
      1_700_000_000_000,
    );
    assert.equal(merged[0]?.inUse, true);
    assert.equal(merged[0]?.inUseKnown, true);
    assert.equal(merged[0]?.available, true);
  });
});

describe("read-only hub calls", () => {
  it("refuses device control routes", () => {
    assert.doesNotThrow(() => assertWatchOnly("GET", "/admin/devices"));
    assert.doesNotThrow(() => assertWatchOnly("GET", "/provider/host-main/devices"));
    assert.doesNotThrow(() => assertWatchOnly("POST", "/authenticate"));
    assert.throws(() => assertWatchOnly("POST", "/devices/control/ABC/release"));
    assert.throws(() => assertWatchOnly("GET", "/device/ABC/tap"));
    assert.throws(() => assertWatchOnly("POST", "/device/ABC/home"));
    assert.throws(() => assertWatchOnly("POST", "/admin/device"));
  });
});
