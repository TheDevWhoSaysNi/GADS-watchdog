export function randomNtfyTopic(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `gads-farm-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function ntfySubscribeUrl(server: string, topic: string): string {
  const host = (server || "https://ntfy.sh").replace(/\/$/, "");
  return `${host}/${encodeURIComponent(topic)}`;
}

export function ntfyAppUrl(server: string, topic: string): string {
  try {
    const url = new URL(server || "https://ntfy.sh");
    return `ntfy://${url.host}/${encodeURIComponent(topic)}`;
  } catch {
    return `ntfy://ntfy.sh/${encodeURIComponent(topic)}`;
  }
}
