import { classifyDevice } from "./classify";
import type { ClassifiedDevice, GadsDevice, HostSnapshot } from "./types";

type ScriptedPhone = {
  udid: string;
  name: string;
  os: "android" | "ios";
  osVersion: string;
  usage: string;
  inUse: boolean;
  inUseBy: string;
  scenario: (t: number) => {
    connected: boolean;
    available: boolean;
    providerState: string;
    lastUpdatedAgoMs: number;
    adb?: HostSnapshot["adb"][number]["status"];
    usb: boolean;
    ios?: boolean;
  };
};

const PHONES: ScriptedPhone[] = [
  {
    udid: "26111FDCG0004Y",
    name: "Pixel 7 Pro",
    os: "android",
    osVersion: "15",
    usage: "enabled",
    inUse: false,
    inUseBy: "",
    scenario: () => ({
      connected: true,
      available: true,
      providerState: "live",
      lastUpdatedAgoMs: 400,
      adb: "device",
      usb: true,
    }),
  },
  {
    udid: "35011FDCG0008K",
    name: "Pixel 8",
    os: "android",
    osVersion: "15",
    usage: "enabled",
    inUse: false,
    inUseBy: "",
    scenario: (t) => {
      const dropped = t >= 40 && t < 75;
      return {
        connected: !dropped,
        available: !dropped,
        providerState: dropped ? "init" : "live",
        lastUpdatedAgoMs: dropped ? 20_000 : 600,
        adb: dropped ? undefined : "device",
        usb: !dropped,
      };
    },
  },
  {
    udid: "R58M30ABC21",
    name: "Galaxy S21",
    os: "android",
    osVersion: "14",
    usage: "enabled",
    inUse: false,
    inUseBy: "",
    scenario: (t) => {
      const offline = t >= 20 && t < 55;
      return {
        connected: !offline,
        available: !offline,
        providerState: offline ? "init" : "live",
        lastUpdatedAgoMs: offline ? 8_000 : 350,
        adb: offline ? "offline" : "device",
        usb: true,
      };
    },
  },
  {
    udid: "0A1B2C3D4E5F",
    name: "Pixel 6a",
    os: "android",
    osVersion: "14",
    usage: "control",
    inUse: false,
    inUseBy: "",
    scenario: (t) => {
      const unauth = t >= 90 && t < 120;
      return {
        connected: !unauth,
        available: !unauth,
        providerState: unauth ? "init" : "live",
        lastUpdatedAgoMs: unauth ? 12_000 : 500,
        adb: unauth ? "unauthorized" : "device",
        usb: true,
      };
    },
  },
  {
    udid: "00008110-001A4D2E0A88801E",
    name: "iPhone 13",
    os: "ios",
    osVersion: "17.5",
    usage: "enabled",
    inUse: false,
    inUseBy: "",
    scenario: (t) => {
      const stuck = t >= 60 && t < 105;
      return {
        connected: !stuck,
        available: !stuck,
        providerState: stuck ? "init" : "live",
        lastUpdatedAgoMs: stuck ? 9_000 : 700,
        usb: true,
        ios: true,
      };
    },
  },
  {
    udid: "1C2D3E4F5A6B",
    name: "Pixel 5",
    os: "android",
    osVersion: "13",
    usage: "automation",
    inUse: false,
    inUseBy: "",
    scenario: (t) => {
      const stale = t >= 10 && t < 28;
      return {
        connected: true,
        available: !stale,
        providerState: "live",
        lastUpdatedAgoMs: stale ? 12_000 : 450,
        adb: "device",
        usb: true,
      };
    },
  },
  {
    udid: "RF8T12XYZ99",
    name: "Galaxy A54",
    os: "android",
    osVersion: "14",
    usage: "enabled",
    inUse: false,
    inUseBy: "",
    scenario: (t) => {
      const blip = t >= 130 && t < 138;
      return {
        connected: !blip,
        available: !blip,
        providerState: blip ? "init" : "live",
        lastUpdatedAgoMs: blip ? 6_000 : 300,
        adb: blip ? undefined : "device",
        usb: !blip,
      };
    },
  },
  {
    udid: "2B3C4D5E6F70",
    name: "Pixel 7a",
    os: "android",
    osVersion: "15",
    usage: "enabled",
    inUse: true,
    inUseBy: "ryan",
    scenario: () => ({
      connected: true,
      available: true,
      providerState: "live",
      lastUpdatedAgoMs: 280,
      adb: "device",
      usb: true,
    }),
  },
];

export function demoCycleSecond(now = Date.now()): number {
  return Math.floor(now / 1000) % 180;
}

export function buildDemoWorld(now = Date.now()): {
  devices: GadsDevice[];
  host: HostSnapshot;
} {
  const t = demoCycleSecond(now);
  const devices: GadsDevice[] = [];
  const adb: HostSnapshot["adb"] = [];
  const usb: HostSnapshot["usb"] = [];
  const ios: string[] = [];

  for (const phone of PHONES) {
    const state = phone.scenario(t);
    devices.push({
      udid: phone.udid,
      name: phone.name,
      os: phone.os,
      osVersion: phone.osVersion,
      provider: "home-lab",
      workspaceId: "",
      usage: phone.usage,
      host: "192.168.1.10:10001",
      connected: state.connected,
      available: state.available,
      providerState: state.providerState,
      lastUpdatedTimestamp: now - state.lastUpdatedAgoMs,
      inUse: phone.inUse && state.connected,
      inUseBy: phone.inUse && state.connected ? phone.inUseBy : "",
    });

    if (state.adb) {
      adb.push({
        udid: phone.udid,
        status: state.adb,
        model: phone.name.replaceAll(" ", "_"),
      });
    }
    if (state.usb) {
      usb.push({
        bus: "1",
        sysName: `1-${phone.udid.slice(-1)}`,
        vendorId: phone.os === "ios" ? "05ac" : "18d1",
        productId: phone.os === "ios" ? "12a8" : "4ee7",
        serial: phone.udid,
        product: phone.name,
      });
    }
    if (state.ios) ios.push(phone.udid);
  }

  return {
    devices,
    host: {
      receivedAt: now,
      hostname: "homeserver",
      adb,
      usb,
      ios,
      vitals: {
        cpuPercent: 14,
        memPercent: 38,
        diskPercent: 22,
        load1: 0.4,
        uptimeSeconds: 86_400,
      },
      dmesg:
        t >= 40 && t < 75
          ? ["usb 1-4: USB disconnect, device number 12", "xhci_hcd: Over-current event on port 4"]
          : [],
    },
  };
}

export function classifyDemoDevices(
  now = Date.now(),
): { devices: ClassifiedDevice[]; host: HostSnapshot } {
  const world = buildDemoWorld(now);
  return {
    host: world.host,
    devices: world.devices.map((device) =>
      classifyDevice(
        device,
        world.host,
        true,
        {
          downSince: null,
          lastOnline: now,
          dropCount24h: 0,
          incidentAlerted: false,
        },
        now,
      ),
    ),
  };
}
