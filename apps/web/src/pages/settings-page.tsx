import {
  Avatar,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Radio,
  Select,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconCheck,
  IconDatabase,
  IconDeviceTv,
  IconExternalLink,
  IconKey,
  IconLogout,
  IconRefresh,
  IconServer,
} from "@tabler/icons-react";
import {
  type ConnectionStatus,
  type NoteColor,
} from "@film-introspect/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { authClient } from "../api/auth";
import { api, apiBaseUrl, errorMessage } from "../api/client";

const services = [
  {
    id: "jellyfin",
    title: "Jellyfin",
    detail: "Playback & media",
    icon: IconDeviceTv,
  },
  {
    id: "bazarr",
    title: "Bazarr",
    detail: "Subtitle management",
    icon: IconServer,
  },
  { id: "omdb", title: "OMDb", detail: "Runtime fallback", icon: IconDatabase },
] as const;

const colors: NoteColor[] = ["amber", "mint", "lilac", "rose", "sky"];

function ConnectionCard({
  definition,
  status,
}: {
  definition: (typeof services)[number];
  status?: ConnectionStatus;
}) {
  const Icon = definition.icon;
  const configured = status?.configured ?? false;
  const connected = status?.connected ?? false;
  return (
    <Paper className="connection-card" radius="xl">
      <div className="connection-service-icon">
        <Icon size={21} stroke={1.5} />
      </div>
      <div className="connection-service-copy">
        <Group gap="xs" wrap="nowrap">
          <Text fw={700}>{status?.label || definition.title}</Text>
          {status?.version && (
            <Text size="xs" c="dimmed">
              {status.version}
            </Text>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {status?.message || definition.detail}
        </Text>
      </div>
      <Badge
        variant="light"
        color={connected ? "green" : configured ? "yellow" : "gray"}
      >
        {connected ? "Connected" : configured ? "Unavailable" : "Not set"}
      </Badge>
    </Paper>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const appConfig = useQuery({
    queryKey: ["app-config"],
    queryFn: api.config,
    staleTime: Infinity,
  });
  const session = authClient.useSession();
  const connections = useQuery({
    queryKey: ["connections"],
    queryFn: api.connections,
    refetchInterval: 60_000,
  });
  const sessions = useQuery({
    queryKey: ["playback-sessions"],
    queryFn: api.sessions,
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

  const chooseSession = useMutation({
    mutationFn: api.selectSession,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playback-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["playback"] }),
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
      ]);
    },
  });

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
          loading={connections.isFetching}
          onClick={() => void connections.refetch()}
        >
          Check services
        </Button>
      </header>

      <section className="settings-section">
        <div className="settings-section-title">
          <Text className="eyebrow">CONNECTIONS</Text>
          <Title order={2}>Your media stack</Title>
          <Text c="dimmed" size="sm">
            Credentials are read securely by the Introspect server and never
            sent to this browser.
          </Text>
        </div>
        {connections.isLoading ? (
          <div className="connection-grid">
            {services.map((service) => (
              <Skeleton key={service.id} height={98} radius="xl" />
            ))}
          </div>
        ) : (
          <div className="connection-grid">
            {services.map((service) => (
              <ConnectionCard
                key={service.id}
                definition={service}
                {...(() => {
                  const status = connections.data?.services.find(
                    (item) => item.service === service.id,
                  );
                  return status ? { status } : {};
                })()}
              />
            ))}
          </div>
        )}
        {connections.isError && (
          <Text className="form-error" size="sm">
            {errorMessage(connections.error)}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Update service addresses and API keys in the server environment, then
          check services again. <IconKey size={12} className="inline-icon" />
        </Text>
      </section>

      <section className="settings-section settings-two-column">
        <div className="settings-section-title">
          <Text className="eyebrow">PLAYBACK DEVICE</Text>
          <Title order={2}>Session to follow</Title>
          <Text c="dimmed" size="sm">
            Introspect follows one Jellyfin device. Selection is remembered
            across visits.
          </Text>
        </div>
        <Paper className="settings-card" radius="xl">
          {sessions.isLoading ? (
            <Stack gap="sm">
              <Skeleton height={58} radius="lg" />
              <Skeleton height={58} radius="lg" />
            </Stack>
          ) : sessions.data && sessions.data.sessions.length > 0 ? (
            <Radio.Group
              value={sessions.data.selectedSessionId ?? ""}
              onChange={(value) => chooseSession.mutate(value || null)}
              aria-label="Jellyfin session"
            >
              <Stack gap="sm">
                {sessions.data.sessions.map((item) => (
                  <label
                    key={item.id}
                    className={
                      item.id === sessions.data.selectedSessionId
                        ? "session-option selected"
                        : "session-option"
                    }
                  >
                    <Radio value={item.id} disabled={chooseSession.isPending} />
                    <div className="session-icon">
                      <IconDeviceTv size={18} />
                    </div>
                    <div className="session-copy">
                      <Group gap="xs">
                        <Text size="sm" fw={650}>
                          {item.deviceName ?? item.client ?? "Jellyfin device"}
                        </Text>
                        {item.isActive && <span className="tiny-live-dot" />}
                      </Group>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {item.nowPlaying?.title ??
                          `${item.userName ?? "User"} · idle`}
                      </Text>
                    </div>
                    {item.id === sessions.data.selectedSessionId && (
                      <IconCheck size={16} color="var(--amber)" />
                    )}
                  </label>
                ))}
              </Stack>
            </Radio.Group>
          ) : (
            <div className="settings-empty">
              <IconDeviceTv size={27} stroke={1.3} />
              <Text fw={650}>No Jellyfin sessions found</Text>
              <Text size="sm" c="dimmed" ta="center">
                Open Jellyfin on the device you want to follow, then refresh.
              </Text>
              <Button
                variant="light"
                size="xs"
                onClick={() => void sessions.refetch()}
              >
                Refresh sessions
              </Button>
            </div>
          )}
          {sessions.isError && (
            <Text className="form-error">{errorMessage(sessions.error)}</Text>
          )}
          {chooseSession.isError && (
            <Text className="form-error">
              {errorMessage(chooseSession.error)}
            </Text>
          )}
        </Paper>
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
                {colors.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`settings-color-option note-${item}${color === item ? " selected" : ""}`}
                    onClick={() => setColor(item)}
                    aria-label={`${item} note color`}
                    aria-pressed={color === item}
                  >
                    <span />
                    {item}
                    {color === item && <IconCheck size={14} />}
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
