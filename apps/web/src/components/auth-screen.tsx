import {
  Button,
  Center,
  Container,
  Divider,
  Paper,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArrowRight, IconDeviceTv, IconNotes } from "@tabler/icons-react";
import { type FormEvent, useState } from "react";
import { authClient } from "../api/auth";
import { errorMessage } from "../api/client";
import { Brand } from "./brand";

type AuthMode = "sign-in" | "create";

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "create" && !name.trim()) {
      setError("Enter your name to create an account.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({
              name: name.trim(),
              email,
              password,
            });
      if (result.error)
        setError(result.error.message ?? "Authentication failed.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-grain" />
      <Container size={1080} className="auth-container">
        <section className="auth-story">
          <Brand />
          <div>
            <Text className="eyebrow">YOUR SECOND SCREEN</Text>
            <Title order={1} className="auth-title">
              Notice what the film makes you <em>feel.</em>
            </Title>
            <Text className="auth-copy">
              Introspect follows Jellyfin in real time, placing every thought
              beside the exact scene that sparked it.
            </Text>
          </div>
          <div className="auth-feature-row">
            <div>
              <IconDeviceTv size={18} stroke={1.6} />
              <Text>Follows playback</Text>
            </div>
            <div>
              <IconNotes size={18} stroke={1.6} />
              <Text>Time-locked notes</Text>
            </div>
          </div>
        </section>

        <Center className="auth-form-wrap">
          <Paper component="section" className="auth-card" radius="xl">
            <Stack gap="lg">
              <div>
                <Text className="eyebrow">WELCOME</Text>
                <Title order={2}>
                  {mode === "sign-in"
                    ? "Return to your notes"
                    : "Begin a film journal"}
                </Title>
                <Text c="dimmed" size="sm" mt={6}>
                  {mode === "sign-in"
                    ? "Sign in to resume your live session."
                    : "Your notes stay private to your account."}
                </Text>
              </div>

              <SegmentedControl
                fullWidth
                value={mode}
                onChange={(value) => {
                  setMode(value as AuthMode);
                  setError(null);
                }}
                data={[
                  { value: "sign-in", label: "Sign in" },
                  { value: "create", label: "Create account" },
                ]}
              />

              <form onSubmit={submit}>
                <Stack gap="md">
                  {mode === "create" && (
                    <TextInput
                      label="Name"
                      placeholder="How should we address you?"
                      value={name}
                      onChange={(event) => setName(event.currentTarget.value)}
                      required
                      autoComplete="name"
                    />
                  )}
                  <TextInput
                    label="Email"
                    placeholder="you@example.com"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    required
                    autoComplete="email"
                  />
                  <PasswordInput
                    label="Password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    required
                    minLength={8}
                    autoComplete={
                      mode === "sign-in" ? "current-password" : "new-password"
                    }
                  />
                  {error && (
                    <Text role="alert" className="form-error" size="sm">
                      {error}
                    </Text>
                  )}
                  <Button
                    type="submit"
                    size="md"
                    fullWidth
                    loading={pending}
                    rightSection={<IconArrowRight size={17} />}
                  >
                    {mode === "sign-in" ? "Sign in" : "Create account"}
                  </Button>
                </Stack>
              </form>

              <Divider label="private by default" labelPosition="center" />
              <Text ta="center" c="dimmed" size="xs">
                Jellyfin credentials remain on your Introspect server. By
                continuing, you agree to keep unusually good notes.
              </Text>
            </Stack>
          </Paper>
        </Center>
      </Container>
    </main>
  );
}
