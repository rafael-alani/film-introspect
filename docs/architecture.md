# Architecture

This map describes the repository implementation. Protocol research and its dated sources live in [integrations.md](integrations.md); setup and checks live in [development.md](development.md).

## Code map

| Location                                                                                    | Responsibility                                                                     |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`apps/web/src/router.tsx`](../apps/web/src/router.tsx), [`pages/`](../apps/web/src/pages/) | Live, Library, and Settings routes; auth gating is in `components/app-layout.tsx`  |
| [`apps/web/src/api/`](../apps/web/src/api/)                                                 | Credentialed HTTP client, response validation, and Better Auth client              |
| [`apps/web/src/hooks/use-playback.ts`](../apps/web/src/hooks/use-playback.ts)               | SSE subscription, HTTP fallback, and browser clock interpolation                   |
| [`apps/api/src/index.ts`](../apps/api/src/index.ts)                                         | Migrate, ensure Local viewer, start Jellyfin sync, serve Hono, shut down           |
| [`apps/api/src/app.ts`](../apps/api/src/app.ts)                                             | Routes, app authentication, validation, image proxy, SSE, and errors               |
| [`apps/api/src/services/playback.ts`](../apps/api/src/services/playback.ts)                 | Session filtering/pairing, app snapshots, subtitle choice/cache, connection checks |
| [`apps/api/src/services/repository.ts`](../apps/api/src/services/repository.ts)             | User-scoped settings, timeline resolution, runtime updates, and note CRUD          |
| [`apps/api/src/integrations/`](../apps/api/src/integrations/)                               | Meta Egg screening client; legacy Jellyfin, Bazarr and OMDb adapters               |
| [`apps/api/src/db/`](../apps/api/src/db/), [`drizzle/`](../apps/api/drizzle/)               | SQLite connection, Drizzle schema, and migrations                                  |
| [`packages/contracts/src/index.ts`](../packages/contracts/src/index.ts)                     | Shared Zod schemas, types, validation limits, and timestamp helpers                |

## Data flow

The screening MVP uses `LivePage` → Introspect's `/api/screening/*` proxy → Meta Egg's `/v1/screening/*` API. Metadata, film versions and transcripts all come from Meta Egg. Meta Egg supplies a standalone catalog and online discovery of film metadata and subtitle releases; its optional Jellyfin provider can also supply media sources and observed sessions. Introspect never sends playback control commands. Only sanitized, validated DTOs reach the browser, and every transcript response must match the requested film, cut and track.

Search and selected-movie detail are bounded requests to Meta Egg, with separate metadata and subtitle progress states in Live. An optional detail `transcriptStatus` preserves the film when subtitles are missing, unconfigured or unavailable. Search resubmission and subtitle retry start fresh requests. Editing a search clears the old film/cut selection; pending or failed lookups cannot open a stale selection. Opening a screening requires a selected version with an available text track.

Meta Egg can persist online selections and requested transcripts in its private screening library. Optional `data.savedAt` ISO timestamps on movie detail and transcript responses acknowledge successful storage; Live displays saved status only for these validated acknowledgements. They do not claim canonical graph ingestion or prove that subtitles match the film on screen. The proxy maps `screening_storage_unavailable` to a local actionable message without forwarding upstream details. Introspect does not duplicate this storage or add a separate save request.

`META_EGG_URL` is server-side configuration. The Meta Egg service must be private; the screening endpoints use the normal Introspect account gate, and the server-to-server connection does not send a browser credential. Notes continue to use the existing user-scoped SQLite repository. Runtime provenance is recorded as `meta_egg`, rather than incorrectly implying all metadata originated in Jellyfin.

The older direct Jellyfin, Bazarr and OMDb adapters remain for existing Settings, Library and API clients. They are not used as fallback metadata or subtitles in the screening flow. Original Jellyfin protocol research remains in [integrations](integrations.md).

## Playback and subtitle synchronization

The browser owns the active screening clock. Manual mode uses an explicit film-time anchor plus a monotonic timer. A dialogue search can re-anchor at a known cue; half-second corrections adjust the subtitle clock without changing the movie. Leaving/reloading the screening loses this transient clock and requires calibration again.

For `provider: catalog` and `provider: discovery` entries, the UI offers only manual alignment and makes no session request. `subtitle_version` precision describes the supplied transcript version, not an automatic match to the screen. Meta Egg can provide matching notes, a reference video link and source attribution, optional license links and optional provider terms; all external links are validated as HTTP(S). The player is separate from Introspect.

For `provider: jellyfin` entries only, optional Meta Egg session snapshots are polled every two seconds. Only the selected exact item/media-source pair is eligible. A new observed timestamp, position, pause or seek re-anchors the clock; a repeated sample does not restart interpolation. The reported Jellyfin position is anchored at receipt without adding the age of `LastPlaybackCheckIn`: Jellyfin has already advanced that position. Missing API updates for ten seconds, playing-session check-ins older than thirty seconds, or check-ins materially ahead of the browser clock are flagged unavailable. A successfully observed paused session does not expire merely because its progress check-in is old. Network and client latency remain limits: this is not frame-accurate synchronization or audio recognition.

Focusing Quick note captures a separate draft timestamp and freezes the subtitle view. The clock continues independently. The save request uses that captured timestamp, not the submission time; success clears the hold and failure retains it. Film/cut changes require leaving the current screening and confirm before discarding text. Track and clock controls are disabled during a held draft.

## Authentication and trust

