import { Button, SegmentedControl, Skeleton, TextInput } from "@mantine/core";
import { IconArrowUpRight, IconSearch } from "@tabler/icons-react";
import { type LibraryMovie } from "@film-introspect/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { api, apiAssetUrl, errorMessage } from "../api/client";

export function movieContext(movie: LibraryMovie): string {
  if (movie.kind === "episode") {
    return [
      movie.contextTitle,
      movie.seasonNumber !== null && movie.episodeNumber !== null
        ? `S${movie.seasonNumber} · E${movie.episodeNumber}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return movie.year?.toString() ?? "";
}

export function movieDuration(movie: LibraryMovie): string {
  const durations = new Set(
    movie.versions.map((version) => version.runtimeSeconds),
  );
  if (durations.size > 1) return "Multiple runtimes";
  const seconds = movie.runtimeSeconds;
  if (!seconds) return "Duration unavailable";
  const minutes = Math.round(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes} min`;
}

export function LibraryPage() {
  const library = useQuery({ queryKey: ["library"], queryFn: api.library });
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const items = (library.data?.items ?? []).filter(
    (movie) =>
      (kind === "all" || movie.kind === kind) &&
      `${movie.title} ${movie.contextTitle ?? ""}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const filtered = Boolean(search || kind !== "all");
  const mixedFormats = library.data?.items.some(
    (movie) => movie.kind !== "movie",
  );

  return (
    <div className="page library-page">
      <header className="library-heading">
        <h1>Library</h1>
        <Button component={Link} to="/live">
          Add notes
        </Button>
      </header>
      <div className="library-controls">
        <TextInput
          className="library-search"
          leftSection={<IconSearch size={18} />}
          placeholder="Search library"
          aria-label="Search library"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        {mixedFormats && (
          <SegmentedControl
            value={kind}
            onChange={setKind}
            aria-label="Media type"
            data={[
              { value: "all", label: "All" },
              { value: "movie", label: "Films" },
              { value: "episode", label: "Shows" },
            ]}
          />
        )}
      </div>
      {library.isPending ? (
        <div className="media-grid" aria-label="Loading library">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height={184} radius="md" />
          ))}
        </div>
      ) : library.isError ? (
        <div className="library-state" role="alert">
          <h2>Could not load your library</h2>
          <p>{errorMessage(library.error)}</p>
          <Button variant="default" onClick={() => void library.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length ? (
        <div className="media-grid">
          {items.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      ) : (
        <div className="library-state">
          <h2>{filtered ? "No matching titles" : "Your library is empty"}</h2>
          <p>
            {filtered
              ? "Try another title or clear the filters."
              : "Open a film in Live to start your notes."}
          </p>
          {filtered && (
            <Button
              variant="default"
              onClick={() => {
                setSearch("");
                setKind("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function MovieCard({ movie }: { movie: LibraryMovie }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <Link
      to="/library/$movieId"
      params={{ movieId: movie.id }}
      className="media-card"
    >
      {movie.imageUrl && !imageFailed && (
        <img
          className="media-thumbnail"
          src={apiAssetUrl(movie.imageUrl) ?? undefined}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}
      <div className="media-card-copy">
        <h2>{movie.title}</h2>
        {movieContext(movie) && (
          <p className="media-context">{movieContext(movie)}</p>
        )}
        <div className="media-meta-row">
          <span>
            {movie.noteCount} {movie.noteCount === 1 ? "note" : "notes"}
          </span>
          <IconArrowUpRight size={18} aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}
