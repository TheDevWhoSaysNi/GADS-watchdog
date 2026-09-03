import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alertCopy, configuredChannels, hasAnyAlertChannel } from "./alerts.ts";
import type { FarmEvent, Settings } from "./types.ts";

function settings(partial: Partial<Settings> = {}): Settings {
  return {
    ntfyTopic: "",
    ntfyServer: "https://ntfy.sh",
    ntfyToken: "",
    discordWebhook: "",
    telegramBotToken: "",
    telegramChatId: "",
    slackWebhook: "",
    mattermostWebhook: "",
    teamsWebhook: "",
    pushoverUserKey: "",
    pushoverApiToken: "",
    gotifyUrl: "",
    gotifyToken: "",
    webhookUrl: "",
    ...partial,
  } as Settings;
}

function event(partial: Partial<FarmEvent> = {}): FarmEvent {
  return {
    id: "1",
    at: 1,
    udid: "ABC",
    name: "Pixel 7",
    severity: "critical",
    cause: "usb_disconnect",
    title: "Pixel 7 has been down",
    detail: "USB serial vanished.",
    notified: false,
    ...partial,
  };
}

describe("alert channels", () => {
  it("ignores blank channels", () => {
    assert.equal(hasAnyAlertChannel(settings()), false);
    assert.deepEqual(configuredChannels(settings()), []);
  });

  it("activates every filled simple channel", () => {
    const next = settings({
      ntfyTopic: "farm-secret",
      discordWebhook: "https://discord.example/hook",
      slackWebhook: "https://hooks.slack.com/x",
      webhookUrl: "https://example.com/hook",
    });
    assert.deepEqual(configuredChannels(next), ["ntfy", "Discord", "Slack", "Webhook"]);
  });

  it("requires both Telegram fields", () => {
    const tokenOnly = settings({ telegramBotToken: "bot" });
    const both = settings({ telegramBotToken: "bot", telegramChatId: "1234" });
    assert.equal(hasAnyAlertChannel(tokenOnly), false);
    assert.deepEqual(configuredChannels(both), ["Telegram"]);
  });

  it("builds a pager title from severity", () => {
    assert.equal(alertCopy(event()).title, "Phone down: Pixel 7");
    assert.equal(alertCopy(event({ severity: "recovered" })).title, "Phone back online: Pixel 7");
    assert.equal(alertCopy(event({ severity: "warning" })).title, "Phone down: Pixel 7");
    assert.equal(
      alertCopy(event({ severity: "warning", udid: "FARM", name: "8 phones" })).title,
      "Farm: 8 phones",
    );
  });
});
