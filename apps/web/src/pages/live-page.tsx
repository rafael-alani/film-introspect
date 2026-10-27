import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Progress,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconEdit,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  formatTimestamp,
  momentRatings,
  noteColors,
  type CreateNoteInput,
  type Note,
  type UpdateNoteInput,
  type ScreeningCut,
  type ScreeningMovie,
  type ScreeningSession,
} from "@film-introspect/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../api/client";
import { MomentControls, MomentGuide } from "../components/moment-controls";
import {
  clockPosition,
  cueWindow,
  notePosition,
  parseScreeningTime,
  sessionAnchor,
  sessionIsFresh,
  chooseScreeningSession,
  type ClockAnchor,
} from "../hooks/screening-clock";

function TimedNote({
  note,
  position,
  lead,
  trail,
  onUpdate,
  onDelete,
  pending,
}: {
  note: Note;
  position: number;
  lead: number;
  trail: number;
  onUpdate: (note: Note, input: UpdateNoteInput) => Promise<unknown>;
  onDelete: (note: Note) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const isNear =
    note.atSeconds >= position - trail && note.atSeconds <= position + lead;
  const saveChanges = (input: UpdateNoteInput) => {
    void onUpdate(note, { ...(editing ? { body: body.trim() } : {}), ...input })
      .then(() => setEditing(false))
      .catch(() => {});
  };

  return (
    <article
      className={`timed-note note-${note.color}${isNear ? " active" : ""}`}
    >
      <div className="note-time">
        <span className={`note-dot note-${note.color}`} />
        {formatTimestamp(note.atSeconds)}
      </div>
      <div className="note-body">
        {editing ? (
          <Textarea
            aria-label="Edit note"
            autosize
            minRows={2}
            maxRows={8}
            value={body}
            maxLength={2000}
            disabled={pending}
            onChange={(event) => setBody(event.currentTarget.value)}
          />
        ) : (
          <>
            {note.body && <Text>{note.body}</Text>}
            <Text size="sm" c="dimmed">
              {noteColors.find((item) => item.value === note.color)?.label}
              {note.rating !== null &&
                ` · ${note.rating}/10 ${momentRatings.find((item) => item.value === note.rating)?.label}`}
            </Text>
          </>
        )}
        <MomentControls
          color={note.color}
          rating={note.rating}
          disabled={pending}
          onColor={(color) => saveChanges({ color })}
          onRating={(rating) => saveChanges({ rating })}
        />
        {note.rating !== null && (
          <Button
            variant="subtle"
            size="compact-sm"
            color="gray"
            disabled={pending}
            onClick={() => saveChanges({ rating: null })}
          >
            Clear rating
          </Button>
        )}
      </div>
      <div className="note-actions">
        {editing ? (
          <>
            <Tooltip label="Save changes">
              <ActionIcon
                variant="subtle"
                color="green"
                disabled={pending}
                onClick={() => saveChanges({ body: body.trim() })}
                aria-label="Save changes"
              >
                <IconCheck size={16} />
              </ActionIcon>
            </Tooltip>
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={pending}
              onClick={() => {
                setBody(note.body);
                setEditing(false);
              }}
              aria-label="Cancel editing"
            >
              <IconX size={16} />
            </ActionIcon>
          </>
        ) : (
          <>
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={pending}
              onClick={() => {
                setBody(note.body);
                setEditing(true);
              }}
              aria-label="Edit note"
            >
              <IconEdit size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => onDelete(note)}
              loading={pending}
              aria-label="Delete note"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </>
        )}
      </div>
    </article>
  );
}

