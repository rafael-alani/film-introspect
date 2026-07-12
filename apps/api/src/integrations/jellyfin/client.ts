import { env } from "../../env";
import { asRecord, type JsonRecord } from "./types";

const CLIENT_NAME = "Introspect";
const DEVICE_NAME = "Introspect server";
export const JELLYFIN_OBSERVER_DEVICE_ID = "film-introspect-backend";
const CLIENT_VERSION = "0.1.0";

export class IntegrationError extends Error {
  constructor(
    public readonly service: string,
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

export class JellyfinClient {
  readonly baseUrl = env.JELLYFIN_URL?.replace(/\/$/, "") ?? null;
  readonly apiKey = env.JELLYFIN_API_KEY ?? null;

  get configured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  get authorizationHeader(): string {
    return `MediaBrowser Client="${CLIENT_NAME}", Device="${DEVICE_NAME}", DeviceId="${JELLYFIN_OBSERVER_DEVICE_ID}", Version="${CLIENT_VERSION}", Token="${this.apiKey ?? ""}"`;
  }

  private async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.baseUrl || !this.apiKey) {
      throw new IntegrationError(
        "jellyfin",
        null,
        "Jellyfin is not configured",
      );
    }

    const response = await globalThis.fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json; profile="CamelCase"',
        Authorization: this.authorizationHeader,
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      const body = (await response.text().catch(() => "")).slice(0, 300);
      throw new IntegrationError(
        "jellyfin",
        response.status,
        `Jellyfin returned ${response.status}${body ? `: ${body}` : ""}`,
      );
    }

    return response;
  }

  private async json(path: string, init?: RequestInit): Promise<unknown> {
    return (await this.fetch(path, init)).json();
  }

  async getSessions(): Promise<JsonRecord[]> {
    // Do not filter by activity: a legitimately paused client can remain quiet for a long time.
    const payload = await this.json("/Sessions");
    return Array.isArray(payload)
      ? payload
          .map(asRecord)
          .filter((value): value is JsonRecord => value !== null)
      : [];
  }

  async getSystemInfo(): Promise<JsonRecord> {
    const payload = asRecord(await this.json("/System/Info"));
    if (!payload)
      throw new IntegrationError(
        "jellyfin",
        null,
        "Invalid Jellyfin system response",
      );
    return payload;
  }

  async getItem(itemId: string, userId?: string | null): Promise<JsonRecord> {
    const userQuery = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    try {
      const current = asRecord(
        await this.json(`/Items/${encodeURIComponent(itemId)}${userQuery}`),
      );
      if (current) return current;
    } catch (error) {
      if (
        !(error instanceof IntegrationError) ||
        error.status !== 404 ||
        !userId
      )
        throw error;
    }

    if (!userId)
      throw new IntegrationError(
        "jellyfin",
        404,
        "Jellyfin item was not found",
      );
    const legacy = asRecord(
      await this.json(
        `/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}`,
      ),
    );
    if (!legacy)
      throw new IntegrationError(
        "jellyfin",
        null,
        "Invalid Jellyfin item response",
      );
    return legacy;
  }

  async getPlaybackInfo(
    itemId: string,
    userId?: string | null,
  ): Promise<JsonRecord> {
    const userQuery = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const payload = asRecord(
      await this.json(
        `/Items/${encodeURIComponent(itemId)}/PlaybackInfo${userQuery}`,
      ),
    );
    if (!payload)
      throw new IntegrationError(
        "jellyfin",
        null,
        "Invalid playback info response",
      );
    return payload;
  }

  async getSubtitleJson(
    itemId: string,
    mediaSourceId: string,
    streamIndex: number,
  ): Promise<unknown> {
    return this.json(
      `/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(mediaSourceId)}/Subtitles/${streamIndex}/Stream.json?CopyTimestamps=true`,
    );
  }

  async getSubtitleVtt(
    itemId: string,
    mediaSourceId: string,
    streamIndex: number,
  ): Promise<string> {
    const response = await this.fetch(
      `/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(mediaSourceId)}/Subtitles/${streamIndex}/Stream.vtt?CopyTimestamps=true`,
      { headers: { Accept: "text/vtt,text/plain" } },
    );
    return response.text();
  }

  async getImage(itemId: string, query: URLSearchParams): Promise<Response> {
    const params = new URLSearchParams({
      maxWidth: query.get("maxWidth") ?? "900",
      quality: query.get("quality") ?? "88",
    });
    return this.fetch(
      `/Items/${encodeURIComponent(itemId)}/Images/Primary?${params}`,
      {
        headers: { Accept: "image/avif,image/webp,image/*" },
      },
    );
  }

  createWebSocket(): WebSocket {
    if (!this.baseUrl || !this.apiKey) {
      throw new IntegrationError(
        "jellyfin",
        null,
        "Jellyfin is not configured",
      );
    }

    const url = new URL(this.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/$/, "")}/socket`;

    const BunWebSocket = WebSocket as unknown as new (
      url: string,
      options: { headers: Record<string, string> },
    ) => WebSocket;

    return new BunWebSocket(url.toString(), {
      headers: { Authorization: this.authorizationHeader },
    });
  }
}

export const jellyfinClient = new JellyfinClient();
