export type FarmMode = "demo" | "live";

export type AdbStatus = "device" | "offline" | "unauthorized" | "unknown" | "absent";

export type DropCause =
  | "online"
  | "usb_disconnect"
  | "adb_offline"
  | "adb_unauthorized"
  | "charge_only_cable"
  | "provider_setup"
  | "ios_needs_attention"
  | "stale_heartbeat"
  | "hub_unreachable"
  | "ios_disconnected"
  | "unknown_down";

export type AlertSeverity = "info" | "warning" | "critical" | "recovered";

export type Settings = {
  mode: FarmMode;
  gadsUrl: string;
  gadsUsername: string;
  gadsPassword: string;
  gadsAuthEnabled: boolean;
  gadsOrigin: string;
  workspaceId: string;
  pollSeconds: number;
  downGraceSeconds: number;
  providerSettleSeconds: number;
  recoverNotify: boolean;
  ntfyServer: string;
  ntfyTopic: string;
  ntfyToken: string;
  discordWebhook: string;
  telegramBotToken: string;
  telegramChatId: string;
  slackWebhook: string;
  mattermostWebhook: string;
  teamsWebhook: string;
  pushoverUserKey: string;
  pushoverApiToken: string;
  gotifyUrl: string;
  gotifyToken: string;
  webhookUrl: string;
  collectorToken: string;
};

export type PublicSettings = Omit<Settings, "gadsPassword"> & {
  hasPassword: boolean;
  fromEnv: string[];
  alertChannels: string[];
};

export type AdbDevice = {
  udid: string;
  status: AdbStatus;
  usb?: string;
  product?: string;
  model?: string;
};

export type UsbDevice = {
  bus: string;
  sysName: string;
  vendorId: string;
  productId: string;
  manufacturer?: string;
  product?: string;
  serial?: string;
};

export type HostSnapshot = {
  receivedAt: number;
  hostname: string;
  adb: AdbDevice[];
  usb: UsbDevice[];
  ios?: string[];
  dmesg: string[];
};

export type GadsDevice = {
  udid: string;
  name: string;
  os: string;
  osVersion: string;
  provider: string;
  workspaceId: string;
  usage: string;
  host: string;
  connected: boolean;
  available: boolean;
  providerState: string;
  lastUpdatedTimestamp: number;
  inUse: boolean;
  inUseBy: string;
};

export type ClassifiedDevice = GadsDevice & {
  adbStatus: AdbStatus;
  usbPresent: boolean | null;
  iosPresent: boolean | null;
  cause: DropCause;
  causeLabel: string;
  causeDetail: string;
  downSince: number | null;
  lastOnline: number | null;
  dropCount24h: number;
  incidentAlerted: boolean;
};

export type FarmEvent = {
  id: string;
  at: number;
  udid: string;
  name: string;
  severity: AlertSeverity;
  cause: DropCause;
  title: string;
  detail: string;
  notified: boolean;
};

export type FarmSnapshot = {
  generatedAt: number;
  mode: FarmMode;
  hubOk: boolean;
  hubError: string | null;
  collectorAgeMs: number | null;
  collectorHostname: string | null;
  devices: ClassifiedDevice[];
  events: FarmEvent[];
  stats: {
    total: number;
    online: number;
    down: number;
    inUse: number;
    cableSuspects: number;
    setupStuck: number;
  };
  alertsConfigured: boolean;
};

export type DeviceMemory = {
  lastCause: DropCause;
  downSince: number | null;
  lastOnline: number | null;
  incidentAlerted: boolean;
  dropTimestamps: number[];
};
