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

type RawHubDevice = {
  info?: {
    udid?: string;
    name?: string;
    os?: string;
    os_version?: string;
    provider?: string;
    usage?: string;
    workspace_id?: string;
  };
  udid?: string;
  name?: string;
  os?: string;
  host?: string;
  connected?: boolean;
  available?: boolean;
  provider_state?: string;
  last_updated_timestamp?: number;
  in_use?: boolean;
  in_use_by?: string;
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

    const res = await fetch(this.url("/authenticate"), {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        username: this.username,
        password: this.password,
      }),
      cache: "no-store",
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

  private async getJson<T>(path: string, query?: Record<string, string>): Promise<T> {
    await this.login();
    const res = await fetch(this.url(path, query), {
      headers: this.headers(),
      cache: "no-store",
    });
    if (res.status === 401 && this.authEnabled) {
      this.token = null;
      await this.login();
      const retry = await fetch(this.url(path, query), {
        headers: this.headers(),
        cache: "no-store",
      });
      if (!retry.ok) throw new Error(`GADS ${path} failed (${retry.status})`);
      return (await retry.json()) as T;
    }
    if (!res.ok) throw new Error(`GADS ${path} failed (${res.status})`);
    return (await res.json()) as T;
  }

  async health(): Promise<boolean> {
    try {
      await this.login();
      const res = await fetch(this.url("/health"), {
        headers: this.headers(),
        cache: "no-store",
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
    if (preferred) return preferred;
    const candidates = ["/workspaces", "/admin/workspaces"];
    for (const path of candidates) {
      try {
        const body = await this.getJson<unknown>(path);
        const list = extractWorkspaces(body);
        const fallback = list.find((w) => w.is_default) ?? list[0];
        const id = fallback?.id ?? fallback?._id ?? "";
        if (id) return id;
      } catch {
        // try the next known path
      }
    }
    return "";
  }

  async listDevices(workspaceId: string): Promise<GadsDevice[]> {
    const devices = await this.readAvailableDevices(workspaceId);
    if (devices.length) return devices;
    return this.readAdminDevices();
  }

  private async readAvailableDevices(workspaceId: string): Promise<GadsDevice[]> {
    if (!workspaceId) return [];
    await this.login();
    const res = await fetch(this.url("/available-devices", { workspaceId }), {
      headers: this.headers({ Accept: "text/event-stream" }),
      cache: "no-store",
    });
    if (!res.ok || !res.body) return [];

    const raw = await readFirstSseData(res);
    if (!raw) return [];
    const parsed = parseSseDevices(raw);
    return parsed.map(normalizeHubDevice).filter((d) => d.udid);
  }

  private async readAdminDevices(): Promise<GadsDevice[]> {
    try {
      const body = await this.getJson<
        GadsEnvelope<{ devices?: Array<RawHubDevice & { udid?: string; name?: string; os?: string }> }>
      >("/admin/devices");
      const devices = body.result?.devices ?? [];
      return devices.map((d) =>
        normalizeHubDevice({
          info: d,
          connected: false,
          available: false,
          provider_state: "unknown",
        }),
      );
    } catch {
      return [];
    }
  }
}

async function readFirstSseData(res: Response): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 4000;

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
    if (dataLines.length) return dataLines.join("\n");
  }

  const trimmed = buffer.trimStart();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trimStart();
  try {
    JSON.parse(payload);
    return payload;
  } catch {
    return null;
  }
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

function normalizeHubDevice(raw: RawHubDevice): GadsDevice {
  const info = raw.info ?? {};
  return {
    udid: info.udid ?? raw.udid ?? "",
    name: info.name ?? raw.name ?? info.udid ?? raw.udid ?? "Unknown device",
    os: info.os ?? raw.os ?? "android",
    osVersion: info.os_version ?? "",
    provider: info.provider ?? "",
    usage: info.usage ?? "",
    host: raw.host ?? "",
    connected: Boolean(raw.connected),
    available: Boolean(raw.available),
    providerState: raw.provider_state ?? "",
    lastUpdatedTimestamp: raw.last_updated_timestamp ?? 0,
    inUse: Boolean(raw.in_use),
    inUseBy: raw.in_use_by ?? "",
  };
}
