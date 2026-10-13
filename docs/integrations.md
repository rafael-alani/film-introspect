# Jellyfin, Bazarr, and runtime research

Research was validated on 2026-07-11 against Jellyfin Server 10.11.11 and Bazarr 1.6.0. This historical research date has not been refreshed. The implementation accepts PascalCase and camelCase DTO profiles and reads a narrow set of fields to tolerate additive changes; this does not establish compatibility with an untested server version. See [current implementation](architecture.md) and [verification limits](development.md#verification).

## Jellyfin

### Authentication

REST and the backend WebSocket use:

```http
Authorization: MediaBrowser Client="Introspect", Device="Introspect server", DeviceId="film-introspect-backend", Version="0.1.0", Token="..."
```

This avoids legacy `X-Emby-*` headers and query-string keys. A Jellyfin API key can inspect all sessions, so session DTOs are filtered and normalized before reaching a browser. Without a configured or saved Jellyfin user, the ordinary workflow requires explicit pairing before live playback details are exposed. The user/device mapping is saved to the current app profile, including Local viewer when app authentication is disabled. The current settings API has [trust limitations](architecture.md#authentication-and-trust); pairing is not proof of Jellyfin account ownership.

Primary sources:

- [Jellyfin 10.11.11 release](https://github.com/jellyfin/jellyfin/releases/tag/v10.11.11)
- [Versioned 10.11.11 OpenAPI](https://repo.jellyfin.org/files/openapi/stable/jellyfin-openapi-10.11.11.json)
- [Authorization parser](https://github.com/jellyfin/jellyfin/blob/v10.11.11/Jellyfin.Server.Implementations/Security/AuthorizationContext.cs)
- [Authentication handler](https://github.com/jellyfin/jellyfin/blob/v10.11.11/Jellyfin.Api/Auth/CustomAuthenticationHandler.cs)

### Sessions and clock

`GET /Sessions` is used without a short `activeWithinSeconds` filter because a legitimately paused client may remain quiet. `IsActive` is a client-session property, not a playing flag; playback exists when `NowPlayingItem` is non-null.

The WebSocket listener is event-driven and returns the complete sessions list. Pause, seek, start, and stop normally force a snapshot; automated progress respects the requested one-second interval. It still needs an initial REST read after subscribing.

One Jellyfin tick is 100 ns, so one second is 10,000,000 ticks. Receipt time is the practical local anchor because `PositionTicks` has no exact observation timestamp. The UI clamps interpolation at `RunTimeTicks` and re-anchors on every server snapshot.

Primary sources:

- [`GET /Sessions` controller](https://github.com/jellyfin/jellyfin/blob/v10.11.11/Jellyfin.Api/Controllers/SessionController.cs)
- [Session WebSocket listener](https://github.com/jellyfin/jellyfin/blob/v10.11.11/Jellyfin.Api/WebSocketListeners/SessionInfoWebSocketListener.cs)
- [Periodic listener timing](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Controller/Net/BasePeriodicWebSocketListener.cs)
- [Automatic session progress](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Controller/Session/SessionInfo.cs)
- [WebSocket keepalive](https://github.com/jellyfin/jellyfin/blob/v10.11.11/Emby.Server.Implementations/Session/SessionWebSocketListener.cs)

The companion app does **not** call `POST /Sessions/Playing`, `/Progress`, or `/Stopped`. Those are reporting writes made by the real player and could corrupt observed state.

### Subtitle delivery

`NowPlayingItem.MediaStreams` reflects the selected media source. Stream `Index` is the global media-stream index, not its ordinal among subtitles. Text tracks are selected in this order:

1. currently selected text stream;
2. preferred language;
3. external stream;
4. default stream.

JSON is preferred because it exposes typed tick fields without parsing display syntax. WebVTT remains a compatibility fallback. Embedded text may invoke FFmpeg extraction on first access and is therefore cached. Image subtitle formats are not OCR'd by Jellyfin.

Primary sources:

- [Subtitle routes](https://github.com/jellyfin/jellyfin/blob/v10.11.11/Jellyfin.Api/Controllers/SubtitleController.cs)
- [JSON subtitle writer](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.MediaEncoding/Subtitles/JsonWriter.cs)
- [Media stream model](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Model/Entities/MediaStream.cs)
- [Image routes](https://github.com/jellyfin/jellyfin/blob/v10.11.11/Jellyfin.Api/Controllers/ImageController.cs)

## Bazarr

Bazarr authenticates with `X-API-KEY`. The useful health endpoint is `GET /api/system/status`; its movie/episode records are keyed by Radarr/Sonarr IDs, not Jellyfin item IDs. It still requires Sonarr/Radarr even when its Jellyfin refresh integration is enabled.

Bazarr 1.6.0 has `GET /api/subtitles/contents?subtitlePath=...`, but it directly opens a caller-supplied server path and only parses external UTF-8 SRT files. Embedded streams have no path; ASS/VTT and bitmap formats are unsupported. Introspect therefore does not expose this endpoint to a mobile client. Jellyfin already knows the selected media source and offers a safer, format-normalized subtitle route.

Primary sources:

- [Bazarr 1.6.0](https://github.com/morpheus65535/bazarr/releases/tag/v1.6.0)
- [API-key authentication](https://github.com/morpheus65535/bazarr/blob/v1.6.0/bazarr/api/utils.py#L19-L33)
- [System status endpoint](https://github.com/morpheus65535/bazarr/blob/v1.6.0/bazarr/api/system/status.py)
- [Movie API](https://github.com/morpheus65535/bazarr/blob/v1.6.0/bazarr/api/movies/movies.py#L19-L113)
- [Episode API](https://github.com/morpheus65535/bazarr/blob/v1.6.0/bazarr/api/episodes/episodes.py#L13-L88)
- [SRT contents handler](https://github.com/morpheus65535/bazarr/blob/v1.6.0/bazarr/api/subtitles/subtitles_contents.py)
- [Official Jellyfin integration guide](https://wiki.bazarr.media/Additional-Configuration/Jellyfin/)

Provider search and download calls run background jobs, consume provider quotas, return no job ID, and initially respond `204` even when no subtitle has yet been saved. They should be an explicit, deduplicated user action—not an automatic playback-tick action.

## Runtime and alternate editions

The intended runtime authority in the original research was:

1. selected Jellyfin media source/item `RunTimeTicks`;
2. explicit per-source user override;
3. optional external title runtime only when local runtime is missing.

The current code differs: a manual override takes precedence, and OMDb is an explicit lookup/save operation whose result is not preserved across playback resolution. The implementation reads runtime from the session's `NowPlayingItem`; it does not separately resolve file duration from media-source metadata. [Timeline and runtime rules](architecture.md#timeline-and-runtime-rules) are authoritative for implemented behavior, and the [user guide](../USER_DOC.md#manage-runtimes-and-editions) describes the available controls.

OMDb's `Runtime` is a rounded title-level string such as `"136 min"`. It is not edition-specific, and OMDb is independent of IMDb. IMDb's downloadable non-commercial TSV similarly describes a title's primary runtime, while IMDb's supported online GraphQL product is licensed through AWS Data Exchange. Neither solves cut detection.

Primary sources:

- [OMDb API](https://www.omdbapi.com/)
- [OMDb terms](https://www.omdbapi.com/legal.htm)
- [IMDb non-commercial datasets](https://developer.imdb.com/non-commercial-datasets/)
- [IMDb API access requirements](https://developer.imdb.com/documentation/api-documentation/getting-access/)

Notes are consequently keyed by user + Jellyfin server + item + `MediaSourceId`. A manual edition label makes the distinction visible. Timestamps are never stretched between cuts; scene insertions and deletions make that transformation nonlinear.
