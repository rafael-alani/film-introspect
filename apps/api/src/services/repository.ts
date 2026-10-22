import {
  type CreateNoteInput,
  type Media,
  type MediaSummary,
  type Note,
  type UpdateNoteInput,
  type UpdateRuntimeInput,
  type UpdateUserSettings,
  type UserSettings,
  userSettingsSchema,
} from "@film-introspect/contracts";
import { and, asc, count, desc, eq, max } from "drizzle-orm";
import { db } from "../db";
import { mediaItems, notes, userSettings } from "../db/schema";

type MediaRow = typeof mediaItems.$inferSelect;
type NoteRow = typeof notes.$inferSelect;

function safeProviderIds(value: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function mediaRowToContract(row: MediaRow): Media {
  return {
    id: row.id,
    jellyfinItemId: row.jellyfinItemId,
    mediaSourceId: row.mediaSourceId || null,
    editionLabel: row.editionLabel,
    title: row.title,
    contextTitle: row.contextTitle,
    kind: row.kind,
    year: row.year,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    runtimeSeconds: row.runtimeSeconds,
    runtimeSource: row.runtimeSource,
    providerIds: safeProviderIds(row.providerIdsJson),
    imageUrl: row.jellyfinServerKey.startsWith("meta-egg:")
      ? null
      : `/api/media/${encodeURIComponent(row.jellyfinItemId)}/image`,
  };
}

function noteRowToContract(row: NoteRow): Note {
  return {
    id: row.id,
    mediaId: row.mediaId,
    atSeconds: row.atSeconds,
    body: row.body,
    color: row.color,
    rating: row.rating,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSettings(userId: string): Promise<UserSettings> {
  const [existing] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  if (!existing) {
    await db.insert(userSettings).values({ userId }).onConflictDoNothing();
    return userSettingsSchema.parse({
      preferredJellyfinUserId: null,
      preferredDeviceId: null,
      preferredSubtitleLanguage: "eng",
      noteLeadSeconds: 2,
      noteTrailSeconds: 12,
      defaultNoteColor: "amber",
    });
  }
  return userSettingsSchema.parse({
    preferredJellyfinUserId: existing.preferredJellyfinUserId,
    preferredDeviceId: existing.preferredDeviceId,
    preferredSubtitleLanguage: existing.preferredSubtitleLanguage,
    noteLeadSeconds: existing.noteLeadSeconds,
    noteTrailSeconds: existing.noteTrailSeconds,
    defaultNoteColor: existing.defaultNoteColor,
  });
}

export async function updateSettings(
  userId: string,
  input: UpdateUserSettings,
): Promise<UserSettings> {
  await getSettings(userId);
  await db
    .update(userSettings)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
  return getSettings(userId);
}

export async function resolveMedia(
  userId: string,
  serverKey: string,
  incoming: Media,
): Promise<Media> {
  const sourceKey = incoming.mediaSourceId ?? "";
  const where = and(
    eq(mediaItems.userId, userId),
    eq(mediaItems.jellyfinServerKey, serverKey),
    eq(mediaItems.jellyfinItemId, incoming.jellyfinItemId),
    eq(mediaItems.mediaSourceId, sourceKey),
  );
  const [existing] = await db.select().from(mediaItems).where(where).limit(1);
  const now = new Date();

  if (existing) {
    const preserveOverride = existing.runtimeSource === "manual";
    const runtimeSeconds = preserveOverride
      ? existing.runtimeSeconds
      : incoming.runtimeSeconds;
    const runtimeSource = preserveOverride
      ? existing.runtimeSource
      : incoming.runtimeSeconds == null
        ? existing.runtimeSource
        : incoming.runtimeSource;
    const lastSeenAge = now.getTime() - existing.lastSeenAt.getTime();
    const metadataChanged =
      existing.title !== incoming.title ||
      existing.contextTitle !== incoming.contextTitle ||
      existing.runtimeSeconds !== runtimeSeconds ||
      existing.runtimeSource !== runtimeSource ||
      existing.providerIdsJson !== JSON.stringify(incoming.providerIds);

    if (metadataChanged || lastSeenAge > 60_000) {
      await db
        .update(mediaItems)
        .set({
          title: incoming.title,
          contextTitle: incoming.contextTitle,
          kind: incoming.kind,
          year: incoming.year,
          seasonNumber: incoming.seasonNumber,
          episodeNumber: incoming.episodeNumber,
          runtimeSeconds,
          runtimeSource,
          jellyfinRuntimeSeconds: incoming.runtimeSeconds,
          providerIdsJson: JSON.stringify(incoming.providerIds),
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(mediaItems.id, existing.id));
    }

    const [updated] = await db
      .select()
      .from(mediaItems)
      .where(eq(mediaItems.id, existing.id))
      .limit(1);
    return mediaRowToContract(updated ?? existing);
  }

  const id = crypto.randomUUID();
  await db
    .insert(mediaItems)
    .values({
      id,
      userId,
      jellyfinServerKey: serverKey,
      jellyfinItemId: incoming.jellyfinItemId,
      mediaSourceId: sourceKey,
      editionLabel: incoming.editionLabel,
      title: incoming.title,
      contextTitle: incoming.contextTitle,
      kind: incoming.kind,
      year: incoming.year,
      seasonNumber: incoming.seasonNumber,
      episodeNumber: incoming.episodeNumber,
      runtimeSeconds: incoming.runtimeSeconds,
      runtimeSource:
        incoming.runtimeSeconds == null ? "unknown" : incoming.runtimeSource,
      jellyfinRuntimeSeconds: incoming.runtimeSeconds,
      providerIdsJson: JSON.stringify(incoming.providerIds),
      lastSeenAt: now,
    })
    // Multiple tabs can observe the first snapshot concurrently. The unique source key
    // elects one timeline without turning the losing insert into a broken SSE stream.
    .onConflictDoNothing();
  const [created] = await db.select().from(mediaItems).where(where).limit(1);
  if (!created) throw new Error("Failed to create media timeline");
  return mediaRowToContract(created);
}

export async function listMedia(userId: string): Promise<MediaSummary[]> {
  const rows = await db
    .select({
      media: mediaItems,
      noteCount: count(notes.id),
      lastNotedAt: max(notes.updatedAt),
    })
    .from(mediaItems)
    .leftJoin(
      notes,
      and(eq(notes.mediaId, mediaItems.id), eq(notes.userId, userId)),
    )
    .where(eq(mediaItems.userId, userId))
    .groupBy(mediaItems.id)
    .orderBy(desc(mediaItems.lastSeenAt))
    .limit(100);

  return rows.map((row) => {
    const lastNotedAt: unknown = row.lastNotedAt;
    return {
      ...mediaRowToContract(row.media),
      noteCount: row.noteCount,
      lastNotedAt:
        lastNotedAt instanceof Date
          ? lastNotedAt.toISOString()
          : lastNotedAt == null
            ? null
            : new Date(Number(lastNotedAt)).toISOString(),
    };
  });
}

export async function findMedia(
  userId: string,
  mediaId: string,
): Promise<MediaRow | null> {
  const [row] = await db
    .select()
    .from(mediaItems)
    .where(and(eq(mediaItems.id, mediaId), eq(mediaItems.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function hasJellyfinItem(
  userId: string,
  jellyfinItemId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.userId, userId),
        eq(mediaItems.jellyfinItemId, jellyfinItemId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function updateRuntime(
  userId: string,
  mediaId: string,
  input: UpdateRuntimeInput,
): Promise<Media | null> {
  const existing = await findMedia(userId, mediaId);
  if (!existing) return null;
  await db
    .update(mediaItems)
    .set({
      runtimeSeconds: input.runtimeSeconds ?? existing.jellyfinRuntimeSeconds,
      runtimeSource:
        input.runtimeSeconds == null
          ? existing.jellyfinRuntimeSeconds == null
            ? "unknown"
            : existing.jellyfinServerKey.startsWith("meta-egg:")
              ? "meta_egg"
              : "jellyfin"
          : (input.source ?? "manual"),
      ...(input.editionLabel !== undefined
        ? { editionLabel: input.editionLabel }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(mediaItems.id, mediaId));
  const updated = await findMedia(userId, mediaId);
  return updated ? mediaRowToContract(updated) : null;
}

export async function listNotes(
  userId: string,
  mediaId: string,
): Promise<Note[] | null> {
  if (!(await findMedia(userId, mediaId))) return null;
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.mediaId, mediaId)))
    .orderBy(asc(notes.atSeconds), asc(notes.createdAt));
  return rows.map(noteRowToContract);
}

export async function createNote(
  userId: string,
  mediaId: string,
  input: CreateNoteInput,
): Promise<Note | null> {
  if (!(await findMedia(userId, mediaId))) return null;
  const id = crypto.randomUUID();
  await db.insert(notes).values({
    id,
    userId,
    mediaId,
    ...input,
    atSeconds: Math.round(input.atSeconds),
  });
  const [created] = await db
    .select()
    .from(notes)
    .where(eq(notes.id, id))
    .limit(1);
  return created ? noteRowToContract(created) : null;
}

export async function updateNote(
  userId: string,
  noteId: string,
  input: UpdateNoteInput,
): Promise<Note | null> {
  const [existing] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1);
  if (!existing) return null;
  await db
    .update(notes)
    .set({
      ...input,
      ...(input.atSeconds === undefined
        ? {}
        : { atSeconds: Math.round(input.atSeconds) }),
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId));
  const [updated] = await db
    .select()
    .from(notes)
    .where(eq(notes.id, noteId))
    .limit(1);
  return updated ? noteRowToContract(updated) : null;
}

export async function deleteNote(
  userId: string,
  noteId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning({ id: notes.id });
  return deleted.length > 0;
}
