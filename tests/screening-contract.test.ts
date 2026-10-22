import { describe, expect, test } from "bun:test";
import {
  screeningMovieDetailSchema,
  screeningTranscriptSchema,
} from "../packages/contracts/src";

const provenance = {
  sourceUrl: "https://example.invalid/film",
  licenseUrl: "https://example.invalid/license",
  attribution: "Test fixture",
};
const movie = {
  id: "test-film",
  provider: "catalog",
  title: "Independent film fixture",
  year: 2026,
  overview: null,
  runtimeSeconds: 600,
  provenance,
};
const cut = {
  id: "version-1",
  editionId: "edition-1",
  label: "Declared subtitle version",
  runtimeSeconds: 600,
  precision: "subtitle_version",
  referenceVideoUrl: "https://example.invalid/film.mp4",
  matchingNotes: "Verify a spoken line.",
  subtitles: [],
};

describe("independent screening contracts", () => {
  test("preserves catalog version provenance and reference link without a player session", () => {
    const result = screeningMovieDetailSchema.parse({
      data: { ...movie, cuts: [cut] },
    });
    expect(result.data.provider).toBe("catalog");
    expect(result.data.cuts[0]?.precision).toBe("subtitle_version");
    expect(result.data.cuts[0]?.referenceVideoUrl).toBe(cut.referenceVideoUrl);
    expect(result.data.provenance?.attribution).toBe(provenance.attribution);
    const transcript = screeningTranscriptSchema.parse({
      data: {
        itemId: movie.id,
        cutId: cut.id,
        trackId: "0",
        language: "eng",
        source: "catalog",
        precision: "subtitle_version",
        provenance,
        cues: [
          {
            id: "1",
            startSeconds: 12.5,
            endSeconds: 14,
            text: "A real timestamp.",
          },
        ],
      },
    });
    expect(transcript.data.cues[0]?.startSeconds).toBe(12.5);
  });
  test("still accepts optional Jellyfin media sources", () => {
    const result = screeningMovieDetailSchema.parse({
      data: {
        ...movie,
        provider: "jellyfin",
        provenance: undefined,
        cuts: [{ ...cut, precision: "media_source" }],
      },
    });
    expect(result.data.provider).toBe("jellyfin");
  });
  test("preserves discovered metadata when subtitles cannot yet be supplied", () => {
    for (const state of ["not_configured", "not_found", "unavailable"]) {
      const result = screeningMovieDetailSchema.parse({
        data: {
          ...movie,
          provider: "discovery",
          cuts: [],
          transcriptStatus: { state, message: "Subtitle lookup status." },
        },
      });
      expect(result.data.provider).toBe("discovery");
      expect(result.data.title).toBe(movie.title);
      expect(result.data.transcriptStatus?.state).toBe(state);
      expect(result.data.cuts).toEqual([]);
    }
  });
  test("preserves discovered transcript terms without claiming a license", () => {
    const result = screeningTranscriptSchema.parse({
      data: {
        itemId: movie.id,
        cutId: cut.id,
        trackId: "0",
        language: "eng",
        source: "discovery",
        precision: "subtitle_version",
        provenance: {
          sourceUrl: "https://example.invalid/release",
          termsUrl: "https://example.invalid/terms",
          attribution: "Subtitle release fixture",
        },
        cues: [],
      },
    });
    expect(result.data.source).toBe("discovery");
    expect(result.data.provenance?.termsUrl).toBe(
      "https://example.invalid/terms",
    );
    expect(result.data.provenance?.licenseUrl).toBeUndefined();
  });
  test("rejects executable reference or attribution links", () => {
    expect(
      screeningMovieDetailSchema.safeParse({
        data: {
          ...movie,
          cuts: [{ ...cut, referenceVideoUrl: "javascript:alert(1)" }],
        },
      }).success,
    ).toBe(false);
    expect(
      screeningMovieDetailSchema.safeParse({
        data: {
          ...movie,
          provenance: { ...provenance, sourceUrl: "data:text/html,test" },
          cuts: [cut],
        },
      }).success,
    ).toBe(false);
    expect(
      screeningMovieDetailSchema.safeParse({
        data: {
          ...movie,
          provenance: { ...provenance, termsUrl: "javascript:alert(1)" },
          cuts: [cut],
        },
      }).success,
    ).toBe(false);
  });
});
