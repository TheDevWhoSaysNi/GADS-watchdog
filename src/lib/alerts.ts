import type { FarmEvent, Settings } from "./types";

export async function dispatchAlert(settings: Settings, event: FarmEvent): Promise<boolean> {
  const jobs: Promise<boolean>[] = [];
  if (settings.ntfyTopic) jobs.push(sendNtfy(settings, event));
  if (settings.discordWebhook) jobs.push(sendDiscord(settings, event));
  if (settings.webhookUrl) jobs.push(sendWebhook(settings, event));
  if (!jobs.length) return false;
  const results = await Promise.all(jobs);
  return results.some(Boolean);
}

function titlePrefix(event: FarmEvent): string {
  if (event.severity === "recovered") return "Phone back online";
  if (event.severity === "critical") return "Phone down";
  return "Phone warning";
}

async function sendNtfy(settings: Settings, event: FarmEvent): Promise<boolean> {
  const server = settings.ntfyServer.replace(/\/$/, "") || "https://ntfy.sh";
  const url = `${server}/${encodeURIComponent(settings.ntfyTopic)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Title: `${titlePrefix(event)}: ${event.name}`,
        Priority: event.severity === "critical" ? "high" : "default",
        Tags: event.severity === "recovered" ? "white_check_mark,iphone" : "warning,iphone",
      },
      body: `${event.title}\n${event.detail}`,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendDiscord(settings: Settings, event: FarmEvent): Promise<boolean> {
  const color =
    event.severity === "recovered"
      ? 0x34d399
      : event.severity === "critical"
        ? 0xf43f5e
        : 0xf59e0b;
  try {
    const res = await fetch(settings.discordWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: `${titlePrefix(event)}: ${event.name}`,
            description: `${event.title}\n${event.detail}`,
            color,
            timestamp: new Date(event.at).toISOString(),
          },
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendWebhook(settings: Settings, event: FarmEvent): Promise<boolean> {
  try {
    const res = await fetch(settings.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "gads-watchdog",
        event,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
