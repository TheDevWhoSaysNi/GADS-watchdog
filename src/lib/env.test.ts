import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyEnv } from "./env.ts";
import type { Settings } from "./types.ts";

function settings(partial: Partial<Settings> = {}): Settings {
  return {
    mode: "demo",
    gadsUrl: "http://127.0.0.1:10000",
    ntfyTopic: "",
    pollSeconds: 8,
    recoverNotify: true,
    telegramBotToken: "",
    telegramChatId: "",
    discordWebhook: "",
    ...partial,
  } as Settings;
}

describe("env overlay", () => {
  it("leaves settings alone when env values are blank", () => {
    const base = settings({ ntfyTopic: "from-ui" });
    const { settings: next, fromEnv } = applyEnv(base, {
      NTFY_TOPIC: "",
      DISCORD_WEBHOOK_URL: "   ",
      TELEGRAM_BOT_TOKEN: undefined,
    });
    assert.equal(next.ntfyTopic, "from-ui");
    assert.deepEqual(fromEnv, []);
  });

  it("overlays only filled variables and records their keys", () => {
    const { settings: next, fromEnv } = applyEnv(settings(), {
      GADS_MODE: "live",
      GADS_URL: "http://hub:10000",
      NTFY_TOPIC: "env-topic",
      TELEGRAM_BOT_TOKEN: "123:abc",
      TELEGRAM_CHAT_ID: "99",
      WATCHDOG_POLL_SECONDS: "12",
      WATCHDOG_RECOVER_NOTIFY: "no",
      WATCHDOG_DAILY_HEALTH: "false",
      WATCHDOG_DAILY_HEALTH_HOUR: "5",
    });
    assert.equal(next.mode, "live");
    assert.equal(next.gadsUrl, "http://hub:10000");
    assert.equal(next.ntfyTopic, "env-topic");
    assert.equal(next.telegramBotToken, "123:abc");
    assert.equal(next.telegramChatId, "99");
    assert.equal(next.pollSeconds, 12);
    assert.equal(next.recoverNotify, false);
    assert.equal(next.dailyHealthEnabled, false);
    assert.equal(next.dailyHealthHour, 5);
    assert.ok(fromEnv.includes("ntfyTopic"));
    assert.ok(fromEnv.includes("telegramBotToken"));
    assert.equal(fromEnv.includes("discordWebhook"), false);
  });
});
