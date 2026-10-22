import { z } from "zod";
import {
  screeningMoviesSchema,
  jellyfinConnectionResultSchema,
  screeningServiceStatusSchema,
  screeningMovieDetailSchema,
  screeningTranscriptSchema,
  screeningSessionsSchema,
} from "@film-introspect/contracts";
import { env } from "../env";

export type JellyfinContext = {
  url: string;
  apiKey: string;
  userId?: string | null;
};

export class MetaEggError extends Error {}

const sourceErrors = {
  jellyfin_auth_failed:
    "Jellyfin rejected this key or its permissions. Update the connection in Settings.",
  discovery_unavailable:
    "Meta Egg's online film search is temporarily unavailable. Try again shortly.",
  transcripts_not_configured:
    "Meta Egg found the film, but its online subtitle provider is not configured. Ask the operator to connect it, then retry.",
  transcript_auth_failed:
    "Meta Egg's subtitle provider rejected its credentials. Ask the operator to check the provider connection, then retry.",
  transcript_quota_exceeded:
    "Meta Egg's subtitle provider has reached its download or request limit. Retry after the provider's quota resets.",
  transcript_unavailable:
    "Meta Egg could not retrieve this subtitle version. Try again shortly or choose another matching version.",
  screening_storage_unavailable:
    "Meta Egg could not safely read or save its private screening library. Ask the operator to check the service, then retry.",
};
const sourceErrorSchema = z.object({
  code: z.enum([
    "jellyfin_auth_failed",
    "discovery_unavailable",
    "transcripts_not_configured",
    "transcript_auth_failed",
    "transcript_quota_exceeded",
    "transcript_unavailable",
    "screening_storage_unavailable",
  ]),
});

export async function metaEggRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  connection?: JellyfinContext | null,
): Promise<T> {
  if (!env.META_EGG_URL)
    throw new MetaEggError(
      "The film service is not connected. Ask the operator to connect it, then retry.",
    );
  let response: Response;
  try {
    response = await fetch(
      `${env.META_EGG_URL.replace(/\/$/, "")}/v1/screening/${path}`,
      {
        headers: {
          Accept: "application/json",
          ...(connection
            ? {
                "X-Jellyfin-Url": connection.url,
                "X-Jellyfin-Key": connection.apiKey,
                ...(connection.userId
                  ? { "X-Jellyfin-User": connection.userId }
                  : {}),
              }
            : {}),
        },
        redirect: "error",
        signal: AbortSignal.timeout(env.META_EGG_TIMEOUT_MS),
      },
    );
  } catch {
    throw new MetaEggError(
      "Meta Egg is unreachable. Check its connection and try again.",
    );
  }
  if (!response.ok) {
    const problem = sourceErrorSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (problem.success)
      throw new MetaEggError(sourceErrors[problem.data.code]);
    if (response.status === 503)
      throw new MetaEggError(
        "Meta Egg's film search is unavailable. Try again shortly or ask the operator to check its source configuration.",
      );
    throw new MetaEggError(
      `Meta Egg could not complete this request (${response.status}). Check the selected cut and its text subtitles, then try again.`,
    );
  }
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success)
    throw new MetaEggError(
      "Meta Egg returned an incompatible screening response.",
    );
  return parsed.data;
}
export const metaEgg = {
  connection: (connection: JellyfinContext) =>
    metaEggRequest("connection", jellyfinConnectionResultSchema, connection),
  status: () => metaEggRequest("status", screeningServiceStatusSchema),
  movies: (query: string, connection?: JellyfinContext | null) =>
    metaEggRequest(
      `movies?query=${encodeURIComponent(query)}&source=${connection ? "jellyfin" : "external"}`,
      screeningMoviesSchema,
      connection,
    ),
  movie: async (id: string, connection?: JellyfinContext | null) => {
    const result = await metaEggRequest(
      `movies/${encodeURIComponent(id)}?source=${connection ? "jellyfin" : "external"}`,
      screeningMovieDetailSchema,
      connection,
    );
    if (result.data.id !== id)
      throw new MetaEggError(
        "Meta Egg returned another film. Choose the film again.",
      );
    return result;
  },
  transcript: async (
    itemId: string,
    cutId: string,
    index: number,
    connection?: JellyfinContext | null,
  ) => {
    const result = await metaEggRequest(
      `movies/${encodeURIComponent(itemId)}/cuts/${encodeURIComponent(cutId)}/subtitles/${index}?source=${connection ? "jellyfin" : "external"}`,
      screeningTranscriptSchema,
      connection,
    );
    if (
      result.data.itemId !== itemId ||
      result.data.cutId !== cutId ||
      result.data.trackId !== String(index)
    )
      throw new MetaEggError(
        "Meta Egg returned subtitles for a different film, cut, or track. Reload the selected version.",
      );
    return result;
  },
  sessions: (itemId: string | undefined, connection?: JellyfinContext | null) =>
    metaEggRequest(
      `sessions?source=${connection ? "jellyfin" : "external"}${itemId === undefined ? "" : `&itemId=${encodeURIComponent(itemId)}`}`,
      screeningSessionsSchema,
      connection,
    ),
};
