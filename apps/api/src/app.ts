import {
  screeningSelectionSchema,
  personalJellyfinInputSchema,
  appConfigSchema,
  connectionsResponseSchema,
  createNoteInputSchema,
  healthResponseSchema,
  mediaListResponseSchema,
  mediaSchema,
  metadataLookupInputSchema,
  metadataLookupResponseSchema,
  noteSchema,
  notesResponseSchema,
  playbackSnapshotSchema,
  sessionsResponseSchema,
  subtitlesResponseSchema,
  updateNoteInputSchema,
  updateRuntimeInputSchema,
  updateUserSettingsSchema,
  userSettingsSchema,
} from "@film-introspect/contracts";
import type { Context } from "hono";
import {
  jellyfinContext,
  jellyfinSummary,
  saveJellyfin,
  removeJellyfin,
} from "./services/jellyfin-settings";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { auth } from "./auth";
import { env } from "./env";
import { errorResponse } from "./http";
import { jellyfinClient } from "./integrations/jellyfin/client";
import { jellyfinSync } from "./integrations/jellyfin/sync";
import { metaEgg, MetaEggError } from "./integrations/meta-egg";
import { omdbClient } from "./integrations/omdb";
import {
  getConnectionStatuses,
  getPlaybackSnapshot,
  getSessions,
  getSubtitles,
  selectSession,
} from "./services/playback";
import {
  resolveMedia,
  createNote,
  deleteNote,
  getSettings,
  hasJellyfinItem,
  listMedia,
  listNotes,
  updateNote,
  updateRuntime,
  updateSettings,
} from "./services/repository";
import { LOCAL_APP_USER } from "./services/local-user";

type Variables = {
  authUser: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
};

type AppContext = { Variables: Variables };

export const app = new Hono<AppContext>({ strict: false });

app.use("*", logger());
app.use("*", secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));
app.use(
  "*",
  cors({
    origin: env.WEB_ORIGIN,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 600,
  }),
);

app.get("/api/health", (c) =>
  c.json(
    healthResponseSchema.parse({
      ok: true,
      version: "0.1.0",
      time: new Date().toISOString(),
    }),
  ),
);

app.get("/api/config", (c) =>
  c.json(
    appConfigSchema.parse({
      authEnabled: env.APP_AUTH_ENABLED,
      demoMode: env.DEMO_MODE,
    }),
  ),
);

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const api = new Hono<AppContext>();

api.use("*", async (c, next) => {
  if (!env.APP_AUTH_ENABLED) {
    c.set("authUser", LOCAL_APP_USER);
    await next();
    return;
  }
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session)
    return errorResponse(c, 401, "UNAUTHORIZED", "Sign in to continue");
  c.set("authUser", {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  });
  await next();
});

