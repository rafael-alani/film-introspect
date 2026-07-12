import { describe, expect, test } from "bun:test";
import { parseJellyfinSubtitleJson, parseVtt } from "./subtitles";

describe("Jellyfin subtitles", () => {
  test("parses and sanitizes Jellyfin JSON track events", () => {
    expect(
      parseJellyfinSubtitleJson({
        TrackEvents: [
          {
            Id: "42",
            Text: "<i>Wake up</i>, Neo...<br>Now.",
            StartPositionTicks: 612_300_000,
            EndPositionTicks: 638_000_000,
          },
        ],
      }),
    ).toEqual([
      {
        id: "42",
        text: "Wake up, Neo...\nNow.",
        startSeconds: 61.23,
        endSeconds: 63.8,
      },
    ]);
  });

  test("accepts camelCase JSON responses", () => {
    expect(
      parseJellyfinSubtitleJson({
        trackEvents: [
          {
            id: "1",
            text: "A line",
            startPositionTicks: 10_000_000,
            endPositionTicks: 20_000_000,
          },
        ],
      })[0],
    ).toMatchObject({
      id: "1",
      startSeconds: 1,
      endSeconds: 2,
      text: "A line",
    });
  });

  test("normalizes ASS line breaks and styling", () => {
    expect(
      parseJellyfinSubtitleJson({
        TrackEvents: [
          {
            Id: "ass",
            Text: "{\\an8}{\\i1}First\\Nsecond{\\i0}",
            StartPositionTicks: 0,
            EndPositionTicks: 10_000_000,
          },
        ],
      })[0]?.text,
    ).toBe("First\nsecond");
  });

  test("parses WebVTT fallback with cue settings", () => {
    const cues = parseVtt(`WEBVTT

intro
00:01.250 --> 00:03.500 align:center
<c.yellow>Hello &amp; welcome</c>

00:04:05.000 --> 00:04:07.100
Second line`);

    expect(cues).toEqual([
      {
        id: "intro",
        startSeconds: 1.25,
        endSeconds: 3.5,
        text: "Hello & welcome",
      },
      {
        id: "cue-2",
        startSeconds: 245,
        endSeconds: 247.1,
        text: "Second line",
      },
    ]);
  });

  test("drops malformed and empty cues", () => {
    expect(parseVtt("WEBVTT\n\nnot a cue\n\n00:01.000 --> nope\nText")).toEqual(
      [],
    );
  });
});
