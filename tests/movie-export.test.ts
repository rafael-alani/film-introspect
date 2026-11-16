import { describe, expect, test } from "bun:test";
import type { Media, Note } from "../packages/contracts/src";
import {
  exportMovieNotes,
  movieVersionLabel,
} from "../apps/web/src/lib/movie-export";

const theatrical: Media = {
  id: "b5657590-f597-4bac-88a7-59613e82c288",
  jellyfinItemId: "movie",
  mediaSourceId: "theatrical",
  editionLabel: "Theatrical",
  title: "A Movie",
  contextTitle: null,
  kind: "movie",
  year: 2018,
  seasonNumber: null,
  episodeNumber: null,
  runtimeSeconds: 6000,
  runtimeSource: "jellyfin",
  providerIds: {},
  imageUrl: null,
};
const extended: Media = {
  ...theatrical,
  id: "71e199b0-1be3-4f93-b096-3440f710b5ae",
  mediaSourceId: "extended",
  editionLabel: "A.Movie.2018.1080p.BluRay.H264.AAC-RARBG",
  runtimeSeconds: 7200,
};

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "da02af18-5f1b-4737-90e6-bc1e650c6825",
    mediaId: theatrical.id!,
    atSeconds: 60,
    body: "A moment worth remembering",
    color: "amber",
    rating: null,
    createdAt: "2026-11-16T12:00:00.000Z",
    updatedAt: "2026-11-16T12:00:00.000Z",
    ...overrides,
  };
}

describe("movie Markdown export", () => {
  test("exports every moment in film order and retains cut durations and textless pings", () => {
    const notes = [
      note({ id: "last", atSeconds: 3612, body: "Later", rating: 8 }),
      note({
        id: "first",
        atSeconds: 12,
        body: "",
        color: "rose",
        mediaId: extended.id!,
      }),
      note({
        id: "middle",
        atSeconds: 60,
        body: "Same time, later capture",
        createdAt: "2026-11-16T13:00:00.000Z",
      }),
      note({
        id: "earlier-capture",
        atSeconds: 60,
        body: "Same time, earlier capture",
      }),
    ];
    const { markdown, filename } = exportMovieNotes(theatrical, notes, [
      theatrical,
      extended,
    ]);
    expect(filename).toBe("A Movie (2018).md");
    expect(markdown).toContain("- Theatrical · 1:40:00\n- Version 2 · 2:00:00");
    expect(markdown).not.toContain("Duration: 1:40:00");
    expect(markdown).toContain("1. **0:12** · Challenge · Version 2");
    expect(markdown).toContain("4. **1:00:12** · Insight · 8/10 · Theatrical");
    expect(markdown.indexOf("earlier capture")).toBeLessThan(
      markdown.indexOf("later capture"),
    );
    expect(markdown).not.toContain("RARBG");
    expect(notes[0]?.id).toBe("last");
  });

  test("keeps multiline Markdown within its numbered item and preserves semantic color labels", () => {
    const body =
      "A [[linked note]] and **bold** text\r\n\r\n- a point\n- another\n\n> a quote\n\n```text\noriginal text\n```";
    const { markdown } = exportMovieNotes(
      theatrical,
      [note({ body, color: "orange", rating: 1 })],
      [theatrical],
    );
    expect(markdown).toContain("Duration: 1:40:00");
    expect(markdown).toContain(
      "1. **1:00** · Confused · 1/10\n\n   A [[linked note]] and **bold** text\n   \n   - a point",
    );
    expect(markdown).toContain("   > a quote");
    expect(markdown).toContain("   ```text\n   original text\n   ```");
    expect(markdown).not.toContain(" · Theatrical");
  });

  test("retains unknown version runtimes instead of substituting the representative runtime", () => {
    const unknown = { ...extended, runtimeSeconds: null };
    const { markdown } = exportMovieNotes(
      theatrical,
      [],
      [theatrical, unknown],
    );
    expect(markdown).toContain("Version 2 · Duration unknown");
    expect(markdown).toContain("No notes yet");
  });

  test("distinguishes repeated edition names and derives shared duration from the versions", () => {
    const secondTheatrical = {
      ...extended,
      editionLabel: "Theatrical",
      runtimeSeconds: theatrical.runtimeSeconds,
    };
    const { markdown } = exportMovieNotes(
      { ...theatrical, runtimeSeconds: null },
      [note(), note({ id: "other", mediaId: extended.id! })],
      [theatrical, secondTheatrical],
    );
    expect(markdown).toContain("Duration: 1:40:00");
    expect(markdown).toContain("Theatrical (Version 1)");
    expect(markdown).toContain("Theatrical (Version 2)");
  });

  test("creates portable filenames and does not inject Markdown through title metadata", () => {
    const { filename, markdown } = exportMovieNotes(
      { ...theatrical, title: "../A: [Movie]\n# Part*?", year: null },
      [],
      [],
    );
    expect(filename).toBe("-A- -Movie- - Part--.md");
    expect(filename).not.toMatch(/[/:*?<>|\[\]#]/);
    expect(markdown).toStartWith("# ../A: \\[Movie\\] \\# Part\\*?\n");
    expect(
      exportMovieNotes({ ...theatrical, title: "CON", year: null }, [], [])
        .filename,
    ).toBe("_CON.md");
    expect(
      exportMovieNotes({ ...theatrical, title: "...", year: null }, [], [])
        .filename,
    ).toBe("Movie notes.md");
  });

  test("keeps episode context in the exported document", () => {
    const { markdown } = exportMovieNotes(
      {
        ...theatrical,
        kind: "episode",
        contextTitle: "A Series",
        seasonNumber: 3,
        episodeNumber: 2,
      },
      [],
      [theatrical],
    );
    expect(markdown).toContain("A Series · Season 3, Episode 2");
  });

  test("uses a readable edition label or a consistent version fallback", () => {
    expect(movieVersionLabel(theatrical, 0)).toBe("Theatrical");
    expect(movieVersionLabel(extended, 1)).toBe("Version 2");
    expect(movieVersionLabel({ editionLabel: null }, 2)).toBe("Version 3");
    expect(movieVersionLabel({ editionLabel: "Director's cut" }, 0)).toBe(
      "Director's cut",
    );
    expect(movieVersionLabel(theatrical, 0, [theatrical, theatrical])).toBe(
      "Theatrical (Version 1)",
    );
  });
});
