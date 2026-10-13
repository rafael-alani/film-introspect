# Operations

This guide covers the supplied single-API SQLite deployment. Commands assume the repository root and Docker with the Compose plugin unless stated otherwise. Deployment and restore procedures have not been executed in this documentation pass; see [verification](development.md#verification).

## Environment settings

Copy [`.env.example`](../.env.example) to `.env` on first setup and edit it. Do not overwrite an existing configuration. API validation lives in [`env.ts`](../apps/api/src/env.ts); Compose maps the variables in [`compose.yaml`](../compose.yaml). Restart a local API or recreate its Compose container after changing settings.

| Variable                           | Default / meaning                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                         | `development` locally; Compose forces `production`                                                                                           |
| `API_PORT`                         | `3001`; Compose fixes the internal port to 3001                                                                                              |
| `DATABASE_PATH`                    | `./data/introspect.db` relative to API working directory; Compose fixes it to `/data/introspect.db`                                          |
| `WEB_ORIGIN`                       | `http://localhost:5173` locally; exact allowed browser origin; Compose uses `PUBLIC_URL`                                                     |
| `BETTER_AUTH_URL`                  | `http://localhost:5173` locally; public app URL used by auth; Compose uses `PUBLIC_URL`                                                      |
| `BETTER_AUTH_SECRET`               | At least 32 characters; a development default exists, but production requires an explicit non-default value, even when app login is disabled |
| `APP_AUTH_ENABLED`                 | `false`; uses shared Local viewer when disabled                                                                                              |
| `ALLOW_SIGN_UP`                    | Defaults to true outside production, false in production; `.env.example` explicitly sets true                                                |
| `JELLYFIN_URL`, `JELLYFIN_API_KEY` | Both required for real playback; blanks mean unconfigured                                                                                    |
| `JELLYFIN_USER_ID`                 | Optional user scope for ordinary session selection; see [trust limits](architecture.md#authentication-and-trust)                             |
| `JELLYFIN_POLL_INTERVAL_MS`        | `10000`; accepted range 2000–60000                                                                                                           |
| `BAZARR_URL`, `BAZARR_API_KEY`     | Optional pair for status checks; URL may include `/api`                                                                                      |
| `OMDB_API_KEY`                     | Optional key for explicit runtime lookup                                                                                                     |
| `DEMO_MODE`                        | `false`; simulates playback/subtitles when enabled; note/settings writes still persist                                                       |
| `PUBLIC_URL`                       | Compose only: defaults to `http://localhost:8080`; sets API origin/auth URL                                                                  |
| `WEB_PORT`                         | Compose only: host port `8080` by default                                                                                                    |

Boolean true values accepted by the API are `1`, `true`, `yes`, and `on` (case insensitive); other strings are false. Prefer explicit `true`/`false` in `.env`. The optional frontend `VITE_API_URL` setting is covered in [development](development.md#local-setup).

Jellyfin's URL must be reachable from the API runtime. `localhost` inside its container refers to that container; the supplied Compose file does not create Jellyfin or Bazarr services. Use a reachable server address or connect the containers to your existing network. Create a Jellyfin dashboard API key and keep it in the backend environment.

Configure Bazarr's Jellyfin integration and metadata refresh in Bazarr itself. Introspect only checks Bazarr's status and receives subtitles through Jellyfin; it does not replace Bazarr's Sonarr/Radarr setup. [Integration research](integrations.md#bazarr) explains this boundary.

## Authentication and access

Prototype mode gives every caller access to the same Local viewer notes/settings. Enable `APP_AUTH_ENABLED=true` for separate Introspect collections. Switching modes neither migrates nor deletes existing local-profile notes; switching authentication off exposes that shared profile again.

For account setup:

1. Generate a secret, for example with `openssl rand -base64 32`, and store it as `BETTER_AUTH_SECRET`.
2. Set `APP_AUTH_ENABLED=true` and temporarily set `ALLOW_SIGN_UP=true`.
3. Start/recreate the API, create the required accounts through the app, then set `ALLOW_SIGN_UP=false`.
4. Apply the environment change with `docker compose up -d api` (or restart the local API). A plain `docker compose restart` does not reload Compose environment values.

Keep registration closed when it is not needed, including in prototype mode: auth endpoints remain mounted separately from the application login gate. The app has no configured password-reset mail flow or admin account-management UI.

Use HTTPS and restrict access to trusted users. Jellyfin and Bazarr keys remain server-side, but app authentication does not prove ownership of a Jellyfin account. The current direct settings API can override playback pairing preferences; `JELLYFIN_USER_ID` is not a hard multi-tenant authorization boundary. See [authentication and trust](architecture.md#authentication-and-trust) before relying on it for separate untrusted users.

## Compose deployment and updates

Set a unique production auth secret, reachable integration URLs/keys, the intended auth mode, and `DEMO_MODE=false` for real playback. If changing the host port or adding a reverse proxy, set `PUBLIC_URL` to the actual browser URL as well as `WEB_PORT` to the desired local port.

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api web
curl --fail http://localhost:8080/api/health
```

Use your configured port for the health request. A successful response has `ok: true`; it proves API liveness, not upstream availability. Open the app and use **Settings → Check services**, then follow [the user playback workflow](../USER_DOC.md#follow-playback).

Compose publishes only the web container's HTTP port. For a reverse proxy, terminate TLS there and forward requests to the web container; allow long-lived SSE responses without buffering or caching. The included [Nginx config](../apps/web/nginx.conf) already disables buffering/cache on `/api/` and uses a one-hour read timeout. Keep the API and upstream service access on your private network.

The `introspect_data` named volume holds `/data`. Its actual Docker name is project-prefixed, so preserve the Compose project identity when restarting/updating. A new checkout directory or different `-p` value can select a fresh empty volume. `docker compose down` retains named volumes; `docker compose down -v` deletes them and the journal.

Before an update, record the application revision (`git rev-parse HEAD`), back up the data/configuration, then rebuild with `docker compose up -d --build`. Startup applies migrations automatically. The Dockerfiles currently install dependencies without copying `bun.lock`; rebuilding a revision can resolve different versions of dependencies declared as `latest`. Retain known-working images alongside a backup when reproducible rollback matters.

## Diagnostics

| Symptom                                   | Check and recovery                                                                                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API fails at startup                      | Read API logs for environment validation, secret length, migrations, or data-directory permissions. Confirm the configured database path.                                                       |
| Web returns 502 or app cannot load config | Check API startup and Nginx connectivity to `api:3001`; Compose startup ordering is not a readiness probe. Locally, verify the Vite proxy target.                                               |
| Sign-in or sign-up fails                  | Confirm the exact public origin/auth URL, HTTPS/cookies, and registration setting. Reload after changing auth mode; the browser caches app config.                                              |
| Jellyfin says Not set or Unavailable      | Check both URL/key, API-to-Jellyfin network reachability, and the status message/logs. Recreate the API after environment changes.                                                              |
| No sessions or Live stays idle            | Start playback on the selected device, refresh the session list, and verify user/device pairing and `JELLYFIN_USER_ID`. An idle pinned device will not fall back to another device.             |
| Playback lags or shows polling            | Inspect `/api/playback/events` in the browser and proxy buffering/timeouts. The browser-to-API SSE link is separate from the API-to-Jellyfin WebSocket; REST polling can mask a socket failure. |
| Subtitle roll is empty                    | Confirm Jellyfin exposes a text stream for the selected source. Refresh Jellyfin metadata after adding a sidecar; allow time for embedded-text extraction.                                      |
| Replaced subtitles still show old text    | The server cache lasts six hours per item/source/stream. Reloading the browser alone does not clear it. Restart the API to clear the cache if necessary, then reload Live.                      |
| OMDb badge is Connected but lookup fails  | The badge checks only key presence. Perform a lookup to check validity/reachability and inspect its error.                                                                                      |
| Library/notes seem lost                   | Check auth mode/account, database volume/path, configured Jellyfin URL, and media source before changing data. Library exposes only the latest 100 observed timelines.                          |

API request logging goes to stdout; unhandled errors go to stderr. Review logs before sharing them because upstream error bodies can contain service details. More detail on stale snapshots, runtime overrides, and scope is in [architecture](architecture.md).

## Backup and recovery

There is no built-in backup, export, scheduled backup, or restore UI. Preserve the full SQLite data directory (including any `-wal` and `-shm` files), application revision, and environment configuration. Protect backups because they contain notes, account/session data, and potentially service secrets. Back up Jellyfin/Bazarr media and configuration through their own procedures.

### Offline backup

This procedure briefly interrupts the API and copies the whole stopped database directory. It avoids copying only the main database file while WAL writes may still be active. Keep all other writers stopped too.

```bash
umask 077
backup_dir="../introspect-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir/data"
git rev-parse HEAD > "$backup_dir/revision.txt"
cp .env "$backup_dir/app.env"
docker compose stop api
docker compose cp api:/data/. "$backup_dir/data/"
docker compose start api
```

Run each step only after the previous one succeeds. If copying fails, keep the failed backup separate, restart the original API, resolve the storage problem, and retry. Verify that the backup contains `introspect.db`, retain any accompanying SQLite files, and store a protected copy away from the deployment host. The environment copy assumes Compose uses the root `.env`; also preserve settings supplied through other mechanisms.

For a local Bun deployment, stop its API and copy the directory containing the resolved `DATABASE_PATH`, plus the environment and revision. The default is `apps/api/data/`. Restart only after the copy completes.

### Restore and validate

Rehearse into a separate deployment before replacing working data. The following sequence assumes a **new Compose project with an empty volume** and the matching application revision; it must not target the running production project.

1. Prepare a separate checkout at the revision recorded in the backup. Prepare a protected restore environment file with a different `WEB_PORT` and matching `PUBLIC_URL`, the intended auth mode, and the saved secret. Keep test access private and disable optional external integrations if they are not needed for the check.
2. Set `restore_env` and `backup_dir` to the actual absolute paths, then create stopped containers with `docker compose --env-file "$restore_env" -p introspect-restore create --build`.
3. Copy the entire saved directory into the fresh volume with `docker compose --env-file "$restore_env" -p introspect-restore cp "$backup_dir/data/." api:/data/`. Do not merge a backup with a previously used database/WAL set.
4. Start it with `docker compose --env-file "$restore_env" -p introspect-restore up -d`. Check logs, API health, sign-in (if enabled), preferences, timeline counts, and known notes. Revisit a known title/source through Live if validating the UI; use the notes API when playback is unavailable.
5. Record the result before considering the backup verified. For production recovery, stop access/writers, preserve the current data separately, and restore into an empty replacement volume using the same sequence and matching application revision. Recheck the public URL, credentials, and data before reopening access.

Starting a newer revision may migrate the restored database. Preserve an untouched backup first. There is no supported down-migration command; rolling back code alone does not undo schema or data changes. A successful health request alone is not evidence that notes, authentication, or a recovery succeeded.
