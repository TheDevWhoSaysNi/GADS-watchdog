"use client";

import { useEffect, useState } from "react";
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

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
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
    const body = (await res.json()) as { sent: boolean; configured: boolean };
    if (!body.configured) {
      toast.error("Add an ntfy topic, Discord webhook, or generic webhook first");
      return;
    }
    toast[body.sent ? "success" : "error"](
      body.sent ? "Test alert sent" : "Alert endpoints rejected the test",
    );
  }

  return (
    <div className="space-y-6">
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
            />
          </Row>
          <Field
            label="Hub URL"
            value={form.gadsUrl}
            onChange={(value) => patch("gadsUrl", value)}
            placeholder="http://127.0.0.1:10000"
          />
          <Row label="Hub auth enabled">
            <Switch
              checked={form.gadsAuthEnabled}
              onCheckedChange={(checked) => patch("gadsAuthEnabled", checked)}
            />
          </Row>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Username"
              value={form.gadsUsername}
              onChange={(value) => patch("gadsUsername", value)}
            />
            <Field
              label={form.hasPassword ? "Password (unchanged if blank)" : "Password"}
              value={form.gadsPassword}
              onChange={(value) => patch("gadsPassword", value)}
              type="password"
            />
          </div>
          <Field
            label="JWT origin override"
            hint="GADS tokens are origin-bound. Leave blank to use the hub URL. If login works but device calls 401, add this app's origin as a GADS secret key or set this to the origin GADS already trusts."
            value={form.gadsOrigin}
            onChange={(value) => patch("gadsOrigin", value)}
            placeholder="http://127.0.0.1:10000"
          />
          <Field
            label="Workspace ID"
            hint="Blank = first/default workspace GADS returns."
            value={form.workspaceId}
            onChange={(value) => patch("workspaceId", value)}
          />
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/70">
        <CardHeader>
          <CardTitle>Alerting</CardTitle>
          <CardDescription>
            ntfy is the fastest home-lab option: install the ntfy app, subscribe to a
            private topic, paste it here. Alerts wait for the grace period so brief
            USB blips stay quiet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Poll interval (seconds)"
              type="number"
              value={String(form.pollSeconds)}
              onChange={(value) => patch("pollSeconds", Number(value))}
            />
            <Field
              label="Down grace (seconds)"
              type="number"
              value={String(form.downGraceSeconds)}
              onChange={(value) => patch("downGraceSeconds", Number(value))}
            />
          </div>
          <Row label="Notify on recovery">
            <Switch
              checked={form.recoverNotify}
              onCheckedChange={(checked) => patch("recoverNotify", checked)}
            />
          </Row>
          <Field
            label="ntfy server"
            value={form.ntfyServer}
            onChange={(value) => patch("ntfyServer", value)}
          />
          <Field
            label="ntfy topic"
            value={form.ntfyTopic}
            onChange={(value) => patch("ntfyTopic", value)}
            placeholder="gads-home-farm-something-secret"
          />
          <Field
            label="Discord webhook"
            value={form.discordWebhook}
            onChange={(value) => patch("discordWebhook", value)}
          />
          <Field
            label="Generic webhook URL"
            value={form.webhookUrl}
            onChange={(value) => patch("webhookUrl", value)}
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
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
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
