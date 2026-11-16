import {
  formatTimestamp,
  noteColors,
  type Media,
  type Note,
} from "@film-introspect/contracts";

type MovieMetadata = Pick<
  Media,
  | "title"
  | "year"
  | "runtimeSeconds"
  | "kind"
  | "contextTitle"
  | "seasonNumber"
  | "episodeNumber"
>;

export function movieVersionLabel(
  media: Pick<Media, "editionLabel">,
  index: number,
  versions?: readonly Pick<Media, "editionLabel">[],
): string {
  const label = media.editionLabel?.trim();
  const isReleaseName =
    label &&
    /(?:\.(?:mkv|mp4|avi|mov|srt|vtt)$|\.\d{4}(?:\.|$)|\b\d{3,4}p\b|bluray|blu-ray|web[ .-]?(?:dl|rip)|[hx][ .-]?26[45]|aac|rarbg|yify)/i.test(
      label,
    );
  const readable =
    label && label.length <= 60 && !isReleaseName
      ? label.replace(/\s+/g, " ")
      : `Version ${index + 1}`;
  return versions &&
    versions.filter(
      (version, versionIndex) =>
        movieVersionLabel(version, versionIndex) === readable,
    ).length > 1
    ? `${readable} (Version ${index + 1})`
    : readable;
}

function inlineText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[\\`*_{}\[\]<>#|]/g, "\\$&");
}

function exportFilename(title: string): string {
  const safeTitle = title
    .replace(/\s+/g, " ")
    .replace(/[<>:"/\\|?*#\[\]^\u0000-\u001f\u007f]/g, "-")
    .replace(/^\.+|[. ]+$/g, "")
    .trim();
  const basename = Array.from(safeTitle || "Movie notes")
    .slice(0, 160)
    .join("")
    .replace(/[. ]+$/g, "");
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(basename) ? `_${basename}` : basename}.md`;
}

export function exportMovieNotes(
  movie: MovieMetadata,
  notes: readonly Note[],
  versions: readonly Media[],
): { filename: string; markdown: string } {
  const title = `${movie.title}${movie.year === null ? "" : ` (${movie.year})`}`;
  const lines = [`# ${inlineText(title)}`, ""];
  if (movie.kind === "episode" && movie.contextTitle) {
    const episode = [
      movie.seasonNumber === null ? null : `Season ${movie.seasonNumber}`,
      movie.episodeNumber === null ? null : `Episode ${movie.episodeNumber}`,
    ].filter(Boolean);
    lines.push(
      `${inlineText(movie.contextTitle)}${episode.length ? ` · ${episode.join(", ")}` : ""}`,
      "",
    );
  }

  const runtimes = new Set(versions.map((version) => version.runtimeSeconds));
  const runtime = versions.length
    ? versions[0]?.runtimeSeconds
    : movie.runtimeSeconds;
  const versionLabels = versions.map(movieVersionLabel);
  if (versions.length > 1 && runtimes.size > 1) {
    lines.push("## Versions", "");
    versions.forEach((version, index) => {
      lines.push(
        `- ${inlineText(versionLabels[index] ?? `Version ${index + 1}`)} · ${version.runtimeSeconds === null ? "Duration unknown" : formatTimestamp(version.runtimeSeconds)}`,
      );
    });
    lines.push("");
  } else if (runtime !== null && runtime !== undefined) {
    lines.push(`Duration: ${formatTimestamp(runtime)}`, "");
  }

  lines.push("## Notes", "");
  const sorted = [...notes].sort(
    (a, b) =>
      a.atSeconds - b.atSeconds ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
  sorted.forEach((note, index) => {
    const color = noteColors.find((option) => option.value === note.color);
    const versionIndex = versions.findIndex(
      (version) => version.id === note.mediaId,
    );
    const version = versions[versionIndex];
    const metadata = [
      `**${formatTimestamp(note.atSeconds)}**`,
      color?.label ?? note.color,
      note.rating === null ? null : `${note.rating}/10`,
      versions.length > 1 && version
        ? inlineText(
            versionLabels[versionIndex] ?? `Version ${versionIndex + 1}`,
          )
        : null,
    ].filter(Boolean);
    const prefix = `${index + 1}. `;
    lines.push(`${prefix}${metadata.join(" · ")}`);
    if (note.body) {
      const indent = " ".repeat(prefix.length);
      lines.push(
        "",
        ...note.body
          .replace(/\r\n?/g, "\n")
          .split("\n")
          .map((line) => `${indent}${line}`),
      );
    }
    lines.push("");
  });
  if (!notes.length) lines.push("No notes yet", "");
  return {
    filename: exportFilename(title),
    markdown: `${lines.join("\n").trimEnd()}\n`,
  };
}
