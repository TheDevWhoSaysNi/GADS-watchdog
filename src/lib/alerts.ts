import type { FarmEvent, Settings } from "./types";

export type AlertChannel = {
  id: string;
  label: string;
  ready: (settings: Settings) => boolean;
  send: (settings: Settings, event: FarmEvent) => Promise<boolean>;
};

export const ALERT_CHANNELS: AlertChannel[] = [
  { id: "ntfy", label: "ntfy", ready: (s) => filled(s.ntfyTopic), send: sendNtfy },
  { id: "discord", label: "Discord", ready: (s) => filled(s.discordWebhook), send: sendDiscord },
  {
    id: "telegram",
    label: "Telegram",
    ready: (s) => filled(s.telegramBotToken) && filled(s.telegramChatId),
    send: sendTelegram,
  },
  { id: "slack", label: "Slack", ready: (s) => filled(s.slackWebhook), send: sendSlack },
  {
    id: "mattermost",
    label: "Mattermost",
    ready: (s) => filled(s.mattermostWebhook),
    send: sendMattermost,
  },
  { id: "teams", label: "Teams", ready: (s) => filled(s.teamsWebhook), send: sendTeams },
  {
    id: "pushover",
    label: "Pushover",
    ready: (s) => filled(s.pushoverUserKey) && filled(s.pushoverApiToken),
    send: sendPushover,
  },
  {
    id: "gotify",
    label: "Gotify",
    ready: (s) => filled(s.gotifyUrl) && filled(s.gotifyToken),
    send: sendGotify,
  },
  { id: "webhook", label: "Webhook", ready: (s) => filled(s.webhookUrl), send: sendWebhook },
];

export function filled(value: string | undefined | null): boolean {
  return Boolean(value && value.trim());
}

export function configuredChannels(settings: Settings): string[] {
  return ALERT_CHANNELS.filter((channel) => channel.ready(settings)).map((channel) => channel.label);
}

export function hasAnyAlertChannel(settings: Settings): boolean {
  return ALERT_CHANNELS.some((channel) => channel.ready(settings));
}

export function alertCopy(event: FarmEvent): { title: string; body: string } {
  const prefix =
    event.severity === "recovered"
      ? "Phone back online"
      : event.cause === "ios_needs_attention"
        ? "Needs hands-on"
        : event.udid === "FARM"
          ? "Farm"
          : "Phone down";
  return {
    title: `${prefix}: ${event.name}`,
    body: `${event.title}\n${event.detail}`,
  };
}

export async function dispatchAlert(settings: Settings, event: FarmEvent): Promise<boolean> {
  const jobs = ALERT_CHANNELS.filter((channel) => channel.ready(settings)).map((channel) =>
    channel.send(settings, event),
  );
  if (!jobs.length) return false;
  const results = await Promise.all(jobs);
  return results.some(Boolean);
}

async function sendNtfy(settings: Settings, event: FarmEvent): Promise<boolean> {
  const { title, body } = alertCopy(event);
  const server = settings.ntfyServer.replace(/\/$/, "") || "https://ntfy.sh";
  const headers: Record<string, string> = {
    Title: title,
    Priority: event.severity === "critical" ? "high" : event.severity === "recovered" ? "default" : "high",
    Tags: event.severity === "recovered" ? "white_check_mark,iphone" : "warning,iphone",
  };
  if (filled(settings.ntfyToken)) headers.Authorization = `Bearer ${settings.ntfyToken}`;
  return post(`${server}/${encodeURIComponent(settings.ntfyTopic)}`, {
    headers,
    body,
  });
}

async function sendDiscord(settings: Settings, event: FarmEvent): Promise<boolean> {
  const { title, body } = alertCopy(event);
  const color =
    event.severity === "recovered" ? 0x34d399 : event.severity === "critical" ? 0xf43f5e : 0xf59e0b;
  return post(settings.discordWebhook, {
    json: {
      embeds: [
        {
          title,
          description: body,
          color,
          timestamp: new Date(event.at).toISOString(),
        },
      ],
    },
  });
}

async function sendTelegram(settings: Settings, event: FarmEvent): Promise<boolean> {
  const { title, body } = alertCopy(event);
  return post(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
    json: {
      chat_id: settings.telegramChatId,
      text: `${title}\n${body}`,
      disable_web_page_preview: true,
    },
  });
}

async function sendSlack(settings: Settings, event: FarmEvent): Promise<boolean> {
  const { title, body } = alertCopy(event);
  const color =
    event.severity === "recovered" ? "#34d399" : event.severity === "critical" ? "#f43f5e" : "#f59e0b";
  return post(settings.slackWebhook, {
    json: {
      text: title,
      attachments: [{ color, text: body, fallback: body }],
    },
  });
}

async function sendMattermost(settings: Settings, event: FarmEvent): Promise<boolean> {
  const { title, body } = alertCopy(event);
  return post(settings.mattermostWebhook, {
    json: { text: `**${title}**\n${body}` },
  });
}

async function sendTeams(settings: Settings, event: FarmEvent): Promise<boolean> {
  const { title, body } = alertCopy(event);
  const themeColor =
    event.severity === "recovered" ? "34d399" : event.severity === "critical" ? "f43f5e" : "f59e0b";
  return post(settings.teamsWebhook, {
    json: {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      summary: title,
      themeColor,
      title,
      text: body.replaceAll("\n", "<br/>"),
    },
  });
}

async function sendPushover(settings: Settings, event: FarmEvent): Promise<boolean> {
  const { title, body } = alertCopy(event);
  return post("https://api.pushover.net/1/messages.json", {
    json: {
      token: settings.pushoverApiToken,
      user: settings.pushoverUserKey,
      title,
      message: body,
      priority: event.severity === "critical" ? 1 : 0,
    },
  });
}

async function sendGotify(settings: Settings, event: FarmEvent): Promise<boolean> {
  const { title, body } = alertCopy(event);
  const url = settings.gotifyUrl.replace(/\/$/, "");
  return post(`${url}/message`, {
    headers: { "X-Gotify-Key": settings.gotifyToken },
    json: {
      title,
      message: body,
      priority: event.severity === "critical" ? 8 : 5,
    },
  });
}

async function sendWebhook(settings: Settings, event: FarmEvent): Promise<boolean> {
  return post(settings.webhookUrl, {
    json: {
      source: "gads-watchdog",
      event,
    },
  });
}

async function post(
  url: string,
  init: { headers?: Record<string, string>; json?: unknown; body?: string },
): Promise<boolean> {
  try {
    const headers = { ...init.headers };
    let body = init.body;
    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.json);
    }
    const res = await fetch(url, { method: "POST", headers, body });
    if (!res.ok) {
      console.error("[watchdog] alert HTTP", res.status);
    }
    return res.ok;
  } catch (error) {
    console.error("[watchdog] alert request failed", error instanceof Error ? error.message : error);
    return false;
  }
}
