# Homelab staging

The `staging` branch runs at
https://film-introspect.staging.rafael.media on the private LAN/Tailscale network.
Push a commit to this branch to deploy it; the staging guest checks roughly
every two minutes, then builds the API and frontend from that exact commit.
`main` is not deployed by this environment.

The screening candidate requires `META_EGG_URL` to point to the private Meta Egg
screening API, `DEMO_MODE=false`, and the application's local single-user profile
or configured accounts. Jellyfin access belongs to Meta Egg's explicitly scoped
integration; Film Introspect needs no direct Jellyfin/Bazarr credentials or media
mounts for this workflow. The old demo-only deployment cannot test this candidate.
SQLite notes/settings persist across successful branch deployments.

The homelab repository owns the reviewed Compose definition, scoped settings,
DNS/TLS, monitoring, and recovery workflow:
https://github.com/rafael-alani/dothomelab/tree/main/hosts/staging

Build failures leave the accepted version running. Each cutover retains the
previous database generation; a candidate that fails health checks is stopped
and the previous version restarted. Cutover includes a short interruption.
A failed revision is held until a new commit or an operator-requested retry.

Dependency changes must update `bun.lock`; the Dockerfiles install with
`--frozen-lockfile`. Changes to app infrastructure, ports, required secrets,
or database engine need a corresponding homelab configuration change. Future
database migrations should remain compatible with the SQLite backup and
rollback contract. See the homelab staging README before downgrading schema.
