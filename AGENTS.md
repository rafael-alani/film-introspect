# Repository guidance

- Use Bun 1.3.14 and the root workspace scripts. Setup, database paths, checks, and test coverage are in [development](docs/development.md).
- For UI behavior, read [USER_DOC.md](USER_DOC.md) and the relevant page under `apps/web/src/pages/`. Shared request/response validation belongs in `packages/contracts/src/index.ts`.
- Before changing playback, session selection, or subtitles, read [architecture](docs/architecture.md) and [integration research](docs/integrations.md). Introspect observes Jellyfin; do not report playback through `/Sessions/Playing*` or send service keys/raw session DTOs to the browser.
- Preserve user ownership checks and timeline identity: user + configured server URL + item + media source. Do not stretch note timestamps across editions. Session pairing has documented [trust limits](docs/architecture.md#authentication-and-trust).
- For deployment, configuration, or recovery, use [operations](docs/operations.md). API startup applies migrations and playback reads may persist media/settings; use an isolated database for experiments.
- Update affected docs in the same change as behavior, configuration, commands, or boundaries: [user workflows](USER_DOC.md), [setup and checks](docs/development.md), [architecture](docs/architecture.md), and [operations](docs/operations.md). Search for affected summaries and old values. Internal refactors with no documented effect need no doc edit. Routine upkeep is part of the task; reserve `document-update` for substantial accumulated drift.
- Record actual checks under [verification](docs/development.md#verification); preserve historical evidence and research dates. Documentation walkthroughs, source inspection, and runtime tests are different evidence.
