import { dispatchAlert } from "@/lib/alerts";
import { loadSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  const settings = loadSettings();
  const sent = await dispatchAlert(settings, {
    id: "test",
    at: Date.now(),
    udid: "TEST",
    name: "Test phone",
    severity: "warning",
    cause: "unknown_down",
    title: "GADS Watchdog test alert",
    detail:
      "If you received this, alerts are wired. Real drops wait for the grace period before notifying.",
    notified: false,
  });

  return Response.json({
    sent,
    configured: Boolean(settings.ntfyTopic || settings.discordWebhook || settings.webhookUrl),
  });
}
