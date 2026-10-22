import { describe, expect, test } from "bun:test";
import {
  clockPosition,
  cueWindow,
  notePosition,
  parseScreeningTime,
  sessionAnchor,
  chooseScreeningSession,
  sessionIsFresh,
} from "../apps/web/src/hooks/screening-clock";
import type { ScreeningSession } from "@film-introspect/contracts";

test("defaults to a fresh playing device for the exact cut and preserves an explicit device", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const session: ScreeningSession = {
    id: "tv",
    itemId: "film",
    cutId: "cut",
    deviceName: "TV",
    state: "playing",
    positionSeconds: 100,
    observedAt: new Date(now - 1000).toISOString(),
  };
  const paused: ScreeningSession = {
    ...session,
    id: "paused",
    state: "paused",
    observedAt: new Date(now - 600_000).toISOString(),
  };
  const stale = {
    ...session,
    id: "stale",
    observedAt: new Date(now - 31_000).toISOString(),
  };
  const sessions = [
    paused,
    stale,
    { ...session, id: "other-cut", cutId: "other" },
    { ...session, id: "other-film", itemId: "other" },
    session,
  ];
  expect(chooseScreeningSession(sessions, "film", "cut", null, now)?.id).toBe(
    "tv",
  );
  expect(
    chooseScreeningSession(sessions, "film", "cut", "paused", now)?.id,
  ).toBe("paused");
  expect(
    chooseScreeningSession(sessions, "film", "cut", "disconnected", now),
  ).toBeUndefined();
  expect(
    chooseScreeningSession([stale], "film", "cut", null, now),
  ).toBeUndefined();
  expect(sessionIsFresh(paused, now)).toBe(true);
  expect(
    sessionIsFresh(
      { ...session, observedAt: new Date(now + 6000).toISOString() },
      now,
    ),
  ).toBe(false);
  expect(
    chooseScreeningSession(
      [
        session,
        { ...session, id: "newer", observedAt: new Date(now).toISOString() },
      ],
      "film",
      "cut",
      null,
      now,
    )?.id,
  ).toBe("newer");
});

describe("screening clock and held notes", () => {
  test("holds the scene while the film advances, then catches up without pausing", () => {
    const anchor = { position: 120, at: 1000, running: true };
    const draft = clockPosition(anchor, 6000, 500);
    const live = clockPosition(anchor, 16000, 500);
    expect(draft).toBe(125);
    expect(live).toBe(135);
    expect(notePosition(live, draft)).toBe(125);
    expect(notePosition(live, null)).toBe(135);
    expect(anchor.running).toBe(true);
  });
  test("pause, seek anchors, runtime and clock rollback stay bounded", () => {
    expect(
      clockPosition({ position: 10, at: 1000, running: false }, 9000, null),
    ).toBe(10);
    expect(
      clockPosition({ position: 90, at: 1000, running: true }, 21000, 100),
    ).toBe(100);
    expect(
      clockPosition({ position: 5, at: 1000, running: true }, 0, null),
    ).toBe(5);
  });
  test("parses explicit film times and refuses malformed anchors", () => {
    expect(parseScreeningTime("1:02:03.5")).toBe(3723.5);
    expect(parseScreeningTime("12:34")).toBe(754);
    expect(parseScreeningTime("0:00")).toBe(0);
    for (const value of ["", "-1", "1:90", "1:2", "0:00x", "999999"])
      expect(parseScreeningTime(value)).toBeNull();
  });
  test("held and live subtitle windows are independent", () => {
    const cues = Array.from({ length: 8 }, (_, id) => ({
      id: String(id),
      startSeconds: id * 10,
      endSeconds: id * 10 + 5,
      text: `Line ${id}`,
    }));
    expect(cueWindow(cues, 12).map((cue) => cue.id)).toEqual(["0", "1", "2"]);
    expect(cueWindow(cues, 52).map((cue) => cue.id)).toEqual(["4", "5", "6"]);
    expect(cueWindow([], 10)).toEqual([]);
  });
});

test("a newer Jellyfin position does not add elapsed check-in time twice", () => {
  const sample = {
    positionSeconds: 128,
    state: "playing" as const,
    observedAt: "2026-10-21T12:00:00.000Z",
  };
  const receivedAt = 8_000;
  const anchor = sessionAnchor(sample, receivedAt);
  expect(clockPosition(anchor, receivedAt, null)).toBe(128);
  expect(clockPosition(anchor, receivedAt + 3_000, null)).toBe(131);
  const next = sessionAnchor(
    { ...sample, positionSeconds: 130 },
    receivedAt + 2_000,
  );
  expect(clockPosition(next, receivedAt + 2_000, null)).toBe(130);
});
