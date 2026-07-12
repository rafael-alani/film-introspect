import {
  type ConnectionsResponse,
  type PlaybackSnapshot,
  type SessionsResponse,
  type SubtitleCue,
  type SubtitlesResponse,
  type SubtitleTrack,
  type UserSettings,
} from "@film-introspect/contracts";
import { env } from "../env";
import { bazarrClient } from "../integrations/bazarr";
import {
  JELLYFIN_OBSERVER_DEVICE_ID,
  jellyfinClient,
} from "../integrations/jellyfin/client";
import {
  parseJellyfinSubtitleJson,
  parseVtt,
} from "../integrations/jellyfin/subtitles";
import { jellyfinSync } from "../integrations/jellyfin/sync";
import {
  asRecord,
  chooseSession,
  readArray,
  readBoolean,
  readNumber,
  readRecord,
  readString,
  type JsonRecord,
  type NormalizedJellyfinSession,
} from "../integrations/jellyfin/types";
import { omdbClient } from "../integrations/omdb";
import { resolveMedia, updateSettings } from "./repository";

const subtitleCache = new Map<
  string,
  { expiresAt: number; value: SubtitlesResponse }
>();

function effectiveSettings(settings: UserSettings): UserSettings {
  return {
    ...settings,
    preferredJellyfinUserId:
      settings.preferredJellyfinUserId ?? env.JELLYFIN_USER_ID ?? null,
  };
}

function authorizedSessions(
  settings: UserSettings,
): NormalizedJellyfinSession[] {
  const preferences = effectiveSettings(settings);
  const authorizedUserId = preferences.preferredJellyfinUserId;
  return jellyfinSync
    .getSessions()
    .filter(
      (candidate) =>
        candidate.session.deviceId !== JELLYFIN_OBSERVER_DEVICE_ID &&
        (!authorizedUserId || candidate.session.userId === authorizedUserId),
    );
}

function selectedPlaybackSession(
  settings: UserSettings,
): NormalizedJellyfinSession | null {
  const preferences = effectiveSettings(settings);
  if (
    !env.DEMO_MODE &&
    !preferences.preferredDeviceId &&
    !preferences.preferredJellyfinUserId
  ) {
    return null;
  }
  return chooseSession(authorizedSessions(settings), preferences);
}

export async function getPlaybackSnapshot(
  userId: string,
  settings: UserSettings,
): Promise<PlaybackSnapshot> {
  const syncState = jellyfinSync.getState();
  const selected = selectedPlaybackSession(settings);
  if (!selected?.media) {
    return {
      connection: syncState.connection,
      state: "idle",
      session: null,
      media: null,
      positionSeconds: 0,
      observedAt: syncState.observedAt,
      mediaSourceId: null,
      subtitleStreamIndex: null,
      statusMessage:
        syncState.message ??
        (!env.DEMO_MODE &&
        !effectiveSettings(settings).preferredDeviceId &&
        !effectiveSettings(settings).preferredJellyfinUserId
          ? "Choose a Jellyfin session in Settings before live playback is shown"
          : "Waiting for playback on Jellyfin"),
    };
  }

  const serverKey = jellyfinClient.baseUrl ?? "demo";
  const media = await resolveMedia(userId, serverKey, selected.media);
  return {
    connection: syncState.connection,
    state: selected.isPaused ? "paused" : "playing",
    session: selected.session,
    media,
    positionSeconds: Math.min(
      selected.positionSeconds,
      media.runtimeSeconds ?? Infinity,
    ),
    observedAt: syncState.observedAt,
    mediaSourceId: selected.mediaSourceId,
    subtitleStreamIndex: selected.subtitleStreamIndex,
    statusMessage: syncState.message,
  };
}

export function getSessions(settings: UserSettings): SessionsResponse {
  const sessions = authorizedSessions(settings).filter(
    (candidate) => candidate.session.isActive || candidate.media !== null,
  );
  const preferences = effectiveSettings(settings);
  const selected = preferences.preferredDeviceId
    ? (sessions.find(
        (candidate) =>
          candidate.session.deviceId === preferences.preferredDeviceId,
      ) ?? null)
    : chooseSession(sessions, preferences);
  return {
    sessions: sessions.map((candidate) => ({
      ...candidate.session,
      // Before a Jellyfin user is paired, expose devices but not another user's
      // identity, title, or position. Selection then persists the authorization map.
      userId: preferences.preferredJellyfinUserId
        ? candidate.session.userId
        : null,
      userName: preferences.preferredJellyfinUserId
        ? candidate.session.userName
        : null,
      nowPlaying: preferences.preferredJellyfinUserId
        ? candidate.nowPlaying
        : null,
      positionSeconds: preferences.preferredJellyfinUserId
        ? candidate.positionSeconds
        : 0,
      isPaused: preferences.preferredJellyfinUserId
        ? candidate.isPaused
        : false,
    })),
    selectedSessionId: selected?.session.id ?? null,
  };
}

