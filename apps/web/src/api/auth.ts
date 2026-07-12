import { createAuthClient } from "better-auth/react";
import { apiBaseUrl } from "./client";

export const authClient = createAuthClient({
  baseURL: apiBaseUrl || window.location.origin,
});
