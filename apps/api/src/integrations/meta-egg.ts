import { z } from "zod";
import {
  screeningMoviesSchema,
  screeningMovieDetailSchema,
  screeningTranscriptSchema,
  screeningSessionsSchema,
} from "@film-introspect/contracts";
import { env } from "../env";

export class MetaEggError extends Error {}

const sourceErrors = {
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
};
const sourceErrorSchema = z.object({
  code: z.enum([
    "discovery_unavailable",
    "transcripts_not_configured",
    "transcript_auth_failed",
    "transcript_quota_exceeded",
    "transcript_unavailable",
  ]),
});

export async function metaEggRequest<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!env.META_EGG_URL)
    throw new MetaEggError(
      "Meta Egg is not configured. Set META_EGG_URL on the Introspect API.",
    );
  let response: Response;
  try {
    response = await fetch(
      `${env.META_EGG_URL.replace(/\/$/, "")}/v1/screening/${path}`,
      {
        headers: { Accept: "application/json" },
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
  movies: (query: string) =>
    metaEggRequest(
      `movies?query=${encodeURIComponent(query)}`,
      screeningMoviesSchema,
    ),
  movie: async (id: string) => {
    const result = await metaEggRequest(
      `movies/${encodeURIComponent(id)}`,
      screeningMovieDetailSchema,
    );
    if (result.data.id !== id)
      throw new MetaEggError(
        "Meta Egg returned another film. Choose the film again.",
      );
    return result;
  },
  transcript: async (itemId: string, cutId: string, index: number) => {
    const result = await metaEggRequest(
      `movies/${encodeURIComponent(itemId)}/cuts/${encodeURIComponent(cutId)}/subtitles/${index}`,
      screeningTranscriptSchema,
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
  sessions: (itemId: string) =>
    metaEggRequest(
      `sessions?itemId=${encodeURIComponent(itemId)}`,
      screeningSessionsSchema,
    ),
};
