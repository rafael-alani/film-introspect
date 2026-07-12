import {
  playbackSnapshotSchema,
  type PlaybackSnapshot,
} from "@film-introspect/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, apiBaseUrl } from "../api/client";

type PlaybackBaseline = {
  snapshot: PlaybackSnapshot;
  receivedAt: number;
};

export function usePlayback() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["playback"],
    queryFn: api.playback,
    refetchInterval: 15_000,
    retry: 2,
  });
  const [streamConnected, setStreamConnected] = useState(false);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const baselineRef = useRef<PlaybackBaseline | null>(null);

  useEffect(() => {
    if (!query.data) return;
    baselineRef.current = {
      snapshot: query.data,
      receivedAt: performance.now(),
    };
    setPositionSeconds(query.data.positionSeconds);
  }, [query.data]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const baseline = baselineRef.current;
      if (!baseline) return;
      const elapsed =
        baseline.snapshot.state === "playing"
          ? (performance.now() - baseline.receivedAt) / 1000
          : 0;
      const duration = baseline.snapshot.media?.runtimeSeconds;
      const next = baseline.snapshot.positionSeconds + elapsed;
      setPositionSeconds(
        duration === null || duration === undefined
          ? next
          : Math.min(next, duration),
      );
    }, 250);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const source = new EventSource(`${apiBaseUrl}/api/playback/events`, {
      withCredentials: true,
    });

    const acceptSnapshot = (event: MessageEvent<string>) => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const parsed = playbackSnapshotSchema.safeParse(payload);
      if (!parsed.success) return;
      baselineRef.current = {
        snapshot: parsed.data,
        receivedAt: performance.now(),
      };
      setPositionSeconds(parsed.data.positionSeconds);
      queryClient.setQueryData(["playback"], parsed.data);
    };

    source.onopen = () => setStreamConnected(true);
    source.onerror = () => setStreamConnected(false);
    source.onmessage = acceptSnapshot;
    source.addEventListener("playback", acceptSnapshot as EventListener);
    source.addEventListener("snapshot", acceptSnapshot as EventListener);

    return () => {
      source.close();
      setStreamConnected(false);
    };
  }, [queryClient]);

  return {
    snapshot: query.data ?? null,
    positionSeconds,
    streamConnected,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
