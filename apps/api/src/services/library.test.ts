import { expect, test } from "bun:test";
import type { MediaSummary } from "@film-introspect/contracts";
import { groupLibraryMovies } from "./library";

function version(
  id: number,
  overrides: Partial<MediaSummary> = {},
): MediaSummary {
  return {
    id: `00000000-0000-4000-8000-${id.toString().padStart(12, "0")}`,
    jellyfinItemId: `item-${id}`,
    mediaSourceId: `cut-${id}`,
    editionLabel: null,
    title: "At Eternity’s Gate",
    contextTitle: null,
    kind: "movie",
    year: 2018,
    seasonNumber: null,
    episodeNumber: null,
    runtimeSeconds: null,
    runtimeSource: "unknown",
    providerIds: {},
    imageUrl: null,
    noteCount: 0,
    lastNotedAt: null,
    ...overrides,
  };
}

test("editions share a stable movie card with aggregate counts and a noted runtime", () => {
  const editions = [
    version(1),
    version(2, {
      title: "At Eternity's Gate",
      noteCount: 2,
      runtimeSeconds: 6660,
      lastNotedAt: "2026-11-01T12:00:00.000Z",
    }),
    version(3, { title: "AT ETERNITY'S GATE", runtimeSeconds: 6780 }),
  ];
  const movie = groupLibraryMovies(editions)[0]!;
  expect(movie?.id).toBe(editions[0]!.id!);
  expect(movie?.versions).toHaveLength(3);
  expect(movie?.noteCount).toBe(2);
  expect(movie?.runtimeSeconds).toBe(6660);
  expect(movie?.lastNotedAt).toBe("2026-11-01T12:00:00.000Z");
  expect(groupLibraryMovies(editions.toReversed())).toEqual([movie]);
  expect(editions[0]!.runtimeSeconds).toBeNull();
});

test("different years, unknown identities, and conflicting provider IDs stay separate", () => {
  expect(
    groupLibraryMovies([
      version(1),
      version(2, { year: 2020 }),
      version(3, { year: null }),
      version(4, { year: null }),
    ]),
  ).toHaveLength(4);
  const conflicting = [
    version(1, { providerIds: { Imdb: "tt1234567" } }),
    version(2),
    version(3, { providerIds: { imdb: "tt7654321" } }),
  ];
  expect(groupLibraryMovies(conflicting)).toHaveLength(2);
  expect(groupLibraryMovies(conflicting.toReversed())).toEqual(
    groupLibraryMovies(conflicting),
  );
  expect(
    groupLibraryMovies([
      version(1, { providerIds: { Imdb: "tt1234567" } }),
      version(2, {
        title: "Alternate title",
        year: null,
        providerIds: { imdb: "tt1234567" },
      }),
    ]),
  ).toHaveLength(1);
  expect(
    groupLibraryMovies([
      version(1, { providerIds: { Imdb: "tt1234567" } }),
      version(2, { year: 2020, providerIds: { imdb: "tt1234567" } }),
    ]),
  ).toHaveLength(2);
});

test("version numbering remains stable when note activity or runtime changes the representative", () => {
  const first = version(1, { runtimeSeconds: 6660 });
  const second = version(2, {
    runtimeSeconds: 6780,
    noteCount: 1,
    lastNotedAt: "2026-11-01T12:00:00.000Z",
  });
  const initial = groupLibraryMovies([second, first])[0]!;
  const updated = groupLibraryMovies([
    { ...second, runtimeSeconds: null },
    { ...first, noteCount: 2, lastNotedAt: "2026-11-16T12:00:00.000Z" },
  ])[0]!;
  expect(initial.runtimeSeconds).toBe(6780);
  expect(updated.runtimeSeconds).toBe(6660);
  expect(initial.versions.map((item) => item.id)).toEqual([
    first.id!,
    second.id!,
  ]);
  expect(updated.versions.map((item) => item.id)).toEqual(
    initial.versions.map((item) => item.id),
  );
  expect(updated.id).toBe(initial.id);
});

test("episodes only share a card within the same series, season and episode", () => {
  const episode = version(1, {
    kind: "episode",
    title: "Pilot",
    contextTitle: "A Series",
    seasonNumber: 1,
    episodeNumber: 1,
  });
  expect(
    groupLibraryMovies([
      episode,
      { ...episode, id: version(2).id, mediaSourceId: "other-cut" },
      { ...episode, id: version(3).id, episodeNumber: 2 },
      { ...episode, id: version(4).id, contextTitle: "Another series" },
      { ...episode, id: version(5).id, seasonNumber: null },
      { ...episode, id: version(6).id, seasonNumber: null },
    ]),
  ).toHaveLength(5);
});

test("missing years group only with matching provider or private source item identity", () => {
  const versions = [
    version(1, { year: null }),
    version(2, { year: null }),
    version(3, { year: null }),
  ];
  const identities = new Map(
    versions.map((item, index) => [
      item.id!,
      JSON.stringify([index < 2 ? "server-a" : "server-b", "same-item-id"]),
    ]),
  );
  expect(
    groupLibraryMovies(versions, identities).map(
      (movie) => movie.versions.length,
    ),
  ).toEqual([2, 1]);
  expect(groupLibraryMovies(versions)).toHaveLength(3);
});

test("known different series remain separate even with matching IDs and incomplete episode metadata", () => {
  const first = version(1, {
    kind: "episode",
    contextTitle: "A Series",
    providerIds: { tvdb: "123" },
  });
  const second = version(2, {
    ...first,
    id: version(2).id,
    contextTitle: "Another series",
  });
  const identities = new Map([
    [first.id!, "same-source-item"],
    [second.id!, "same-source-item"],
  ]);
  expect(groupLibraryMovies([first, second], identities)).toHaveLength(2);
});
