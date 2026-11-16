import {
  Button,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
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
      <div className="auth-container">
        <Brand />
        <section className="auth-card">
          <Stack gap="lg">
            <Title order={1}>
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </Title>
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
                    placeholder="Your name"
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
                  description={
                    mode === "create" ? "At least 8 characters" : undefined
                  }
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
          </Stack>
        </section>
      </div>
    </main>
  );
}
