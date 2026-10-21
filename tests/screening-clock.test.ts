import { describe, expect, test } from "bun:test";
import {
  clockPosition,
  cueWindow,
  notePosition,
  parseScreeningTime,
} from "../apps/web/src/hooks/screening-clock";

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
