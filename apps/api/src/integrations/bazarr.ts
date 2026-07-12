import { env } from "../env";
import {
  asRecord,
  readRecord,
  readString,
  type JsonRecord,
} from "./jellyfin/types";

export class BazarrClient {
  private readonly apiBase = env.BAZARR_URL
    ? `${env.BAZARR_URL.replace(/\/$/, "")}${env.BAZARR_URL.replace(/\/$/, "").endsWith("/api") ? "" : "/api"}`
    : null;

  get configured(): boolean {
    return Boolean(this.apiBase && env.BAZARR_API_KEY);
  }

  private async get(path: string): Promise<unknown> {
    if (!this.apiBase || !env.BAZARR_API_KEY)
      throw new Error("Bazarr is not configured");
    const response = await fetch(`${this.apiBase}${path}`, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": env.BAZARR_API_KEY,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Bazarr returned ${response.status}`);
    return response.json();
  }

  async getStatus(): Promise<{ version: string | null; raw: JsonRecord }> {
    const raw = asRecord(await this.get("/system/status"));
    if (!raw) throw new Error("Invalid Bazarr status response");
    const data = readRecord(raw, "data") ?? raw;
    return {
      version:
        readString(data, "bazarr_version") ??
        readString(data, "BazarrVersion") ??
        readString(data, "version"),
      raw,
    };
  }
}

export const bazarrClient = new BazarrClient();