export function LivePage() {
  const jellyfin = useQuery({
    queryKey: ["jellyfin-settings"],
    queryFn: api.jellyfinSettings,
  });
  const [chosenSource, setSource] = useState<"external" | "jellyfin" | null>(
    null,
  );
  const source =
    chosenSource ?? (jellyfin.data?.configured ? "jellyfin" : "external");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [movieId, setMovieId] = useState<string | null>(null);
  const [cutId, setCutId] = useState<string | null>(null);
  const [screening, setScreening] = useState<{
    movie: ScreeningMovie;
    cut: ScreeningCut;
    initialSessionId?: string;
  } | null>(null);
  const nowPlaying = useQuery({
    queryKey: ["screening-now-playing", jellyfin.data?.url],
    queryFn: () => api.screeningSessions(undefined, "jellyfin"),
    enabled: !!jellyfin.data?.configured && !screening,
    refetchInterval: 2000,
    retry: 1,
  });
  const activeSessions = (nowPlaying.data?.data ?? []).filter((session) =>
    sessionIsFresh(session, Date.now()),
  );
  const followPlaying = useMutation({
    mutationFn: async (session: ScreeningSession) => {
      const { data: movie } = await api.screeningMovie(
        session.itemId,
        "jellyfin",
      );
      const cut = movie.cuts.find((cut) => cut.id === session.cutId);
      if (!cut)
        throw new Error(
          "This player has not identified an available media version. Choose the film and version below.",
        );
      return { movie, cut, initialSessionId: session.id };
    },
    onSuccess: (selection) => {
      setSource("jellyfin");
      setScreening(selection);
    },
  });
  const movies = useQuery({
    queryKey: ["screening-movies", source, jellyfin.data?.url, query],
    queryFn: () => api.screeningMovies(query, source),
    enabled: query.length > 0 && (!jellyfin.isPending || chosenSource !== null),
    retry: 1,
  });
  const movie = useQuery({
    queryKey: ["screening-movie", source, jellyfin.data?.url, movieId],
    queryFn: () => api.screeningMovie(movieId!, source),
    enabled: !!movieId,
    retry: 1,
  });
  const currentSearch = query.length > 0 && query === search.trim();
  const showResults = currentSearch && !movies.isFetching && !movies.isError;
  const selectedMovie = showResults
    ? movies.data?.data.find((item) => item.id === movieId)
    : undefined;
  const detail = movie.data?.data.id === movieId ? movie.data.data : undefined;
  const cuts = detail?.cuts ?? [];
  const selectedCut =
    cuts.find((cut) => cut.id === cutId) ??
    (cuts.length === 1 ? cuts[0] : undefined);

  if (screening)
    return (
      <Screening
        key={`${screening.movie.id}:${screening.cut.id}`}
        {...screening}
        serverName={
          source === "jellyfin"
            ? (jellyfin.data?.serverName ?? "Jellyfin")
            : null
        }
        sourceKey={
          source === "jellyfin"
            ? (jellyfin.data?.url ?? "jellyfin")
            : "external"
        }
        onLeave={() => setScreening(null)}
      />
    );

  return (
    <div className="page live-page screening-page">
      <header className="page-heading">
        <div>
          <Title order={1}>Keep watching.</Title>
          <Text c="dimmed" mt="sm">
            Watch on any screen. Catch a thought without stopping the film.
          </Text>
        </div>
      </header>
      {jellyfin.data?.configured && (
        <section
          className="screening-now-playing"
          aria-label="Now playing on Jellyfin"
        >
          <Title order={2}>
            Now playing on {jellyfin.data.serverName ?? "Jellyfin"}
          </Title>
          {nowPlaying.isPending && (
            <Text c="dimmed" role="status">
              Checking your players…
            </Text>
          )}
          {nowPlaying.isError ? (
            <Text role="alert" className="form-error">
              Could not check your players. {errorMessage(nowPlaying.error)}{" "}
              <Button
                variant="subtle"
                onClick={() => void nowPlaying.refetch()}
              >
                Try again
              </Button>
            </Text>
          ) : activeSessions.length ? (
            activeSessions.map((session) => (
              <Group
                key={session.id}
                className="screening-active-session"
                justify="space-between"
              >
                <div>
                  <Text fw={650}>{session.title ?? "Jellyfin playback"}</Text>
                  <Text size="sm" c="dimmed">
                    {session.deviceName} ·{" "}
                    {session.state === "paused" ? "Paused" : "Playing"} ·{" "}
                    {formatTimestamp(session.positionSeconds)}
                    {session.runtimeSeconds != null &&
                      ` / ${formatTimestamp(session.runtimeSeconds)}`}
                  </Text>
                  {!session.cutId && (
                    <Text size="sm" c="dimmed">
                      Waiting for the player to identify its media version.
                    </Text>
                  )}
                </div>
                <Button
                  variant="default"
                  loading={
                    followPlaying.isPending &&
                    followPlaying.variables?.id === session.id
                  }
                  disabled={!session.cutId || followPlaying.isPending}
                  onClick={() => followPlaying.mutate(session)}
                  aria-label={`Follow ${session.title ?? "playback"} on ${session.deviceName}`}
                >
                  Follow playback
                </Button>
              </Group>
            ))
          ) : (
            !nowPlaying.isPending && (
              <Text c="dimmed" size="sm">
                Nothing is playing right now. Start a film on Jellyfin and it
                will appear here.
              </Text>
            )
          )}
          {followPlaying.isError && (
            <Text role="alert" className="form-error">
              {errorMessage(followPlaying.error)}
            </Text>
          )}
        </section>
      )}
      <Stack gap="xs" mb="lg">
        <Select
          label="Where are you watching?"
          value={source}
          allowDeselect={false}
          data={[
            {
              value: "external",
              label: "Any screen · cinema or another player",
            },
            ...(jellyfin.data?.configured
              ? [
                  {
                    value: "jellyfin",
                    label: jellyfin.data.serverName ?? "Jellyfin",
                  },
                ]
              : []),
          ]}
          onChange={(value) => {
            setSource(value === "jellyfin" ? "jellyfin" : "external");
            setMovieId(null);
            setCutId(null);
            followPlaying.reset();
          }}
        />
        <Text size="sm" c="dimmed">
          {source === "jellyfin"
            ? `Browse ${jellyfin.data?.serverName ?? "Jellyfin"}. Subtitles come from your selected media version; playback can follow your device.`
            : "Find a matching subtitle release and align it with the film on screen."}{" "}
          {jellyfin.isSuccess && !jellyfin.data.configured && (
            <a href="/settings">Connect Jellyfin in Settings</a>
          )}
        </Text>
        {jellyfin.isPending && (
          <Text size="sm" c="dimmed" role="status">
            Loading your Jellyfin connection… You can use Any screen meanwhile.
          </Text>
        )}
        {jellyfin.isError && (
          <div role="alert">
            <Text size="sm">
              Could not load your Jellyfin connection. Try again to see your
              saved server. Any screen is still available.
            </Text>
            <Button
              variant="subtle"
              size="sm"
              loading={jellyfin.isFetching}
              onClick={() => void jellyfin.refetch()}
            >
              Retry connection
            </Button>
          </div>
        )}
      </Stack>
      <form
        className="screening-search"
        onSubmit={(event) => {
          event.preventDefault();
          setMovieId(null);
          setCutId(null);
          if (search.trim() === query) void movies.refetch();
          else setQuery(search.trim());
        }}
      >
        <TextInput
          label={
            source === "jellyfin"
              ? `Find a film on ${jellyfin.data?.serverName ?? "Jellyfin"}`
              : "Find a film for any screen"
          }
          placeholder="Movie title"
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setMovieId(null);
            setCutId(null);
          }}
          maxLength={200}
          leftSection={<IconSearch size={18} />}
        />
        <Button
          type="submit"
          loading={currentSearch && movies.isFetching}
          disabled={!search.trim()}
        >
          Search films
        </Button>
      </form>
      {!query && (
        <Text c="dimmed" mt="lg">
          {source === "jellyfin"
            ? "Search the films available on your Jellyfin server."
            : "Search for a film and a matching subtitle release for the screen you are watching."}
        </Text>
      )}
      {currentSearch && movies.isFetching && (
        <Group mt="xl" role="status" aria-live="polite">
          <Loader size="sm" />
          <Text c="dimmed">
            {source === "jellyfin"
              ? "Searching your Jellyfin library…"
              : "Searching film metadata…"}
          </Text>
        </Group>
      )}
      {currentSearch && movies.isError && !movies.isFetching && (
        <Text role="alert" className="form-error" mt="lg">
          {errorMessage(movies.error)}{" "}
          <Button variant="subtle" onClick={() => void movies.refetch()}>
            Try again
          </Button>
        </Text>
      )}
      {showResults && movies.data?.data.length === 0 && (
        <Text c="dimmed" mt="xl">
          {source === "jellyfin"
            ? "No matching film in your Jellyfin library. Try another title, or choose Any screen to search online."
            : "No matching film found. Try another spelling or title."}
        </Text>
      )}
      <div className="screening-results">
        {showResults &&
          movies.data?.data.map((item) => (
            <button
              className={`screening-result${item.id === movieId ? " selected" : ""}`}
              key={item.id}
              onClick={() => {
                setMovieId(item.id);
                setCutId(null);
              }}
              aria-pressed={item.id === movieId}
            >
              <span>{item.title}</span>
              <span>
                {[
                  item.year,
                  item.runtimeSeconds
                    ? `${Math.round(item.runtimeSeconds / 60)} min`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          ))}
      </div>
      {selectedMovie && (
        <section className="screening-selection" aria-label="Choose your cut">
          <Title order={2}>{detail?.title ?? selectedMovie.title}</Title>
          <Text size="sm" mt="sm">
            {source === "jellyfin"
              ? `From ${jellyfin.data?.serverName ?? "Jellyfin"} · exact media versions · device sync option`
              : "Any screen · choose a subtitle version and align manually"}
          </Text>
          {(detail?.overview ?? selectedMovie.overview) && (
            <Text c="dimmed" maw="65ch" mt="sm">
              {detail?.overview ?? selectedMovie.overview}
            </Text>
          )}
          {movie.isFetching && (
            <Group mt="md" role="status" aria-live="polite">
              <Loader size="sm" />
              <Text c="dimmed">Meta Egg is finding subtitle versions…</Text>
            </Group>
          )}
          {movie.isError && !movie.isFetching && (
            <Text role="alert" className="form-error">
              {errorMessage(movie.error)}{" "}
              <Button variant="subtle" onClick={() => void movie.refetch()}>
                Try again
              </Button>
            </Text>
          )}
          {detail && !movie.isFetching && !movie.isError && (
            <Stack gap="md" mt="md">
              {detail.savedAt && (
                <Text size="sm" c="dimmed" role="status">
                  Saved in Meta Egg
                </Text>
              )}
              {detail.transcriptStatus &&
                detail.transcriptStatus.state !== "ready" && (
                  <Text role="status" c="dimmed">
                    {detail.transcriptStatus.message}{" "}
                    <Button
                      variant="subtle"
                      onClick={() => void movie.refetch()}
                    >
                      Retry subtitle search
                    </Button>
                  </Text>
                )}
              <Select
                label={
                  source === "jellyfin"
                    ? "Media version on your server"
                    : "Cut / subtitle version"
                }
                placeholder="Choose the version you are watching"
                value={selectedCut?.id ?? null}
                onChange={setCutId}
                disabled={cuts.length === 0}
                data={cuts.map((cut) => ({
                  value: cut.id,
                  label: `${cut.label}${cut.runtimeSeconds ? ` · ${Math.round(cut.runtimeSeconds / 60)} min` : ""}`,
                }))}
              />
              <Text size="sm" c="dimmed">
                Match the version on screen. Different cuts have separate
                subtitle timing and notes; runtimes are never stretched.
              </Text>
              {cuts.length === 0 && !detail.transcriptStatus && (
                <Text className="form-error">
                  Meta Egg found the film, but no subtitle version is available.
                </Text>
              )}
              {selectedCut &&
                !selectedCut.subtitles.some((track) => track.available) && (
                  <Text c="dimmed">
                    {selectedCut.subtitles.length
                      ? "This version has image subtitles. You can still follow playback and take notes; a text transcript is unavailable here."
                      : "This version has no subtitle tracks. You can still sync the clock and take notes."}
                  </Text>
                )}
              <Button
                disabled={!selectedCut}
                onClick={() => {
                  if (selectedCut)
                    setScreening({ movie: detail, cut: selectedCut });
                }}
                style={{ alignSelf: "flex-start" }}
              >
                Open screening
              </Button>
            </Stack>
          )}
        </section>
      )}
    </div>
  );
}

