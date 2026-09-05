import { cpus, freemem, hostname, loadavg, totalmem, uptime } from "node:os";
import { statfsSync } from "node:fs";
import type { HostVitals } from "./types";

let lastCpu: { idle: number; total: number } | null = null;

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function cpuPercent(): number | null {
  const now = cpuTimes();
  const prev = lastCpu;
  lastCpu = now;
  if (!prev || now.total <= prev.total) return null;
  const idle = now.idle - prev.idle;
  const total = now.total - prev.total;
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)));
}

function diskPercent(path = process.platform === "win32" ? "C:\\" : "/"): number | null {
  try {
    const stats = statfsSync(path);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    if (total <= 0) return null;
    return Math.max(0, Math.min(100, Math.round(((total - free) / total) * 100)));
  } catch {
    return null;
  }
}

export function collectLocalVitals(): HostVitals {
  const total = totalmem();
  const free = freemem();
  return {
    hostname: hostname(),
    cpuPercent: cpuPercent(),
    memPercent: total > 0 ? Math.round(((total - free) / total) * 100) : null,
    diskPercent: diskPercent(),
    load1: Math.round(loadavg()[0] * 100) / 100,
    uptimeSeconds: Math.round(uptime()),
  };
}

export async function collectLocalVitalsReady(): Promise<HostVitals> {
  let vitals = collectLocalVitals();
  if (vitals.cpuPercent != null) return vitals;
  await new Promise((resolve) => setTimeout(resolve, 250));
  return collectLocalVitals();
}

export function formatVitals(vitals: HostVitals | undefined): string {
  if (!vitals) return "no vitals";
  const parts: string[] = [];
  if (vitals.cpuPercent != null) parts.push(`CPU ${vitals.cpuPercent}%`);
  if (vitals.memPercent != null) parts.push(`RAM ${vitals.memPercent}%`);
  if (vitals.diskPercent != null) parts.push(`disk ${vitals.diskPercent}%`);
  if (vitals.load1 != null) parts.push(`load ${vitals.load1}`);
  if (vitals.uptimeSeconds != null) parts.push(`up ${formatUptime(vitals.uptimeSeconds)}`);
  return parts.join(" · ") || "no vitals";
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
