import { afterAll, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { resolve } from "node:path";
import {
  libraryListResponseSchema,
  libraryMovieResponseSchema,
} from "@film-introspect/contracts";

process.env.DATABASE_PATH = ":memory:";
process.env.META_EGG_URL = "http://meta-egg.test";
process.env.APP_AUTH_ENABLED = "false";
const { db, sqlite } = await import("../db");
migrate(db, { migrationsFolder: resolve(import.meta.dir, "../../drizzle") });
const { user } = await import("../db/schema");
const { ensureLocalAppUser, LOCAL_APP_USER } = await import("./local-user");
await ensureLocalAppUser();
db.insert(user)
  .values({ id: "second-viewer", name: "Second", email: "second@test.invalid" })
  .run();
const { app } = await import("../app");
const {
  jellyfinSummary,
  saveJellyfin,
  jellyfinContext,
  encryptCredential,
  decryptCredential,
} = await import("./jellyfin-settings");
const realFetch = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
  sqlite.close();
});

test("library returns every movie and every owned note across editions without changing timelines", async () => {
  const { mediaItems, notes } = await import("../db/schema");
  const { getLibraryMovie, updateRuntime } = await import("./repository");
  const primary = crypto.randomUUID();
  const alternate = crypto.randomUUID();
  const privateId = crypto.randomUUID();
  const movie = {
    userId: LOCAL_APP_USER.id,
    title: "At Eternity's Gate",
    year: 2018,
    kind: "movie" as const,
  };
  db.insert(mediaItems)
    .values([
      {
        ...movie,
        id: primary,
        jellyfinServerKey: "https://old-screen.test",
        jellyfinItemId: "movie",
        mediaSourceId: "theatrical",
        runtimeSeconds: 6660,
        lastSeenAt: new Date(0),
      },
      {
        ...movie,
        id: alternate,
        title: "At Eternity’s Gate",
        jellyfinServerKey: "jellyfin:https://new-screen.test",
        jellyfinItemId: "another-id",
        mediaSourceId: "extended",
        runtimeSeconds: 6780,
        lastSeenAt: new Date(0),
      },
      {
        ...movie,
        id: privateId,
        userId: "second-viewer",
        jellyfinItemId: "movie",
        mediaSourceId: "private",
      },
      ...Array.from({ length: 105 }, (_, index) => ({
        ...movie,
        id: crypto.randomUUID(),
        title: `Library fixture ${index}`,
        jellyfinItemId: `fixture-${index}`,
        lastSeenAt: new Date(),
      })),
    ])
    .run();
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  const last = crypto.randomUUID();
  db.insert(notes)
    .values([
      {
        id: last,
        userId: LOCAL_APP_USER.id,
        mediaId: primary,
        atSeconds: 120,
        body: "Later scene",
        color: "amber",
      },
      {
        id: second,
        userId: LOCAL_APP_USER.id,
        mediaId: primary,
        atSeconds: 30,
        body: "Same scene, later note",
        createdAt: new Date(2000),
        color: "sky",
      },
      {
        id: first,
        userId: LOCAL_APP_USER.id,
        mediaId: alternate,
        atSeconds: 30,
        body: "",
        rating: 8,
        createdAt: new Date(1000),
        color: "orange",
      },
      {
        id: crypto.randomUUID(),
        userId: "second-viewer",
        mediaId: privateId,
        atSeconds: 0,
        body: "Private thought",
        color: "amber",
      },
    ])
    .run();

  const listResponse = await app.request("/api/library");
  expect(listResponse.status).toBe(200);
  const list = libraryListResponseSchema.parse(await listResponse.json());
  expect(list.items).toHaveLength(106);
  expect(
    list.items.find(
      (item) => item.year === 2018 && item.title.startsWith("At Eternity"),
    )?.noteCount,
  ).toBe(3);
  const detailResponse = await app.request(`/api/library/${alternate}`);
  expect(detailResponse.status).toBe(200);
  const detail = libraryMovieResponseSchema.parse(await detailResponse.json());
  expect(detail.movie.versions).toHaveLength(2);
  expect(detail.notes.map((note) => note.id)).toEqual([first, second, last]);
  expect(detail.notes[0]?.mediaId).toBe(alternate);
  expect(detail.notes[0]?.rating).toBe(8);
  expect(detail.notes[0]?.body).toBe("");
  expect(await getLibraryMovie(LOCAL_APP_USER.id, primary)).toEqual(detail);
  expect((await app.request(`/api/library/${privateId}`)).status).toBe(404);
  expect(await getLibraryMovie("second-viewer", primary)).toBeNull();
  await updateRuntime(LOCAL_APP_USER.id, primary, {
    runtimeSeconds: 7000,
    editionLabel: "Director's cut",
    source: "manual",
  });
  const updated = await getLibraryMovie(LOCAL_APP_USER.id, alternate);
  expect(
    updated?.movie.versions.find((item) => item.id === primary)?.runtimeSeconds,
  ).toBe(7000);
  expect(
    updated?.movie.versions.find((item) => item.id === alternate)
      ?.runtimeSeconds,
  ).toBe(6780);
  expect(updated?.notes).toEqual(detail.notes);
  expect(sqlite.query("PRAGMA integrity_check").get()).toEqual({
    integrity_check: "ok",
  });
});

