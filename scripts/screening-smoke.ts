import { strict as assert } from "node:assert";
import { resolve } from "node:path";

const provider = process.argv.includes("--jellyfin")
  ? "jellyfin"
  : process.argv.includes("--discovery")
    ? "discovery"
    : "catalog";
const precision = provider === "jellyfin" ? "media_source" : "subtitle_version";
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
const fixture = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  idleTimeout: 70,
  async fetch(request) {
    const url = new URL(request.url);
    if (sourceError)
      return Response.json(
        { code: sourceError, detail: "Untrusted upstream error detail" },
        { status: 502 },
      );
    if (unavailable) return new Response(null, { status: 503 });
    if (url.pathname.endsWith("/sessions")) return Response.json({ data: [] });
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
          cuts: transcriptState === "ready" ? cuts : [],
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
const port = serve ? 3001 : 19371;
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
  const found = await request("/screening/movies?query=fixture");
  assert.equal(found.data[0].id, movie.id);
  assert.equal(found.data[0].provider, provider);
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
  assert.equal(first.runtimeSource, "meta_egg");
  await request(`/media/${first.id}/runtime`, "PATCH", {
    runtimeSeconds: 610,
    source: "manual",
  });
  const reset = await request(`/media/${first.id}/runtime`, "PATCH", {
    runtimeSeconds: null,
  });
  assert.equal(reset.runtimeSource, "meta_egg");
  const other = await request("/screening/timeline", "POST", {
    itemId: movie.id,
    cutId: "extended",
  });
  assert.notEqual(first.id, other.id);
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
    ["screening_storage_unavailable", "check its data volume, then retry"],
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
  console.info(
    `PASS (${provider}): Meta Egg search/no-match, metadata with subtitle statuses, cuts, transcript provenance, save acknowledgements, timeline reuse, cut isolation, note timestamp, empty-text color/rating pings, partial edits, rating validation, invalid timeline, wrong-cut rejection, and safe upstream/storage errors.`,
  );
  if (serve) {
    console.info(
      `Isolated browser fixture API at ${base}; run the web dev server separately. Ctrl-C to stop.`,
    );
    await new Promise<void>((done) => {
      process.on("SIGINT", done);
      process.on("SIGTERM", done);
    });
  }
} finally {
  child.kill();
  await child.exited;
  fixture.stop(true);
}
