import {
  type Media,
  type PlaybackConnection,
  type PlaybackSession,
  type SessionMedia,
} from "@film-introspect/contracts";

export type JsonRecord = Record<string, unknown>;

export interface NormalizedJellyfinSession {
  session: PlaybackSession;
  media: Media | null;
  nowPlaying: SessionMedia | null;
  positionSeconds: number;
  isPaused: boolean;
  mediaSourceId: string | null;
  subtitleStreamIndex: number | null;
  raw: JsonRecord;
}

export interface JellyfinSyncState {
  connection: PlaybackConnection;
  sessions: JsonRecord[];
  message: string | null;
  observedAt: string;
}

const ticksToSeconds = (ticks: number | null | undefined): number =>
  Math.max(0, (ticks ?? 0) / 10_000_000);

export function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

export function readValue(
  record: JsonRecord | null,
  pascalName: string,
): unknown {
  if (!record) return undefined;
  const camelName = pascalName.charAt(0).toLowerCase() + pascalName.slice(1);
  return record[pascalName] ?? record[camelName];
}

export function readRecord(
  record: JsonRecord | null,
  name: string,
): JsonRecord | null {
  return asRecord(readValue(record, name));
}

export function readArray(record: JsonRecord | null, name: string): unknown[] {
  const value = readValue(record, name);
  return Array.isArray(value) ? value : [];
}

export function readString(
  record: JsonRecord | null,
  name: string,
): string | null {
  const value = readValue(record, name);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readNumber(
  record: JsonRecord | null,
  name: string,
): number | null {
  const value = readValue(record, name);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function readBoolean(record: JsonRecord | null, name: string): boolean {
  return readValue(record, name) === true;
}

function normalizeProviderIds(item: JsonRecord): Record<string, string> {
  const raw = readRecord(item, "ProviderIds");
  if (!raw) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function normalizeMedia(
  item: JsonRecord,
  mediaId: string | null = null,
  mediaSourceId: string | null = null,
): Media {
  const type = readString(item, "Type")?.toLowerCase();
  const runtimeTicks = readNumber(item, "RunTimeTicks");
  const jellyfinItemId = readString(item, "Id") ?? "unknown";
  const seriesName = readString(item, "SeriesName");
  const seasonName = readString(item, "SeasonName");

  return {
    id: mediaId,
    jellyfinItemId,
    mediaSourceId,
    editionLabel: null,
    title: readString(item, "Name") ?? "Untitled",
    contextTitle: seriesName ?? seasonName,
    kind: type === "movie" ? "movie" : type === "episode" ? "episode" : "video",
    year: readNumber(item, "ProductionYear"),
    seasonNumber: readNumber(item, "ParentIndexNumber"),
    episodeNumber: readNumber(item, "IndexNumber"),
    runtimeSeconds:
      runtimeTicks == null ? null : Math.round(ticksToSeconds(runtimeTicks)),
    runtimeSource: runtimeTicks == null ? "unknown" : "jellyfin",
    providerIds: normalizeProviderIds(item),
    imageUrl: `/api/media/${encodeURIComponent(jellyfinItemId)}/image`,
  };
}

export function normalizeSession(raw: JsonRecord): NormalizedJellyfinSession {
  const playState = readRecord(raw, "PlayState");
  const nowPlayingItem = readRecord(raw, "NowPlayingItem");
  const mediaSourceId = readString(playState, "MediaSourceId");
  const media = nowPlayingItem
    ? normalizeMedia(nowPlayingItem, null, mediaSourceId)
    : null;
  const sessionId =
    readString(raw, "Id") ?? readString(raw, "DeviceId") ?? crypto.randomUUID();

  return {
    session: {
      id: sessionId,
      userId: readString(raw, "UserId"),
      userName: readString(raw, "UserName"),
      deviceId: readString(raw, "DeviceId"),
      deviceName: readString(raw, "DeviceName"),
      client: readString(raw, "Client"),
      isActive: readBoolean(raw, "IsActive"),
      supportsRemoteControl: readBoolean(raw, "SupportsRemoteControl"),
      lastActivityAt:
        readString(raw, "LastPlaybackCheckIn") ??
        readString(raw, "LastActivityDate"),
    },
    media,
    nowPlaying: media
      ? {
          jellyfinItemId: media.jellyfinItemId,
          mediaSourceId: media.mediaSourceId,
          editionLabel: media.editionLabel,
          title: media.title,
          contextTitle: media.contextTitle,
          kind: media.kind,
          year: media.year,
          seasonNumber: media.seasonNumber,
          episodeNumber: media.episodeNumber,
          runtimeSeconds: media.runtimeSeconds,
          providerIds: media.providerIds,
          imageUrl: media.imageUrl,
        }
      : null,
    positionSeconds: ticksToSeconds(readNumber(playState, "PositionTicks")),
    isPaused: readBoolean(playState, "IsPaused"),
    mediaSourceId,
    subtitleStreamIndex: readNumber(playState, "SubtitleStreamIndex"),
    raw,
  };
}

export function chooseSession(
  sessions: NormalizedJellyfinSession[],
  preferences: {
    preferredDeviceId: string | null;
    preferredJellyfinUserId: string | null;
  },
): NormalizedJellyfinSession | null {
  const playing = sessions.filter((candidate) => candidate.media !== null);
  if (playing.length === 0) return null;

  if (preferences.preferredDeviceId) {
    return (
      playing.find(
        (candidate) =>
          candidate.session.deviceId === preferences.preferredDeviceId,
      ) ?? null
    );
  }

  if (preferences.preferredJellyfinUserId) {
    return (
      playing.find(
        (candidate) =>
          candidate.session.userId === preferences.preferredJellyfinUserId,
      ) ?? null
    );
  }

  return (
    playing.toSorted((left, right) => {
      const leftTime = left.session.lastActivityAt
        ? Date.parse(left.session.lastActivityAt)
        : 0;
      const rightTime = right.session.lastActivityAt
        ? Date.parse(right.session.lastActivityAt)
        : 0;
      return rightTime - leftTime;
    })[0] ?? null
  );
}
