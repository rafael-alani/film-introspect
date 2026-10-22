import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull();

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  preferredJellyfinUserId: text("preferred_jellyfin_user_id"),
  preferredDeviceId: text("preferred_device_id"),
  preferredSubtitleLanguage: text("preferred_subtitle_language")
    .default("eng")
    .notNull(),
  noteLeadSeconds: integer("note_lead_seconds").default(2).notNull(),
  noteTrailSeconds: integer("note_trail_seconds").default(12).notNull(),
  defaultNoteColor: text("default_note_color").default("amber").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const mediaItems = sqliteTable(
  "media_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jellyfinServerKey: text("jellyfin_server_key").default("").notNull(),
    jellyfinItemId: text("jellyfin_item_id").notNull(),
    mediaSourceId: text("media_source_id").default("").notNull(),
    editionLabel: text("edition_label"),
    title: text("title").notNull(),
    contextTitle: text("context_title"),
    kind: text("kind", { enum: ["movie", "episode", "video"] })
      .default("video")
      .notNull(),
    year: integer("year"),
    seasonNumber: integer("season_number"),
    episodeNumber: integer("episode_number"),
    runtimeSeconds: integer("runtime_seconds"),
    runtimeSource: text("runtime_source", {
      enum: ["jellyfin", "meta_egg", "manual", "omdb", "unknown"],
    })
      .default("unknown")
      .notNull(),
    jellyfinRuntimeSeconds: integer("jellyfin_runtime_seconds"),
    providerIdsJson: text("provider_ids_json").default("{}").notNull(),
    imageTag: text("image_tag"),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("media_user_jellyfin_source_uidx").on(
      table.userId,
      table.jellyfinServerKey,
      table.jellyfinItemId,
      table.mediaSourceId,
    ),
    index("media_user_last_seen_idx").on(table.userId, table.lastSeenAt),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    atSeconds: integer("at_seconds").notNull(),
    body: text("body").notNull(),
    color: text("color", {
      enum: ["amber", "mint", "lilac", "rose", "sky", "orange"],
    })
      .default("amber")
      .notNull(),
    rating: integer("rating"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("notes_media_time_idx").on(table.mediaId, table.atSeconds),
    index("notes_user_updated_idx").on(table.userId, table.updatedAt),
    check(
      "notes_rating_check",
      sql`${table.rating} IS NULL OR (typeof(${table.rating}) = 'integer' AND ${table.rating} BETWEEN 1 AND 10)`,
    ),
  ],
);

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  settings: one(userSettings),
  mediaItems: many(mediaItems),
  notes: many(notes),
}));

export const mediaRelations = relations(mediaItems, ({ one, many }) => ({
  user: one(user, { fields: [mediaItems.userId], references: [user.id] }),
  notes: many(notes),
}));

export const noteRelations = relations(notes, ({ one }) => ({
  user: one(user, { fields: [notes.userId], references: [user.id] }),
  media: one(mediaItems, {
    fields: [notes.mediaId],
    references: [mediaItems.id],
  }),
}));

export const authSchema = { user, session, account, verification };

export const userJellyfin = sqliteTable("user_jellyfin", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  serverName: text("server_name").notNull(),
  credential: text("credential").notNull(),
  jellyfinUserId: text("jellyfin_user_id"),
});