api.use("/settings/jellyfin", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (
    c.req.method !== "GET" &&
    c.req.header("Origin") &&
    c.req.header("Origin") !== env.WEB_ORIGIN
  )
    return errorResponse(
      c,
      403,
      "INVALID_ORIGIN",
      "Open Settings from Introspect to change this connection.",
    );
  await next();
});
api.get("/settings/jellyfin", (c) =>
  c.json(jellyfinSummary(c.get("authUser").id)),
);
api.post(
  "/settings/jellyfin",
  zValidator("json", personalJellyfinInputSchema, (result, c) => {
    if (!result.success)
      return errorResponse(
        c,
        400,
        "INVALID_CONNECTION",
        "Enter a valid Jellyfin server address and API key.",
      );
  }),
  async (c) => {
    const input = c.req.valid("json");
    const { data } = await metaEgg.connection(input);
    return c.json(
      saveJellyfin(c.get("authUser").id, input, data.serverName, data.userId),
    );
  },
);
api.delete("/settings/jellyfin", (c) =>
  c.json(removeJellyfin(c.get("authUser").id)),
);
api.get("/screening/status", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await metaEgg.status());
});
function screeningConnection(c: Context<AppContext>, selected?: string) {
  const source = selected ?? c.req.query("source") ?? "external";
  if (source === "external") return null;
  if (source !== "jellyfin")
    throw new MetaEggError("Choose Any screen or your Jellyfin server.");
  const connection = jellyfinContext(c.get("authUser").id);
  if (!connection)
    throw new MetaEggError("Connect your Jellyfin server in Settings first.");
  return connection;
}
api.use("/screening/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

api.get("/screening/movies", async (c) => {
  const query = (c.req.query("query") ?? "").trim();
  if (!query || query.length > 200)
    return errorResponse(
      c,
      400,
      "INVALID_QUERY",
      "Enter a film title between 1 and 200 characters.",
    );
  return c.json(await metaEgg.movies(query, screeningConnection(c)));
});
api.get("/screening/movies/:itemId", async (c) =>
  c.json(await metaEgg.movie(c.req.param("itemId"), screeningConnection(c))),
);
api.get("/screening/movies/:itemId/cuts/:cutId/subtitles/:index", async (c) => {
  const index = Number(c.req.param("index"));
  if (!Number.isInteger(index) || index < 0)
    return errorResponse(c, 400, "INVALID_TRACK", "Choose a subtitle track.");
  return c.json(
    await metaEgg.transcript(
      c.req.param("itemId"),
      c.req.param("cutId"),
      index,
      screeningConnection(c),
    ),
  );
});
api.get("/screening/sessions", async (c) => {
  const itemId = c.req.query("itemId");
  if (itemId !== undefined && (!itemId.trim() || itemId.length > 200))
    return errorResponse(c, 400, "INVALID_ITEM", "Choose a film first.");
  return c.json(await metaEgg.sessions(itemId, screeningConnection(c)));
});
api.post(
  "/screening/timeline",
  zValidator("json", screeningSelectionSchema, (result, c) => {
    if (!result.success)
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "Choose a film and cut from Meta Egg.",
      );
  }),
  async (c) => {
    const { itemId, cutId, source } = c.req.valid("json");
    const connection = screeningConnection(c, source);
    const { data: movie } = await metaEgg.movie(itemId, connection);
    const cut = movie.cuts.find((entry) => entry.id === cutId);
    if (!cut)
      return errorResponse(
        c,
        404,
        "CUT_NOT_FOUND",
        "This cut is no longer available. Choose it again.",
      );
    const media = await resolveMedia(
      c.get("authUser").id,
      connection
        ? `jellyfin:${connection.url}`
        : `meta-egg:${env.META_EGG_URL?.replace(/\/$/, "")}`,
      {
        id: null,
        jellyfinItemId: movie.id,
        mediaSourceId: cut.id,
        editionLabel: cut.label,
        title: movie.title,
        contextTitle: movie.contextTitle ?? null,
        kind: movie.kind ?? "movie",
        year: movie.year,
        seasonNumber: movie.seasonNumber ?? null,
        episodeNumber: movie.episodeNumber ?? null,
        runtimeSeconds: cut.runtimeSeconds,
        runtimeSource: connection ? "jellyfin" : "meta_egg",
        providerIds: {},
        imageUrl: null,
      },
    );
    return c.json(mediaSchema.parse({ ...media, imageUrl: null }));
  },
);

api.get("/playback", async (c) => {
  const user = c.get("authUser");
  const settings = await getSettings(user.id);
  return c.json(
    playbackSnapshotSchema.parse(await getPlaybackSnapshot(user.id, settings)),
  );
});

api.get("/playback/sessions", async (c) => {
  const settings = await getSettings(c.get("authUser").id);
  return c.json(sessionsResponseSchema.parse(getSessions(settings)));
});

