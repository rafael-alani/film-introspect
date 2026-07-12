import { resolve } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, sqlite } from ".";

const migrationsFolder = resolve(import.meta.dir, "../../drizzle");
migrate(db, { migrationsFolder });
sqlite.close();

console.info(`Applied database migrations from ${migrationsFolder}`);
