import { normalizeUdid } from "./classify";
import {
  applyProviderSync,
  assertWatchOnly,
  extractProviderSync,
  filterWorkspace,
  normalizeHubDevice,
  parseAdminDevices,
  providerNames,
  type ParsedAdmin,
  type RawHubDevice,
  type RawProviderSync,
} from "./gads-devices";
import type { GadsDevice } from "./types";

type GadsEnvelope<T> = {
  success?: boolean;
  message?: string;
  result?: T;
};

type AuthResult = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type Workspace = {
  id?: string;
  _id?: string;
  name?: string;
  is_default?: boolean;
};

export class GadsClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    private readonly authEnabled: boolean,
    private readonly originOverride: string,
  ) {}

  private origin(): string {
    if (this.originOverride) return this.originOverride.replace(/\/$/, "");
    return this.baseUrl.replace(/\/$/, "");
  }

  private headers(extra: Record<string, string> = {}): HeadersInit {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Origin: this.origin(),
      "X-Origin": this.origin(),
      ...extra,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }

  private url(path: string, query?: Record<string, string>): string {
    const u = new URL(path.replace(/^\//, ""), `${this.baseUrl.replace(/\/$/, "")}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value) u.searchParams.set(key, value);
      }
    }
    return u.toString();
  }

  async login(): Promise<void> {
    if (!this.authEnabled) return;
    if (this.token && Date.now() < this.tokenExpiresAt - 30_000) return;

    assertWatchOnly("POST", "/authenticate");
    const res = await fetch(this.url("/authenticate"), {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        username: this.username,
        password: this.password,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`GADS login failed (${res.status})`);
    }

    const body = (await res.json()) as GadsEnvelope<AuthResult> & AuthResult;
    const token = body.result?.access_token ?? body.access_token;
    if (!token) throw new Error("GADS login returned no access_token");
    this.token = token;
    const expiresIn = body.result?.expires_in ?? body.expires_in ?? 3600;
    this.tokenExpiresAt = Date.now() + expiresIn * 1000;
  }

  private async getJson<T>(
    path: string,
    query?: Record<string, string>,
    timeoutMs = 12_000,
  ): Promise<T> {
    assertWatchOnly("GET", path);
    await this.login();
    const res = await fetch(this.url(path, query), {
      headers: this.headers(),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401 && this.authEnabled) {
      this.token = null;
      await this.login();
      const retry = await fetch(this.url(path, query), {
        headers: this.headers(),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!retry.ok) throw new Error(`GADS ${path} failed (${retry.status})`);
      return (await retry.json()) as T;
    }
    if (!res.ok) throw new Error(`GADS ${path} failed (${res.status})`);
    return (await res.json()) as T;
  }

  async health(): Promise<boolean> {
    try {
      assertWatchOnly("GET", "/health");
      await this.login();
      const res = await fetch(this.url("/health"), {
        headers: this.headers(),
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) return true;
      // Some hubs keep /health behind a broken anonymous check even after login.
      // If we already have a token, the hub is reachable enough to watch devices.
      return Boolean(this.token);
    } catch {
      return false;
    }
  }

  async resolveWorkspaceId(preferred: string): Promise<string> {
    return preferred.trim();
  }

  private async listWorkspaceIds(): Promise<string[]> {
    for (const path of ["/workspaces", "/admin/workspaces"]) {
      try {
        const body = await this.getJson<unknown>(path);
        const ids = extractWorkspaces(body)
          .map((workspace) => workspace.id ?? workspace._id ?? "")
          .filter(Boolean);
        if (ids.length) return ids;
      } catch {
        // try the next known path
      }
    }
    return [];
  }

  async listDevices(workspaceId: string): Promise<GadsDevice[]> {
    const admin = await this.tryAdminDevices();
    if (admin) {
      const filtered = filterWorkspace(admin.devices, workspaceId);
      // GADS v6 answers with one inventory document. Do not open per-workspace SSE.
      if (admin.hasLiveRuntime) return filtered;
      const names = providerNames(workspaceId.trim() ? [] : admin.providers, filtered);
      if (!names.length) return filtered;
      const reads = await mapPool(names, 4, async (provider) => ({
        provider,
        sync: await this.readProviderSync(provider),
      }));
      return applyProviderSync(filtered, reads, Date.now());
    }
    return this.listDevicesFromAvailableStream(workspaceId);
  }

  /** Pre-v6 hubs that do not answer GET /admin/devices. */
  private async listDevicesFromAvailableStream(workspaceId: string): Promise<GadsDevice[]> {
    if (workspaceId) {
      const devices = await this.readAvailableDevices(workspaceId);
      if (devices.length) return devices;
      return [];
    }

    const workspaceIds = await this.listWorkspaceIds();
    const live = (
      await mapPool(workspaceIds, 4, (id) => this.readAvailableDevices(id))
    ).flat();
    const byUdid = new Map<string, GadsDevice>();
    for (const device of live) {
      if (!device.udid) continue;
      byUdid.set(normalizeUdid(device.udid), device);
    }
    return [...byUdid.values()];
  }

  private async tryAdminDevices(): Promise<ParsedAdmin | null> {
    try {
      const body = await this.getJson<unknown>("/admin/devices");
      return parseAdminDevices(body);
    } catch {
      return null;
    }
  }

  /**
   * Provider sync is the v6 runtime payload (connected, provider_state).
   * It is not a device-control call. /device/:udid routes are refused above.
   */
  private async readProviderSync(nickname: string): Promise<RawProviderSync[] | null> {
    const encoded = encodeURIComponent(nickname);
    for (const path of [`/provider/${encoded}/devices`, `/provider/${encoded}/info`]) {
      try {
        const body = await this.getJson<unknown>(path, undefined, 5_000);
        const list = extractProviderSync(body);
        if (list) return list;
      } catch {
        // try the other read-only provider route
      }
    }
    return null;
  }

  private async readAvailableDevices(workspaceId: string): Promise<GadsDevice[]> {
    if (!workspaceId) return [];
    assertWatchOnly("GET", "/available-devices");
    await this.login();
    const controller = new AbortController();
    const giveUp = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(this.url("/available-devices", { workspaceId }), {
        headers: this.headers({ Accept: "text/event-stream" }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return [];
      const raw = await readFirstSseData(res);
      if (!raw) return [];
      return parseSseDevices(raw).map(normalizeHubDevice).filter((d) => d.udid);
    } catch {
      return [];
    } finally {
      clearTimeout(giveUp);
      controller.abort();
    }
  }

}

async function readFirstSseData(res: Response): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 7000;

  try {
    while (Date.now() < deadline) {
      const remaining = Math.max(50, deadline - Date.now());
      const chunk = await readChunk(reader, remaining);
      if (!chunk) break;
      buffer += decoder.decode(chunk, { stream: true });
      const payload = firstSsePayload(buffer);
      if (payload) return payload;
    }
    return firstSsePayload(buffer + decoder.decode(), true);
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
}

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<Uint8Array | null> {
  try {
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("sse-timeout")), timeoutMs);
      }),
    ]);
    if (result.done) return null;
    return result.value;
  } catch {
    return null;
  }
}