api.patch(
  "/playback/sessions",
  zValidator(
    "json",
    z.object({ sessionId: z.string().min(1).nullable() }),
    (result, c) => {
      if (!result.success) {
        return errorResponse(
          c,
          400,
          "VALIDATION_ERROR",
          "Invalid session selection",
          result.error.issues,
        );
      }
    },
  ),
  async (c) => {
    const user = c.get("authUser");
    const settings = await getSettings(user.id);
    const response = await selectSession(
      user.id,
      settings,
      c.req.valid("json").sessionId,
    );
    if (!response)
      return errorResponse(
        c,
        404,
        "SESSION_NOT_FOUND",
        "Playback session not found",
      );
    return c.json(sessionsResponseSchema.parse(response));
  },
);

api.get("/playback/subtitles", async (c) => {
  const settings = await getSettings(c.get("authUser").id);
  try {
    return c.json(subtitlesResponseSchema.parse(await getSubtitles(settings)));
  } catch (error) {
    return errorResponse(
      c,
      502,
      "SUBTITLES_UNAVAILABLE",
      error instanceof Error
        ? error.message
        : "Jellyfin subtitles are unavailable",
    );
  }
});

api.get("/playback/events", async (c) => {
  const user = c.get("authUser");
  return streamSSE(c, async (stream) => {
    let active = true;
    let writeQueue = Promise.resolve();
    const unsubscribe = jellyfinSync.subscribe((state) => {
      writeQueue = writeQueue
        .then(async () => {
          if (!active) return;
          const snapshot = playbackSnapshotSchema.parse(
            await getPlaybackSnapshot(user.id, await getSettings(user.id)),
          );
          await stream.writeSSE({
            event: "playback",
            id: state.observedAt,
            data: JSON.stringify(snapshot),
          });
        })
        .catch(() => {
          active = false;
        });
    });

    stream.onAbort(() => {
      active = false;
      unsubscribe();
    });

    try {
      while (active && !stream.aborted) {
        // Bun closes idle HTTP streams after roughly ten seconds by default.
        await stream.sleep(5_000);
        if (active && !stream.aborted) {
          await stream.writeSSE({
            event: "heartbeat",
            data: new Date().toISOString(),
          });
        }
      }
    } finally {
      active = false;
      unsubscribe();
    }
  });
});

api.get("/connections", async (c) =>
  c.json(connectionsResponseSchema.parse(await getConnectionStatuses())),
);

api.get("/settings", async (c) =>
  c.json(userSettingsSchema.parse(await getSettings(c.get("authUser").id))),
);

api.patch(
  "/settings",
  zValidator("json", updateUserSettingsSchema, (result, c) => {
    if (!result.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "Invalid settings",
        result.error.issues,
      );
    }
  }),
  async (c) =>
    c.json(
      userSettingsSchema.parse(
        await updateSettings(c.get("authUser").id, c.req.valid("json")),
      ),
    ),
);

api.get("/media", async (c) =>
  c.json(
    mediaListResponseSchema.parse({
      items: await listMedia(c.get("authUser").id),
    }),
  ),
);

api.get("/media/:jellyfinItemId/image", async (c) => {
  const itemId = c.req.param("jellyfinItemId");
  if (!(await hasJellyfinItem(c.get("authUser").id, itemId))) {
    return errorResponse(c, 404, "MEDIA_NOT_FOUND", "Media timeline not found");
  }
  if (env.DEMO_MODE && itemId === "demo-movie") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a33b20"/><stop offset=".5" stop-color="#4a1818"/><stop offset="1" stop-color="#111513"/></linearGradient><filter id="n"><feTurbulence baseFrequency=".9" numOctaves="4" stitchTiles="stitch"/><feBlend mode="soft-light" in2="SourceGraphic"/></filter></defs><rect width="600" height="900" fill="url(#g)"/><circle cx="420" cy="260" r="180" fill="#f0bf7a" opacity=".18"/><rect width="600" height="900" filter="url(#n)" opacity=".2"/><text x="48" y="760" fill="#f6eee1" font-family="serif" font-size="50">IN THE MOOD</text><text x="48" y="818" fill="#f6eee1" font-family="serif" font-size="50">FOR LOVE</text></svg>`;
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }
  try {
    const upstream = await jellyfinClient.getImage(
      itemId,
      new URL(c.req.url).searchParams,
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return errorResponse(
      c,
      502,
      "IMAGE_UNAVAILABLE",
      error instanceof Error ? error.message : "Jellyfin image is unavailable",
    );
  }
});

