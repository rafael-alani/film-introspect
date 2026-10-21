import { resolve } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { app } from "./app";
import { db, sqlite } from "./db";
import { env } from "./env";
import { jellyfinSync } from "./integrations/jellyfin/sync";
import { ensureLocalAppUser } from "./services/local-user";

migrate(db, { migrationsFolder: resolve(import.meta.dir, "../drizzle") });
await ensureLocalAppUser();
jellyfinSync.start();

const server = Bun.serve({
  hostname: "0.0.0.0",
  port: env.API_PORT,
  idleTimeout: Math.ceil(env.META_EGG_TIMEOUT_MS / 1000) + 5,
  fetch: app.fetch,
});

console.info(`Introspect API listening on http://localhost:${server.port}`);

const shutdown = () => {
  jellyfinSync.stop();
  server.stop(true);
  sqlite.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
