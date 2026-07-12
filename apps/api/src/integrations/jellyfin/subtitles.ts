import { type SubtitleCue } from "@film-introspect/contracts";
import { asRecord, readArray, readNumber, readString } from "./types";

function cleanText(value: string): string {
  return value
    .replace(/\\[Nn]/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\\[^}]+}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\r/g, "")
    .trim();
}

export function parseJellyfinSubtitleJson(payload: unknown): SubtitleCue[] {
  const root = asRecord(payload);
  return readArray(root, "TrackEvents")
    .map(asRecord)
    .filter((event): event is NonNullable<typeof event> => event !== null)
    .map((event, index) => {
      const startTicks = readNumber(event, "StartPositionTicks") ?? 0;
      const endTicks = readNumber(event, "EndPositionTicks") ?? startTicks;
      const text = cleanText(readString(event, "Text") ?? "");
      return {
        id: readString(event, "Id") ?? `cue-${index}`,
        startSeconds: Math.max(0, startTicks / 10_000_000),
        endSeconds: Math.max(startTicks, endTicks) / 10_000_000,
        text,
      };
    })
    .filter((cue) => cue.text.length > 0)
    .toSorted((left, right) => left.startSeconds - right.startSeconds);
}

function parseVttTime(value: string): number | null {
  const parts = value.trim().replace(",", ".").split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const seconds = Number(parts.at(-1));
  const minutes = Number(parts.at(-2));
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  if (![seconds, minutes, hours].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function parseVtt(input: string): SubtitleCue[] {
  const blocks = input.replace(/^\uFEFF/, "").split(/\r?\n\r?\n+/);
  const cues: SubtitleCue[] = [];

  for (const [blockIndex, block] of blocks.entries()) {
    const lines = block.split(/\r?\n/).map((line) => line.trimEnd());
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const timing = lines[timingIndex]?.split("-->");
    if (!timing || timing.length !== 2) continue;
    const startSeconds = parseVttTime(timing[0] ?? "");
    const endSeconds = parseVttTime(
      (timing[1] ?? "").trim().split(/\s+/)[0] ?? "",
    );
    if (startSeconds == null || endSeconds == null) continue;
    const text = cleanText(lines.slice(timingIndex + 1).join("\n"));
    if (!text) continue;
    cues.push({
      id: timingIndex > 0 && lines[0] ? lines[0] : `cue-${blockIndex}`,
      startSeconds,
      endSeconds: Math.max(startSeconds, endSeconds),
      text,
    });
  }

  return cues.toSorted((left, right) => left.startSeconds - right.startSeconds);
}
