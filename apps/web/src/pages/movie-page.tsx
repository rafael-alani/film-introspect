import {
  Button,
  Group,
  Loader,
  NumberInput,
  Stack,
  TextInput,
} from "@mantine/core";
import { IconArrowLeft, IconDownload, IconSettings } from "@tabler/icons-react";
import {
  formatTimestamp,
  type LibraryMovie,
  type Note,
  type UpdateNoteInput,
  type UpdateRuntimeInput,
} from "@film-introspect/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import { TimedNote } from "../components/timed-note";
import { exportMovieNotes, movieVersionLabel } from "../lib/movie-export";
import { movieContext, movieDuration } from "./library-page";

export function MoviePage() {
  return <MovieDetail settings={false} />;
}

export function MovieSettingsPage() {
  return <MovieDetail settings />;
}

function MovieDetail({ settings }: { settings: boolean }) {
  const { movieId = "" } = useParams({ strict: false });
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["library-movie", movieId],
    queryFn: () => api.libraryMovie(movieId),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library-movie"] }),
      queryClient.invalidateQueries({ queryKey: ["library"] }),
      queryClient.invalidateQueries({ queryKey: ["notes"] }),
      queryClient.invalidateQueries({ queryKey: ["media"] }),
    ]);
  const updateNote = useMutation({
    mutationFn: ({ note, input }: { note: Note; input: UpdateNoteInput }) =>
      api.updateNote(note.id, input),
    onSuccess: refresh,
  });
  const deleteNote = useMutation({
    mutationFn: (note: Note) => api.deleteNote(note.id),
    onSuccess: refresh,
  });
  const [exportError, setExportError] = useState<string | null>(null);
  const movie = detail.data?.movie;
  const notes = detail.data?.notes ?? [];

  const download = () => {
    if (!movie || detail.isError) return;
    try {
      const { filename, markdown } = exportMovieNotes(
        movie,
        notes,
        movie.versions,
      );
      const url = URL.createObjectURL(
        new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportError(null);
    } catch (error) {
      setExportError(errorMessage(error));
    }
  };

  return (
    <div className="page movie-page">
      <Link to="/" className="back-link">
        <IconArrowLeft size={18} />
        Library
      </Link>
      {detail.isPending ? (
        <Loader aria-label="Loading movie notes" />
      ) : !movie ? (
        <div className="library-state" role="alert">
          <h1>Could not load this movie</h1>
          <p>{errorMessage(detail.error)}</p>
          <Button variant="default" onClick={() => void detail.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {detail.isError && (
            <div role="alert" className="movie-refresh-error">
              <p>
                Could not refresh this movie. Your open edits are still here.
              </p>
              <Button variant="default" onClick={() => void detail.refetch()}>
                Try again
              </Button>
            </div>
          )}
          <header className="movie-heading">
            <div>
              <h1>{movie.title}</h1>
              <p className="movie-metadata">
                {[movieContext(movie), movieDuration(movie)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {!settings && (
              <div className="movie-actions">
                <Button
                  variant="default"
                  leftSection={<IconDownload size={18} />}
                  disabled={
                    notes.length === 0 ||
                    detail.isFetching ||
                    detail.isError ||
                    updateNote.isPending ||
                    deleteNote.isPending
                  }
                  onClick={download}
                >
                  Export notes
                </Button>
                <Button
                  renderRoot={(props) => (
                    <Link
                      {...props}
                      to="/library/$movieId/settings"
                      params={{ movieId }}
                    />
                  )}
                  variant="subtle"
                  color="gray"
                  leftSection={<IconSettings size={18} />}
                >
                  Settings
                </Button>
              </div>
            )}
          </header>
          {settings ? (
            <>
              <div className="movie-section-heading">
                <h2>Movie settings</h2>
                <Link
                  to="/library/$movieId"
                  params={{ movieId }}
                  className="text-link"
                >
                  Back to notes
                </Link>
              </div>
              <p className="settings-intro">
                Correct a duration or name a version. Notes keep their original
                timestamps.
              </p>
              <div className="movie-settings">
                {movie.versions.map((version, index) => (
                  <RuntimeForm
                    key={version.id}
                    version={version}
                    index={index}
                    versions={movie.versions}
                    multiple={movie.versions.length > 1}
                    onSaved={refresh}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              {movie.versions.length > 1 && (
                <div className="movie-versions" aria-label="Movie versions">
                  {movie.versions.map((version, index) => (
                    <span key={version.id}>
                      {movieVersionLabel(version, index, movie.versions)} ·{" "}
                      {version.runtimeSeconds
                        ? formatTimestamp(version.runtimeSeconds)
                        : "Duration unavailable"}
                    </span>
                  ))}
                </div>
              )}
              <div className="movie-section-heading">
                <h2>
                  Notes <span>{notes.length}</span>
                </h2>
              </div>
              {(updateNote.isError || deleteNote.isError || exportError) && (
                <p role="alert" className="form-error">
                  {exportError ??
                    errorMessage(updateNote.error ?? deleteNote.error)}
                </p>
              )}
              {notes.length ? (
                <div className="notes-list movie-notes">
                  {notes.map((note) => {
                    const versionIndex = movie.versions.findIndex(
                      (version) => version.id === note.mediaId,
                    );
                    const version = movie.versions[versionIndex];
                    return (
                      <TimedNote
                        key={note.id}
                        note={note}
                        reading
                        position={-1}
                        lead={0}
                        trail={0}
                        versionLabel={
                          movie.versions.length > 1 && version
                            ? movieVersionLabel(
                                version,
                                versionIndex,
                                movie.versions,
                              )
                            : undefined
                        }
                        pending={updateNote.isPending || deleteNote.isPending}
                        onUpdate={(target, input) =>
                          updateNote.mutateAsync({ note: target, input })
                        }
                        onDelete={(target) => {
                          if (
                            window.confirm(
                              "Delete this note? This cannot be undone.",
                            )
                          )
                            deleteNote.mutate(target);
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="library-state movie-empty">
                  <h3>No notes yet</h3>
                  <p>Open this film in Live to capture a moment.</p>
                  <Button component={Link} to="/live" variant="default">
                    Open Live
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function RuntimeForm({
  version,
  index,
  versions,
  multiple,
  onSaved,
}: {
  version: LibraryMovie["versions"][number];
  index: number;
  versions: LibraryMovie["versions"];
  multiple: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [baseline, setBaseline] = useState({
    runtimeSeconds: version.runtimeSeconds,
    editionLabel: version.editionLabel,
  });
  const initialMinutes =
    baseline.runtimeSeconds === null
      ? ""
      : Math.round(baseline.runtimeSeconds / 6) / 10;
  const [minutes, setMinutes] = useState<string | number>(initialMinutes);
  const [label, setLabel] = useState(version.editionLabel ?? "");
  const [saved, setSaved] = useState(false);
  const dirty =
    minutes !== initialMinutes || label !== (baseline.editionLabel ?? "");
  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm("Discard your settings changes?"),
    enableBeforeUnload: dirty,
  });
  const update = useMutation({
    mutationFn: (input: UpdateRuntimeInput) =>
      api.updateRuntime(version.id, input),
    onSuccess: async (media) => {
      setBaseline({
        runtimeSeconds: media.runtimeSeconds,
        editionLabel: media.editionLabel,
      });
      setMinutes(
        media.runtimeSeconds === null
          ? ""
          : Math.round(media.runtimeSeconds / 6) / 10,
      );
      setLabel(media.editionLabel ?? "");
      await onSaved();
      setSaved(true);
    },
  });
  useEffect(() => {
    if (
      !dirty &&
      !update.isPending &&
      (baseline.runtimeSeconds !== version.runtimeSeconds ||
        baseline.editionLabel !== version.editionLabel)
    ) {
      setBaseline({
        runtimeSeconds: version.runtimeSeconds,
        editionLabel: version.editionLabel,
      });
      setMinutes(
        version.runtimeSeconds === null
          ? ""
          : Math.round(version.runtimeSeconds / 6) / 10,
      );
      setLabel(version.editionLabel ?? "");
    }
  }, [
    dirty,
    update.isPending,
    baseline.runtimeSeconds,
    baseline.editionLabel,
    version.runtimeSeconds,
    version.editionLabel,
  ]);
  return (
    <form
      className="runtime-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (minutes === "" || Number(minutes) < 0.1 || Number(minutes) > 1440)
          return;
        update.mutate({
          runtimeSeconds:
            minutes === initialMinutes
              ? baseline.runtimeSeconds
              : Math.round(Number(minutes) * 60),
          editionLabel: label.trim() || null,
          source: "manual",
        });
      }}
    >
      {multiple && <h3>{movieVersionLabel(version, index, versions)}</h3>}
      <Stack gap="lg">
        <NumberInput
          label="Duration in minutes"
          min={0.1}
          max={1440}
          decimalScale={1}
          value={minutes}
          disabled={update.isPending}
          onChange={(value) => {
            setMinutes(value);
            setSaved(false);
          }}
        />
        <TextInput
          label="Version name"
          placeholder="e.g. Director’s cut"
          value={label}
          maxLength={80}
          disabled={update.isPending}
          onChange={(event) => {
            setLabel(event.currentTarget.value);
            setSaved(false);
          }}
        />
        {multiple && (
          <details className="version-details">
            <summary>Source details</summary>
            <p>{version.mediaSourceId ?? version.jellyfinItemId}</p>
          </details>
        )}
        {update.isError && (
          <p className="form-error" role="alert">
            {errorMessage(update.error)}
          </p>
        )}
        <Group gap="sm">
          <Button
            type="submit"
            loading={update.isPending}
            disabled={
              minutes === "" || Number(minutes) < 0.1 || Number(minutes) > 1440
            }
          >
            Save changes
          </Button>
          <Button
            type="button"
            variant="subtle"
            color="gray"
            disabled={update.isPending}
            onClick={() =>
              update.mutate({ runtimeSeconds: null, editionLabel: null })
            }
          >
            Use automatic
          </Button>
          {saved && (
            <span role="status" className="saved-feedback">
              Saved
            </span>
          )}
        </Group>
      </Stack>
    </form>
  );
}
