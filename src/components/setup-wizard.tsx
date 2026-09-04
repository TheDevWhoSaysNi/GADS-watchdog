"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ntfyAppUrl, ntfySubscribeUrl, randomNtfyTopic } from "@/lib/ntfy";
import type { PublicSettings } from "@/lib/types";

type FormState = PublicSettings & { gadsPassword: string };

const STEPS = ["What this is", "Get paged", "Your hub", "You are set"];

export function SetupWizard() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: PublicSettings) => setForm({ ...data, gadsPassword: "" }))
      .catch(() => toast.error("Could not load settings"));
  }, []);

  if (!form) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <LoaderCircle className="size-4 animate-spin" />
        Loading the guided setup…
      </div>
    );
  }

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function persist(next: FormState) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) throw new Error("Save failed");
    const saved = (await res.json()) as PublicSettings;
    const merged: FormState = { ...saved, gadsPassword: "" };
    setForm(merged);
    return merged;
  }

  async function generateTopic() {
    if (!form) return;
    if (form.fromEnv.includes("ntfyTopic")) {
      toast.error("Your ntfy topic is set in .env. Edit that file and restart instead.");
      return;
    }
    setBusy(true);
    try {
      const next: FormState = { ...form, ntfyTopic: randomNtfyTopic() };
      await persist(next);
      toast.success("Private topic created. Subscribe on your phone next.");
    } catch {
      toast.error("Could not save the ntfy topic");
    } finally {
      setBusy(false);
    }
  }

  async function saveHub() {
    if (!form) return;
    setBusy(true);
    try {
      await persist(form);
      toast.success("Hub settings saved");
      setStep(3);
    } catch {
      toast.error("Could not save hub settings");
    } finally {
      setBusy(false);
    }
  }

  async function testAlert() {
    setBusy(true);
    try {
      const res = await fetch("/api/alerts/test", { method: "POST" });
      const body = (await res.json()) as { sent: boolean; configured: boolean; channels: string[] };
      if (!body.configured) {
        toast.error("Create a topic first so Watchdog has somewhere to send the ping");
        return;
      }
      if (body.sent) {
        toast.success(`Test sent via ${body.channels.join(", ")}. Check your phone.`);
      } else {
        toast.error("The ntfy server rejected the test. Check the topic and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const topicLocked = form.fromEnv.includes("ntfyTopic");
  const subscribeUrl = form.ntfyTopic ? ntfySubscribeUrl(form.ntfyServer, form.ntfyTopic) : "";
  const appUrl = form.ntfyTopic ? ntfyAppUrl(form.ntfyServer, form.ntfyTopic) : "";

  return (
    <div className="space-y-6">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((label, index) => {
          const active = index === step;
          const done = index < step;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(index)}
                className={`w-full rounded-lg px-2 py-2 text-left ${
                  active
                    ? "bg-lime-400 text-zinc-950"
                    : done
                      ? "bg-lime-400/15 text-lime-100"
                      : "bg-white/5 text-zinc-500"
                }`}
              >
                <span className="block text-[10px] font-medium uppercase tracking-wide opacity-70">
                  Step {index + 1}
                </span>
                <span className="block text-xs font-semibold sm:text-sm">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === 0 ? (
        <Card className="bg-zinc-900/70">
          <CardHeader>
            <CardTitle>What this is</CardTitle>
            <CardDescription>
              Watchdog watches your GADS farm and pages you when a phone stays down.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-zinc-300">
            <ol className="list-decimal space-y-2 pl-5">
              <li>A demo farm is already running so you can see drop types before you risk production.</li>
              <li>You will install the free ntfy app and subscribe to a private topic. That is your pager.</li>
              <li>When you are ready, point Watchdog at your real GADS hub URL.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setStep(1)}>Get paged on my phone</Button>
              <Button variant="outline" render={<Link href="/" />}>
                Peek at the demo farm
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card className="bg-zinc-900/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-4 text-lime-300" />
              Install ntfy, then subscribe
            </CardTitle>
            <CardDescription>
              ntfy is a free push app. Nobody else can guess your topic if you
              use the generated one. You do not create an account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ol className="space-y-4 text-sm text-zinc-300">
              <li className="rounded-lg bg-black/20 p-3">
                <p className="font-medium text-zinc-100">1. Install ntfy on your phone</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StoreLink href="https://apps.apple.com/app/ntfy/id1625396347">iPhone</StoreLink>
                  <StoreLink href="https://play.google.com/store/apps/details?id=io.heckel.ntfy">
                    Android
                  </StoreLink>
                  <StoreLink href="https://f-droid.org/packages/io.heckel.ntfy/">F-Droid</StoreLink>
                </div>
              </li>
              <li className="rounded-lg bg-black/20 p-3">
                <p className="font-medium text-zinc-100">2. Create a private topic</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Treat this like a password. Anyone who knows it can subscribe.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={generateTopic} disabled={busy || topicLocked}>
                    {form.ntfyTopic ? "Make a new topic" : "Generate my topic"}
                  </Button>
                </div>
                {form.ntfyTopic ? (
                  <div className="mt-3 space-y-2">
                    <Label>Your topic</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={form.ntfyTopic} className="font-mono text-xs" />
                      <Button
                        variant="outline"
                        onClick={() => copyText(form.ntfyTopic, "Topic copied")}
                      >
                        <Copy className="size-3.5" />
                        Copy
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
              <li className="rounded-lg bg-black/20 p-3">
                <p className="font-medium text-zinc-100">3. Subscribe in the app</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Open ntfy → tap the + → paste the topic. Or use a link:
                </p>
                {form.ntfyTopic ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" render={<a href={subscribeUrl} target="_blank" rel="noreferrer" />}>
                      <ExternalLink className="size-3.5" />
                      Open subscribe page
                    </Button>
                    <Button variant="outline" render={<a href={appUrl} />}>
                      <Smartphone className="size-3.5" />
                      Open in ntfy app
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-amber-200">Generate a topic first.</p>
                )}
              </li>
              <li className="rounded-lg bg-black/20 p-3">
                <p className="font-medium text-zinc-100">4. Send a test ping</p>
                <p className="mt-1 text-xs text-zinc-500">
                  You should feel a notification within a couple of seconds.
                </p>
                <Button className="mt-3" onClick={testAlert} disabled={busy || !form.ntfyTopic}>
                  Send test alert
                </Button>
              </li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)} disabled={!form.ntfyTopic}>
                Next: connect my hub
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="bg-zinc-900/70">
          <CardHeader>
            <CardTitle>Point Watchdog at the GADS hub you already run</CardTitle>
            <CardDescription>
              Leave demo mode on until the URL and login work. You can keep
              playing with the fake farm for as long as you want.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg bg-black/20 px-3 py-2.5">
              <div>
                <Label>Demo mode</Label>
                <p className="mt-1 text-xs text-zinc-500">
                  On = fake 8-phone farm. Off = your real hub.
                </p>
              </div>
              <Switch
                checked={form.mode === "demo"}
                onCheckedChange={(checked) => patch("mode", checked ? "demo" : "live")}
                disabled={form.fromEnv.includes("mode")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Hub URL</Label>
              <Input
                value={form.gadsUrl}
                onChange={(event) => patch("gadsUrl", event.target.value)}
                placeholder="http://127.0.0.1:10000"
                disabled={form.fromEnv.includes("gadsUrl")}
              />
              <p className="text-xs text-zinc-500">
                Usually the same machine, port 10000. If GADS is on another box,
                use that box&apos;s address.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg bg-black/20 px-3 py-2.5">
              <div>
                <Label>Hub asks for a login</Label>
                <p className="mt-1 text-xs text-zinc-500">Most installs do. Use an admin user.</p>
              </div>
              <Switch
                checked={form.gadsAuthEnabled}
                onCheckedChange={(checked) => patch("gadsAuthEnabled", checked)}
                disabled={form.fromEnv.includes("gadsAuthEnabled")}
              />
            </div>
            {form.gadsAuthEnabled ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input
                    value={form.gadsUsername}
                    onChange={(event) => patch("gadsUsername", event.target.value)}
                    disabled={form.fromEnv.includes("gadsUsername")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{form.hasPassword ? "Password (unchanged if blank)" : "Password"}</Label>
                  <Input
                    type="password"
                    value={form.gadsPassword}
                    onChange={(event) => patch("gadsPassword", event.target.value)}
                    disabled={form.fromEnv.includes("gadsPassword")}
                  />
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={saveHub} disabled={busy}>
                {busy ? "Saving…" : "Save and finish"}
              </Button>
              <Button variant="ghost" onClick={() => setStep(3)}>
                Skip for now
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="bg-zinc-900/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="size-4 text-lime-300" />
              You are watching the farm
            </CardTitle>
            <CardDescription>
              Drops shorter than 45 seconds stay quiet on purpose. A 5-second
              USB hiccup should not wake you up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-zinc-300">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Open the{" "}
                <Link href="/" className="text-lime-200 underline underline-offset-2">
                  Farm
                </Link>{" "}
                page. Demo mode loops real drop types so you can learn the labels.
              </li>
              <li>
                When a real phone stays down, ntfy will say whether it looks like
                a cable, ADB, provider setup, or a dead heartbeat.
              </li>
              <li>
                Later, run the host collector from Settings if you want Watchdog
                to see ADB/USB on the machine the cables plug into.
              </li>
            </ul>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
              Prefer systemd, Task Scheduler, or a Telegram bot instead of the
              wizard? Use the{" "}
              <Link href="/settings" className="text-zinc-200 underline underline-offset-2">
                service / .env path
              </Link>
              . Blank notification variables are ignored; filled ones all get the alert.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button render={<Link href="/" />}>Go to the farm</Button>
              <Button variant="outline" render={<Link href="/settings" />}>
                Advanced settings
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button variant="outline" size="sm" render={<a href={href} target="_blank" rel="noreferrer" />}>
      {children}
    </Button>
  );
}

function copyText(value: string, ok: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(ok),
    () => toast.error("Could not copy"),
  );
}