test("personal credentials are encrypted, owner-bound and never returned; failed replacement keeps previous key", async () => {
  const key = "test-only-personal-key";
  const value = encryptCredential("alice", "https://screen.test", key);
  expect(value).not.toContain(key);
  expect(decryptCredential("alice", "https://screen.test", value)).toBe(key);
  expect(() =>
    decryptCredential("bob", "https://screen.test", value),
  ).toThrow();
  expect(() =>
    decryptCredential("alice", "https://other.test", value),
  ).toThrow();
  const upstream: { url: string; key: string | null }[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    upstream.push({ url, key: headers.get("X-Jellyfin-Key") });
    if (headers.get("X-Jellyfin-Key") === "bad")
      return Response.json({ code: "jellyfin_auth_failed" }, { status: 502 });
    if (url.endsWith("/connection"))
      return Response.json({
        data: { serverName: "Living room", userId: "reader" },
      });
    return Response.json({ data: [] });
  }) as typeof fetch;
  const post = (url: string, apiKey: string) =>
    app.request("/api/settings/jellyfin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, apiKey }),
    });
  let response = await post("https://screen.test/", key);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    configured: true,
    url: "https://screen.test",
    serverName: "Living room",
  });
  expect(
    sqlite.query("SELECT credential FROM user_jellyfin").get(),
  ).not.toEqual({ credential: key });
  expect(jellyfinSummary("second-viewer").configured).toBe(false);
  saveJellyfin(
    "second-viewer",
    { url: "https://other.test", apiKey: "second-test-key" },
    "Other",
    null,
  );
  expect(jellyfinContext("second-viewer")?.apiKey).toBe("second-test-key");
  response = await post("https://screen.test", "bad");
  expect(response.status).toBe(502);
  expect(jellyfinContext(LOCAL_APP_USER.id)?.apiKey).toBe(key);
  response = await app.request(
    "/api/screening/movies?query=test&source=jellyfin",
  );
  expect(response.status).toBe(200);
  expect(upstream.at(-1)?.key).toBe(key);
  await app.request("/api/screening/movies?query=test&source=external");
  expect(upstream.at(-1)?.key).toBeNull();
  response = await app.request("/api/screening/sessions?source=jellyfin");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: [] });
  expect(upstream.at(-1)?.key).toBe(key);
  expect(new URL(upstream.at(-1)!.url).searchParams.has("itemId")).toBe(false);
  await app.request("/api/screening/sessions?itemId=film&source=jellyfin");
  expect(new URL(upstream.at(-1)!.url).searchParams.get("itemId")).toBe("film");
  await app.request("/api/screening/sessions?source=external");
  expect(upstream.at(-1)?.key).toBeNull();
  const reads = upstream.length;
  expect((await post("file:///etc/passwd", key)).status).toBe(400);
  expect(upstream.length).toBe(reads);
  expect(
    (
      await app.request("/api/settings/jellyfin", {
        method: "DELETE",
        headers: { Origin: "https://foreign.test" },
      })
    ).status,
  ).toBe(403);
  await app.request("/api/settings/jellyfin", { method: "DELETE" });
  expect(jellyfinSummary(LOCAL_APP_USER.id).configured).toBe(false);
  expect(jellyfinSummary("second-viewer").configured).toBe(true);
  response = await app.request(
    "/api/screening/movies?query=test&source=jellyfin",
  );
  expect(response.status).toBe(502);
  expect(upstream.length).toBe(reads);
});
