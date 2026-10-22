import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconClockEdit,
  IconMovie,
  IconNotes,
  IconSearch,
  IconSparkles,
} from "@tabler/icons-react";
import {
  formatTimestamp,
  type MediaSummary,
  type UpdateRuntimeInput,
} from "@film-introspect/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, apiAssetUrl, errorMessage } from "../api/client";

type KindFilter = "all" | "movie" | "episode";

function detailLine(media: MediaSummary): string {
  if (media.kind === "episode") {
    const episode =
      media.episodeNumber === null
        ? null
        : `E${String(media.episodeNumber).padStart(2, "0")}`;
    const season =
      media.seasonNumber === null
        ? null
        : `S${String(media.seasonNumber).padStart(2, "0")}`;
    return [
      media.contextTitle,
      season && episode ? `${season}${episode}` : null,
      media.editionLabel,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return [
    media.year,
    media.kind === "video" ? "Video" : "Film",
    media.editionLabel,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatRelative(value: string | null): string {
  if (!value) return "No notes yet";
  const days = Math.floor(
    (Date.now() - new Date(value).getTime()) / 86_400_000,
  );
  if (days <= 0) return "Noted today";
  if (days === 1) return "Noted yesterday";
  if (days < 30) return `Noted ${days} days ago`;
  return `Noted ${new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function LibraryPage() {
  const queryClient = useQueryClient();
  const mediaQuery = useQuery({ queryKey: ["media"], queryFn: api.media });
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [selected, setSelected] = useState<MediaSummary | null>(null);
  const [runtimeMinutes, setRuntimeMinutes] = useState<string | number>("");
  const [runtimeOrigin, setRuntimeOrigin] = useState<"manual" | "omdb">(
    "manual",
  );
  const [editionLabel, setEditionLabel] = useState("");
  const [imdbId, setImdbId] = useState("");
  const [metadataFeedback, setMetadataFeedback] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const chooseMedia = (media: MediaSummary) => {
    setSelected(media);
    setRuntimeMinutes(
      media.runtimeSeconds === null
        ? ""
        : Math.round((media.runtimeSeconds / 60) * 10) / 10,
    );
    setRuntimeOrigin(media.runtimeSource === "omdb" ? "omdb" : "manual");
    setEditionLabel(media.editionLabel ?? "");
    setImdbId(
      media.providerIds.Imdb ??
        media.providerIds.IMDb ??
        media.providerIds.imdb ??
        "",
    );
    setMetadataFeedback(null);
    setRuntimeError(null);
  };

  const updateRuntime = useMutation({
    mutationFn: (input: UpdateRuntimeInput) =>
      api.updateRuntime(selected?.id as string, input),
    onSuccess: async () => {
      setSelected(null);
      await queryClient.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (cause) => setRuntimeError(errorMessage(cause)),
  });

  const lookupMetadata = useMutation({
    mutationFn: () => api.lookupMetadata(imdbId.trim()),
    onSuccess: (match) => {
      if (match.runtimeSeconds !== null) {
        setRuntimeMinutes(Math.round((match.runtimeSeconds / 60) * 10) / 10);
        setRuntimeOrigin("omdb");
      }
      setMetadataFeedback(
        match.runtimeSeconds === null
          ? `${match.title} has no OMDb runtime.`
          : `${match.title}${match.year ? ` (${match.year})` : ""} · ${Math.round(match.runtimeSeconds / 60)} min from OMDb`,
      );
    },
    onError: (cause) => setMetadataFeedback(errorMessage(cause)),
  });

  const items = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return [...(mediaQuery.data?.items ?? [])]
      .filter((item) => kind === "all" || item.kind === kind)
      .filter(
        (item) =>
          !needle ||
          `${item.title} ${item.contextTitle ?? ""}`
            .toLocaleLowerCase()
            .includes(needle),
      )
      .sort((a, b) => {
        if (!a.lastNotedAt && !b.lastNotedAt) return 0;
        if (!a.lastNotedAt) return 1;
        if (!b.lastNotedAt) return -1;
        return b.lastNotedAt.localeCompare(a.lastNotedAt);
      });
  }, [kind, mediaQuery.data?.items, search]);

  return (
    <div className="page library-page">
      <header className="page-heading">
        <div>
          <Text className="eyebrow">YOUR COLLECTION</Text>
          <Title order={1}>Film journal</Title>
          <Text c="dimmed" mt={6}>
            Thoughts you caught while the film kept moving.
          </Text>
        </div>
        <Paper className="library-stat" radius="lg">
          <IconNotes size={18} />
          <div>
            <Text fw={700}>
              {mediaQuery.data?.items.reduce(
                (sum, item) => sum + item.noteCount,
                0,
              ) ?? 0}
            </Text>
            <Text size="xs" c="dimmed">
              observations
            </Text>
          </div>
        </Paper>
      </header>

      <div className="library-controls">
        <TextInput
          className="library-search"
          leftSection={<IconSearch size={16} />}
          placeholder="Search titles"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          aria-label="Search titles"
        />
        <SegmentedControl
          value={kind}
          onChange={(value) => setKind(value as KindFilter)}
          data={[
            { value: "all", label: "All" },
            { value: "movie", label: "Films" },
            { value: "episode", label: "Shows" },
          ]}
        />
      </div>

      {mediaQuery.isLoading ? (
        <div className="media-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height={310} radius="xl" />
          ))}
        </div>
      ) : mediaQuery.isError ? (
        <Paper className="state-card" radius="xl">
          <Text fw={650}>The library could not be loaded.</Text>
          <Text c="dimmed" size="sm">
            {errorMessage(mediaQuery.error)}
          </Text>
          <Button variant="light" onClick={() => void mediaQuery.refetch()}>
            Try again
          </Button>
        </Paper>
      ) : items.length > 0 ? (
        <div className="media-grid">
          {items.map((media) => (
            <button
              key={
                media.id ??
                `${media.jellyfinItemId}:${media.mediaSourceId ?? ""}`
              }
              type="button"
              className="media-card"
              onClick={() => chooseMedia(media)}
            >
              <div className="media-poster">
                {media.imageUrl ? (
                  <img
                    src={apiAssetUrl(media.imageUrl) ?? undefined}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <div className="media-poster-placeholder">
                    <IconMovie size={34} stroke={1.2} />
                  </div>
                )}
                <div className="media-poster-gradient" />
                <Badge className="media-kind" variant="filled" color="dark">
                  {media.kind === "episode" ? "Series" : media.kind}
                </Badge>
                <div className="media-note-count">
                  <IconNotes size={14} />
                  {media.noteCount}
                </div>
              </div>
              <div className="media-card-copy">
                <Text fw={650} lineClamp={1}>
                  {media.title}
                </Text>
                <Text c="dimmed" size="sm" lineClamp={1}>
                  {detailLine(media)}
                </Text>
                <div className="media-meta-row">
                  <Text size="xs" c="dimmed">
                    {formatRelative(media.lastNotedAt)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {media.runtimeSeconds
                      ? formatTimestamp(media.runtimeSeconds)
                      : "Runtime unknown"}
                  </Text>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Paper className="state-card library-empty" radius="xl">
          <div className="empty-icon">
            <IconSparkles size={26} />
          </div>
          <Title order={2}>
            {search || kind !== "all"
              ? "No matching titles"
              : "Your journal starts with play"}
          </Title>
          <Text c="dimmed" maw={440} ta="center">
            {search || kind !== "all"
              ? "Try a different search or show every format."
              : "Start something in Jellyfin and add a timed note. It will be waiting here afterward."}
          </Text>
          {(search || kind !== "all") && (
            <Button
              variant="light"
              onClick={() => {
                setSearch("");
                setKind("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </Paper>
      )}

      <Modal
        opened={selected !== null}
        onClose={() => setSelected(null)}
        title="Runtime override"
        centered
        radius="xl"
        classNames={{
          content: "runtime-modal",
          header: "runtime-modal-header",
        }}
      >
        {selected && (
          <Stack gap="lg">
            <div className="runtime-media-summary">
              <div className="runtime-thumb">
                {selected.imageUrl ? (
                  <img
                    src={apiAssetUrl(selected.imageUrl) ?? undefined}
                    alt=""
                  />
                ) : (
                  <IconMovie size={24} />
                )}
              </div>
              <div>
                <Text fw={700}>{selected.title}</Text>
                <Text size="sm" c="dimmed">
                  {detailLine(selected)}
                </Text>
              </div>
            </div>
            <Text size="sm" c="dimmed">
              Override the duration when the theatrical, director’s, or extended
              cut differs from Jellyfin. Clear it to return to automatic
              metadata.
            </Text>
            <NumberInput
              label="Runtime in minutes"
              description={`Current source: ${selected.runtimeSource}`}
              placeholder="e.g. 142"
              min={0.1}
              max={1440}
              decimalScale={1}
              value={runtimeMinutes}
              onChange={(value) => {
                setRuntimeMinutes(value);
                setRuntimeOrigin("manual");
              }}
              leftSection={<IconClockEdit size={16} />}
            />
            <TextInput
              label="Edition label"
              description="Optional"
              placeholder="Theatrical, Director’s Cut, Extended…"
              value={editionLabel}
              maxLength={80}
              onChange={(event) => setEditionLabel(event.currentTarget.value)}
            />
            <div>
              <Text size="sm" fw={500} mb={6}>
                OMDb runtime fallback
              </Text>
              <Group align="flex-start" wrap="nowrap">
                <TextInput
                  aria-label="IMDb title ID"
                  placeholder="IMDb ID, e.g. tt0133093"
                  value={imdbId}
                  onChange={(event) => {
                    setImdbId(event.currentTarget.value);
                    setMetadataFeedback(null);
                  }}
                  error={Boolean(imdbId && !/^tt\d{7,10}$/.test(imdbId.trim()))}
                  style={{ flex: 1 }}
                />
                <Button
                  variant="light"
                  leftSection={<IconSearch size={15} />}
                  loading={lookupMetadata.isPending}
                  disabled={!/^tt\d{7,10}$/.test(imdbId.trim())}
                  onClick={() => lookupMetadata.mutate()}
                >
                  Look up
                </Button>
              </Group>
              <Text
                size="xs"
                c={lookupMetadata.isError ? "red" : "dimmed"}
                mt={6}
              >
                {metadataFeedback ??
                  "Uses title-level metadata only; verify alternate cuts against the actual file."}
              </Text>
            </div>
            {runtimeError && (
              <Text className="form-error" size="sm">
                {runtimeError}
              </Text>
            )}
            {!selected.id && (
              <Text className="form-error" size="sm">
                Add a note to this title before overriding its runtime.
              </Text>
            )}
            <Group justify="space-between" wrap="nowrap">
              <Button
                variant="subtle"
                color="gray"
                disabled={!selected.id}
                onClick={() => {
                  setEditionLabel("");
                  updateRuntime.mutate({
                    runtimeSeconds: null,
                    editionLabel: null,
                  });
                }}
                loading={updateRuntime.isPending}
              >
                Use automatic
              </Button>
              <Button
                disabled={
                  !selected.id ||
                  runtimeMinutes === "" ||
                  Number(runtimeMinutes) <= 0
                }
                loading={updateRuntime.isPending}
                onClick={() =>
                  updateRuntime.mutate({
                    runtimeSeconds: Math.round(Number(runtimeMinutes) * 60),
                    editionLabel: editionLabel.trim() || null,
                    source: runtimeOrigin,
                  })
                }
              >
                Save runtime
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </div>
  );
}
