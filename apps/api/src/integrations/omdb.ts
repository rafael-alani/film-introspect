import { type MetadataLookupResponse } from "@film-introspect/contracts";
import { env } from "../env";
import { asRecord, readString } from "./jellyfin/types";

export class OmdbClient {
  get configured(): boolean {
    return Boolean(env.OMDB_API_KEY);
  }

  async lookup(imdbId: string): Promise<MetadataLookupResponse> {
    if (!env.OMDB_API_KEY) throw new Error("OMDb is not configured");
    const url = new URL("https://www.omdbapi.com/");
    url.searchParams.set("apikey", env.OMDB_API_KEY);
    url.searchParams.set("i", imdbId);
    url.searchParams.set("r", "json");

    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`OMDb returned ${response.status}`);
    const raw = asRecord(await response.json());
    if (!raw || readString(raw, "Response") === "False") {
      throw new Error(readString(raw, "Error") ?? "OMDb title was not found");
    }

    const runtimeMatch = readString(raw, "Runtime")?.match(/^(\d+)\s+min$/i);
    const yearMatch = readString(raw, "Year")?.match(/^\d{4}/);
    return {
      title: readString(raw, "Title") ?? "Untitled",
      year: yearMatch ? Number(yearMatch[0]) : null,
      runtimeSeconds: runtimeMatch ? Number(runtimeMatch[1]) * 60 : null,
      imdbId: readString(raw, "imdbID") ?? imdbId,
      source: "omdb",
    };
  }
}

export const omdbClient = new OmdbClient();
