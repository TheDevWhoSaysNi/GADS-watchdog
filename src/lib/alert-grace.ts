import type { DropCause } from "./types";

/**
 * GADS retries these on its own (Lockdown pairing, WDA setup, adb reconnect).
 * A flap that clears in a minute or two must not page. Cable and trust
 * failures still use the configured grace so someone can go reseat or tap Allow.
 */
const SELF_HEAL_CAUSES: ReadonlySet<DropCause> = new Set([
  "ios_needs_attention",
  "provider_setup",
  "adb_offline",
  "stale_heartbeat",
  "ios_disconnected",
  "unknown_down",
]);

/** How long a self-healing drop must last before it is worth a physical check. */
export const SELF_HEAL_GRACE_SECONDS = 10 * 60;

export function alertGraceSeconds(cause: DropCause, downGraceSeconds: number): number {
  const configured = Math.max(15, downGraceSeconds || 60);
  if (SELF_HEAL_CAUSES.has(cause)) return Math.max(configured, SELF_HEAL_GRACE_SECONDS);
  return configured;
}

export function downLongEnough(
  cause: DropCause,
  elapsedMs: number,
  downGraceSeconds: number,
): boolean {
  return elapsedMs >= alertGraceSeconds(cause, downGraceSeconds) * 1000;
}
