import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { env } from "../env";
import * as schema from "./schema";

const databasePath =
  env.DATABASE_PATH === ":memory:"
    ? env.DATABASE_PATH
    : resolve(process.cwd(), env.DATABASE_PATH);

if (databasePath !== ":memory:") {
  mkdirSync(dirname(databasePath), { recursive: true });
}

export const sqlite = new Database(databasePath);
sqlite.run("PRAGMA journal_mode = WAL;");
sqlite.run("PRAGMA foreign_keys = ON;");
sqlite.run("PRAGMA busy_timeout = 5000;");

export const db = drizzle(sqlite, { schema });
export type DatabaseClient = typeof db;
