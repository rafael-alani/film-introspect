import { z } from "zod";

export const isoDateSchema = z.string().datetime();
export const nullableTextSchema = z.string().trim().min(1).nullable();

export const mediaKindSchema = z.enum(["movie", "episode", "video"]);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const runtimeSourceSchema = z.enum([
  "jellyfin",
  "meta_egg",
  "manual",
  "omdb",
  "unknown",
]);
export type RuntimeSource = z.infer<typeof runtimeSourceSchema>;

export const providerIdsSchema = z.record(z.string(), z.string());

export const mediaSchema = z.object({
  id: z.string().uuid().nullable(),
  jellyfinItemId: z.string().min(1),
  mediaSourceId: z.string().nullable(),
  editionLabel: z.string().nullable(),
  title: z.string().min(1),
  contextTitle: z.string().nullable(),
  kind: mediaKindSchema,
  year: z.number().int().min(1800).max(3000).nullable(),
  seasonNumber: z.number().int().nonnegative().nullable(),
  episodeNumber: z.number().int().nonnegative().nullable(),
  runtimeSeconds: z.number().nonnegative().nullable(),
  runtimeSource: runtimeSourceSchema,
  providerIds: providerIdsSchema,
  imageUrl: z.string().nullable(),
});
export type Media = z.infer<typeof mediaSchema>;

export const sessionMediaSchema = mediaSchema.omit({
  id: true,
  runtimeSource: true,
});
export type SessionMedia = z.infer<typeof sessionMediaSchema>;

export const playbackSessionSchema = z.object({
  id: z.string().min(1),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  deviceId: z.string().nullable(),
  deviceName: z.string().nullable(),
  client: z.string().nullable(),
  isActive: z.boolean(),
  supportsRemoteControl: z.boolean(),
  lastActivityAt: isoDateSchema.nullable(),
});
export type PlaybackSession = z.infer<typeof playbackSessionSchema>;

export const playbackConnectionSchema = z.enum([
  "connected",
  "reconnecting",
  "disconnected",
  "not_configured",
  "demo",
]);
export type PlaybackConnection = z.infer<typeof playbackConnectionSchema>;

export const playbackStateSchema = z.enum(["idle", "playing", "paused"]);
export type PlaybackState = z.infer<typeof playbackStateSchema>;

export const playbackSnapshotSchema = z.object({
  connection: playbackConnectionSchema,
  state: playbackStateSchema,
  session: playbackSessionSchema.nullable(),
  media: mediaSchema.nullable(),
  positionSeconds: z.number().nonnegative(),
  observedAt: isoDateSchema,
  mediaSourceId: z.string().nullable(),
  subtitleStreamIndex: z.number().int().nullable(),
  statusMessage: z.string().nullable(),
});
export type PlaybackSnapshot = z.infer<typeof playbackSnapshotSchema>;

export const sessionsResponseSchema = z.object({
  sessions: z.array(
    playbackSessionSchema.extend({
      nowPlaying: sessionMediaSchema.nullable(),
      positionSeconds: z.number().nonnegative(),
      isPaused: z.boolean(),
    }),
  ),
  selectedSessionId: z.string().nullable(),
});
export type SessionsResponse = z.infer<typeof sessionsResponseSchema>;

export const noteColorSchema = z.enum([
  "amber",
  "mint",
  "lilac",
  "rose",
  "sky",
]);
export type NoteColor = z.infer<typeof noteColorSchema>;

