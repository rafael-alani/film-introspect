import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().url().optional(),
);

const optionalString = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().min(1).optional(),
);

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}, z.boolean());

const DEVELOPMENT_AUTH_SECRET = "development-only-secret-change-me-now";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_PATH: z.string().min(1).default("./data/introspect.db"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:5173"),
  BETTER_AUTH_SECRET: z.string().min(32).default(DEVELOPMENT_AUTH_SECRET),
  ALLOW_SIGN_UP: booleanFromEnv.default(process.env.NODE_ENV !== "production"),
  APP_AUTH_ENABLED: booleanFromEnv.default(false),
  META_EGG_URL: optionalUrl,
  META_EGG_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(180_000)
    .default(65_000),
  JELLYFIN_URL: optionalUrl,
  JELLYFIN_API_KEY: optionalString,
  JELLYFIN_USER_ID: optionalString,
  JELLYFIN_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(2_000)
    .max(60_000)
    .default(10_000),
  BAZARR_URL: optionalUrl,
  BAZARR_API_KEY: optionalString,
  OMDB_API_KEY: optionalString,
  DEMO_MODE: booleanFromEnv.default(false),
});

export type AppEnv = z.infer<typeof envSchema>;

const parsedEnv = envSchema.parse(process.env);

if (
  parsedEnv.NODE_ENV === "production" &&
  (!process.env.BETTER_AUTH_SECRET ||
    parsedEnv.BETTER_AUTH_SECRET === DEVELOPMENT_AUTH_SECRET)
) {
  throw new Error(
    "BETTER_AUTH_SECRET must be explicitly set to a unique 32+ character value in production",
  );
}

export const env = parsedEnv;
