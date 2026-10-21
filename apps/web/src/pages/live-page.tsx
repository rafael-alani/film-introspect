import {
  ActionIcon,
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
  type Note,
  type ScreeningCut,
  type ScreeningMovie,
} from "@film-introspect/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../api/client";
import {
  clockPosition,
  cueWindow,
  notePosition,
  parseScreeningTime,
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
  onUpdate: (note: Note, body: string) => void;
  onDelete: (note: Note) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const isNear =
    note.atSeconds >= position - trail && note.atSeconds <= position + lead;

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
            onChange={(event) => setBody(event.currentTarget.value)}
          />
        ) : (
          <Text>{note.body}</Text>
        )}
      </div>
      <div className="note-actions">
        {editing ? (
          <>
            <Tooltip label="Save changes">
              <ActionIcon
                variant="subtle"
                color="green"
                disabled={!body.trim() || pending}
                onClick={() => {
                  onUpdate(note, body.trim());
                  setEditing(false);
                }}
                aria-label="Save changes"
              >
                <IconCheck size={16} />
              </ActionIcon>
            </Tooltip>
            <ActionIcon
              variant="subtle"
              color="gray"
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
              onClick={() => setEditing(true)}
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
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [movieId, setMovieId] = useState<string | null>(null);
  const [cutId, setCutId] = useState<string | null>(null);
  const [screening, setScreening] = useState<{
    movie: ScreeningMovie;
    cut: ScreeningCut;
  } | null>(null);
  const movies = useQuery({
    queryKey: ["screening-movies", query],
    queryFn: () => api.screeningMovies(query),
    retry: 1,
  });
  const movie = useQuery({
    queryKey: ["screening-movie", movieId],
    queryFn: () => api.screeningMovie(movieId!),
    enabled: !!movieId,
    retry: 1,
  });
  const cuts = movie.data?.data.cuts ?? [];
  const selectedCut =
    cuts.find((cut) => cut.id === cutId) ??
    (cuts.length === 1 ? cuts[0] : undefined);

  if (screening)
    return (
      <Screening
        key={`${screening.movie.id}:${screening.cut.id}`}
        {...screening}
        onLeave={() => setScreening(null)}
      />
    );

  return (
    <div className="page live-page screening-page">
      <header className="page-heading">
        <div>
          <Title order={1}>Keep watching.</Title>
          <Text c="dimmed" mt="sm">
            Find your film. Catch a thought without stopping the screening.
          </Text>
        </div>
      </header>
      <form
        className="screening-search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setMovieId(null);
          setCutId(null);
        }}
      >
        <TextInput
          label="Find a film in Meta Egg"
          placeholder="Movie title"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          maxLength={200}
          leftSection={<IconSearch size={18} />}
        />
        <Button type="submit" loading={movies.isFetching}>
          Search films
        </Button>
      </form>
      {movies.isLoading && <Loader mt="xl" aria-label="Loading films" />}
      {movies.isError && (
        <Text role="alert" className="form-error" mt="lg">
          {errorMessage(movies.error)}{" "}
          <Button variant="subtle" onClick={() => void movies.refetch()}>
            Try again
          </Button>
        </Text>
      )}
      {movies.data?.data.length === 0 && (
        <Text c="dimmed" mt="xl">
          No films found. Try another title, or add this film to Meta Egg's
          connected library.
        </Text>
      )}
      <div className="screening-results">
        {movies.data?.data.map((item) => (
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
      {movieId && (
        <section className="screening-selection" aria-label="Choose your cut">
          {movie.isLoading && <Loader aria-label="Loading cuts" />}
          {movie.isError && (
            <Text role="alert" className="form-error">
              {errorMessage(movie.error)}{" "}
              <Button variant="subtle" onClick={() => void movie.refetch()}>
                Try again
              </Button>
            </Text>
          )}
          {movie.data && (
            <Stack gap="md">
              <Title order={2}>{movie.data.data.title}</Title>
              {movie.data.data.overview && (
                <Text c="dimmed" maw="65ch">
                  {movie.data.data.overview}
                </Text>
              )}
              <Select
                label="Cut / media version"
                placeholder="Choose the version you are watching"
                value={selectedCut?.id ?? null}
                onChange={setCutId}
                data={cuts.map((cut) => ({
                  value: cut.id,
                  label: `${cut.label}${cut.runtimeSeconds ? ` · ${Math.round(cut.runtimeSeconds / 60)} min` : ""}`,
                }))}
              />
              <Text size="sm" c="dimmed">
                Match the version on screen. Different cuts have separate
                subtitle timing and notes; runtimes are never stretched.
              </Text>
              {cuts.length === 0 && (
                <Text className="form-error">
                  Meta Egg has no playable media version for this film.
                </Text>
              )}
              <Button
                disabled={!selectedCut}
                onClick={() => {
                  if (selectedCut)
                    setScreening({ movie: movie.data.data, cut: selectedCut });
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
}: {
  movie: ScreeningMovie;
  cut: ScreeningCut;
  onLeave: () => void;
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
  const [mode, setMode] = useState("manual");
  const [sessionId, setSessionId] = useState<string | null>(null);
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const timeline = useQuery({
    queryKey: ["screening-timeline", movie.id, cut.id],
    queryFn: () => api.screeningTimeline(movie.id, cut.id),
    retry: 1,
  });
  const mediaId = timeline.data?.id;
  const transcript = useQuery({
    queryKey: ["screening-transcript", movie.id, cut.id, trackIndex],
    queryFn: () =>
      api.screeningTranscript(movie.id, cut.id, Number(trackIndex)),
    enabled: trackIndex !== null && trackIndex !== "",
    retry: 1,
    staleTime: 60_000,
  });
  const sessions = useQuery({
    queryKey: ["screening-sessions", movie.id],
    queryFn: () => api.screeningSessions(movie.id),
    enabled: mode === "jellyfin",
    refetchInterval: 2000,
    retry: 1,
  });
  const matchingSessions = (sessions.data?.data ?? []).filter(
    (session) => session.itemId === movie.id && session.cutId === cut.id,
  );
  const selectedSession = matchingSessions.find(
    (session) => session.id === sessionId,
  );
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
  const visibleCues = cueWindow(cues, displayPosition);
  const stale =
    mode === "jellyfin" &&
    (!selectedSession ||
      sessions.isError ||
      Date.now() - Date.parse(selectedSession.observedAt) > 10_000 ||
      Date.parse(selectedSession.observedAt) - Date.now() > 5_000);
  const canNote =
    !!mediaId &&
    (mode === "manual" ? anchor.running : !!selectedSession && !stale);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(tick);
  }, []);
  useEffect(() => {
    if (mode !== "jellyfin" || !selectedSession) return;
    const age = Math.max(
      0,
      Math.min(
        10,
        (Date.now() - Date.parse(selectedSession.observedAt)) / 1000,
      ),
    );
    setAnchor({
      position:
        selectedSession.positionSeconds +
        (selectedSession.state === "playing" ? age : 0),
      at: performance.now(),
      running: selectedSession.state === "playing",
    });
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
      !!noteBody.trim() &&
      !window.confirm("Discard this unsaved note and leave the screening?"),
    enableBeforeUnload: !!noteBody.trim(),
  });

  const invalidateNotes = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notes", mediaId] }),
      queryClient.invalidateQueries({ queryKey: ["media"] }),
    ]);
  const createNote = useMutation({
    mutationFn: (input: { atSeconds: number; body: string }) =>
      api.createNote(mediaId!, {
        ...input,
        color: settings.data?.defaultNoteColor ?? "amber",
      }),
    onSuccess: () => {
      setNoteBody("");
      setDraftPosition(null);
      textarea.current?.blur();
      setFeedback("Saved. Subtitles caught up to the film.");
      void invalidateNotes();
    },
    onError: (cause) => setFeedback(errorMessage(cause)),
  });
  const updateNote = useMutation({
    mutationFn: ({ note, body }: { note: Note; body: string }) =>
      api.updateNote(note.id, { body }),
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
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (
      mediaId &&
      noteBody.trim() &&
      draftPosition !== null &&
      !createNote.isPending
    )
      createNote.mutate({
        atSeconds: Math.floor(draftPosition),
        body: noteBody,
      });
  };

  return (
    <div className="page live-page screening-page">
      <header className="screening-heading">
        <div>
          <Title order={1}>{movie.title}</Title>
          <Text c="dimmed" size="sm">
            {[
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
              !noteBody.trim() ||
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
      <details
        className="screening-sync"
        open={!anchor.running && !selectedSession}
      >
        <summary>Sync with the screen</summary>
        <Stack gap="md" mt="md">
          <Select
            label="Screening clock"
            data={[
              { value: "manual", label: "External screen — set the clock" },
              {
                value: "jellyfin",
                label: "Follow a Jellyfin device via Meta Egg",
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
                  No permitted device is playing this exact cut. Start it with
                  Meta Egg's configured Jellyfin user, or use the
                  external-screen clock.
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
              : (selectedSession?.state ?? "Choose device")}
        </Badge>
      </Group>
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
            {transcript.isFetching && <Loader size="xs" />}
          </div>
          <Select
            label="Subtitle track"
            value={trackIndex}
            onChange={setTrackIndex}
            disabled={draftPosition !== null}
            data={cut.subtitles.map((track) => ({
              value: String(track.index),
              label: `${track.label}${track.available ? "" : " — image subtitles unavailable"}`,
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
                {transcript.isError
                  ? errorMessage(transcript.error)
                  : transcript.isFetching
                    ? "Loading this cut's transcript…"
                    : "No text transcript is available for this cut. Add a matching SRT/VTT or text track to the connected library."}
              </Text>
            )}
            {transcript.isError && (
              <Button
                mt="sm"
                variant="subtle"
                onClick={() => void transcript.refetch()}
              >
                Retry transcript
              </Button>
            )}
          </div>
          <Text className="subtitle-source">
            Meta Egg ·{" "}
            {transcript.data?.data.language?.toUpperCase() ?? "text track"} ·
            matched to this media version
          </Text>
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
                  ? "Tap to hold the subtitles. The film keeps moving."
                  : `The film continues at ${formatTimestamp(position)}. Save to catch up.`}
              </Text>
            </div>
          </div>
          <form onSubmit={save}>
            <Textarea
              ref={textarea}
              label="Quick note"
              className="note-composer"
              placeholder="What did you notice?"
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
                    !noteBody.trim() ||
                    window.confirm("Discard this unsaved note?")
                  ) {
                    setNoteBody("");
                    setDraftPosition(null);
                    textarea.current?.blur();
                  }
                }}
              >
                Return to live
              </Button>
              <Button
                type="submit"
                loading={createNote.isPending}
                disabled={
                  !mediaId || !noteBody.trim() || draftPosition === null
                }
              >
                Save & catch up
              </Button>
            </div>
          </form>
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
              onUpdate={(target, body) =>
                updateNote.mutate({ note: target, body })
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
