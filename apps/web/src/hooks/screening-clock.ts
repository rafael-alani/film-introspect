import type { ScreeningSession, SubtitleCue } from "@film-introspect/contracts";

export type ClockAnchor = { position: number; at: number; running: boolean };

export function sessionIsFresh(
  session: ScreeningSession,
  now: number,
): boolean {
  const age = now - Date.parse(session.observedAt);
  return (
    Number.isFinite(age) &&
    age >= -5_000 &&
    (session.state === "paused" || age <= 30_000)
  );
}

export function chooseScreeningSession(
  sessions: ScreeningSession[],
  itemId: string,
  cutId: string,
  selectedId: string | null,
  now: number,
): ScreeningSession | undefined {
  const matching = sessions.filter(
    (session) => session.itemId === itemId && session.cutId === cutId,
  );
  if (selectedId !== null)
    return matching.find((session) => session.id === selectedId);
  return matching
    .filter((session) => sessionIsFresh(session, now))
    .sort(
      (a, b) =>
        Number(b.state === "playing") - Number(a.state === "playing") ||
        Date.parse(b.observedAt) - Date.parse(a.observedAt) ||
        a.id.localeCompare(b.id),
    )[0];
}

export function clockPosition(
  anchor: ClockAnchor,
  now: number,
  runtime: number | null,
): number {
  const position =
    anchor.position +
    (anchor.running ? Math.max(0, now - anchor.at) / 1000 : 0);
  return Math.max(0, runtime == null ? position : Math.min(position, runtime));
}

export function parseScreeningTime(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?::[0-5]\d){0,2}(?:\.\d+)?$/.test(trimmed)) return null;
  const seconds = trimmed
    .split(":")
    .reduce((sum, part) => sum * 60 + Number(part), 0);
  return Number.isFinite(seconds) && seconds <= 86400 ? seconds : null;
}

export function cueWindow(
  cues: SubtitleCue[],
  position: number,
): SubtitleCue[] {
  if (!cues.length) return [];
  let active = cues.findIndex(
    (cue) => cue.startSeconds <= position && cue.endSeconds >= position,
  );
  if (active < 0) {
    active = cues.findIndex((cue) => cue.startSeconds > position);
    if (active < 0) active = cues.length - 1;
  }
  return cues.slice(Math.max(0, active - 1), Math.min(cues.length, active + 2));
}

export function notePosition(
  livePosition: number,
  draftPosition: number | null,
): number {
  return draftPosition ?? livePosition;
}

// Jellyfin already advances its reported position; check-in time is only freshness evidence.
export function sessionAnchor(
  session: Pick<ScreeningSession, "positionSeconds" | "state">,
  receivedAt: number,
): ClockAnchor {
  return {
    position: session.positionSeconds,
    at: receivedAt,
    running: session.state === "playing",
  };
}