export async function selectSession(
  userId: string,
  settings: UserSettings,
  sessionId: string | null,
): Promise<SessionsResponse | null> {
  if (sessionId === null) {
    const updated = await updateSettings(userId, {
      preferredDeviceId: null,
      preferredJellyfinUserId: null,
    });
    return getSessions(updated);
  }

  const selected = jellyfinSync
    .getSessions()
    .find((candidate) => candidate.session.id === sessionId);
  if (!selected) return null;
  const authorizedUserId =
    env.JELLYFIN_USER_ID ?? settings.preferredJellyfinUserId;
  if (authorizedUserId && selected.session.userId !== authorizedUserId)
    return null;
  const updated = await updateSettings(userId, {
    preferredDeviceId: selected.session.deviceId,
    preferredJellyfinUserId: selected.session.userId,
  });
  return getSessions(updated ?? settings);
}

function streamScore(
  stream: JsonRecord,
  selectedIndex: number | null,
  language: string,
): number {
  const streamLanguage = readString(stream, "Language")?.toLowerCase() ?? "";
  const wanted = language.toLowerCase();
  const languageMatch =
    streamLanguage === wanted ||
    streamLanguage.slice(0, 2) === wanted.slice(0, 2) ||
    streamLanguage.startsWith(wanted);
  return (
    (readNumber(stream, "Index") === selectedIndex ? 1_000 : 0) +
    (languageMatch ? 100 : 0) +
    (readBoolean(stream, "IsExternal") ? 20 : 0) +
    (readBoolean(stream, "IsDefault") ? 10 : 0) +
    (readBoolean(stream, "IsForced") ? 2 : 0)
  );
}

function chooseSubtitleStream(
  streams: JsonRecord[],
  selectedIndex: number | null,
  language: string,
): JsonRecord | null {
  return (
    streams
      .filter(
        (stream) =>
          readString(stream, "Type")?.toLowerCase() === "subtitle" &&
          readBoolean(stream, "IsTextSubtitleStream"),
      )
      .toSorted(
        (left, right) =>
          streamScore(right, selectedIndex, language) -
          streamScore(left, selectedIndex, language),
      )[0] ?? null
  );
}

async function getStreams(
  selected: NormalizedJellyfinSession,
): Promise<JsonRecord[]> {
  const nowPlaying = readRecord(selected.raw, "NowPlayingItem");
  const fromSession = readArray(nowPlaying, "MediaStreams")
    .map(asRecord)
    .filter((value): value is JsonRecord => value !== null);
  const hasUsableTextSubtitle = fromSession.some(
    (stream) =>
      readString(stream, "Type")?.toLowerCase() === "subtitle" &&
      readBoolean(stream, "IsTextSubtitleStream"),
  );
  if (hasUsableTextSubtitle || !selected.media) return fromSession;

  try {
    const playbackInfo = await jellyfinClient.getPlaybackInfo(
      selected.media.jellyfinItemId,
      selected.session.userId,
    );
    const source = readArray(playbackInfo, "MediaSources")
      .map(asRecord)
      .filter((value): value is JsonRecord => value !== null)
      .find(
        (candidate) =>
          !selected.mediaSourceId ||
          readString(candidate, "Id") === selected.mediaSourceId,
      );
    const streams = readArray(source ?? null, "MediaStreams")
      .map(asRecord)
      .filter((value): value is JsonRecord => value !== null);
    if (streams.length > 0) return streams;
  } catch {
    // Fall through to the lighter item DTO for older servers.
  }

  const item = await jellyfinClient.getItem(
    selected.media.jellyfinItemId,
    selected.session.userId,
  );
  return readArray(item, "MediaStreams")
    .map(asRecord)
    .filter((value): value is JsonRecord => value !== null);
}

function trackFromStream(
  stream: JsonRecord,
  selectedIndex: number | null,
): SubtitleTrack {
  const index = readNumber(stream, "Index") ?? 0;
  const language = readString(stream, "Language");
  return {
    index,
    language,
    label:
      readString(stream, "DisplayTitle") ??
      readString(stream, "Title") ??
      language?.toUpperCase() ??
      `Subtitle ${index}`,
    codec: readString(stream, "Codec"),
    isExternal: readBoolean(stream, "IsExternal"),
    isSelected: index === selectedIndex,
  };
}

