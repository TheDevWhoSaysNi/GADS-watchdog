import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Settings } from "./types";

type EnvBinding = {
  env: string;
  key: keyof Settings;
  parse?: (raw: string) => Settings[keyof Settings];
};

function asBool(raw: string): boolean {
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function asInt(raw: string): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

export const ENV_BINDINGS: EnvBinding[] = [
  { env: "GADS_MODE", key: "mode", parse: (raw) => (raw === "live" ? "live" : "demo") },
  { env: "GADS_URL", key: "gadsUrl" },
  { env: "GADS_USERNAME", key: "gadsUsername" },
  { env: "GADS_PASSWORD", key: "gadsPassword" },
  { env: "GADS_AUTH_ENABLED", key: "gadsAuthEnabled", parse: asBool },
  { env: "GADS_ORIGIN", key: "gadsOrigin" },
  { env: "GADS_WORKSPACE_ID", key: "workspaceId" },
  { env: "WATCHDOG_POLL_SECONDS", key: "pollSeconds", parse: asInt },
  { env: "WATCHDOG_DOWN_GRACE_SECONDS", key: "downGraceSeconds", parse: asInt },
  { env: "WATCHDOG_PROVIDER_SETTLE_SECONDS", key: "providerSettleSeconds", parse: asInt },
  { env: "WATCHDOG_RECOVER_NOTIFY", key: "recoverNotify", parse: asBool },
  { env: "WATCHDOG_COLLECTOR_TOKEN", key: "collectorToken" },
  { env: "NTFY_SERVER", key: "ntfyServer" },
  { env: "NTFY_TOPIC", key: "ntfyTopic" },
  { env: "NTFY_TOKEN", key: "ntfyToken" },
  { env: "DISCORD_WEBHOOK_URL", key: "discordWebhook" },
  { env: "TELEGRAM_BOT_TOKEN", key: "telegramBotToken" },
  { env: "TELEGRAM_CHAT_ID", key: "telegramChatId" },
  { env: "SLACK_WEBHOOK_URL", key: "slackWebhook" },
  { env: "MATTERMOST_WEBHOOK_URL", key: "mattermostWebhook" },
  { env: "TEAMS_WEBHOOK_URL", key: "teamsWebhook" },
  { env: "PUSHOVER_USER_KEY", key: "pushoverUserKey" },
  { env: "PUSHOVER_API_TOKEN", key: "pushoverApiToken" },
  { env: "GOTIFY_URL", key: "gotifyUrl" },
  { env: "GOTIFY_TOKEN", key: "gotifyToken" },
  { env: "WEBHOOK_URL", key: "webhookUrl" },
];

export function loadDotEnv(cwd = process.cwd()) {
  try {
    const text = readFileSync(join(cwd, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  } catch {
    // No .env file is fine — systemd / Task Scheduler / launchd can supply env instead.
  }
}

export function applyEnv(
  settings: Settings,
  env: NodeJS.ProcessEnv = process.env,
): { settings: Settings; fromEnv: (keyof Settings)[] } {
  const next = { ...settings };
  const fromEnv: (keyof Settings)[] = [];

  for (const binding of ENV_BINDINGS) {
    const raw = env[binding.env];
    if (raw == null || raw.trim() === "") continue;
    const value = binding.parse ? binding.parse(raw.trim()) : raw.trim();
    (next[binding.key] as Settings[typeof binding.key]) = value as Settings[typeof binding.key];
    fromEnv.push(binding.key);
  }

  return { settings: next, fromEnv };
}