api.get("/media/:mediaId/notes", async (c) => {
  const result = await listNotes(c.get("authUser").id, c.req.param("mediaId"));
  if (!result)
    return errorResponse(c, 404, "MEDIA_NOT_FOUND", "Media timeline not found");
  return c.json(notesResponseSchema.parse({ notes: result }));
});

api.post(
  "/media/:mediaId/notes",
  zValidator("json", createNoteInputSchema, (result, c) => {
    if (!result.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "Invalid note",
        result.error.issues,
      );
    }
  }),
  async (c) => {
    const note = await createNote(
      c.get("authUser").id,
      c.req.param("mediaId"),
      c.req.valid("json"),
    );
    if (!note)
      return errorResponse(
        c,
        404,
        "MEDIA_NOT_FOUND",
        "Media timeline not found",
      );
    return c.json(noteSchema.parse(note), 201);
  },
);

api.patch(
  "/media/:mediaId/runtime",
  zValidator("json", updateRuntimeInputSchema, (result, c) => {
    if (!result.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "Invalid runtime",
        result.error.issues,
      );
    }
  }),
  async (c) => {
    const media = await updateRuntime(
      c.get("authUser").id,
      c.req.param("mediaId"),
      c.req.valid("json"),
    );
    if (!media)
      return errorResponse(
        c,
        404,
        "MEDIA_NOT_FOUND",
        "Media timeline not found",
      );
    return c.json(mediaSchema.parse(media));
  },
);

api.patch(
  "/notes/:noteId",
  zValidator("json", updateNoteInputSchema, (result, c) => {
    if (!result.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "Invalid note update",
        result.error.issues,
      );
    }
  }),
  async (c) => {
    const note = await updateNote(
      c.get("authUser").id,
      c.req.param("noteId"),
      c.req.valid("json"),
    );
    if (!note) return errorResponse(c, 404, "NOTE_NOT_FOUND", "Note not found");
    return c.json(noteSchema.parse(note));
  },
);

api.delete("/notes/:noteId", async (c) => {
  const deleted = await deleteNote(c.get("authUser").id, c.req.param("noteId"));
  if (!deleted)
    return errorResponse(c, 404, "NOTE_NOT_FOUND", "Note not found");
  return c.body(null, 204);
});

api.post(
  "/metadata/lookup",
  zValidator("json", metadataLookupInputSchema, (result, c) => {
    if (!result.success) {
      return errorResponse(
        c,
        400,
        "VALIDATION_ERROR",
        "Invalid IMDb id",
        result.error.issues,
      );
    }
  }),
  async (c) => {
    try {
      return c.json(
        metadataLookupResponseSchema.parse(
          await omdbClient.lookup(c.req.valid("json").imdbId),
        ),
      );
    } catch (error) {
      return errorResponse(
        c,
        omdbClient.configured ? 502 : 503,
        "METADATA_UNAVAILABLE",
        error instanceof Error ? error.message : "Metadata lookup failed",
      );
    }
  },
);

app.route("/api", api);

app.notFound((c) => errorResponse(c, 404, "NOT_FOUND", "Route not found"));
app.onError((error, c) => {
  if (error instanceof MetaEggError)
    return errorResponse(c, 502, "META_EGG_UNAVAILABLE", error.message);
  console.error(error);
  return errorResponse(
    c,
    500,
    "INTERNAL_ERROR",
    env.NODE_ENV === "production" ? "Something went wrong" : error.message,
  );
});

export type AppType = typeof app;
