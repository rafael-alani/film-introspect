# Repository guidance

- Use Bun 1.3.14 and the root workspace scripts. Setup, database paths, checks, and test coverage are in [development](docs/development.md).
- For UI behavior, read [USER_DOC.md](USER_DOC.md) and the relevant page under `apps/web/src/pages/`. Shared request/response validation belongs in `packages/contracts/src/index.ts`.
- Before changing playback, session selection, or subtitles, read [architecture](docs/architecture.md) and [integration research](docs/integrations.md). Introspect observes Jellyfin; do not report playback through `/Sessions/Playing*` or send service keys/raw session DTOs to the browser.
- Preserve user ownership checks and timeline identity: user + configured server URL + item + media source. Do not stretch note timestamps across editions. Session pairing has documented [trust limits](docs/architecture.md#authentication-and-trust).
- For deployment, configuration, or recovery, use [operations](docs/operations.md). API startup applies migrations and playback reads may persist media/settings; use an isolated database for experiments.
- Keep workflow facts in the user guide, code boundaries in architecture, and operational procedures in operations. Record dated checks under [verification](docs/development.md#verification); preserve the historical research date.
