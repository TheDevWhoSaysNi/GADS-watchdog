import type {
  AdbDevice,
  AdbStatus,
  ClassifiedDevice,
  DropCause,
  GadsDevice,
  HostSnapshot,
  UsbDevice,
} from "./types";

const GADS_STALE_MS = 4000;

export const CAUSE_COPY: Record<
  DropCause,
  { label: string; detail: string }
> = {
  online: {
    label: "Online",
    detail: "GADS reports the device live and reachable.",
  },
  usb_disconnect: {
    label: "USB unplugged",
    detail:
      "The phone is gone from both ADB and the USB tree. Most often a loose cable, a port that dropped power, or someone physically unplugged it.",
  },
  adb_offline: {
    label: "ADB offline — likely cable or hub",
    detail:
      "The phone is still on USB, but ADB transport is frozen (offline). This is the classic flaky-cable / underpowered-hub failure. Newer GADS versions auto-run `adb reconnect`; if it keeps happening, replace the cable or move the port.",
  },
  adb_unauthorized: {
    label: "ADB unauthorized",
    detail:
      "USB is present but the phone revoked or never accepted the host RSA key. Unlock the phone and tap Allow, or revoke USB debugging authorizations and re-pair.",
  },
  charge_only_cable: {
    label: "USB present, no ADB",
    detail:
      "The kernel still sees the device, but ADB does not. Typical causes: charge-only cable, USB mode flipped to charging-only, or a data-line failure in an otherwise seated connector.",
  },
  provider_setup: {
    label: "Stuck in provider setup",
    detail:
      "The provider host can still see this phone (ADB or iOS pairing), but GADS never reached live. Check provider logs for GADS-stream, WebDriverAgent, or permission failures.",
  },
  ios_needs_attention: {
    label: "Needs a hands-on fix",
    detail:
      "The phone is still on USB — GADS can see the UDID — but setup is failing (often Lockdown pairing error 3). Unlock it, tap Trust if asked, or hard-restart the iPhone. A reboot usually clears a wedged pairing session.",
  },
  stale_heartbeat: {
    label: "Stale provider heartbeat",
    detail:
      "GADS still marks the device connected, but the provider has not refreshed it in over 3 seconds. The hub treats that as unavailable. Usually the provider process stalled or lost its Mongo/hub path — not a cable.",
  },
  hub_unreachable: {
    label: "Hub unreachable",
    detail:
      "Watchdog cannot reach the GADS hub API. Devices may still be fine on the host; this is a hub/network/auth problem.",
  },
  ios_disconnected: {
    label: "Phone down",
    detail: "GADS does not see this iPhone as live. Check the device or the provider.",
  },
  unknown_down: {
    label: "Phone down",
    detail: "GADS does not see this phone as live. Check the device or the provider.",
  },
};

export function hasHubRuntime(device: GadsDevice): boolean {
  const state = device.providerState.trim().toLowerCase();
  return Boolean(state) && state !== "unknown";
}

export function isGadsLive(device: GadsDevice, now = Date.now()): boolean {
  // GADS UI "Available" is computed on the hub (live + fresh heartbeat).
  if (device.available) return true;
  if (!hasHubRuntime(device)) return false;
  if (!device.connected) return false;
  if (device.providerState !== "live") return false;
  if (
    device.lastUpdatedTimestamp > 0 &&
    now - device.lastUpdatedTimestamp > GADS_STALE_MS
  ) {
    return false;
  }
  return true;
}

export function isStale(device: GadsDevice, now = Date.now()): boolean {
  return (
    device.connected &&
    device.lastUpdatedTimestamp > 0 &&
    now - device.lastUpdatedTimestamp > GADS_STALE_MS
  );
}

export function normalizeUdid(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, "");
}

export function sameUdid(left: string, right: string): boolean {
  const a = normalizeUdid(left);
  const b = normalizeUdid(right);
  return Boolean(a) && a === b;
}

export function matchAdb(
  snapshot: HostSnapshot | null,
  udid: string,
): AdbDevice | undefined {
  if (!snapshot) return undefined;
  return snapshot.adb.find((d) => sameUdid(d.udid, udid));
}

export function matchUsb(
  snapshot: HostSnapshot | null,
  udid: string,
): UsbDevice | undefined {
  if (!snapshot) return undefined;
  return snapshot.usb.find((u) => sameUdid(u.serial ?? "", udid));
}

export function matchIos(snapshot: HostSnapshot | null, udid: string): boolean {
  return Boolean(snapshot?.ios?.some((id) => sameUdid(id, udid)));
}

export function classifyCause(
  device: GadsDevice,
  snapshot: HostSnapshot | null,
  hubOk: boolean,
  now = Date.now(),
): DropCause {
  if (!hubOk) return "hub_unreachable";

  const os = device.os.toLowerCase();
  const adb = matchAdb(snapshot, device.udid);
  const usb = matchUsb(snapshot, device.udid);
  const iosListed = matchIos(snapshot, device.udid);
  const usbPresent = snapshot ? Boolean(usb) : null;
  const adbStatus: AdbStatus = adb?.status ?? (snapshot ? "absent" : "unknown");

  if (isGadsLive(device, now)) return "online";

  // GADS `connected` means usbmux/ADB still sees the phone. That is never an unplug,
  // even when go-ios `ios list` omits a device that failed Lockdown pairing.
  if (os === "ios" && (device.connected || iosListed || usbPresent === true)) {
    return "ios_needs_attention";
  }

  if (snapshot) {
    if (os === "ios") {
      if (!device.connected && usbPresent === false && !iosListed) {
        return "usb_disconnect";
      }
    } else {
      if (usbPresent === false && adbStatus === "absent" && !device.connected) {
        return "usb_disconnect";
      }
      if (adbStatus === "offline") return "adb_offline";
      if (adbStatus === "unauthorized") return "adb_unauthorized";
      if (usbPresent === true && adbStatus === "absent") return "charge_only_cable";
      if (
        hasHubRuntime(device) &&
        (adbStatus === "device" || device.connected) &&
        device.providerState !== "live"
      ) {
        return "provider_setup";
      }
    }
  }

  if (isStale(device, now)) return "stale_heartbeat";
  // Without a collector we cannot tell unplugged vs WDA vs a powered-off phone.
  // Do not claim ADB/iOS pairing can see it.
  return "unknown_down";
}

export function classifyDevice(
  device: GadsDevice,
  snapshot: HostSnapshot | null,
  hubOk: boolean,
  extras: Pick<
    ClassifiedDevice,
    "downSince" | "lastOnline" | "dropCount24h" | "incidentAlerted"
  >,
  now = Date.now(),
): ClassifiedDevice {
  const adb = matchAdb(snapshot, device.udid);
  const usb = matchUsb(snapshot, device.udid);
  const iosListed = matchIos(snapshot, device.udid);
  const cause = classifyCause(device, snapshot, hubOk, now);
  const copy = CAUSE_COPY[cause];

  return {
    ...device,
    adbStatus: adb?.status ?? (snapshot ? "absent" : "unknown"),
    usbPresent: snapshot ? Boolean(usb) : null,
    iosPresent: snapshot ? Boolean(iosListed) : null,
    cause,
    causeLabel: copy.label,
    causeDetail: copy.detail,
    ...extras,
  };
}

export function isCableSuspect(cause: DropCause): boolean {
  return (
    cause === "usb_disconnect" ||
    cause === "adb_offline" ||
    cause === "charge_only_cable"
  );
}

export function severityForCause(cause: DropCause): "warning" | "critical" {
  if (cause === "hub_unreachable" || cause === "usb_disconnect") return "critical";
  return "warning";
}
