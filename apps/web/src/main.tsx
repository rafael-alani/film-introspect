import "@mantine/core/styles.css";
import "./styles.css";
import {
  Button,
  MantineProvider,
  Paper,
  PasswordInput,
  TextInput,
  createTheme,
} from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
});

const theme = createTheme({
  primaryColor: "amber",
  primaryShade: 5,
  colors: {
    amber: [
      "#fff8e7",
      "#f8ebc9",
      "#eddaa1",
      "#e3c774",
      "#dbb653",
      "#d6aa3f",
      "#bd8e2e",
      "#987022",
      "#77571e",
      "#62491d",
    ],
  },
  defaultRadius: "md",
  fontFamily:
    'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily: 'Iowan Old Style, Baskerville, "Times New Roman", serif',
    fontWeight: "500",
  },
  components: {
    Button: Button.extend({ defaultProps: { radius: "xl" } }),
    Paper: Paper.extend({ defaultProps: { bg: "var(--surface)" } }),
    TextInput: TextInput.extend({ defaultProps: { radius: "md" } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { radius: "md" } }),
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