function demoSubtitles(): SubtitlesResponse {
  const playhead = Math.floor(
    jellyfinSync.getSessions()[0]?.positionSeconds ?? 2_262,
  );
  const cues: SubtitleCue[] = [
    {
      id: "demo-1",
      startSeconds: playhead - 7,
      endSeconds: playhead - 1,
      text: "If memories could be canned...",
    },
    {
      id: "demo-2",
      startSeconds: playhead - 1,
      endSeconds: playhead + 5,
      text: "would they also have expiry dates?",
    },
    {
      id: "demo-3",
      startSeconds: playhead + 5,
      endSeconds: playhead + 11,
      text: "If so, I hope they last for centuries.",
    },
  ];
  return {
    track: {
      index: 2,
      language: "eng",
      label: "English · Demo",
      codec: "srt",
      isExternal: true,
      isSelected: true,
    },
    cues,
    message: null,
  };
}

export async function getSubtitles(
  settings: UserSettings,
): Promise<SubtitlesResponse> {
  if (env.DEMO_MODE) return demoSubtitles();
  const selected = selectedPlaybackSession(settings);
  if (!selected?.media)
    return { track: null, cues: [], message: "Nothing is playing" };

  const streams = await getStreams(selected);
  const stream = chooseSubtitleStream(
    streams,
    selected.subtitleStreamIndex,
    settings.preferredSubtitleLanguage,
  );
  if (!stream) {
    return {
      track: null,
      cues: [],
      message:
        "No text subtitle stream is available. Ask Bazarr to add an SRT or VTT sidecar.",
    };
  }

  const track = trackFromStream(stream, selected.subtitleStreamIndex);
  const mediaSourceId = selected.mediaSourceId ?? selected.media.jellyfinItemId;
  const cacheKey = `${selected.media.jellyfinItemId}:${mediaSourceId}:${track.index}`;
  const cached = subtitleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let cues: SubtitleCue[];
  try {
    const json = await jellyfinClient.getSubtitleJson(
      selected.media.jellyfinItemId,
      mediaSourceId,
      track.index,
    );
    cues = parseJellyfinSubtitleJson(json);
  } catch {
    const vtt = await jellyfinClient.getSubtitleVtt(
      selected.media.jellyfinItemId,
      mediaSourceId,
      track.index,
    );
    cues = parseVtt(vtt);
  }

  const value: SubtitlesResponse = {
    track,
    cues,
    message:
      cues.length === 0
        ? "The selected subtitle track contains no text cues"
        : null,
  };
  subtitleCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + 6 * 60 * 60 * 1_000,
  });
  if (subtitleCache.size > 100)
    subtitleCache.delete(subtitleCache.keys().next().value ?? "");
  return value;
}

export async function getConnectionStatuses(): Promise<ConnectionsResponse> {
  const checkedAt = new Date().toISOString();
  const jellyfin = async () => {
    if (env.DEMO_MODE) {
      return {
        service: "jellyfin" as const,
        configured: false,
        connected: true,
        label: "Jellyfin demo",
        version: null,
        message: "Demo mode is active",
        checkedAt,
      };
    }
    if (!jellyfinClient.configured) {
      return {
        service: "jellyfin" as const,
        configured: false,
        connected: false,
        label: "Jellyfin",
        version: null,
        message: "Set JELLYFIN_URL and JELLYFIN_API_KEY",
        checkedAt,
      };
    }
    try {
      const info = await jellyfinClient.getSystemInfo();
      return {
        service: "jellyfin" as const,
        configured: true,
        connected: true,
        label: readString(info, "ServerName") ?? "Jellyfin",
        version: readString(info, "Version"),
        message: "Playback sessions and subtitle streams are available",
        checkedAt,
      };
    } catch (error) {
      return {
        service: "jellyfin" as const,
        configured: true,
        connected: false,
        label: "Jellyfin",
        version: null,
        message: error instanceof Error ? error.message : "Connection failed",
        checkedAt,
      };
    }
  };

  const bazarr = async () => {
    if (!bazarrClient.configured) {
      return {
        service: "bazarr" as const,
        configured: false,
        connected: false,
        label: "Bazarr",
        version: null,
        message: "Optional: set BAZARR_URL and BAZARR_API_KEY",
        checkedAt,
      };
    }
    try {
      const status = await bazarrClient.getStatus();
      return {
        service: "bazarr" as const,
        configured: true,
        connected: true,
        label: "Bazarr",
        version: status.version,
        message: "Subtitle acquisition layer is reachable",
        checkedAt,
      };
    } catch (error) {
      return {
        service: "bazarr" as const,
        configured: true,
        connected: false,
        label: "Bazarr",
        version: null,
        message: error instanceof Error ? error.message : "Connection failed",
        checkedAt,
      };
    }
  };

  const omdb = Promise.resolve({
    service: "omdb" as const,
    configured: omdbClient.configured,
    connected: omdbClient.configured,
    label: "OMDb",
    version: null,
    message: omdbClient.configured
      ? "Metadata fallback is configured; Jellyfin runtime remains authoritative"
      : "Optional title-level runtime fallback",
    checkedAt,
  });

  const services = await Promise.all([jellyfin(), bazarr(), omdb]);
  return { services };
}
