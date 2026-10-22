# Development

## Local setup

Use Bun 1.3.14, matching [`package.json`](../package.json) and the Dockerfiles. The [README quick start](../README.md#quick-start) installs dependencies and starts both workspaces. Run commands below from the repository root unless noted. No additional local database service is needed.

The API's `dev`, `start`, and `db:migrate` scripts explicitly load the root `.env` and run with `apps/api` as their working directory. Thus the default `DATABASE_PATH=./data/introspect.db` resolves to `apps/api/data/introspect.db`. This directory is ignored by Git. See [environment settings](operations.md#environment-settings) for the full configuration reference.

Vite binds to all interfaces on port 5173 and proxies `/api` to `http://localhost:3001`. If you change `API_PORT`, update that target in [`vite.config.ts`](../apps/web/vite.config.ts) too. For access from a phone, use the development machine's reachable address and set `WEB_ORIGIN` and `BETTER_AUTH_URL` to that exact browser origin. Restart after environment changes. `META_EGG_URL` must resolve from the machine/container running the API; `.env.example` deliberately supplies no integration hostname.

Keep the same-origin proxy for the standard setup. `VITE_API_URL` is an optional frontend build-time origin override read by [`api/client.ts`](../apps/web/src/api/client.ts); it requires matching API CORS/auth configuration and is not passed as a build argument by the supplied web Dockerfile. Never put integration secrets in a `VITE_` variable.

## Isolated demo

The current Live page requires the Meta Egg screening API. Use the [screening fixture](#screening-mvp-checks) for a browser walkthrough. The legacy demo below only exercises `/api/playback` and `/api/playback/subtitles`.

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

For code changes, run tests, typecheck, and build; check formatting for all changes. The current tests cover Jellyfin session normalization/selection and JSON/VTT subtitle parsing in [`types.test.ts`](../apps/api/src/integrations/jellyfin/types.test.ts) and [`subtitles.test.ts`](../apps/api/src/integrations/jellyfin/subtitles.test.ts). The screening MVP additionally has clock/held-note tests in `tests/screening-clock.test.ts`, discovery/provenance and save-acknowledgement validation in `tests/screening-contract.test.ts`, and an isolated HTTP/SQLite smoke check. The moment tests in `apps/api/src/db/moment-notes.test.ts` validate ping/patch payloads and migrate seeded legacy notes/preferences without loss, checking idempotence, foreign keys, and rating constraints. There are no automated browser or live-integration tests. Passing the unit suite does not establish those behaviors.

To format only documentation, pass the changed file paths to `bunx --no-install prettier --write …` rather than rewriting unrelated files. Local builds write ignored `apps/api/dist` and `apps/web/dist` directories; they do not deploy the app.

## Database changes

The schema is [`apps/api/src/db/schema.ts`](../apps/api/src/db/schema.ts), migrations live in [`apps/api/drizzle/`](../apps/api/drizzle/), and generation is configured by [`drizzle.config.ts`](../apps/api/drizzle.config.ts).

1. Change the schema and run `bun run db:generate`.
2. Review generated SQL and Drizzle metadata together before applying them. The original baseline has no snapshot. Migration `0001_moment_ratings` adds the nullable rating column and a full current-schema snapshot; review generated changes against it, especially for attempts to recreate existing tables. Its additive SQL was authored as a custom migration to preserve existing rows.
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

These are dated checks of specific revisions, not a claim about a deployed release.

### Initial documentation review — 2026-10-13

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

### Documentation maintenance follow-up — 2026-10-13

This follow-up used base revision `cb855f68a6a049456e29f3a7c662e6b26bf073d4`, macOS/Darwin arm64, and Bun 1.3.14 with existing dependencies. It added same-change documentation guidance and the notes API procedure for checking an isolated restore without playback.

- Reviewed the procedure against routes, contracts, ownership queries, and the Library page; walked through its authentication, timeline selection, expected results, and failure handling.
- Executed the two documented JavaScript snippets through in-process Hono requests against fresh in-memory databases, once as Local viewer and once with an app-account session cookie. Both returned the seeded timeline, count, note text, timestamp, and color. Missing authentication returned `401`; another profile's timeline returned `404` in both modes. No server was exposed or upstream contacted.
- Checked 88 local links/anchors across the seven repository Markdown files and all five shell blocks with `bash -n`. Repository formatting and `git diff --check` passed.

These checks cover the snippets and sampled ownership behavior. They did not exercise a browser console, Docker, persistent backup/restore, or live playback, and do not supersede the earlier verification limits. Application source was unchanged; the unit suite, typecheck, and build were not rerun for this documentation-only follow-up.

### Documentation skills review — 2026-10-13

Reviewed all seven Markdown guides and `.env.example` against `main` at `edc67fe05089817a6d7ccd992110dd60f3702111` on macOS/Darwin arm64, Bun 1.3.14, with existing dependencies. Source inspection and documentation walkthroughs covered setup, pairing, notes, subtitles, runtimes, preferences, demo, and recovery. The existing guide structure and agent maintenance rule remained sufficient.

`bun run format:check`, `git diff --check`, 89 local links/anchors, and `bash -n` for five shell blocks passed. Referenced paths and scripts were checked. Capabilities, restore snippets, constraints, and historical evidence were preserved. Application code and configuration values were unchanged; runtime tests, browser journeys, deployment, restore, and upstream compatibility were not rechecked.

## Screening MVP checks

Run `bun run scripts/screening-smoke.ts` to start an ephemeral Meta Egg fixture and an Introspect API with an in-memory database. The default fixture uses the standalone catalog contract. It checks the real HTTP path for search, declared subtitle versions, provenance, transcripts, timeline reuse, cut-isolated notes, captured timestamps, textless color/rating pings, partial edits that preserve other fields, clearing ratings, invalid score rejection, original runtime provenance after clearing an override, and invalid timeline requests. Add `--jellyfin` to exercise the optional media-source contract, or `--discovery` to verify discovered films and transcript terms without an implied license. All variants check empty search results, metadata retained across subtitle statuses, a later successful retry, save acknowledgements through the proxy, and safe provider authentication/quota/storage errors. Add `--slow` to verify a 16-second upstream response can complete beyond the former 15-second proxy deadline. It does not read or mutate the configured application database, and it clears external integration settings for the child API.

For a browser walkthrough, run `bun run scripts/screening-smoke.ts --discovery --serve` (API port 3001), then `bun run --cwd apps/web dev`. Search the clearly labeled **Screening timing fixture**, choose a cut, sync to `0:00`, focus Quick note, wait for the film clock to advance, then save. Confirm the note retains its starting time and the subtitle roll catches up. Saved status in this fixture tests display of a simulated acknowledgement, not durable Meta Egg storage. This uses synthetic test data only; it is not evidence that a real movie or Jellyfin player is synchronized. Also test a textless color ping, a textless score ping, a drafted note saved with either control, and inline recoloring/rating on a saved moment. Confirm failed saves retain the original time and can be retried; check 320px/390px widths and keyboard access. Stop both processes afterward. Localhost server binding may require the execution environment's network approval.

Staging acceptance must separately exercise a real Meta Egg catalog item, matching cut, available text transcript and stored note. The real standalone acceptance path uses Meta Egg's licensed Sintel pilot and its separately opened reference film. Anchor on one spoken line, compare at least two later dialogue checkpoints, begin a note while the video continues, save, and confirm both the captured note time and catch-up line. Do not treat a synthetic cue fixture as this evidence. Automatic following is optional and separately requires an active permitted Jellyfin session identifying that exact media source. For online discovery acceptance, search **At eternity's gate**, select the real film, and check metadata remains visible when the subtitle provider cannot supply a release. Verify same-query retries issue another request, editing the query clears the old selection, and **Open screening** stays unavailable without an available text track. Automatic lookup does not guarantee a matching cut or waive provider authentication/quota requirements. The later moment-annotation change adds migration `0001_moment_ratings`; see the database checks above.

### Screening browser fixture — 2026-10-21

A desktop browser walkthrough against the isolated synthetic fixture exercised film search, explicit cut selection, clock anchoring, focus-to-hold, continued live clock advancement, note save and subtitle catch-up. The saved timestamp uses the same whole second shown in the composer; the held cue still uses its precise fractional position. This is browser behavior evidence with test data, not a real film synchronization or Jellyfin integration check.
