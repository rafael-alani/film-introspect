import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Progress,
  Skeleton,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconClockPlus,
  IconDeviceTv,
  IconEdit,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlus,
  IconRefresh,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  formatTimestamp,
  type Note,
  type NoteColor,
  type PlaybackConnection,
  type SubtitleCue,
} from "@film-introspect/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { api, apiAssetUrl, errorMessage } from "../api/client";
import { usePlayback } from "../hooks/use-playback";

const noteColors: NoteColor[] = ["amber", "mint", "lilac", "rose", "sky"];

const connectionCopy: Record<PlaybackConnection, string> = {
  connected: "Jellyfin connected",
  reconnecting: "Reconnecting",
  disconnected: "Jellyfin offline",
  not_configured: "Setup needed",
  demo: "Demo session",
};

function cueWindow(cues: SubtitleCue[], position: number): SubtitleCue[] {
  if (cues.length === 0) return [];
  let active = cues.findIndex(
    (cue) => cue.startSeconds <= position && cue.endSeconds >= position,
  );
  if (active < 0) {
    active = cues.findIndex((cue) => cue.startSeconds > position);
    if (active < 0) active = cues.length - 1;
  }
  return cues.slice(Math.max(0, active - 1), Math.min(cues.length, active + 2));
}

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
  const queryClient = useQueryClient();
  const playback = usePlayback();
  const snapshot = playback.snapshot;
  const media = snapshot?.media ?? null;
  const mediaId = media?.id ?? null;
  const [noteBody, setNoteBody] = useState("");
  const [color, setColor] = useState<NoteColor>("amber");
  const [composerOpen, setComposerOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const subtitles = useQuery({
    queryKey: [
      "subtitles",
      media?.jellyfinItemId,
      snapshot?.mediaSourceId,
      snapshot?.subtitleStreamIndex,
    ],
    queryFn: api.subtitles,
    enabled: Boolean(media),
    staleTime: 60_000,
    retry: 1,
  });
  const notes = useQuery({
    queryKey: ["notes", mediaId],
    queryFn: () => api.notes(mediaId as string),
    enabled: mediaId !== null,
  });

  useEffect(() => {
    if (settings.data) setColor(settings.data.defaultNoteColor);
  }, [settings.data]);

  const invalidateNotes = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notes", mediaId] }),
      queryClient.invalidateQueries({ queryKey: ["media"] }),
    ]);
  };

  const createNote = useMutation({
    mutationFn: () =>
      api.createNote(mediaId as string, {
        atSeconds: Math.max(0, Math.round(playback.positionSeconds * 10) / 10),
        body: noteBody,
        color,
      }),
    onSuccess: async () => {
      setNoteBody("");
      setComposerOpen(false);
      setFeedback("Note placed on the timeline.");
      await invalidateNotes();
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

  const visibleCues = useMemo(
    () => cueWindow(subtitles.data?.cues ?? [], playback.positionSeconds),
    [subtitles.data?.cues, playback.positionSeconds],
  );
  const sortedNotes = useMemo(
    () =>
      [...(notes.data?.notes ?? [])].sort((a, b) => a.atSeconds - b.atSeconds),
    [notes.data?.notes],
  );
  const runtime = media?.runtimeSeconds ?? 0;
  const progress =
    runtime > 0 ? Math.min(100, (playback.positionSeconds / runtime) * 100) : 0;
  const lead = settings.data?.noteLeadSeconds ?? 10;
  const trail = settings.data?.noteTrailSeconds ?? 20;

  if (playback.isLoading) {
    return (
      <div className="page live-page">
        <Skeleton height={22} width={150} />
        <Skeleton height={330} radius="xl" mt="lg" />
        <div className="live-grid">
          <Skeleton height={280} radius="xl" />
          <Skeleton height={280} radius="xl" />
        </div>
      </div>
    );
  }

  if (!snapshot || !media) {
    return (
      <div className="page live-page">
        <header className="page-heading">
          <div>
            <Text className="eyebrow">LIVE SESSION</Text>
            <Title order={1}>Follow the moment</Title>
          </div>
          <Badge
            variant="dot"
            color={snapshot?.connection === "connected" ? "green" : "gray"}
          >
            {snapshot ? connectionCopy[snapshot.connection] : "Unavailable"}
          </Badge>
        </header>
        <Paper className="empty-live" radius="xl">
          <div className="empty-live-orbit">
            <IconDeviceTv size={36} stroke={1.3} />
          </div>
          <Text className="eyebrow">WAITING FOR A SCREEN</Text>
          <Title order={2}>Press play in Jellyfin.</Title>
          <Text c="dimmed" maw={460} ta="center">
            When a movie or episode starts on your selected device, its
            playhead, subtitles, and notes will appear here automatically.
          </Text>
          {snapshot?.statusMessage && (
            <Text className="form-error">{snapshot.statusMessage}</Text>
          )}
          {playback.error && (
            <Text className="form-error">{errorMessage(playback.error)}</Text>
          )}
          <Group justify="center">
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              onClick={() => void playback.refetch()}
            >
              Check again
            </Button>
            <Button
              renderRoot={(props) => <Link to="/settings" {...props} />}
              variant="subtle"
              color="gray"
            >
              Choose device
            </Button>
          </Group>
        </Paper>
      </div>
    );
  }

  const activeCueId = visibleCues.find(
    (cue) =>
      cue.startSeconds <= playback.positionSeconds &&
      cue.endSeconds >= playback.positionSeconds,
  )?.id;

  return (
    <div className="page live-page">
      <header className="page-heading live-heading">
        <div>
          <Text className="eyebrow">LIVE SESSION</Text>
          <Title order={1}>Follow the moment</Title>
        </div>
        <div className="connection-badge">
          <span className={`connection-dot ${snapshot.connection}`} />
          <div>
            <Text size="sm" fw={650}>
              {connectionCopy[snapshot.connection]}
            </Text>
            <Text size="xs" c="dimmed">
              {snapshot.session?.deviceName ?? "Selected session"} ·{" "}
              {playback.streamConnected ? "live" : "polling"}
            </Text>
          </div>
        </div>
      </header>

      <Paper className="now-playing" radius="xl">
        {media.imageUrl && (
          <div
            className="now-playing-backdrop"
            style={{ backgroundImage: `url(${apiAssetUrl(media.imageUrl)})` }}
          />
        )}
        <div className="now-playing-scrim" />
        <div className="now-playing-content">
          <div className="media-copy">
            <Badge variant="light" color="gray" size="sm">
              {media.kind === "episode" ? "Now watching" : "Now playing"}
            </Badge>
            <Title order={2}>{media.title}</Title>
            <Text c="dimmed">
              {[media.contextTitle, media.year, media.editionLabel]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </div>

          <div className="playhead">
            <div className="playhead-time-row">
              <div className={`play-state ${snapshot.state}`}>
                {snapshot.state === "playing" ? (
                  <IconPlayerPlayFilled size={15} />
                ) : (
                  <IconPlayerPauseFilled size={15} />
                )}
                <span>
                  {snapshot.state === "playing"
                    ? "Playing"
                    : snapshot.state === "paused"
                      ? "Paused"
                      : "Idle"}
                </span>
              </div>
              <Text className="playhead-time">
                {formatTimestamp(playback.positionSeconds)}
              </Text>
              <Text className="playhead-runtime">
                −
                {formatTimestamp(
                  Math.max(0, runtime - playback.positionSeconds),
                )}
              </Text>
            </div>
            <Progress
              value={progress}
              size="sm"
              radius="xl"
              aria-label={`${Math.round(progress)}% watched`}
            />
          </div>
        </div>
      </Paper>

      <div className="live-grid">
        <Paper className="subtitle-panel" radius="xl">
          <div className="panel-heading">
            <div>
              <Text className="eyebrow">SUBTITLE ROLL</Text>
              <Text fw={650}>{subtitles.data?.track?.label ?? "Dialogue"}</Text>
            </div>
            {subtitles.isFetching && <Loader size="xs" color="gray" />}
          </div>
          <div className="subtitle-roll" aria-live="polite">
            {visibleCues.length > 0 ? (
              visibleCues.map((cue) => (
                <Text
                  key={cue.id}
                  className={
                    cue.id === activeCueId
                      ? "subtitle-line active"
                      : "subtitle-line"
                  }
                >
                  {cue.text}
                </Text>
              ))
            ) : (
              <div className="panel-empty">
                <Text c="dimmed" size="sm" ta="center">
                  {subtitles.isError
                    ? errorMessage(subtitles.error)
                    : (subtitles.data?.message ??
                      "No subtitle cues are available for this moment.")}
                </Text>
              </div>
            )}
          </div>
          <Text className="subtitle-source">
            {subtitles.data?.track
              ? `${subtitles.data.track.language?.toUpperCase() ?? "UND"} · ${subtitles.data.track.codec ?? "subtitle"}`
              : "Jellyfin subtitles"}
          </Text>
        </Paper>

        <Paper className="composer-panel" radius="xl">
          <div className="panel-heading">
            <div>
              <Text className="eyebrow">QUICK NOTE</Text>
              <Text fw={650}>
                Pin a thought to {formatTimestamp(playback.positionSeconds)}
              </Text>
            </div>
            <IconSparkles size={18} color="var(--amber)" />
          </div>
          <form
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              if (mediaId && noteBody.trim()) createNote.mutate();
            }}
          >
            <Textarea
              className="note-composer"
              placeholder="What did you notice?"
              autosize
              minRows={composerOpen ? 4 : 3}
              maxRows={8}
              value={noteBody}
              onFocus={() => setComposerOpen(true)}
              onChange={(event) => setNoteBody(event.currentTarget.value)}
              maxLength={2000}
            />
            <div className="composer-footer">
              <div className="color-picker" aria-label="Note color">
                {noteColors.map((noteColor) => (
                  <button
                    key={noteColor}
                    type="button"
                    className={`color-swatch note-${noteColor}${color === noteColor ? " selected" : ""}`}
                    onClick={() => setColor(noteColor)}
                    aria-label={`${noteColor} note`}
                    aria-pressed={color === noteColor}
                  />
                ))}
              </div>
              <Button
                type="submit"
                size="sm"
                leftSection={<IconPlus size={16} />}
                loading={createNote.isPending}
                disabled={!mediaId || !noteBody.trim()}
              >
                Add at {formatTimestamp(playback.positionSeconds)}
              </Button>
            </div>
          </form>
          {feedback && (
            <Text
              size="xs"
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
        </Paper>
      </div>

      <section className="timeline-section">
        <div className="timeline-heading">
          <div>
            <Text className="eyebrow">TIMELINE</Text>
            <Title order={2}>Notes in this film</Title>
          </div>
          <Group gap="xs">
            <IconClockPlus size={16} color="var(--muted)" />
            <Text size="sm" c="dimmed">
              {sortedNotes.length} {sortedNotes.length === 1 ? "note" : "notes"}
            </Text>
          </Group>
        </div>

        {notes.isLoading ? (
          <Stack gap="sm">
            <Skeleton height={84} radius="lg" />
            <Skeleton height={84} radius="lg" />
          </Stack>
        ) : notes.isError ? (
          <Paper className="notes-empty" radius="xl">
            <Text fw={600}>Notes could not be loaded.</Text>
            <Text c="dimmed" size="sm">
              {errorMessage(notes.error)}
            </Text>
            <Button
              size="xs"
              variant="light"
              mt="md"
              onClick={() => void notes.refetch()}
            >
              Try again
            </Button>
          </Paper>
        ) : sortedNotes.length > 0 ? (
          <div className="notes-list">
            {sortedNotes.map((note) => (
              <TimedNote
                key={note.id}
                note={note}
                position={playback.positionSeconds}
                lead={lead}
                trail={trail}
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
        ) : (
          <Paper className="notes-empty" radius="xl">
            <Text fw={600}>The timeline is quiet.</Text>
            <Text c="dimmed" size="sm">
              Your first observation will appear here, tied to the current
              scene.
            </Text>
          </Paper>
        )}
      </section>
    </div>
  );
}
