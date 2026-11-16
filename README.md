# Introspect

Introspect is a film notebook built around your library. Open a movie to read its notes in film-time order, see its duration, or export the notes as Markdown for Obsidian. Versions of the same movie share a card while retaining their original timestamps and settings.

Use **Live** to capture notes while watching. Search Meta Egg, choose the matching cut and transcript, then anchor the subtitle clock to the film on any screen. Jellyfin following is optional. Beginning a note holds the dialogue and timestamp while the film keeps moving; saving returns to live subtitles. One-tap color and 1–10 rating pings capture individual moments, with optional text.

This Bun workspace contains a React/Vite web app, a Hono API, shared Zod contracts, and SQLite storage. See the [user guide](USER_DOC.md#capability-index) for supported capabilities, workflows, and restrictions.

## Quick start

Use Bun **1.3.14**, the version declared in [package.json](package.json). From the repository root, on a fresh checkout:

```bash
cp .env.example .env
bun install --frozen-lockfile
```

Edit `.env` before starting. Set `META_EGG_URL` to your private Meta Egg API. Meta Egg searches configured online metadata sources as well as its standalone catalog, which includes the licensed **Sintel** pilot. Selecting a film asks Meta Egg for subtitle versions; online subtitle discovery needs a configured provider on Meta Egg. If none can be supplied, the film's metadata remains visible with the reason. No Jellyfin credential is needed for this workflow. The Live workflow needs Meta Egg's `/v1/screening` API. Direct Jellyfin, Bazarr and OMDb settings are optional legacy integrations; they are not required for screening notes. Reuse an existing `.env` instead of overwriting it.

```bash
bun dev
```

Open [localhost:5173](http://localhost:5173) to see **Library**. To add notes, open **Live**, search for a film, choose its cut, then select **Open screening** and **Sync with the screen**. The API listens on port 3001; Vite proxies `/api` to it. API startup applies migrations automatically.

`APP_AUTH_ENABLED=false` is the default: everyone who can reach the app shares the **Local viewer** profile and its notes. Enable accounts for separate collections; Introspect credentials are separate from Jellyfin credentials. See [authentication and access](docs/operations.md#authentication-and-access) before exposing the app beyond a trusted network.

## Documentation

| Guide                                        | Start here to…                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| [User guide](USER_DOC.md)                    | Follow playback, write notes, manage editions, and use settings               |
| [Development](docs/development.md)           | Configure local development, run checks, and inspect verification limits      |
| [Architecture](docs/architecture.md)         | Find components, data ownership, and integration boundaries                   |
| [Operations](docs/operations.md)             | Configure services, deploy Compose, diagnose problems, and back up or restore |
| [Private staging](docs/staging.md)           | Review a candidate before promotion to main                                   |
| [Integration research](docs/integrations.md) | Read the historical protocol rationale and primary sources                    |
| [Agent guidance](AGENTS.md)                  | Find task-specific reading and essential repository constraints               |

The guides describe this candidate implementation. Staging deployment and real-screen synchronization require separate verification. [Verification](docs/development.md#verification) records the inspected revision and checks actually run.