Better Auth stores app accounts/sessions in SQLite. With `APP_AUTH_ENABLED=true`, application routes require an app session; health, config, and Better Auth's own routes are outside that gate. With it disabled, application requests all use the fixed Local viewer ID. Better Auth routes remain mounted even in local mode, so `ALLOW_SIGN_UP` is a separate setting.

Notes, settings, and timelines are scoped by app user. Screening session scope belongs to Meta Egg's configured user. The legacy direct-Jellyfin backend, when configured, uses one API key and its pairing does not verify the viewer's Jellyfin credentials.

The legacy Settings session picker checks `JELLYFIN_USER_ID` (or the saved pairing), and hides user/title/position before an unscoped first pairing. However, `PATCH /api/settings` accepts `preferredJellyfinUserId` and `preferredDeviceId` directly, and playback filtering prefers the stored user over the environment default. Consequently, `JELLYFIN_USER_ID` is not an enforced tenant boundary against a caller making direct API requests. Deploy for trusted users; hardening this path is required before claiming isolation between untrusted Jellyfin users.

## Timeline and runtime rules

The unique timeline key is **app user + server key + item ID + media-source ID**. Screening timelines use `meta-egg:` plus the configured Meta Egg URL as the server key; their cut IDs are the declared subtitle-version IDs or media-source IDs returned by Meta Egg. Legacy direct Jellyfin timelines retain their original keys, and no automatic migration or cross-cut stretching occurs. For legacy direct playback, the server key is the configured Jellyfin URL with its trailing slash removed, or `demo` when no URL is configured. Changing that URL can create a new timeline identity. A missing media-source ID is stored as an empty string. Notes reference the app-owned timeline UUID; their timestamps are rounded to whole seconds and are never stretched between cuts.

Opening a screening posts `/api/screening/timeline`, re-fetches authoritative cut metadata and creates or reuses its user-owned media row. The existing legacy playback snapshot can also create a media row without a note. Settings reads can create defaults. These GET paths therefore have database side effects; use an isolated database for verification. Library returns the 100 most recently seen media rows for a user, with note counts.

Actual runtime behavior in `repository.ts` is:

- A `manual` override survives incoming playback updates and controls the displayed runtime/clamp.
- Screening resolution receives the chosen cut's runtime from Meta Egg; the screening clock always uses that cut runtime. Legacy resolution uses `NowPlayingItem.RunTimeTicks` from the Jellyfin snapshot. The code does not separately fetch a media-source duration for runtime resolution.
- OMDb is a manual lookup-and-save action. Values saved with source `omdb` can be replaced by the next resolution, including by a missing Jellyfin duration; they are not a persistent automatic fallback.
- Clearing an override restores the last stored Jellyfin duration, or unknown. The UI's **Use automatic** action also clears the edition label.

## Moment annotations

Notes support empty text for immediate color/rating pings and an optional integer `rating` (1–10, `null` when unrated). Every note retains a color; text saves and score-only pings use the configured default. Shared color/rating definitions feed both the inline controls and their reference guide. For stored-color compatibility, `amber`, `rose`, `mint`, `sky`, and `lilac` display as yellow, red, green, blue, and purple; `orange` is new. Existing note rows and preferences keep their IDs and values.

A composer ping captures the current clock, or uses the already held draft timestamp. It submits immediately with any draft text, blocks duplicate pending saves, and catches up after success. Failed requests retain text, color, rating, and timestamp for explicit retry and navigation protection. Saved-note color/rating patches preserve omitted fields; defaults apply only on creation. The API validates rating bounds and the database enforces integer/null values in migration `0001_moment_ratings`. Ownership and cut identity are unchanged.

## Storage and deployment boundaries

SQLite stores Better Auth users/accounts/sessions/verifications, preferences, observed media, edition labels, and notes. WAL, foreign keys, and a five-second busy timeout are enabled. Playback sessions and subtitle caches are in memory and are rebuilt after restart.

The existing project rationale for SQLite is one self-hosted API process with modest concurrent writes and a single persistent volume. PostgreSQL would require a schema/adapter and migration change; there is no supported database switch or multi-replica deployment in this repository.

Compose runs the API and an Nginx web container. Nginx serves the Vite build, proxies `/api`, and disables proxy buffering for SSE. Only the web port is published. The API Dockerfile runs TypeScript source with Bun, rather than the local `dist` bundle. [Operations](operations.md) owns configuration, backup, and recovery procedures.

## API reading map

The route definitions in [`app.ts`](../apps/api/src/app.ts) and payload schemas in [`contracts`](../packages/contracts/src/index.ts) are authoritative. The UI client in [`client.ts`](../apps/web/src/api/client.ts) provides concrete request examples.

| Route group                                           | Purpose                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `/api/screening/*`                                    | Meta Egg film search/detail, cut transcript, sessions and timeline selection |
| `/api/health`, `/api/config`, `/api/auth/*`           | Liveness, mode flags, app account/session handling                           |
| `/api/playback`, `/api/playback/events`               | Snapshot and SSE stream                                                      |
| `/api/playback/sessions`, `/api/playback/subtitles`   | Session list/selection and subtitle cues                                     |
| `/api/settings`, `/api/connections`                   | Preferences and service status                                               |
| `/api/media`, `/api/media/:jellyfinItemId/image`      | Observed library and artwork                                                 |
| `/api/media/:mediaId/notes`, `/api/notes/:noteId`     | List/create and update/delete notes                                          |
| `/api/media/:mediaId/runtime`, `/api/metadata/lookup` | Runtime/edition changes and explicit OMDb lookup                             |

Application errors use `{ "error": { "code", "message", "details"? } }`. Better Auth handles its own route responses. Frontend calls use cookies; the Jellyfin key is not an app API credential.
