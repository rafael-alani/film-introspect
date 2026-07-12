import { describe, expect, test } from "bun:test";
import { chooseSession, normalizeSession } from "./types";

const playingSession = (overrides: Record<string, unknown> = {}) => ({
  Id: "session-1",
  UserId: "user-1",
  UserName: "Rafael",
  DeviceId: "tv-1",
  DeviceName: "Living room",
  Client: "Jellyfin Android TV",
  IsActive: true,
  SupportsRemoteControl: true,
  LastActivityDate: "2026-07-11T09:00:00.000Z",
  PlayState: {
    PositionTicks: 1_234_500_000,
    IsPaused: false,
    MediaSourceId: "source-extended",
    SubtitleStreamIndex: 7,
  },
  NowPlayingItem: {
    Id: "item-1",
    Name: "Arrival",
    Type: "Movie",
    ProductionYear: 2016,
    RunTimeTicks: 6_960_000_000,
    ProviderIds: { Imdb: "tt2543164" },
  },
  ...overrides,
});

describe("Jellyfin session normalization", () => {
  test("converts ticks and retains media-source identity", () => {
    const normalized = normalizeSession(playingSession());
    expect(normalized.positionSeconds).toBe(123.45);
    expect(normalized.mediaSourceId).toBe("source-extended");
    expect(normalized.subtitleStreamIndex).toBe(7);
    expect(normalized.media).toMatchObject({
      jellyfinItemId: "item-1",
      mediaSourceId: "source-extended",
      title: "Arrival",
      runtimeSeconds: 696,
      runtimeSource: "jellyfin",
    });
  });

  test("handles camelCase profiles and paused state", () => {
    const normalized = normalizeSession({
      id: "session-2",
      deviceId: "phone",
      isActive: true,
      playState: { positionTicks: 20_000_000, isPaused: true },
      nowPlayingItem: { id: "episode-1", name: "Pilot", type: "Episode" },
    });
    expect(normalized.session.id).toBe("session-2");
    expect(normalized.isPaused).toBe(true);
    expect(normalized.positionSeconds).toBe(2);
    expect(normalized.media?.kind).toBe("episode");
  });

  test("selects the configured device before recency", () => {
    const sessions = [
      normalizeSession(playingSession()),
      normalizeSession(
        playingSession({
          Id: "session-2",
          DeviceId: "phone",
          LastActivityDate: "2026-07-11T10:00:00.000Z",
        }),
      ),
    ];
    expect(
      chooseSession(sessions, {
        preferredDeviceId: "tv-1",
        preferredJellyfinUserId: null,
      })?.session.id,
    ).toBe("session-1");
  });

  test("ignores idle sessions", () => {
    const idle = normalizeSession({
      Id: "idle",
      DeviceId: "browser",
      IsActive: true,
    });
    expect(
      chooseSession([idle], {
        preferredDeviceId: null,
        preferredJellyfinUserId: null,
      }),
    ).toBeNull();
  });

  test("does not fall through to another device when the selected device is idle", () => {
    const idle = normalizeSession({
      Id: "selected-idle",
      DeviceId: "selected-tv",
      IsActive: true,
    });
    const otherPlaying = normalizeSession(
      playingSession({ DeviceId: "other-tv" }),
    );
    expect(
      chooseSession([idle, otherPlaying], {
        preferredDeviceId: "selected-tv",
        preferredJellyfinUserId: null,
      }),
    ).toBeNull();
  });
});
