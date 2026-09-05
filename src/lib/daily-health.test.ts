import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDailyHealthEvent,
  dailyHealthDue,
  localDateKey,
  unrecoveredDrops,
} from "./daily-health.ts";
import type { ClassifiedDevice, HostSnapshot } from "./types.ts";

const noon = Date.parse("2026-09-05T12:00:00");
const threeAm = Date.parse("2026-09-05T03:00:00");
const fourAm = Date.parse("2026-09-05T04:00:00");

function phone(partial: Partial<ClassifiedDevice> = {}): ClassifiedDevice {
  return {
    udid: "a",
    name: "Asim 1",
    os: "ios",
    osVersion: "17",
    provider: "mini-02",
    workspaceId: "",
    usage: "enabled",
    host: "",
    connected: true,
    available: false,
    providerState: "init",
    lastUpdatedTimestamp: noon,
    inUse: false,
    inUseBy: "",
    adbStatus: "absent",
    usbPresent: false,
    iosPresent: false,
    cause: "ios_needs_attention",
    causeLabel: "Needs a hands-on fix",
    causeDetail: "",
    downSince: noon - 2 * 60 * 60 * 1000,
    lastOnline: noon - 3 * 60 * 60 * 1000,
    dropCount24h: 1,
    incidentAlerted: true,
    ...partial,
  };
}

describe("daily health schedule", () => {
  it("does not send before the configured hour", () => {
    assert.equal(dailyHealthDue(threeAm, 4, null), false);
  });

  it("sends at or after 4am if nothing was sent today", () => {
    assert.equal(dailyHealthDue(fourAm, 4, null), true);
    assert.equal(dailyHealthDue(noon, 4, null), true);
  });

  it("does not send twice on the same local day", () => {
    assert.equal(dailyHealthDue(noon, 4, fourAm), false);
    assert.equal(localDateKey(fourAm), localDateKey(noon));
  });
});

describe("daily health contents", () => {
  it("lists only phones that dropped in the last 24 hours and are still down", () => {
    const devices = [
      phone({ udid: "live", name: "Live", cause: "online", downSince: null }),
      phone({ udid: "today", name: "Today down" }),
      phone({
        udid: "old",
        name: "Old down",
        downSince: noon - 48 * 60 * 60 * 1000,
      }),
    ];
    const down = unrecoveredDrops(devices, noon);
    assert.deepEqual(down.map((item) => item.name), ["Today down"]);
  });

  it("summarizes hub, providers, and unrecovered phones", () => {
    const hosts: HostSnapshot[] = [
      {
        receivedAt: noon,
        hostname: "suncoast-macmini-02",
        adb: [],
        usb: [],
        dmesg: [],
        providerControl: {
          allowed: false,
          kind: "none",
          unit: "",
          nickname: "mini-02",
        },
        vitals: {
          cpuPercent: 11,
          memPercent: 44,
          diskPercent: 20,
          load1: 0.4,
          uptimeSeconds: 3600,
        },
      },
    ];
    const event = buildDailyHealthEvent({
      now: noon,
      hubOk: true,
      hubError: null,
      hubVitals: {
        hostname: "byteme-server",
        cpuPercent: 8,
        memPercent: 30,
        diskPercent: 10,
        load1: 0.2,
        uptimeSeconds: 86400,
      },
      hosts,
      devices: [
        phone({ cause: "online", name: "Live", downSince: null }),
        phone({ name: "Asim 1" }),
      ],
    });
    assert.equal(event.udid, "DAILY");
    assert.match(event.title, /1\/2 online/);
    assert.match(event.detail, /1 of 2 phones are online/);
    assert.match(event.detail, /Hub byteme-server: reachable/);
    assert.match(event.detail, /CPU 8%/);
    assert.match(event.detail, /mini-02 · suncoast-macmini-02: 1\/2 online · CPU 11%/);
    assert.match(event.detail, /Asim 1/);
    assert.match(event.detail, /Needs a hands-on fix/);
  });

  it("marks providers that have no collector", () => {
    const event = buildDailyHealthEvent({
      now: noon,
      hubOk: true,
      hubError: null,
      hubVitals: {
        hostname: "hub",
        cpuPercent: 1,
        memPercent: 2,
        diskPercent: 3,
        load1: 0.1,
        uptimeSeconds: 60,
      },
      hosts: [],
      devices: [phone({ name: "Asim 1" })],
    });
    assert.match(event.detail, /mini-02 \(no collector\)/);
    assert.match(event.detail, /no vitals/);
  });
});
