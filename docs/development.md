# Development

## Local setup

Use Bun 1.3.14, matching [`package.json`](../package.json) and the Dockerfiles. The [README quick start](../README.md#quick-start) installs dependencies and starts both workspaces. Run commands below from the repository root unless noted. No additional local database service is needed.

The API's `dev`, `start`, and `db:migrate` scripts explicitly load the root `.env` and run with `apps/api` as their working directory. Thus the default `DATABASE_PATH=./data/introspect.db` resolves to `apps/api/data/introspect.db`. This directory is ignored by Git. See [environment settings](operations.md#environment-settings) for the full configuration reference.

Vite binds to all interfaces on port 5173 and proxies `/api` to `http://localhost:3001`. If you change `API_PORT`, update that target in [`vite.config.ts`](../apps/web/vite.config.ts) too. For access from a phone, use the development machine's reachable address and set `WEB_ORIGIN` and `BETTER_AUTH_URL` to that exact browser origin. Restart after environment changes. The placeholder hostname `jellyfin` in `.env.example` must resolve from the machine/container running the API.

Keep the same-origin proxy for the standard setup. `VITE_API_URL` is an optional frontend build-time origin override read by [`api/client.ts`](../apps/web/src/api/client.ts); it requires matching API CORS/auth configuration and is not passed as a build argument by the supplied web Dockerfile. Never put integration secrets in a `VITE_` variable.

## Isolated demo

To run the API with a disposable in-memory database and no configured upstream services, use this in one terminal from the root:

```bash
DATABASE_PATH=:memory: DEMO_MODE=true APP_AUTH_ENABLED=false ALLOW_SIGN_UP=false \
  JELLYFIN_URL= JELLYFIN_API_KEY= JELLYFIN_USER_ID= \
  BAZARR_URL= BAZARR_API_KEY= OMDB_API_KEY= \
  bun run --cwd apps/api start
```

In another terminal, run `bun run --cwd apps/web dev` and open [localhost:5173](http://localhost:5173). Stop any existing process on ports 3001/5173 first. The API still loads any remaining `.env` settings, including its port and origins; the command assumes local defaults. Notes disappear when the API exits. This mode does not validate Jellyfin, accounts, or persistence.

## Commands and change checks

| Command                | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `bun dev`              | Run API with watch mode and Vite together                 |
| `bun test`             | Existing Bun unit suite                                   |
| `bun run typecheck`    | Strict TypeScript checks across all workspaces            |
| `bun run build`        | API bundle, web typecheck/Vite build, contracts typecheck |
| `bun run db:generate`  | Generate Drizzle migration artifacts from the schema      |
| `bun run db:migrate`   | Apply migrations to the configured database               |
| `bun run format:check` | Check repository formatting with Prettier                 |
| `bun run format`       | Rewrite repository formatting; use deliberately           |

For code changes, run tests, typecheck, and build; check formatting for all changes. The current tests cover Jellyfin session normalization/selection and JSON/VTT subtitle parsing in [`types.test.ts`](../apps/api/src/integrations/jellyfin/types.test.ts) and [`subtitles.test.ts`](../apps/api/src/integrations/jellyfin/subtitles.test.ts). There are no existing browser, authentication, persistence, or live-integration tests. Passing the unit suite does not establish those behaviors.

To format only documentation, pass the changed file paths to `bunx --no-install prettier --write …` rather than rewriting unrelated files. Local builds write ignored `apps/api/dist` and `apps/web/dist` directories; they do not deploy the app.

## Database changes

The schema is [`apps/api/src/db/schema.ts`](../apps/api/src/db/schema.ts), migrations live in [`apps/api/drizzle/`](../apps/api/drizzle/), and generation is configured by [`drizzle.config.ts`](../apps/api/drizzle.config.ts).

1. Change the schema and run `bun run db:generate`.
2. Review generated SQL and Drizzle metadata together before applying them. The checked-in baseline contains initial SQL and a journal but no schema snapshot; check especially for attempts to recreate existing tables.
3. Exercise migrations on a disposable database, then an isolated copy of an existing database when testing an upgrade. `DATABASE_PATH=:memory: bun run db:migrate` checks a fresh schema only.
4. Include the reviewed migration artifacts with the schema change. Back up a persistent database before applying migrations; API startup applies them too.

The generation script does not explicitly load the root `.env` the way migration/start scripts do. Pass required environment values explicitly when invoking Drizzle tooling. There is no down-migration script; recovery uses a matching application revision and database backup as described in [operations](operations.md#backup-and-recovery).

## Debugging map

- Blank Live or session selection issues: `services/playback.ts`, `integrations/jellyfin/sync.ts`, then `types.ts` in the [code map](architecture.md#code-map).
- Unexpected subtitle content: `getStreams`/`chooseSubtitleStream` in the playback service, subtitle parsers, and the in-process cache.
- Notes on the wrong cut or missing after a URL change: inspect [timeline identity](architecture.md#timeline-and-runtime-rules) before changing stored data.
- HTTP/contract errors: inspect the browser network response, `api/client.ts`, shared contracts, and API logs. Production hides unhandled exception details from HTTP responses.
- Proxy, service, authentication, and persistent-storage failures: use [operational diagnostics](operations.md#diagnostics).

## Verification

Documentation review on **2026-10-13** inspected branch `main`, base revision `11d22da0b943b173bfb13a71c52f804000cfdb58` (before these documentation edits), on macOS/Darwin arm64 with Bun 1.3.14 and existing installed dependencies.

| Method                                            | Result and scope                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Source inspection                                 | Entrypoints, all three UI pages, auth, contracts, integrations, repository/schema, scripts, Dockerfiles, and proxy configuration reviewed |
| `bun test`                                        | 10 tests passed, 16 assertions across two files                                                                                           |
| `bun run typecheck`                               | All three workspaces passed                                                                                                               |
| `bun run build`                                   | API and web builds plus contracts check passed                                                                                            |
| `DATABASE_PATH=:memory: bun run db:migrate`       | Fresh in-memory migration passed; no persistent database changed                                                                          |
| `bun run format:check`                            | Passed after documentation formatting                                                                                                     |
| Local Markdown links/anchors and referenced paths | 83 local links/anchors across seven Markdown files passed; referenced source paths checked                                                |

All five documented shell blocks passed `bash -n` syntax checks. Script names and configuration references were checked against the repository; this does not mean the deployment commands were executed.

No dependency reinstall, browser journey, real Jellyfin/Bazarr/OMDb connection, account-isolation exercise, Docker build, deployment, persistent upgrade, or backup/restore rehearsal was performed. The Docker CLI is present, but `docker compose version` reports that the Compose subcommand is unavailable. Deployment and recovery instructions are based on repository configuration and require validation in the target environment. The historical research date in [integrations.md](integrations.md) is preserved; upstream compatibility was not rechecked here.
