import {
  type LibraryMovie,
  type MediaSummary,
} from "@film-introspect/contracts";

type StoredMedia = MediaSummary & { id: string };

function normalizedTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/['’‘ʼ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function providerIds(media: MediaSummary): Map<string, string> {
  return new Map(
    Object.entries(media.providerIds)
      .map(
        ([provider, id]) =>
          [provider.toLowerCase(), id.trim().toLowerCase()] as const,
      )
      .filter(
        ([provider, id]) =>
          ["imdb", "tmdb", "tvdb"].includes(provider) && id !== "",
      ),
  );
}

function sameMovie(
  a: StoredMedia,
  b: StoredMedia,
  sourceItemKeys: ReadonlyMap<string, string>,
): boolean {
  if (
    a.kind !== b.kind ||
    (a.year !== null && b.year !== null && a.year !== b.year)
  )
    return false;
  const aIds = providerIds(a);
  const bIds = providerIds(b);
  if (
    [...aIds].some(
      ([provider, id]) => bIds.has(provider) && bIds.get(provider) !== id,
    )
  )
    return false;
  const sameProvider = [...aIds].some(
    ([provider, id]) => bIds.get(provider) === id,
  );
  const sameSourceItem =
    sourceItemKeys.has(a.id) &&
    sourceItemKeys.get(a.id) === sourceItemKeys.get(b.id);
  if (a.kind === "episode") {
    if (
      a.contextTitle &&
      b.contextTitle &&
      normalizedTitle(a.contextTitle) !== normalizedTitle(b.contextTitle)
    )
      return false;
    if (
      (a.seasonNumber !== null &&
        b.seasonNumber !== null &&
        a.seasonNumber !== b.seasonNumber) ||
      (a.episodeNumber !== null &&
        b.episodeNumber !== null &&
        a.episodeNumber !== b.episodeNumber)
    )
      return false;
    if (
      !a.contextTitle ||
      !b.contextTitle ||
      a.seasonNumber === null ||
      b.seasonNumber === null ||
      a.episodeNumber === null ||
      b.episodeNumber === null
    )
      return sameProvider || sameSourceItem;
  }
  if (sameProvider || sameSourceItem) return true;
  // Missing years and generic videos cannot establish a film identity from a title alone.
  return (
    a.kind !== "video" &&
    a.year !== null &&
    a.year === b.year &&
    normalizedTitle(a.title) === normalizedTitle(b.title)
  );
}

function groupingKeys(
  item: StoredMedia,
  sourceItemKeys: ReadonlyMap<string, string>,
): string[] {
  const keys = [...providerIds(item)].map(([provider, id]) =>
    JSON.stringify([item.kind, provider, id]),
  );
  if (sourceItemKeys.has(item.id))
    keys.push(
      JSON.stringify([item.kind, "source", sourceItemKeys.get(item.id)]),
    );
  if (item.year !== null && item.kind !== "video")
    keys.push(
      JSON.stringify([
        item.kind,
        "title",
        normalizedTitle(item.title),
        item.year,
      ]),
    );
  return keys;
}

function representativeOrder(a: StoredMedia, b: StoredMedia): number {
  const aHasRuntime = a.runtimeSeconds !== null && a.runtimeSeconds > 0;
  const bHasRuntime = b.runtimeSeconds !== null && b.runtimeSeconds > 0;
  return (
    Number(b.noteCount > 0 && bHasRuntime) -
      Number(a.noteCount > 0 && aHasRuntime) ||
    Number(bHasRuntime) - Number(aHasRuntime) ||
    (b.lastNotedAt ?? "").localeCompare(a.lastNotedAt ?? "") ||
    b.noteCount - a.noteCount ||
    a.id.localeCompare(b.id)
  );
}

export function groupLibraryMovies(
  items: MediaSummary[],
  sourceItemKeys: ReadonlyMap<string, string> = new Map(),
): LibraryMovie[] {
  const groups: StoredMedia[][] = [];
  const groupsByKey = new Map<string, Set<number>>();
  for (const item of [...items].sort((a, b) =>
    (a.id ?? "").localeCompare(b.id ?? ""),
  )) {
    if (!item.id) throw new Error("Library timelines must have a stored ID");
    const stored = { ...item, id: item.id };
    const keys = groupingKeys(stored, sourceItemKeys);
    const candidates = new Set(
      keys.flatMap((key) => [...(groupsByKey.get(key) ?? [])]),
    );
    // Every member must agree, so a title-only row cannot bridge contradictory provider IDs.
    let groupIndex = [...candidates]
      .sort((a, b) => a - b)
      .find((index) =>
        groups[index]!.every((version) =>
          sameMovie(version, stored, sourceItemKeys),
        ),
      );
    if (groupIndex === undefined) {
      groupIndex = groups.length;
      groups.push([]);
    }
    groups[groupIndex]!.push(stored);
    for (const key of keys) {
      if (!groupsByKey.has(key)) groupsByKey.set(key, new Set());
      groupsByKey.get(key)!.add(groupIndex);
    }
  }
  return groups
    .map((group) => {
      const representative = group.toSorted(representativeOrder)[0]!;
      return {
        ...representative,
        id: group[0]!.id,
        noteCount: group.reduce(
          (total, version) => total + version.noteCount,
          0,
        ),
        lastNotedAt:
          group
            .map((version) => version.lastNotedAt)
            .filter((date) => date !== null)
            .sort()
            .at(-1) ?? null,
        versions: group,
      };
    })
    .sort(
      (a, b) =>
        (b.lastNotedAt ?? "").localeCompare(a.lastNotedAt ?? "") ||
        a.title.localeCompare(b.title) ||
        (a.year ?? 0) - (b.year ?? 0) ||
        a.id.localeCompare(b.id),
    );
}
