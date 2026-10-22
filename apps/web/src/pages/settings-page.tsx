import {
  Avatar,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  TextInput,
  PasswordInput,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconCheck,
  IconExternalLink,
  IconLogout,
  IconRefresh,
} from "@tabler/icons-react";
import { noteColors, type NoteColor } from "@film-introspect/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { authClient } from "../api/auth";
import { api, apiBaseUrl, errorMessage } from "../api/client";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const appConfig = useQuery({
    queryKey: ["app-config"],
    queryFn: api.config,
    staleTime: Infinity,
  });
  const session = authClient.useSession();
  const jellyfin = useQuery({
    queryKey: ["jellyfin-settings"],
    queryFn: api.jellyfinSettings,
  });
  const sourceStatus = useQuery({
    queryKey: ["screening-status"],
    queryFn: api.screeningStatus,
  });
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connectionFeedback, setConnectionFeedback] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (jellyfin.data) setServerUrl(jellyfin.data.url ?? "");
  }, [jellyfin.data]);
  const connectionSaved = async () => {
    setApiKey("");
    await queryClient.invalidateQueries({ queryKey: ["jellyfin-settings"] });
    queryClient.removeQueries({
      predicate: (query) => String(query.queryKey[0]).startsWith("screening-"),
    });
  };
  const saveConnection = useMutation({
    mutationFn: () => api.saveJellyfin({ url: serverUrl, apiKey }),
    onSuccess: async (result) => {
      setConnectionFeedback(`Connected to ${result.serverName}.`);
      await connectionSaved();
    },
    onError: (cause) => {
      setApiKey("");
      setConnectionFeedback(errorMessage(cause));
    },
  });
  const disconnect = useMutation({
    mutationFn: api.removeJellyfin,
    onSuccess: async () => {
      setConnectionFeedback(
        "Jellyfin disconnected. Your notes are still in Library.",
      );
      await connectionSaved();
    },
    onError: (cause) => setConnectionFeedback(errorMessage(cause)),
  });
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [language, setLanguage] = useState("eng");
  const [lead, setLead] = useState<string | number>(10);
  const [trail, setTrail] = useState<string | number>(20);
  const [color, setColor] = useState<NoteColor>("amber");
  const [preferenceFeedback, setPreferenceFeedback] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!settings.data) return;
    setLanguage(settings.data.preferredSubtitleLanguage);
    setLead(settings.data.noteLeadSeconds);
    setTrail(settings.data.noteTrailSeconds);
    setColor(settings.data.defaultNoteColor);
  }, [settings.data]);

  const savePreferences = useMutation({
    mutationFn: () =>
      api.updateSettings({
        preferredSubtitleLanguage: language,
        noteLeadSeconds: Number(lead),
        noteTrailSeconds: Number(trail),
        defaultNoteColor: color,
      }),
    onSuccess: async () => {
      setPreferenceFeedback("Preferences saved.");
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (cause) => setPreferenceFeedback(errorMessage(cause)),
  });

  return (
    <div className="page settings-page">
      <header className="page-heading">
        <div>
          <Text className="eyebrow">CONTROL ROOM</Text>
          <Title order={1}>Settings</Title>
          <Text c="dimmed" mt={6}>
            Tune how Introspect follows your screen.
          </Text>
        </div>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconRefresh size={16} />}
          loading={sourceStatus.isFetching}
          onClick={() => void sourceStatus.refetch()}
        >
          Check services
        </Button>
      </header>

      <section className="settings-section settings-two-column">
        <div className="settings-section-title">
          <Title order={2}>Your Jellyfin server</Title>
          <Text c="dimmed" size="sm">
            Connect a server to browse its films, choose exact subtitle tracks
            and follow playback on your device.
          </Text>
        </div>
        <Paper
          component="form"
          className="settings-card"
          radius="lg"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setConnectionFeedback(null);
            saveConnection.mutate();
          }}
        >
          <Stack gap="md">
            {jellyfin.data?.configured && (
              <Text fw={650}>
                Saved connection · {jellyfin.data.serverName}
              </Text>
            )}
            {!appConfig.data?.authEnabled && (
              <Text size="sm" c="dimmed">
                This preview uses one shared Local viewer profile. Everyone
                using it shares this connection. Separate accounts keep their
                own connections when sign-in is enabled.
              </Text>
            )}
            <TextInput
              label="Jellyfin server address"
              placeholder="https://jellyfin.example.com"
              type="url"
              required
              value={serverUrl}
              onChange={(event) => setServerUrl(event.currentTarget.value)}
              disabled={saveConnection.isPending || disconnect.isPending}
            />
            <PasswordInput
              label={
                jellyfin.data?.configured
                  ? "Replacement API key or access token"
                  : "API key or access token"
              }
              required
              value={apiKey}
              onChange={(event) => setApiKey(event.currentTarget.value)}
              autoComplete="off"
              disabled={saveConnection.isPending || disconnect.isPending}
            />
            <Text size="xs" c="dimmed">
              Stored encrypted for your profile; saved keys are never shown.
              Access follows the key’s permissions. Use a personal access token
              when you only want your own Jellyfin library and sessions.
            </Text>
            {jellyfin.isError && (
              <Text role="alert" c="red">
                {errorMessage(jellyfin.error)}
              </Text>
            )}
            {connectionFeedback && (
              <Text
                role={
                  saveConnection.isError || disconnect.isError
                    ? "alert"
                    : "status"
                }
                size="sm"
              >
                {connectionFeedback}
              </Text>
            )}
            <Group justify="space-between">
              {jellyfin.data?.configured && (
                <Button
                  variant="subtle"
                  color="red"
                  onClick={() => disconnect.mutate()}
                  loading={disconnect.isPending}
                  disabled={saveConnection.isPending}
                >
                  Disconnect
                </Button>
              )}
              <Button
                type="submit"
                loading={saveConnection.isPending}
                disabled={
                  !serverUrl.trim() ||
                  !apiKey.trim() ||
                  jellyfin.isLoading ||
                  disconnect.isPending
                }
              >
                Test and save connection
              </Button>
            </Group>
          </Stack>
        </Paper>
      </section>
      <section className="settings-section settings-two-column">
        <div className="settings-section-title">
          <Title order={2}>OpenSubtitles</Title>
          <Text c="dimmed" size="sm">
            Subtitle versions for cinema visits and other screens.
          </Text>
        </div>
        <Stack gap="sm">
          <Text fw={650}>
            {sourceStatus.isPending
              ? "Checking configuration…"
              : sourceStatus.isError
                ? "Status unavailable"
                : sourceStatus.data.data.openSubtitlesConfigured
                  ? "API key configured"
                  : "API key not configured"}
          </Text>
          <Text size="sm" c="dimmed">
            Managed by the service operator for everyone using this app.{" "}
            {sourceStatus.data?.data.openSubtitlesConfigured
              ? "Availability is checked when you search for subtitles."
              : "Ask the operator to connect OpenSubtitles to enable online subtitle lookup."}
          </Text>
          {sourceStatus.isError && (
            <Text role="alert" c="red">
              {errorMessage(sourceStatus.error)}
            </Text>
          )}
        </Stack>
      </section>

      <section className="settings-section settings-two-column">
        <div className="settings-section-title">
          <Text className="eyebrow">NOTE BEHAVIOR</Text>
          <Title order={2}>Reading window</Title>
          <Text c="dimmed" size="sm">
            Define when a timed note becomes prominent around the live playhead.
          </Text>
        </div>
        <Paper
          component="form"
          className="settings-card"
          radius="xl"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setPreferenceFeedback(null);
            savePreferences.mutate();
          }}
        >
          <Stack gap="lg">
            <Select
              label="Preferred subtitle language"
              value={language}
              onChange={(value) => setLanguage(value ?? "eng")}
              allowDeselect={false}
              searchable
              data={[
                { value: "eng", label: "English" },
                { value: "ron", label: "Romanian" },
                { value: "fra", label: "French" },
                { value: "deu", label: "German" },
                { value: "spa", label: "Spanish" },
                { value: "ita", label: "Italian" },
                { value: "por", label: "Portuguese" },
                { value: "jpn", label: "Japanese" },
              ]}
            />
            <div className="window-inputs">
              <NumberInput
                label="Show before"
                description="seconds"
                min={0}
                max={60}
                value={lead}
                onChange={setLead}
              />
              <NumberInput
                label="Keep after"
                description="seconds"
                min={1}
                max={120}
                value={trail}
                onChange={setTrail}
              />
            </div>
            <div>
              <Text size="sm" fw={500} mb={8}>
                Default note color
              </Text>
              <div className="settings-color-picker">
                {noteColors.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`settings-color-option note-${item.value}${color === item.value ? " selected" : ""}`}
                    onClick={() => setColor(item.value)}
                    aria-label={`${item.name}: ${item.label}`}
                    aria-pressed={color === item.value}
                  >
                    <span />
                    {item.name} · {item.label}
                    {color === item.value && <IconCheck size={14} />}
                  </button>
                ))}
              </div>
            </div>
            {preferenceFeedback && (
              <Text size="sm" c={savePreferences.isError ? "red" : "green"}>
                {preferenceFeedback}
              </Text>
            )}
            <Group justify="flex-end">
              <Button
                type="submit"
                loading={savePreferences.isPending}
                disabled={settings.isLoading}
              >
                Save preferences
              </Button>
            </Group>
          </Stack>
        </Paper>
      </section>

      <section className="settings-section settings-two-column account-section">
        <div className="settings-section-title">
          <Text className="eyebrow">ACCOUNT</Text>
          <Title order={2}>Private space</Title>
        </div>
        <Paper className="settings-card account-card" radius="xl">
          <Avatar radius="xl" color="amber">
            {(session.data?.user.name ||
              session.data?.user.email ||
              "L")[0]?.toUpperCase()}
          </Avatar>
          <div className="account-copy">
            <Text fw={650}>{session.data?.user.name || "Local viewer"}</Text>
            <Text size="xs" c="dimmed">
              {appConfig.data?.authEnabled
                ? session.data?.user.email
                : "Prototype mode · app authentication is off"}
            </Text>
          </div>
          {appConfig.data?.authEnabled ? (
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconLogout size={16} />}
              onClick={() => {
                queryClient.clear();
                void authClient.signOut();
              }}
            >
              Sign out
            </Button>
          ) : (
            <Badge variant="light" color="gray">
              Login disabled
            </Badge>
          )}
        </Paper>
      </section>

      <footer className="settings-footer">
        <Text size="xs" c="dimmed">
          Introspect · your self-hosted film companion
        </Text>
        <Button
          component="a"
          href={`${apiBaseUrl}/api/health`}
          target="_blank"
          rel="noreferrer"
          variant="subtle"
          color="gray"
          size="compact-xs"
          rightSection={<IconExternalLink size={13} />}
        >
          API status
        </Button>
      </footer>
    </div>
  );
}