export const noteSchema = z.object({
  id: z.string().uuid(),
  mediaId: z.string().uuid(),
  atSeconds: z.number().nonnegative(),
  body: z.string().min(1).max(2000),
  color: noteColorSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Note = z.infer<typeof noteSchema>;

export const createNoteInputSchema = z.object({
  atSeconds: z
    .number()
    .nonnegative()
    .max(60 * 60 * 24),
  body: z.string().trim().min(1).max(2000),
  color: noteColorSchema.default("amber"),
});
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;

export const updateNoteInputSchema = createNoteInputSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
export type UpdateNoteInput = z.infer<typeof updateNoteInputSchema>;

export const notesResponseSchema = z.object({
  notes: z.array(noteSchema),
});
export type NotesResponse = z.infer<typeof notesResponseSchema>;

export const mediaSummarySchema = mediaSchema.extend({
  noteCount: z.number().int().nonnegative(),
  lastNotedAt: isoDateSchema.nullable(),
});
export type MediaSummary = z.infer<typeof mediaSummarySchema>;

export const mediaListResponseSchema = z.object({
  items: z.array(mediaSummarySchema),
});
export type MediaListResponse = z.infer<typeof mediaListResponseSchema>;

export const subtitleCueSchema = z.object({
  id: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  text: z.string(),
});
export type SubtitleCue = z.infer<typeof subtitleCueSchema>;

export const subtitleTrackSchema = z.object({
  index: z.number().int(),
  language: z.string().nullable(),
  label: z.string(),
  codec: z.string().nullable(),
  isExternal: z.boolean(),
  isSelected: z.boolean(),
});
export type SubtitleTrack = z.infer<typeof subtitleTrackSchema>;

export const subtitlesResponseSchema = z.object({
  track: subtitleTrackSchema.nullable(),
  cues: z.array(subtitleCueSchema),
  message: z.string().nullable(),
});
export type SubtitlesResponse = z.infer<typeof subtitlesResponseSchema>;

export const userSettingsSchema = z.object({
  preferredJellyfinUserId: z.string().nullable(),
  preferredDeviceId: z.string().nullable(),
  preferredSubtitleLanguage: z.string().trim().min(2).max(12),
  noteLeadSeconds: z.number().int().min(0).max(60),
  noteTrailSeconds: z.number().int().min(1).max(120),
  defaultNoteColor: noteColorSchema,
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const updateUserSettingsSchema = userSettingsSchema.partial();
export type UpdateUserSettings = z.infer<typeof updateUserSettingsSchema>;

export const connectionServiceSchema = z.enum(["jellyfin", "bazarr", "omdb"]);
export const connectionStatusSchema = z.object({
  service: connectionServiceSchema,
  configured: z.boolean(),
  connected: z.boolean(),
  label: z.string(),
  version: z.string().nullable(),
  message: z.string().nullable(),
  checkedAt: isoDateSchema,
});
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const connectionsResponseSchema = z.object({
  services: z.array(connectionStatusSchema),
});
export type ConnectionsResponse = z.infer<typeof connectionsResponseSchema>;

export const updateRuntimeInputSchema = z.object({
  runtimeSeconds: z
    .number()
    .int()
    .positive()
    .max(60 * 60 * 24)
    .nullable(),
  editionLabel: z.string().trim().min(1).max(80).nullable().optional(),
  source: z.enum(["manual", "omdb"]).optional(),
});
export type UpdateRuntimeInput = z.infer<typeof updateRuntimeInputSchema>;

export const metadataLookupInputSchema = z.object({
  imdbId: z.string().regex(/^tt\d{7,10}$/),
});

export const metadataLookupResponseSchema = z.object({
  title: z.string(),
  year: z.number().int().nullable(),
  runtimeSeconds: z.number().int().positive().nullable(),
  imdbId: z.string(),
  source: z.literal("omdb"),
});
export type MetadataLookupResponse = z.infer<
  typeof metadataLookupResponseSchema
>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  time: isoDateSchema,
});

export const appConfigSchema = z.object({
  authEnabled: z.boolean(),
  demoMode: z.boolean(),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

export function ticksToSeconds(ticks: number | null | undefined): number {
  return Math.max(0, (ticks ?? 0) / 10_000_000);
}

export function formatTimestamp(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    : `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Meta Egg attaches every transcript to a declared subtitle version or media source.
const screeningSourceSchema = z.enum(["catalog", "jellyfin", "discovery"]);
const screeningPrecisionSchema = z.enum(["subtitle_version", "media_source"]);
const screeningLinkSchema = z
  .string()
  .url()
  .refine(
    (value) => /^https?:\/\//.test(value),
    "Expected an HTTP or HTTPS link",
  );
export const screeningProvenanceSchema = z.object({
  sourceUrl: screeningLinkSchema,
  licenseUrl: screeningLinkSchema.optional(),
  termsUrl: screeningLinkSchema.optional(),
  attribution: z.string().min(1),
});
export const screeningMovieSchema = z.object({
  provider: screeningSourceSchema,
  provenance: screeningProvenanceSchema.optional(),
  id: z.string().min(1),
  title: z.string().min(1),
  year: z.number().int().nullable(),
  overview: z.string().nullable(),
  runtimeSeconds: z.number().nonnegative().nullable(),
});
export const screeningTrackSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  label: z.string(),
  language: z.string().nullable(),
  codec: z.string().nullable(),
  available: z.boolean(),
});
export const screeningCutSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  runtimeSeconds: z.number().nonnegative().nullable(),
  precision: screeningPrecisionSchema,
  editionId: z.string().min(1).optional(),
  referenceVideoUrl: screeningLinkSchema.nullable().optional(),
  referenceVideoLabel: z.string().min(1).optional(),
  matchingNotes: z.string().optional(),
  subtitles: z.array(screeningTrackSchema),
});
export const screeningMoviesSchema = z.object({
  data: z.array(screeningMovieSchema),
});
export const screeningMovieDetailSchema = z.object({
  data: screeningMovieSchema.extend({
    savedAt: isoDateSchema.optional(),
    cuts: z.array(screeningCutSchema),
    transcriptStatus: z
      .object({
        state: z.enum(["ready", "not_configured", "not_found", "unavailable"]),
        message: z.string().min(1),
      })
      .optional(),
  }),
});
export const screeningTranscriptSchema = z.object({
  data: z.object({
    itemId: z.string(),
    cutId: z.string(),
    trackId: z.string(),
    language: z.string().nullable(),
    source: screeningSourceSchema,
    precision: screeningPrecisionSchema,
    provenance: screeningProvenanceSchema.optional(),
    savedAt: isoDateSchema.optional(),
    cues: z.array(
      subtitleCueSchema.refine((cue) => cue.endSeconds >= cue.startSeconds),
    ),
  }),
});
export const screeningSessionsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      itemId: z.string(),
      cutId: z.string().nullable(),
      deviceName: z.string(),
      state: z.enum(["playing", "paused"]),
      positionSeconds: z.number().nonnegative(),
      observedAt: isoDateSchema,
    }),
  ),
});
export const screeningSelectionSchema = z.object({
  itemId: z.string().min(1).max(200),
  cutId: z.string().min(1).max(200),
});
export type ScreeningMovie = z.infer<typeof screeningMovieSchema>;
export type ScreeningCut = z.infer<typeof screeningCutSchema>;
export type ScreeningSession = z.infer<
  typeof screeningSessionsSchema
>["data"][number];
