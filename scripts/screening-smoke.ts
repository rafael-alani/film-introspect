import { strict as assert } from "node:assert";
import { resolve } from "node:path";

// Isolated contract fixture for API checks and a browser walkthrough; never a production fallback.
const movie = {
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
  precision: "media_source",
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
const fixture = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(request) {
    const url = new URL(request.url);
    if (unavailable) return new Response(null, { status: 503 });
    if (url.pathname.endsWith("/sessions")) return Response.json({ data: [] });
    if (url.pathname.endsWith("/subtitles/0"))
      return Response.json({
        data: {
          itemId: movie.id,
          cutId: corruptTranscript ? "other-cut" : url.pathname.split("/")[6],
          trackId: "0",
          language: "eng",
          source: "jellyfin",
          precision: "media_source",
          cues: Array.from({ length: 120 }, (_, i) => ({
            id: String(i),
            startSeconds: i * 5,
            endSeconds: i * 5 + 4,
            text: `Subtitle ${i + 1}. The screening continues.`,
          })),
        },
      });
    if (url.pathname.endsWith(`/movies/${movie.id}`))
      return Response.json({ data: { ...movie, cuts } });
    if (url.pathname.endsWith("/movies")) {
      if (!url.searchParams.get("query")?.trim())
        return new Response(null, { status: 400 });
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
  const detail = await request(`/screening/movies/${movie.id}`);
  assert.equal(detail.data.cuts.length, 2);
  const transcript = await request(
    `/screening/movies/${movie.id}/cuts/theatrical/subtitles/0`,
  );
  assert.equal(transcript.data.cutId, "theatrical");
  assert.equal(transcript.data.cues.length, 120);
  const first = await request("/screening/timeline", "POST", {
    itemId: movie.id,
    cutId: "theatrical",
  });
  const same = await request("/screening/timeline", "POST", {
    itemId: movie.id,
    cutId: "theatrical",
  });
  assert.equal(first.id, same.id);
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
  unavailable = true;
  const offline = await fetch(`${base}/api/screening/movies?query=fixture`);
  assert.equal(offline.status, 502);
  unavailable = false;
  console.info(
    "PASS: Meta Egg search, cuts, transcript, timeline reuse, cut isolation, note timestamp, invalid timeline, wrong-cut rejection, and unavailable upstream checks.",
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
