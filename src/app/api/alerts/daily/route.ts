import { configuredChannels, hasAnyAlertChannel } from "@/lib/alerts";
import { sendDailyHealthNow } from "@/lib/farm";
import { loadSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  const settings = loadSettings();
  const result = await sendDailyHealthNow();
  return Response.json({
    ...result,
    configured: hasAnyAlertChannel(settings),
    channels: configuredChannels(settings),
    enabled: settings.dailyHealthEnabled,
    hour: settings.dailyHealthHour,
  });
}
