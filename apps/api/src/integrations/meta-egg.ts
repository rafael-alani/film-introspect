import { z } from "zod";
import {
  screeningMoviesSchema,
  screeningMovieDetailSchema,
  screeningTranscriptSchema,
  screeningSessionsSchema,
} from "@film-introspect/contracts";
import { env } from "../env";

export class MetaEggError extends Error {}

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
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new MetaEggError(
      "Meta Egg is unreachable. Check its connection and try again.",
    );
  }
  if (!response.ok)
    throw new MetaEggError(
      `Meta Egg could not complete this request (${response.status}). Check the selected cut and its text subtitles, then try again.`,
    );
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