function firstSsePayload(buffer: string, allowPartial = false): string | null {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const complete = allowPartial ? blocks : blocks.slice(0, -1);
  for (const block of complete) {
    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (!dataLines.length) continue;
    const payload = dataLines.join("\n");
    try {
      JSON.parse(payload);
      return payload;
    } catch {
      // keep reading; GADS sends one huge data:[...] line
    }
  }

  return firstJsonArray(buffer);
}

function firstJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "[") {
      depth += 1;
    } else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(Math.max(1, limit), items.length || 1);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

function extractWorkspaces(body: unknown): Workspace[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const payload = "result" in root ? root.result : body;
  if (Array.isArray(payload)) return payload as Workspace[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.items)) return record.items as Workspace[];
    if (Array.isArray(record.workspaces)) return record.workspaces as Workspace[];
  }
  return [];
}

function parseSseDevices(raw: string): RawHubDevice[] {
  const tryParse = (text: string): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  let value = tryParse(raw);
  if (typeof value === "string") value = tryParse(value);
  if (Array.isArray(value)) return value as RawHubDevice[];
  if (value && typeof value === "object" && "result" in value) {
    const result = (value as GadsEnvelope<unknown>).result;
    if (Array.isArray(result)) return result as RawHubDevice[];
  }
  return [];
}