function Screening({
  movie,
  cut,
  onLeave,
  serverName,
  sourceKey,
  initialSessionId,
}: {
  movie: ScreeningMovie;
  cut: ScreeningCut;
  onLeave: () => void;
  serverName: string | null;
  sourceKey: string;
  initialSessionId?: string;
}) {
  const queryClient = useQueryClient();
  const [trackIndex, setTrackIndex] = useState<string | null>(() => {
    const tracks = cut.subtitles.filter((track) => track.available);
    return String(
      (
        tracks.find((track) => ["eng", "en"].includes(track.language ?? "")) ??
        tracks[0]
      )?.index ?? "",
    );
  });
  const hasTextTrack = trackIndex !== null && trackIndex !== "";
  const source = movie.provider === "jellyfin" ? "jellyfin" : "external";
  const [mode, setMode] = useState(
    movie.provider === "jellyfin" ? "jellyfin" : "manual",
  );
  const [sessionId, setSessionId] = useState<string | null>(
    initialSessionId ?? null,
  );
  const [anchor, setAnchor] = useState<ClockAnchor>({
    position: 0,
    at: performance.now(),
    running: false,
  });
  const [now, setNow] = useState(performance.now());
  const [syncTime, setSyncTime] = useState("0:00");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [cueSearch, setCueSearch] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [draftPosition, setDraftPosition] = useState<number | null>(null);
  const [draftMark, setDraftMark] = useState<Pick<
    CreateNoteInput,
    "color" | "rating"
  > | null>(null);
  const saving = useRef(false);
  const hasDraft = !!noteBody.trim() || draftMark !== null;
  const [feedback, setFeedback] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const timeline = useQuery({
    queryKey: ["screening-timeline", sourceKey, movie.id, cut.id],
    queryFn: () => api.screeningTimeline(movie.id, cut.id, source),
    retry: 1,
  });
  const mediaId = timeline.data?.id;
  const transcript = useQuery({
    queryKey: ["screening-transcript", sourceKey, movie.id, cut.id, trackIndex],
    queryFn: () =>
      api.screeningTranscript(movie.id, cut.id, Number(trackIndex), source),
    enabled: hasTextTrack,
    retry: 1,
    staleTime: 60_000,
  });
  const sessions = useQuery({
    queryKey: ["screening-sessions", sourceKey, movie.id],
    queryFn: () => api.screeningSessions(movie.id, source),
    enabled: movie.provider === "jellyfin" && mode === "jellyfin",
    refetchInterval: 2000,
    retry: 1,
  });
  const matchingSessions = (sessions.data?.data ?? []).filter(
    (session) => session.itemId === movie.id && session.cutId === cut.id,
  );
  const selectedSession = chooseScreeningSession(
    matchingSessions,
    movie.id,
    cut.id,
    sessionId,
    Date.now(),
  );
  useEffect(() => {
    if (mode === "jellyfin" && sessionId === null && selectedSession)
      setSessionId(selectedSession.id);
  }, [mode, sessionId, selectedSession?.id]);
  const notes = useQuery({
    queryKey: ["notes", mediaId],
    queryFn: () => api.notes(mediaId!),
    enabled: !!mediaId,
  });
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const runtime = cut.runtimeSeconds;
  const position = Math.max(
    0,
    Math.min(runtime ?? Infinity, clockPosition(anchor, now, runtime) + offset),
  );
  const displayPosition = notePosition(position, draftPosition);
  const cues = transcript.data?.data.cues ?? [];
  const provenance =
    transcript.data?.data.provenance ??
    (movie.provider === "discovery" ? undefined : movie.provenance);
  const visibleCues = cueWindow(cues, displayPosition);
  const stale =
    mode === "jellyfin" &&
    sessionId !== null &&
    !sessions.isPending &&
    (!selectedSession ||
      sessions.isError ||
      Date.now() - sessions.dataUpdatedAt > 10_000 ||
      !sessionIsFresh(selectedSession, Date.now()));
  const canNote =
    !!mediaId &&
    (mode === "manual" ? anchor.running : !!selectedSession && !stale);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(tick);
  }, []);
  useEffect(() => {
    if (mode !== "jellyfin" || !selectedSession) return;
    setAnchor(sessionAnchor(selectedSession, performance.now()));
    setNow(performance.now());
  }, [
    mode,
    selectedSession?.id,
    selectedSession?.positionSeconds,
    selectedSession?.state,
    selectedSession?.observedAt,
  ]);
  useBlocker({
    shouldBlockFn: () =>
      hasDraft &&
      !window.confirm("Discard this unsaved note and leave the screening?"),
    enableBeforeUnload: hasDraft,
  });

  const invalidateNotes = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notes", mediaId] }),
      queryClient.invalidateQueries({ queryKey: ["media"] }),
    ]);
  const createNote = useMutation({
    mutationFn: (input: CreateNoteInput) => api.createNote(mediaId!, input),
    onSuccess: async () => {
      setNoteBody("");
      setDraftPosition(null);
      setDraftMark(null);
      textarea.current?.blur();
      setFeedback(
        cues.length
          ? "Saved. Subtitles caught up to the film."
          : "Saved. Back at the current film time.",
      );
      await invalidateNotes();
    },
    onError: (cause) => setFeedback(errorMessage(cause)),
    onSettled: () => {
      saving.current = false;
    },
  });
  const updateNote = useMutation({
    mutationFn: ({ note, input }: { note: Note; input: UpdateNoteInput }) =>
      api.updateNote(note.id, input),
    onSuccess: invalidateNotes,
    onError: (cause) => setFeedback(errorMessage(cause)),
  });
  const deleteNote = useMutation({
    mutationFn: (note: Note) => api.deleteNote(note.id),
    onSuccess: invalidateNotes,
    onError: (cause) => setFeedback(errorMessage(cause)),
  });
  const sync = (seconds: number) => {
    setAnchor({ position: seconds, at: performance.now(), running: true });
    setNow(performance.now());
    setOffset(0);
    setSyncError(null);
  };
  const beginNote = () => {
    if (draftPosition === null && canNote) {
      setDraftPosition(position);
      setFeedback(null);
    }
  };
  const saveMoment = (mark?: Pick<CreateNoteInput, "color" | "rating">) => {
    if (!mediaId || saving.current || (!canNote && draftPosition === null))
      return;
    const selected = mark ?? draftMark;
    if (!selected && !noteBody.trim()) return;
    const captured =
      draftPosition ??
      Math.max(
        0,
        Math.min(
          runtime ?? Infinity,
          clockPosition(anchor, performance.now(), runtime) + offset,
        ),
      );
    const input = {
      atSeconds: Math.floor(captured),
      body: noteBody,
      color: selected?.color ?? settings.data?.defaultNoteColor ?? "amber",
      rating: selected?.rating ?? null,
    };
    saving.current = true;
    setDraftPosition(captured);
    setDraftMark({ color: input.color, rating: input.rating });
    setFeedback(null);
    createNote.mutate(input);
  };
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    saveMoment();
  };

  return (
    <div className="page live-page screening-page">
      <header className="screening-heading">
        <div>
          <Title order={1}>{movie.title}</Title>
          <Text c="dimmed" size="sm">
            {[
              serverName,
              movie.year,
              cut.label,
              runtime ? `${Math.round(runtime / 60)} min` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </div>
        <Button
          variant="subtle"
          color="gray"
          onClick={() => {
            if (
              !hasDraft ||
              window.confirm(
                "Discard this unsaved note and choose another film?",
              )
            )
              onLeave();
          }}
          disabled={createNote.isPending}
        >
          Change film
        </Button>
      </header>
      {cut.referenceVideoUrl && (
        <Text size="sm" mb="md">
          <Anchor
            href={cut.referenceVideoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {cut.referenceVideoLabel ?? "Watch reference film"}
          </Anchor>{" "}
          · opens separately; keep Introspect on your second screen.
        </Text>
      )}
      {cut.matchingNotes && (
        <Text size="sm" c="dimmed" mb="md">
          {cut.matchingNotes}
        </Text>
      )}
      <details
        className="screening-sync"
        open={!anchor.running && !selectedSession}
      >
        <summary>Sync with the screen</summary>
        <Stack gap="md" mt="md">
          {movie.provider === "jellyfin" ? (
            <Select
              label="Screening clock"
              data={[
                { value: "manual", label: "External screen — set the clock" },
                {
                  value: "jellyfin",
                  label: `Follow a device on ${serverName ?? "Jellyfin"}`,
                },
              ]}
              value={mode}
              disabled={draftPosition !== null}
              onChange={(value) => {
                setMode(value ?? "manual");
                setAnchor({ position, at: performance.now(), running: false });
                setOffset(0);
              }}
            />
          ) : (
            <Text size="sm" c="dimmed">
              Use the clock or a line of dialogue to align with a cinema, a
              friend's screen, or any player. Introspect does not connect to or
              control that screen.
            </Text>
          )}
          {mode === "manual" ? (
            <>
              <form
                className="screening-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  const seconds = parseScreeningTime(syncTime);
                  if (
                    seconds === null ||
                    (runtime !== null && seconds > runtime)
                  )
                    setSyncError(
                      "Enter a time inside this cut, such as 12:34 or 1:12:34.",
                    );
                  else sync(seconds);
                }}
              >
                <TextInput
                  label="Film time on screen"
                  description="Set the film's current time, then tap Sync now at that moment."
                  value={syncTime}
                  onChange={(event) => setSyncTime(event.currentTarget.value)}
                  placeholder="0:00"
                  error={syncError}
                  disabled={draftPosition !== null}
                />
                <Button type="submit" disabled={draftPosition !== null}>
                  Sync now
                </Button>
              </form>
              <details>
                <summary>Sync to a line of dialogue</summary>
                <TextInput
                  mt="sm"
                  label="Find a line you can hear"
                  value={cueSearch}
                  onChange={(event) => setCueSearch(event.currentTarget.value)}
                  placeholder="A few words from the film"
                />
                <div className="cue-matches">
                  {cueSearch.trim().length >= 2 &&
                    cues
                      .filter((cue) =>
                        cue.text
                          .toLowerCase()
                          .includes(cueSearch.toLowerCase()),
                      )
                      .slice(0, 8)
                      .map((cue) => (
                        <Button
                          key={cue.id}
                          variant="subtle"
                          color="gray"
                          disabled={draftPosition !== null}
                          onClick={() => sync(cue.startSeconds)}
                        >
                          {formatTimestamp(cue.startSeconds)} · {cue.text}
                        </Button>
                      ))}
                </div>
                <Text size="xs" c="dimmed" mt="xs">
                  Tap the line when it starts on screen. Check the next line and
                  adjust if needed.
                </Text>
              </details>
            </>
          ) : (
            <>
              <Select
                label="Device playing this exact cut"
                description="A matching player is selected automatically. You can switch devices here."
                allowDeselect={false}
                placeholder="Choose a device"
                value={sessionId}
                onChange={setSessionId}
                data={matchingSessions.map((session) => ({
                  value: session.id,
                  label: session.deviceName,
                }))}
                disabled={draftPosition !== null}
              />
              {sessions.isError && (
                <Text role="alert" className="form-error">
                  {errorMessage(sessions.error)}
                </Text>
              )}
              {!sessions.isLoading && !matchingSessions.length && (
                <Text c="dimmed" size="sm">
                  No permitted device is playing this exact cut. Start this
                  version on your Jellyfin player, or use the external-screen
                  clock.
                </Text>
              )}
              <Text size="xs" c="dimmed">
                Playback is observed, never controlled. Polling and client
                latency can cause drift; use the timing corrections below.
              </Text>
            </>
          )}
          <Group gap="sm">
            <Button
              variant="default"
              disabled={draftPosition !== null || !anchor.running}
              onClick={() => setOffset((value) => value - 0.5)}
            >
              −0.5 s
            </Button>
            <Button
              variant="default"
              disabled={draftPosition !== null || !anchor.running}
              onClick={() => setOffset((value) => value + 0.5)}
            >
              +0.5 s
            </Button>
            <Text size="sm" c="dimmed">
              Subtitle clock correction: {offset > 0 ? "+" : ""}
              {offset.toFixed(1)} s
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            External screenings need a matching cut and a manual timing anchor.
            Keep this page open and verify alignment; this is not audio
            recognition.
          </Text>
        </Stack>
      </details>

      <Group justify="space-between" className="screening-status">
        <Text className="screening-time">
          {formatTimestamp(position)}
          {runtime !== null && <span> / {formatTimestamp(runtime)}</span>}
        </Text>
        <Badge
          color={stale ? "red" : anchor.running ? "green" : "gray"}
          variant="light"
        >
          {stale
            ? "Sync unavailable"
            : mode === "manual"
              ? anchor.running
                ? "Screening clock running"
                : "Set the clock to begin"
              : (selectedSession?.state ??
                (sessions.isPending
                  ? "Finding your player"
                  : "Waiting for playback"))}
        </Badge>
      </Group>
      {mode === "jellyfin" && selectedSession && !stale && (
        <Text size="sm" c="dimmed">
          Following {selectedSession.deviceName}
        </Text>
      )}
      {mode === "jellyfin" && sessionId === null && !sessions.isError && (
        <Text size="sm" c="dimmed">
          Start this version on Jellyfin. Live timing and notes will connect to
          a matching player automatically.
        </Text>
      )}
      {stale && (
        <Text role="alert" size="sm" className="form-error">
          Live timing is unavailable. The clock is an estimate until the device
          reconnects; you can switch to a manual anchor.
        </Text>
      )}
      <Progress
        value={runtime ? Math.min(100, (position / runtime) * 100) : 0}
        size="xs"
        aria-label="Screening progress"
      />
      <div className="live-grid">
        <Paper className="subtitle-panel" radius="lg">
          <div className="panel-heading">
            <Text fw={650}>
              {draftPosition !== null
                ? `Held at ${formatTimestamp(draftPosition)}`
                : "Live subtitles"}
            </Text>
            {hasTextTrack && transcript.isFetching && <Loader size="xs" />}
          </div>
          <Select
            label="Subtitle track"
            value={trackIndex}
            onChange={setTrackIndex}
            disabled={draftPosition !== null || !hasTextTrack}
            data={cut.subtitles.map((track) => ({
              value: String(track.index),
              label: `${track.label}${track.available ? "" : " — image track"}`,
              disabled: !track.available,
            }))}
            placeholder="No text subtitles available"
            size="xs"
          />
          <div
            className="subtitle-roll"
            aria-label={
              draftPosition !== null
                ? "Subtitles held for your note"
                : "Subtitles at the screening clock"
            }
          >
            {visibleCues.map((cue) => (
              <Text
                key={cue.id}
                className={`subtitle-line${cue.startSeconds <= displayPosition && cue.endSeconds >= displayPosition ? " active" : ""}`}
              >
                {cue.text}
              </Text>
            ))}
            {!visibleCues.length && (
              <Text c="dimmed" size="sm">
                {!hasTextTrack
                  ? cut.subtitles.length
                    ? "This version uses image subtitles. Your player can display them, but Introspect cannot show them as text. The clock and notes still work."
                    : "This version has no subtitle tracks. The clock and notes still work."
                  : transcript.isError
                    ? errorMessage(transcript.error)
                    : transcript.isFetching
                      ? "Loading this cut's transcript…"
                      : "No dialogue at this moment."}
              </Text>
            )}
            {hasTextTrack && transcript.isError && (
              <Button
                mt="sm"
                variant="subtle"
                onClick={() => void transcript.refetch()}
              >
                Retry transcript
              </Button>
            )}
          </div>
          {transcript.data && (
            <Text className="subtitle-source">
              Meta Egg ·{" "}
              {transcript.data?.data.language?.toUpperCase() ?? "text track"} ·
              {cut.precision === "subtitle_version"
                ? "declared subtitle version · verify alignment"
                : "matched to this media version"}
            </Text>
          )}
          {transcript.data?.data.savedAt && !transcript.isError && (
            <Text size="xs" c="dimmed" mt="sm" role="status">
              Transcript saved in Meta Egg
            </Text>
          )}
          {provenance && (
            <Text size="xs" c="dimmed" mt="sm">
              {provenance.attribution}
              {" · "}
              <Anchor
                size="xs"
                href={provenance.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Source
              </Anchor>
              {provenance.licenseUrl && (
                <>
                  {" · "}
                  <Anchor
                    size="xs"
                    href={provenance.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    License
                  </Anchor>
                </>
              )}
              {provenance.termsUrl && (
                <>
                  {" · "}
                  <Anchor
                    size="xs"
                    href={provenance.termsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Terms
                  </Anchor>
                </>
              )}
            </Text>
          )}
        </Paper>
        <Paper className="composer-panel" radius="lg">
          <div className="panel-heading">
            <div>
              <Text fw={650}>
                {draftPosition === null
                  ? "Catch a thought"
                  : `Note at ${formatTimestamp(draftPosition)}`}
              </Text>
              <Text size="xs" c="dimmed" mt="xs">
                {draftPosition === null
                  ? "One tap saves a color or rating, with any text below."
                  : `The film continues at ${formatTimestamp(position)}. Save to catch up.`}
              </Text>
            </div>
          </div>
          <form onSubmit={save}>
            <MomentControls
              disabled={
                createNote.isPending || (!canNote && draftPosition === null)
              }
              onColor={(color) =>
                saveMoment({ color, rating: draftMark?.rating ?? null })
              }
              onRating={(rating) =>
                saveMoment({
                  color:
                    draftMark?.color ??
                    settings.data?.defaultNoteColor ??
                    "amber",
                  rating,
                })
              }
            />
            <Textarea
              ref={textarea}
              label="Quick note"
              className="note-composer"
              placeholder="What did you notice? Text is optional for pings."
              minRows={3}
              maxRows={8}
              autosize
              value={noteBody}
              maxLength={2000}
              disabled={
                createNote.isPending || (!canNote && draftPosition === null)
              }
              onFocus={beginNote}
              onChange={(event) => {
                beginNote();
                setNoteBody(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  save();
                }
              }}
            />
            <div className="composer-footer">
              <Button
                variant="subtle"
                color="gray"
                disabled={draftPosition === null || createNote.isPending}
                onClick={() => {
                  if (
                    !hasDraft ||
                    window.confirm("Discard this unsaved note?")
                  ) {
                    setNoteBody("");
                    setDraftPosition(null);
                    setDraftMark(null);
                    textarea.current?.blur();
                  }
                }}
              >
                Return to live
              </Button>
              <Button
                type="submit"
                loading={createNote.isPending}
                disabled={!mediaId || !hasDraft || draftPosition === null}
              >
                {createNote.isError ? "Retry & catch up" : "Save & catch up"}
              </Button>
            </div>
          </form>
          <MomentGuide />
          {feedback && (
            <Text
              role="status"
              size="sm"
              mt="sm"
              c={
                createNote.isError || updateNote.isError || deleteNote.isError
                  ? "red"
                  : "dimmed"
              }
            >
              {feedback}
            </Text>
          )}
          {timeline.isError && (
            <Text role="alert" className="form-error" size="sm">
              Notes are unavailable: {errorMessage(timeline.error)}{" "}
              <Button variant="subtle" onClick={() => void timeline.refetch()}>
                Retry notes
              </Button>
            </Text>
          )}
        </Paper>
      </div>
      <section className="timeline-section">
        <div className="timeline-heading">
          <Title order={2}>Notes in this cut</Title>
          <Text c="dimmed" size="sm">
            {notes.data?.notes.length ?? 0} notes
          </Text>
        </div>
        {notes.isLoading && <Loader aria-label="Loading notes" />}
        {notes.isError && (
          <Text role="alert" className="form-error">
            {errorMessage(notes.error)}{" "}
            <Button variant="subtle" onClick={() => void notes.refetch()}>
              Try again
            </Button>
          </Text>
        )}
        {notes.data?.notes.length === 0 && (
          <Text c="dimmed">
            Your first thought will appear here, at the moment you began
            writing.
          </Text>
        )}
        <div className="notes-list">
          {notes.data?.notes.map((note) => (
            <TimedNote
              key={note.id}
              note={note}
              position={position}
              lead={settings.data?.noteLeadSeconds ?? 2}
              trail={settings.data?.noteTrailSeconds ?? 12}
              pending={updateNote.isPending || deleteNote.isPending}
              onUpdate={(target, input) =>
                updateNote.mutateAsync({ note: target, input })
              }
              onDelete={(target) => {
                if (window.confirm("Delete this timed note?"))
                  deleteNote.mutate(target);
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
