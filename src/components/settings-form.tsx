"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PublicSettings } from "@/lib/types";

type FormState = PublicSettings & { gadsPassword: string };

export function SettingsForm() {
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: PublicSettings) => {
        setForm({ ...data, gadsPassword: "" });
      })
      .catch(() => toast.error("Could not load settings"));
  }, []);

  if (!form) {
    return <p className="text-sm text-zinc-400">Loading settings…</p>;
  }

  const fromEnv = form.fromEnv ?? [];

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function locked(key: string) {
    return fromEnv.includes(key);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      const next = (await res.json()) as PublicSettings;
      setForm({ ...next, gadsPassword: "" });
      toast.success("Settings saved");
    } catch {
      toast.error("Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  async function testAlert() {
    const res = await fetch("/api/alerts/test", { method: "POST" });
    const body = (await res.json()) as { sent: boolean; configured: boolean; channels?: string[] };
    if (!body.configured) {
      toast.error("Fill ntfy, Telegram, Discord, or any other channel first — blank ones are skipped");
      return;
    }
    toast[body.sent ? "success" : "error"](
      body.sent
        ? `Test sent via ${body.channels?.join(", ") ?? "configured channels"}`
        : "Alert endpoints rejected the test",
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/setup"
          className="rounded-xl border border-lime-400/25 bg-lime-400/5 p-4 transition hover:bg-lime-400/10"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-lime-300">Path 1</p>
          <p className="mt-1 font-medium text-zinc-100">New to phone farms</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            Guided ntfy setup. Install an app, generate a private topic, get a
            test ping. No .env required.
          </p>
        </Link>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Path 2</p>
          <p className="mt-1 font-medium text-zinc-100">Run as a service</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            Copy <code className="text-zinc-200">.env.example</code> to{" "}
            <code className="text-zinc-200">.env</code>, paste any webhooks you
            want, leave the rest blank. Then install the Linux, Windows, or
            macOS service. Env values lock the matching fields below.
          </p>
        </div>
      </div>

      <Card className="bg-zinc-900/70">
        <CardHeader>
          <CardTitle>GADS connection</CardTitle>
          <CardDescription>
            Leave demo mode on until the hub URL and login work. Watchdog never
            replaces the GADS UI — it only reads device state.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row label="Demo mode" hint="Simulated 8-phone farm with real drop patterns">
            <Switch
              checked={form.mode === "demo"}
              onCheckedChange={(checked) => patch("mode", checked ? "demo" : "live")}
              disabled={locked("mode")}
            />
          </Row>
          <Field
            label="Hub URL"
            value={form.gadsUrl}
            onChange={(value) => patch("gadsUrl", value)}
            placeholder="http://127.0.0.1:10000"
            locked={locked("gadsUrl")}
          />
          <Row label="Hub auth enabled">
            <Switch
              checked={form.gadsAuthEnabled}
              onCheckedChange={(checked) => patch("gadsAuthEnabled", checked)}
              disabled={locked("gadsAuthEnabled")}
            />
          </Row>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Username"
              value={form.gadsUsername}
              onChange={(value) => patch("gadsUsername", value)}
              locked={locked("gadsUsername")}
            />
            <Field
              label={form.hasPassword ? "Password (unchanged if blank)" : "Password"}
              value={form.gadsPassword}
              onChange={(value) => patch("gadsPassword", value)}
              type="password"
              locked={locked("gadsPassword")}
            />
          </div>
          <Field
            label="JWT origin override"
            hint="GADS tokens are origin-bound. Leave blank to use the hub URL. If login works but device calls 401, add this app's origin as a GADS secret key or set this to the origin GADS already trusts."
            value={form.gadsOrigin}
            onChange={(value) => patch("gadsOrigin", value)}
            placeholder="http://127.0.0.1:10000"
            locked={locked("gadsOrigin")}
          />
          <Field
            label="Workspace ID"
            hint="Blank = first/default workspace GADS returns."
            value={form.workspaceId}
            onChange={(value) => patch("workspaceId", value)}
            locked={locked("workspaceId")}
          />
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/70">
        <CardHeader>
          <CardTitle>Alerting</CardTitle>
          <CardDescription>
            Every filled channel gets the same drop. Blank channels are skipped.
            ntfy is the guided-phone option; the rest are paste-a-secret for
            people who already have bots and webhooks.
            {form.alertChannels?.length
              ? ` Active: ${form.alertChannels.join(", ")}.`
              : " No channels active yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Poll interval (seconds)"
              type="number"
              value={String(form.pollSeconds)}
              onChange={(value) => patch("pollSeconds", Number(value))}
              locked={locked("pollSeconds")}
            />
            <Field
              label="Down grace (seconds)"
              type="number"
              value={String(form.downGraceSeconds)}
              onChange={(value) => patch("downGraceSeconds", Number(value))}
              locked={locked("downGraceSeconds")}
            />
          </div>
          <Row label="Notify on recovery">
            <Switch
              checked={form.recoverNotify}
              onCheckedChange={(checked) => patch("recoverNotify", checked)}
              disabled={locked("recoverNotify")}
            />
          </Row>

          <p className="pt-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Phone push — ntfy
          </p>
          <Field
            label="ntfy server"
            value={form.ntfyServer}
            onChange={(value) => patch("ntfyServer", value)}
            locked={locked("ntfyServer")}
          />
          <Field
            label="ntfy topic"
            value={form.ntfyTopic}
            onChange={(value) => patch("ntfyTopic", value)}
            placeholder="gads-home-farm-something-secret"
            locked={locked("ntfyTopic")}
          />
          <Field
            label="ntfy token (optional)"
            hint="Only if your ntfy server requires auth."
            value={form.ntfyToken}
            onChange={(value) => patch("ntfyToken", value)}
            type="password"
            locked={locked("ntfyToken")}
          />

          <p className="pt-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Chat and webhooks — blank means off
          </p>
          <Field
            label="Telegram bot token"
            hint="From @BotFather. Also set a chat id."
            value={form.telegramBotToken}
            onChange={(value) => patch("telegramBotToken", value)}
            type="password"
            locked={locked("telegramBotToken")}
          />
          <Field
            label="Telegram chat id"
            value={form.telegramChatId}
            onChange={(value) => patch("telegramChatId", value)}
            locked={locked("telegramChatId")}
          />
          <Field
            label="Discord webhook"
            value={form.discordWebhook}
            onChange={(value) => patch("discordWebhook", value)}
            locked={locked("discordWebhook")}
          />
          <Field
            label="Slack webhook"
            value={form.slackWebhook}
            onChange={(value) => patch("slackWebhook", value)}
            locked={locked("slackWebhook")}
          />
          <Field
            label="Mattermost webhook"
            value={form.mattermostWebhook}
            onChange={(value) => patch("mattermostWebhook", value)}
            locked={locked("mattermostWebhook")}
          />
          <Field
            label="Microsoft Teams webhook"
            value={form.teamsWebhook}
            onChange={(value) => patch("teamsWebhook", value)}
            locked={locked("teamsWebhook")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Pushover user key"
              value={form.pushoverUserKey}
              onChange={(value) => patch("pushoverUserKey", value)}
              locked={locked("pushoverUserKey")}
            />
            <Field
              label="Pushover API token"
              value={form.pushoverApiToken}
              onChange={(value) => patch("pushoverApiToken", value)}
              type="password"
              locked={locked("pushoverApiToken")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Gotify URL"
              value={form.gotifyUrl}
              onChange={(value) => patch("gotifyUrl", value)}
              placeholder="https://gotify.example.com"
              locked={locked("gotifyUrl")}
            />
            <Field
              label="Gotify token"
              value={form.gotifyToken}
              onChange={(value) => patch("gotifyToken", value)}
              type="password"
              locked={locked("gotifyToken")}
            />
          </div>
          <Field
            label="Generic webhook URL"
            hint="POSTs JSON { source, event }. Slack, n8n, or anything that accepts a POST."
            value={form.webhookUrl}
            onChange={(value) => patch("webhookUrl", value)}
            locked={locked("webhookUrl")}
          />
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/70">
        <CardHeader>
          <CardTitle>Host collector</CardTitle>
          <CardDescription>
            Run <code>scripts/host-collector.sh</code> on the machine that has the
            USB phones. It posts ADB, sysfs USB serials, optional idevice_id, and
            recent dmesg USB errors so drops can be classified as cable vs software.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field
            label="Collector token"
            value={form.collectorToken}
            onChange={(value) => patch("collectorToken", value)}
            locked={locked("collectorToken")}
          />
          <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-zinc-300">
{`WATCH_URL=http://127.0.0.1:43180 \\
COLLECTOR_TOKEN=${form.collectorToken || "YOUR_TOKEN"} \\
./scripts/host-collector.sh`}
          </pre>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        <Button variant="outline" onClick={testAlert}>
          Send test alert
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  type = "text",
  placeholder,
  locked = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  locked?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {locked ? (
          <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-amber-200">
            from .env
          </span>
        ) : null}
      </Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={locked}
      />
      {locked ? (
        <p className="text-xs text-zinc-500">Set in .env or the service environment. Restart to change.</p>
      ) : hint ? (
        <p className="text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-black/20 px-3 py-2.5">
      <div>
        <Label>{label}</Label>
        {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}
