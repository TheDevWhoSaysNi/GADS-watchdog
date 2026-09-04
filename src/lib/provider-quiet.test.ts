import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClassifiedDevice } from "./types.ts";
import {
  looksLikeProviderRestart,
  providerIsQuiet,
  providerKey,
  suppressAlertWhileQuiet,
  updateProviderQuiet,
} from "./provider-quiet.ts";

const now = 1_700_000_000_000;

function phone(
  id: string,
  cause: ClassifiedDevice["cause"],
  provider = "mini-04",
): ClassifiedDevice {
  return {
    udid: id,
    name: id,
    os: "ios",
    osVersion: "16",
    provider,
    workspaceId: "",
    usage: "enabled",
    host: "",
    connected: cause === "online",
    available: cause === "online",
    providerState: cause === "online" ? "live" : "init",
    lastUpdatedTimestamp: now,
    inUse: false,
    inUseBy: "",
    adbStatus: "absent",
    usbPresent: false,
    iosPresent: true,
    cause,
    causeLabel: cause,
    causeDetail: "",
    downSince: cause === "online" ? null : now,
    lastOnline: now,
    dropCount24h: 0,
    incidentAlerted: false,
  };
}

describe("provider quiet window", () => {
  it("treats a cluster of setup-stuck phones as a provider restart", () => {
    const devices = [
      phone("a", "provider_setup"),
      phone("b", "provider_setup"),
      phone("c", "provider_setup"),
      phone("d", "online"),
    ];
    assert.equal(looksLikeProviderRestart(devices), true);
  });

  it("does not treat a few USB unplugs as a restart", () => {
    const devices = [
      phone("a", "usb_disconnect"),
      phone("b", "usb_disconnect"),
      phone("c", "usb_disconnect"),
      phone("d", "online"),
    ];
    assert.equal(looksLikeProviderRestart(devices), false);
  });

  it("stays quiet through the bounce and for the settle minute after live", () => {
    const bounce = [
      phone("a", "provider_setup"),
      phone("b", "provider_setup"),
      phone("c", "provider_setup"),
    ];
    const live = bounce.map((device) => ({ ...device, cause: "online" as const }));
    const started = updateProviderQuiet({}, bounce, now, 60_000);
    assert.equal(providerIsQuiet(started, "mini-04", now, 60_000), true);

    const recovering = updateProviderQuiet(started, live, now + 20_000, 60_000);
    assert.equal(providerIsQuiet(recovering, "mini-04", now + 20_000, 60_000), true);
    assert.equal(providerIsQuiet(recovering, "mini-04", now + 79_000, 60_000), true);
    assert.equal(providerIsQuiet(recovering, "mini-04", now + 81_000, 60_000), false);

    const expired = updateProviderQuiet(recovering, live, now + 81_000, 60_000);
    assert.equal(providerIsQuiet(expired, "mini-04", now + 81_000, 60_000), false);
  });

  it("re-opens quiet if another bounce starts during settle", () => {
    const bounce = [
      phone("a", "provider_setup"),
      phone("b", "provider_setup"),
      phone("c", "provider_setup"),
    ];
    const live = bounce.map((device) => ({ ...device, cause: "online" as const }));
    const afterLive = updateProviderQuiet(
      updateProviderQuiet({}, bounce, now, 60_000),
      live,
      now + 5_000,
      60_000,
    );
    const again = updateProviderQuiet(afterLive, bounce, now + 20_000, 60_000);
    assert.equal(again["mini-04"]?.liveSince, null);
    assert.equal(providerIsQuiet(again, "mini-04", now + 20_000, 60_000), true);
  });

  it("keys quiet windows by provider name", () => {
    assert.equal(providerKey({ provider: "suncoast-macmini-04" }), "suncoast-macmini-04");
  });

  it("still allows a recovery for a phone that was already paged down", () => {
    assert.equal(suppressAlertWhileQuiet(true, false), true);
    assert.equal(suppressAlertWhileQuiet(true, true), false);
    assert.equal(suppressAlertWhileQuiet(false, true), false);
  });
});
