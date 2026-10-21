import {
  screeningMoviesSchema,
  screeningMovieDetailSchema,
  screeningTranscriptSchema,
  screeningSessionsSchema,
  appConfigSchema,
  apiErrorSchema,
  connectionsResponseSchema,
  createNoteInputSchema,
  mediaListResponseSchema,
  mediaSchema,
  metadataLookupInputSchema,
  metadataLookupResponseSchema,
  noteSchema,
  notesResponseSchema,
  playbackSnapshotSchema,
  sessionsResponseSchema,
  subtitlesResponseSchema,
  updateNoteInputSchema,
  updateRuntimeInputSchema,
  updateUserSettingsSchema,
  userSettingsSchema,
  type ConnectionsResponse,
  type AppConfig,
  type CreateNoteInput,
  type Media,
  type MediaListResponse,
  type MetadataLookupResponse,
  type Note,
  type NotesResponse,
  type PlaybackSnapshot,
  type SessionsResponse,
  type SubtitlesResponse,
  type UpdateNoteInput,
  type UpdateRuntimeInput,
  type UpdateUserSettings,
  type UserSettings,
} from "@film-introspect/contracts";
import type { ZodType } from "zod";

export const apiBaseUrl =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "";

export function apiAssetUrl(value: string | null): string | null {
  if (!value || /^(?:https?:|data:|blob:)/i.test(value)) return value;
  return `${apiBaseUrl}${value.startsWith("/") ? value : `/${value}`}`;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown | undefined;

  constructor(
    message: string,
    code: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function parseError(response: Response): Promise<ApiClientError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new ApiClientError(
      response.statusText || "The server returned an unreadable response.",
      "HTTP_ERROR",
      response.status,
    );
  }

  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    return new ApiClientError(
      parsed.data.error.message,
      parsed.data.error.code,
      response.status,
      parsed.data.error.details,
    );
  }

  return new ApiClientError(
    "The server returned an unexpected error.",
    "INVALID_ERROR_RESPONSE",
    response.status,
  );
}

async function request<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) throw await parseError(response);

  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiClientError(
      "The server response did not match the Introspect contract.",
      "INVALID_RESPONSE",
      response.status,
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}

async function requestEmpty(path: string, init?: RequestInit): Promise<void> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!response.ok) throw await parseError(response);
}

function body(value: unknown): string {
  return JSON.stringify(value);
}

export const api = {
  screeningMovies: (query: string) =>
    request(
      `/api/screening/movies?query=${encodeURIComponent(query)}`,
      screeningMoviesSchema,
    ),
  screeningMovie: (id: string) =>
    request(
      `/api/screening/movies/${encodeURIComponent(id)}`,
      screeningMovieDetailSchema,
    ),
  screeningTranscript: (item: string, cut: string, index: number) =>
    request(
      `/api/screening/movies/${encodeURIComponent(item)}/cuts/${encodeURIComponent(cut)}/subtitles/${index}`,
      screeningTranscriptSchema,
    ),
  screeningSessions: (itemId: string) =>
    request(
      `/api/screening/sessions?itemId=${encodeURIComponent(itemId)}`,
      screeningSessionsSchema,
    ),
  screeningTimeline: (itemId: string, cutId: string) =>
    request("/api/screening/timeline", mediaSchema, {
      method: "POST",
      body: body({ itemId, cutId }),
    }),
  config: (): Promise<AppConfig> => request("/api/config", appConfigSchema),
  playback: (): Promise<PlaybackSnapshot> =>
    request("/api/playback", playbackSnapshotSchema),
  sessions: (): Promise<SessionsResponse> =>
    request("/api/playback/sessions", sessionsResponseSchema),
  selectSession: (sessionId: string | null): Promise<SessionsResponse> =>
    request("/api/playback/sessions", sessionsResponseSchema, {
      method: "PATCH",
      body: body({ sessionId }),
    }),
  subtitles: (): Promise<SubtitlesResponse> =>
    request("/api/playback/subtitles", subtitlesResponseSchema),
  media: (): Promise<MediaListResponse> =>
    request("/api/media", mediaListResponseSchema),
  notes: (mediaId: string): Promise<NotesResponse> =>
    request(
      `/api/media/${encodeURIComponent(mediaId)}/notes`,
      notesResponseSchema,
    ),
  createNote: (mediaId: string, input: CreateNoteInput): Promise<Note> => {
    const parsed = createNoteInputSchema.parse(input);
    return request(
      `/api/media/${encodeURIComponent(mediaId)}/notes`,
      noteSchema,
      {
        method: "POST",
        body: body(parsed),
      },
    );
  },
  updateNote: (noteId: string, input: UpdateNoteInput): Promise<Note> => {
    const parsed = updateNoteInputSchema.parse(input);
    return request(`/api/notes/${encodeURIComponent(noteId)}`, noteSchema, {
      method: "PATCH",
      body: body(parsed),
    });
  },
  deleteNote: (noteId: string): Promise<void> =>
    requestEmpty(`/api/notes/${encodeURIComponent(noteId)}`, {
      method: "DELETE",
    }),
  updateRuntime: (
    mediaId: string,
    input: UpdateRuntimeInput,
  ): Promise<Media> => {
    const parsed = updateRuntimeInputSchema.parse(input);
    return request(
      `/api/media/${encodeURIComponent(mediaId)}/runtime`,
      mediaSchema,
      {
        method: "PATCH",
        body: body(parsed),
      },
    );
  },
  settings: (): Promise<UserSettings> =>
    request("/api/settings", userSettingsSchema),
  updateSettings: (input: UpdateUserSettings): Promise<UserSettings> => {
    const parsed = updateUserSettingsSchema.parse(input);
    return request("/api/settings", userSettingsSchema, {
      method: "PATCH",
      body: body(parsed),
    });
  },
  connections: (): Promise<ConnectionsResponse> =>
    request("/api/connections", connectionsResponseSchema),
  lookupMetadata: (imdbId: string): Promise<MetadataLookupResponse> => {
    const input = metadataLookupInputSchema.parse({ imdbId });
    return request("/api/metadata/lookup", metadataLookupResponseSchema, {
      method: "POST",
      body: body(input),
    });
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
