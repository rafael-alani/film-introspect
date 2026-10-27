import { strict as assert } from "node:assert";
import { resolve } from "node:path";

const provider = process.argv.includes("--jellyfin")
  ? "jellyfin"
  : process.argv.includes("--discovery")
    ? "discovery"
    : "catalog";
const precision = provider === "jellyfin" ? "media_source" : "subtitle_version";
const episode = process.argv.includes("--episode");
if (episode) assert.equal(provider, "jellyfin", "Episodes require --jellyfin");
const savedAt = "2026-10-22T12:34:56.000Z";
const provenance = {
  sourceUrl: "https://example.invalid/fixture",
  ...(provider === "discovery"
    ? { termsUrl: "https://example.invalid/terms" }
    : { licenseUrl: "https://example.invalid/license" }),
  attribution: "Synthetic contract fixture, not a real film.",
};

// Isolated contract fixture for API checks and a browser walkthrough; never a production fallback.
const movie = {
  provider,
  ...(episode
    ? {
        kind: "episode",
        contextTitle: "Example series",
        seasonNumber: 3,
        episodeNumber: 2,
      }
    : {}),
  provenance,
  id: "fixture-film",
  title: "Screening timing fixture",
  year: 2026,
  overview:
    "A deterministic test transcript for note timing. This is test data, not a film.",
  runtimeSeconds: 600,
};
const cuts = ["theatrical", "extended"].map((id) => ({
  id,
  label: id === "theatrical" ? "Theatrical test cut" : "Extended test cut",
  runtimeSeconds: 600,
  precision,
  editionId: id,
  referenceVideoUrl: null,
  matchingNotes:
    "Synthetic test subtitles. Real screenings require a matching transcript.",
  subtitles: [
    {
      id: "0",
      index: 0,
      label: "English text",
      language: "eng",
      codec: "srt",
      available: true,
    },
  ],
}));
let corruptTranscript = false;
let unavailable = false;
let transcriptState = "ready";
let sourceError: string | null = null;
let subtitleMode: "text" | "image" | "none" = "text";
const startedAt = Date.now();
const fixture = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  idleTimeout: 70,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/connection"))
      return Response.json({
        data: { serverName: "Fixture cinema", userId: "fixture-viewer" },
      });
    if (url.pathname.endsWith("/status"))
      return Response.json({ data: { openSubtitlesConfigured: false } });
    if (sourceError)
      return Response.json(
        { code: sourceError, detail: "Untrusted upstream error detail" },
        { status: 502 },
      );
    if (unavailable) return new Response(null, { status: 503 });
    if (url.pathname.endsWith("/sessions"))
      return Response.json({
        data:
          provider === "jellyfin" &&
          (!url.searchParams.has("itemId") ||
            url.searchParams.get("itemId") === movie.id)
            ? [
                {
                  id: "fixture-tv",
                  itemId: movie.id,
                  cutId: "theatrical",
                  title: movie.title,
                  runtimeSeconds: 600,
                  deviceName: "Fixture TV",
                  state: "playing",
                  positionSeconds: Math.min(
                    599,
                    120 + (Date.now() - startedAt) / 1000,
                  ),
                  observedAt: new Date().toISOString(),
                },
              ]
            : [],
      });
    if (url.pathname.endsWith("/subtitles/0") && subtitleMode !== "text")
      return Response.json({ code: "transcript_unavailable" }, { status: 422 });
    if (url.pathname.endsWith("/subtitles/0"))
      return Response.json({
        data: {
          itemId: movie.id,
          cutId: corruptTranscript ? "other-cut" : url.pathname.split("/")[6],
          trackId: "0",
          language: "eng",
          source: provider,
          precision,
          provenance,
          savedAt,
          cues: Array.from({ length: 120 }, (_, i) => ({
            id: String(i),
            startSeconds: i * 5,
            endSeconds: i * 5 + 4,
            text: `Subtitle ${i + 1}. The screening continues.`,
          })),
        },
      });
    if (url.pathname.endsWith(`/movies/${movie.id}`))
      return Response.json({
        data: {
          ...movie,
          savedAt,
          cuts:
            transcriptState === "ready"
              ? cuts.map((cut) => ({
                  ...cut,
                  subtitles:
                    subtitleMode === "none"
                      ? []
                      : cut.subtitles.map((track) =>
                          subtitleMode === "image"
                            ? {
                                ...track,
                                label: "English - PGSSUB",
                                codec: "PGSSUB",
                                available: false,
                              }
                            : track,
                        ),
                }))
              : [],
          transcriptStatus: {
            state: transcriptState,
            message: `Fixture subtitle status: ${transcriptState}.`,
          },
        },
      });
    if (url.pathname.endsWith("/movies")) {
      if (url.searchParams.get("query") === "slow-fixture")
        await Bun.sleep(16_000);
      if (!url.searchParams.get("query")?.trim())
        return new Response(null, { status: 400 });
      if (url.searchParams.get("query") === "missing-fixture")
        return Response.json({ data: [] });
      return Response.json({ data: [movie] });
    }
    return new Response(null, { status: 404 });
  },
});
const serve = process.argv.includes("--serve");
const connectionError = serve && process.argv.includes("--connection-error");
const port = serve && !connectionError ? 3001 : 19371;
const child = Bun.spawn([process.execPath, "src/index.ts"], {
  cwd: resolve(import.meta.dir, "../apps/api"),
  env: {
    ...process.env,
    NODE_ENV: "test",
    API_PORT: String(port),
    DATABASE_PATH: ":memory:",
    APP_AUTH_ENABLED: "false",
    ALLOW_SIGN_UP: "false",
    DEMO_MODE: "false",
    META_EGG_TIMEOUT_MS: "65000",
    META_EGG_URL: `http://127.0.0.1:${fixture.port}`,
    JELLYFIN_URL: "",
    JELLYFIN_API_KEY: "",
    JELLYFIN_USER_ID: "",
    BAZARR_URL: "",
    BAZARR_API_KEY: "",
    OMDB_API_KEY: "",
  },
  stdout: "ignore",
  stderr: "pipe",
});
const base = `http://127.0.0.1:${port}`;
async function request(path: string, method = "GET", body?: unknown) {
  if (provider === "jellyfin" && path.startsWith("/screening/")) {
    path += `${path.includes("?") ? "&" : "?"}source=jellyfin`;
    if (body && typeof body === "object")
      body = { ...body, source: "jellyfin" };
  }
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(
    response.status,
    method === "POST" && path.includes("/notes") ? 201 : 200,
    `${method} ${path}: ${response.status}`,
  );
  return response.json();
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await Bun.sleep(100);
  }
  assert.ok(ready, "Isolated API did not become ready");
  assert.equal((await fetch(`${base}/api/screening/movies`)).status, 400);
  if (provider === "jellyfin")
    await request("/settings/jellyfin", "POST", {
      url: "https://fixture.invalid",
      apiKey: "synthetic-test-key",
    });
  const found = await request("/screening/movies?query=fixture");
  assert.equal(found.data[0].id, movie.id);
  assert.equal(found.data[0].provider, provider);
  const playing = await request("/screening/sessions");
  assert.equal(playing.data.length, provider === "jellyfin" ? 1 : 0);
  if (provider === "jellyfin") {
    assert.equal(playing.data[0].title, movie.title);
    assert.equal(
      (await request(`/screening/sessions?itemId=${movie.id}`)).data[0].id,
      "fixture-tv",
    );
    assert.equal(
      (await request("/screening/sessions?itemId=other-film")).data.length,
      0,
    );
  }
  assert.equal(found.data[0].provenance.attribution, provenance.attribution);
  assert.equal(
    (await request("/screening/movies?query=missing-fixture")).data.length,
    0,
  );
  for (const state of ["not_configured", "not_found", "unavailable"]) {
    transcriptState = state;
    const metadataOnly = await request(`/screening/movies/${movie.id}`);
    assert.equal(metadataOnly.data.title, movie.title);
    assert.equal(metadataOnly.data.cuts.length, 0);
    assert.equal(metadataOnly.data.transcriptStatus.state, state);
  }
  transcriptState = "ready";
  if (process.argv.includes("--slow")) {
    const delayed = await request("/screening/movies?query=slow-fixture");
    assert.equal(delayed.data[0].id, movie.id);
    console.info(
      "PASS: a 16-second Meta Egg response completes beyond the former 15-second deadline.",
    );
  }
  const detail = await request(`/screening/movies/${movie.id}`);
  assert.equal(detail.data.cuts.length, 2);
  assert.equal(detail.data.cuts[0].precision, precision);
  assert.equal(detail.data.cuts[0].editionId, "theatrical");
  assert.equal(detail.data.transcriptStatus.state, "ready");
  assert.equal(detail.data.savedAt, savedAt);
  const transcript = await request(
    `/screening/movies/${movie.id}/cuts/theatrical/subtitles/0`,
  );
  assert.equal(transcript.data.cutId, "theatrical");
  assert.equal(transcript.data.cues.length, 120);
  assert.equal(transcript.data.source, provider);
  assert.equal(transcript.data.precision, precision);
  assert.equal(transcript.data.savedAt, savedAt);
  if (provider === "discovery") {
    assert.equal(transcript.data.provenance.termsUrl, provenance.termsUrl);
    assert.equal(transcript.data.provenance.licenseUrl, undefined);
  }
  const first = await request("/screening/timeline", "POST", {
    itemId: movie.id,
    cutId: "theatrical",
  });
  const same = await request("/screening/timeline", "POST", {
    itemId: movie.id,
    cutId: "theatrical",
  });
  assert.equal(first.id, same.id);
  assert.equal(first.kind, episode ? "episode" : "movie");
  assert.equal(first.contextTitle, episode ? "Example series" : null);
  assert.equal(first.seasonNumber, episode ? 3 : null);
  assert.equal(first.episodeNumber, episode ? 2 : null);
  assert.equal(
    first.runtimeSource,
    provider === "jellyfin" ? "jellyfin" : "meta_egg",
  );
  await request(`/media/${first.id}/runtime`, "PATCH", {
    runtimeSeconds: 610,
    source: "manual",
  });
  const reset = await request(`/media/${first.id}/runtime`, "PATCH", {
    runtimeSeconds: null,
  });
  assert.equal(
    reset.runtimeSource,
    provider === "jellyfin" ? "jellyfin" : "meta_egg",
  );
  const other = await request("/screening/timeline", "POST", {
    itemId: movie.id,
    cutId: "extended",
  });
  assert.notEqual(first.id, other.id);
  if (provider === "jellyfin") {
    await request("/settings/jellyfin", "POST", {
      url: "https://second-fixture.invalid",
      apiKey: "synthetic-second-key",
    });
    const otherServer = await request("/screening/timeline", "POST", {
      itemId: movie.id,
      cutId: "theatrical",
    });
    assert.notEqual(first.id, otherServer.id);
    assert.equal(otherServer.imageUrl, null);
    await request("/settings/jellyfin", "POST", {
      url: "https://fixture.invalid",
      apiKey: "synthetic-test-key",
    });
    assert.equal(
      (
        await request("/screening/timeline", "POST", {
          itemId: movie.id,
          cutId: "theatrical",
        })
      ).id,
      first.id,
    );
  }
  const note = await request(`/media/${first.id}/notes`, "POST", {
    atSeconds: 125,
    body: "The moment I started writing",
    color: "amber",
  });
  assert.equal(note.atSeconds, 125);
  assert.equal((await request(`/media/${first.id}/notes`)).notes.length, 1);
  assert.equal((await request(`/media/${other.id}/notes`)).notes.length, 0);
  assert.equal(note.rating, null);
  const ping = await request(`/media/${first.id}/notes`, "POST", {
    atSeconds: 130,
    body: "",
    color: "orange",
    rating: 9,
  });
  assert.equal(ping.body, "");
  assert.equal(ping.color, "orange");
  assert.equal(ping.rating, 9);
  const recolored = await request(`/notes/${ping.id}`, "PATCH", {
    color: "sky",
  });
  assert.equal(recolored.rating, 9);
  const written = await request(`/notes/${ping.id}`, "PATCH", {
    body: "Notation explained later",
  });
  assert.equal(written.color, "sky");
  assert.equal(written.rating, 9);
  assert.equal(written.atSeconds, 130);
  const cleared = await request(`/notes/${ping.id}`, "PATCH", { rating: null });
  assert.equal(cleared.rating, null);
  assert.equal(cleared.body, written.body);
  for (const rating of [0, 11, 3.5, "8"]) {
    const invalid = await fetch(`${base}/api/notes/${ping.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    assert.equal(invalid.status, 400);
  }
  assert.equal((await request(`/media/${other.id}/notes`)).notes.length, 0);
  assert.equal(
    (
      await fetch(`${base}/api/screening/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: movie.id, cutId: "wrong-cut" }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(
        `${base}/api/media/00000000-0000-4000-8000-000000000099/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            atSeconds: 1,
            body: "No timeline",
            color: "amber",
          }),
        },
      )
    ).status,
    404,
  );
  corruptTranscript = true;
  const mismatched = await fetch(
    `${base}/api/screening/movies/${movie.id}/cuts/theatrical/subtitles/0`,
  );
  assert.equal(mismatched.status, 502);
  assert.equal((await mismatched.json()).error.code, "META_EGG_UNAVAILABLE");
  corruptTranscript = false;
  for (const [code, message] of [
    ["discovery_unavailable", "online film search is temporarily unavailable"],
    [
      "transcripts_not_configured",
      "online subtitle provider is not configured",
    ],
    ["transcript_auth_failed", "subtitle provider rejected its credentials"],
    ["transcript_quota_exceeded", "download or request limit"],
    ["transcript_unavailable", "could not retrieve this subtitle version"],
    ["screening_storage_unavailable", "check the service, then retry"],
  ]) {
    sourceError = code!;
    const failure = await fetch(
      `${base}/api/screening/movies/${movie.id}/cuts/theatrical/subtitles/0`,
    );
    assert.equal(failure.status, 502);
    const body = await failure.json();
    assert.ok(body.error.message.includes(message));
    assert.ok(!body.error.message.includes("Untrusted upstream error detail"));
  }
  sourceError = null;
  unavailable = true;
  const offline = await fetch(`${base}/api/screening/movies?query=fixture`);
  assert.equal(offline.status, 502);
  assert.match(
    (await offline.json()).error.message,
    /film search is unavailable/,
  );
  unavailable = false;
  if (provider === "jellyfin") {
    for (const mode of ["image", "none"] as const) {
      subtitleMode = mode;
      const detail = await request(`/screening/movies/${movie.id}`);
      assert.ok(
        !detail.data.cuts[0].subtitles.some(
          (track: { available: boolean }) => track.available,
        ),
      );
      const timeline = await request("/screening/timeline", "POST", {
        itemId: movie.id,
        cutId: "theatrical",
      });
      assert.equal(timeline.id, first.id);
      const note = await request(`/media/${timeline.id}/notes`, "POST", {
        atSeconds: 142,
        body: "No text transcript needed",
        color: "amber",
      });
      assert.equal(note.atSeconds, 142);
      const stored = await request(`/media/${timeline.id}/notes`);
      assert.ok(
        stored.notes.some((entry: { id: string }) => entry.id === note.id),
      );
    }
    subtitleMode = process.argv.includes("--image-subtitles")
      ? "image"
      : process.argv.includes("--no-subtitles")
        ? "none"
        : "text";
  }
  console.info(
    `PASS (${provider}): Meta Egg search/no-match, metadata with subtitle statuses, cuts, transcript provenance, save acknowledgements, timeline reuse, cut isolation, note timestamp, empty-text color/rating pings, partial edits, rating validation, invalid timeline, wrong-cut rejection, and safe upstream/storage errors.`,
  );
  if (serve) {
    let connectionFailures = 0;
    const proxy = connectionError
      ? Bun.serve({
          hostname: "127.0.0.1",
          port: 3001,
          async fetch(request) {
            const url = new URL(request.url);
            if (
              url.pathname === "/api/settings/jellyfin" &&
              request.method === "GET" &&
              connectionFailures++ < 4
            )
              return Response.json(
                {
                  error: {
                    code: "FIXTURE_UNAVAILABLE",
                    message: "Synthetic connection lookup failure",
                  },
                },
                { status: 503 },
              );
            return fetch(
              new Request(`${base}${url.pathname}${url.search}`, request),
            );
          },
        })
      : null;
    console.info(
      `Isolated browser fixture API at ${connectionError ? "http://127.0.0.1:3001" : base}; run the web dev server separately. Ctrl-C to stop.`,
    );
    await new Promise<void>((done) => {
      process.on("SIGINT", done);
      process.on("SIGTERM", done);
    });
    proxy?.stop(true);
  }
} finally {
  child.kill();
  await child.exited;
  fixture.stop(true);
}
