# Introspect

Introspect is a mobile-first second-screen journal for movies and shows. It follows a Jellyfin playback session, mirrors play/pause/seek state, displays nearby subtitle lines, and saves notes at the current playhead.

This Bun workspace contains a React/Vite web app, a Hono API, shared Zod contracts, and SQLite storage. See the [user guide](USER_DOC.md#capability-index) for supported capabilities, workflows, and restrictions.

## Quick start

Use Bun **1.3.14**, the version declared in [package.json](package.json). From the repository root, on a fresh checkout:

```bash
cp .env.example .env
bun install --frozen-lockfile
```

Edit `.env` before starting. Set `JELLYFIN_URL` to an address reachable from the API and supply `JELLYFIN_API_KEY`. Set `JELLYFIN_USER_ID` to scope normal session selection. To preview without Jellyfin, use `DEMO_MODE=true` and leave `JELLYFIN_USER_ID` empty. Reuse an existing `.env` instead of overwriting it.

```bash
bun dev
```

Open [localhost:5173](http://localhost:5173). For real playback, start a title in Jellyfin and choose the device in **Settings → Session to follow**. The API listens on port 3001; Vite proxies `/api` to it. API startup applies migrations automatically.

`APP_AUTH_ENABLED=false` is the default: everyone who can reach the app shares the **Local viewer** profile and its notes. Enable accounts for separate collections; Introspect credentials are separate from Jellyfin credentials. See [authentication and access](docs/operations.md#authentication-and-access) before exposing the app beyond a trusted network.

## Documentation

| Guide                                        | Start here to…                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| [User guide](USER_DOC.md)                    | Follow playback, write notes, manage editions, and use settings               |
| [Development](docs/development.md)           | Configure local development, run checks, and inspect verification limits      |
| [Architecture](docs/architecture.md)         | Find components, data ownership, and integration boundaries                   |
| [Operations](docs/operations.md)             | Configure services, deploy Compose, diagnose problems, and back up or restore |
| [Integration research](docs/integrations.md) | Read the historical protocol rationale and primary sources                    |
| [Agent guidance](AGENTS.md)                  | Find task-specific reading and essential repository constraints               |

The guides describe the `main` implementation, not a verified deployed release. [Verification](docs/development.md#verification) records the inspected revision and checks actually run.
