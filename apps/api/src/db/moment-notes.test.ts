import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import {
  createNoteInputSchema,
  updateNoteInputSchema,
} from "@film-introspect/contracts";

test("moment pings accept no text, validate ratings, and preserve omitted patch fields", () => {
  expect(
    createNoteInputSchema.parse({
      atSeconds: 12,
      body: "",
      color: "orange",
      rating: 10,
    }).body,
  ).toBe("");
  expect(updateNoteInputSchema.parse({ rating: 8 })).toEqual({ rating: 8 });
  expect(updateNoteInputSchema.parse({ body: "" })).toEqual({ body: "" });
  expect(updateNoteInputSchema.parse({ rating: null })).toEqual({
    rating: null,
  });
  expect(updateNoteInputSchema.safeParse({}).success).toBe(false);
  for (const rating of [0, 11, 7.5, "8", NaN])
    expect(
      createNoteInputSchema.safeParse({ atSeconds: 0, body: "", rating })
        .success,
    ).toBe(false);
});

test("rating migration preserves existing notes and preferences and is applied once", () => {
  const folder = mkdtempSync(join(tmpdir(), "introspect-migration-"));
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite);
  const migrations = resolve(import.meta.dir, "../../drizzle");
  try {
    mkdirSync(join(folder, "meta"));
    const journal = JSON.parse(
      readFileSync(join(migrations, "meta/_journal.json"), "utf8"),
    );
    writeFileSync(
      join(folder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
    );
    writeFileSync(
      join(folder, "0000_initial.sql"),
      readFileSync(join(migrations, "0000_initial.sql")),
    );
    migrate(db, { migrationsFolder: folder });
    sqlite.run(
      "INSERT INTO user (id, name, email) VALUES ('user', 'Fixture', 'fixture@example.invalid')",
    );
    sqlite.run(
      "INSERT INTO user_settings (user_id, default_note_color) VALUES ('user', 'sky')",
    );
    sqlite.run(
      "INSERT INTO media_items (id, user_id, jellyfin_item_id, title) VALUES ('film', 'user', 'item', 'Fixture')",
    );
    for (const color of ["amber", "mint", "lilac", "rose", "sky"])
      sqlite.run(
        "INSERT INTO notes (id, user_id, media_id, at_seconds, body, color) VALUES (?, 'user', 'film', 125, 'Existing thought', ?)",
        [color, color],
      );
    const before = sqlite
      .query<Record<string, unknown>, []>("SELECT * FROM notes ORDER BY id")
      .all();
    migrate(db, { migrationsFolder: migrations });
    migrate(db, { migrationsFolder: migrations });
    expect(sqlite.query("SELECT * FROM notes ORDER BY id").all()).toEqual(
      before.map((note) => ({ ...note, rating: null })),
    );
    expect(
      sqlite.query("SELECT default_note_color FROM user_settings").get(),
    ).toEqual({ default_note_color: "sky" });
    expect(sqlite.query("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(
      sqlite.query("SELECT count(*) AS count FROM __drizzle_migrations").get(),
    ).toEqual({ count: 2 });
    sqlite.run(
      "UPDATE notes SET rating = 10, body = '', color = 'orange' WHERE id = 'amber'",
    );
    expect(() => sqlite.run("UPDATE notes SET rating = 11")).toThrow();
    expect(() => sqlite.run("UPDATE notes SET rating = 4.5")).toThrow();
  } finally {
    sqlite.close();
    rmSync(folder, { recursive: true });
  }
});
