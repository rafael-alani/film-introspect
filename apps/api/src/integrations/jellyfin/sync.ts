import { env } from "../../env";
import { jellyfinClient, type JellyfinClient } from "./client";
import {
  asRecord,
  normalizeSession,
  readString,
  readValue,
  type JellyfinSyncState,
  type JsonRecord,
  type NormalizedJellyfinSession,
} from "./types";

type Listener = (state: JellyfinSyncState) => void;

const nowIso = () => new Date().toISOString();

export class JellyfinSync {
  private listeners = new Set<Listener>();
  private socket: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private started = false;
  private demoStartedAt = Date.now() - 37 * 60 * 1000 - 42 * 1000;
  private state: JellyfinSyncState = {
    connection: env.DEMO_MODE
      ? "demo"
      : jellyfinClient.configured
        ? "reconnecting"
        : "not_configured",
    sessions: [],
    message: null,
    observedAt: nowIso(),
  };

  constructor(private readonly client: JellyfinClient = jellyfinClient) {}

  start(): void {
    if (this.started) return;
    this.started = true;

    if (env.DEMO_MODE) {
      this.update({
        connection: "demo",
        sessions: [this.createDemoSession()],
        message: "Demo playback",
      });
      this.pollTimer = setInterval(() => {
        this.update({
          connection: "demo",
          sessions: [this.createDemoSession()],
          message: "Demo playback",
        });
      }, 1_000);
      return;
    }

    if (!this.client.configured) {
      this.update({
        connection: "not_configured",
        sessions: [],
        message: "Add JELLYFIN_URL and JELLYFIN_API_KEY to connect",
      });
      return;
    }

    this.connectWebSocket();
    this.pollTimer = setInterval(
      () => void this.refresh(),
      env.JELLYFIN_POLL_INTERVAL_MS,
    );
  }

  stop(): void {
    this.started = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close(1000, "Server stopping");
    this.socket = null;
  }

  getState(): JellyfinSyncState {
    return this.state;
  }

  getSessions(): NormalizedJellyfinSession[] {
    return this.state.sessions.map(normalizeSession);
  }

  getRawSession(sessionId: string): JsonRecord | null {
    return (
      this.state.sessions.find((session) => {
        const normalized = normalizeSession(session);
        return normalized.session.id === sessionId;
      }) ?? null
    );
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async refresh(): Promise<void> {
    try {
      const sessions = await this.client.getSessions();
      const websocketConnected = this.socket?.readyState === WebSocket.OPEN;
      this.update({
        connection: "connected",
        sessions,
        message: websocketConnected
          ? null
          : "Jellyfin WebSocket is unavailable; using REST polling",
      });
    } catch (error) {
      this.update({
        connection: "reconnecting",
        sessions: this.state.sessions,
        message:
          error instanceof Error ? error.message : "Jellyfin refresh failed",
      });
    }
  }

  private connectWebSocket(): void {
    if (!this.started || !this.client.configured || env.DEMO_MODE) return;
    try {
      const socket = this.client.createWebSocket();
      this.socket = socket;

      socket.addEventListener("open", () => {
        this.reconnectAttempts = 0;
        socket.send(
          JSON.stringify({ MessageType: "SessionsStart", Data: "0,1000" }),
        );
        this.update({
          connection: "connected",
          sessions: this.state.sessions,
          message: null,
        });
        // SessionsStart does not itself guarantee an initial payload.
        void this.refresh();
      });

      socket.addEventListener("message", (event) =>
        this.handleMessage(event.data),
      );
      socket.addEventListener("close", () =>
        this.scheduleReconnect("Jellyfin WebSocket closed"),
      );
      socket.addEventListener("error", () =>
        this.scheduleReconnect("Jellyfin WebSocket error"),
      );
    } catch (error) {
      this.scheduleReconnect(
        error instanceof Error
          ? error.message
          : "Unable to connect to Jellyfin",
      );
    }
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") return;
    try {
      const message = asRecord(JSON.parse(data));
      const messageType = readString(message, "MessageType");
      if (messageType === "ForceKeepAlive") {
        this.socket?.send(JSON.stringify({ MessageType: "KeepAlive" }));
        return;
      }
      if (messageType !== "Sessions") return;
      const sessions = readValue(message, "Data");
      if (!Array.isArray(sessions)) return;
      this.update({
        connection: "connected",
        sessions: sessions
          .map(asRecord)
          .filter((value): value is JsonRecord => value !== null),
        message: null,
      });
    } catch {
      // Jellyfin may send non-JSON control frames; the periodic REST refresh heals state.
    }
  }

  private scheduleReconnect(message: string): void {
    if (!this.started || this.reconnectTimer) return;
    this.socket = null;
    this.update({
      connection:
        this.state.connection === "connected" ? "connected" : "reconnecting",
      sessions: this.state.sessions,
      message: `${message}; REST polling remains active`,
    });
    const delay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempts++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, delay);
  }

  private update(next: Omit<JellyfinSyncState, "observedAt">): void {
    this.state = { ...next, observedAt: nowIso() };
    for (const listener of this.listeners) listener(this.state);
  }

  private createDemoSession(): JsonRecord {
    const positionTicks = (Date.now() - this.demoStartedAt) * 10_000;
    return {
      Id: "demo-living-room",
      UserId: "demo-user",
      UserName: "Demo viewer",
      Client: "Jellyfin Web",
      DeviceId: "demo-cinema",
      DeviceName: "Living Room TV",
      IsActive: true,
      SupportsRemoteControl: true,
      LastActivityDate: nowIso(),
      LastPlaybackCheckIn: nowIso(),
      PlayState: {
        PositionTicks: positionTicks,
        IsPaused: false,
        MediaSourceId: "demo-source",
        SubtitleStreamIndex: 2,
      },
      NowPlayingItem: {
        Id: "demo-movie",
        Name: "In the Mood for Love",
        Type: "Movie",
        ProductionYear: 2000,
        RunTimeTicks: 59_280_000_000,
        ProviderIds: { Imdb: "tt0118694", Tmdb: "843" },
      },
    };
  }
}

export const jellyfinSync = new JellyfinSync();
