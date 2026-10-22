import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { eq } from "drizzle-orm";
import {
  personalJellyfinSchema,
  type PersonalJellyfinInput,
} from "@film-introspect/contracts";
import { db } from "../db";
import { userJellyfin } from "../db/schema";
import { env } from "../env";

const key = () =>
  Buffer.from(
    hkdfSync(
      "sha256",
      env.BETTER_AUTH_SECRET,
      "introspect",
      "jellyfin-credentials-v1",
      32,
    ),
  );
export function encryptCredential(userId: string, url: string, value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(JSON.stringify([userId, url])));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64",
  );
}
export function decryptCredential(userId: string, url: string, value: string) {
  const bytes = Buffer.from(value, "base64");
  const cipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  cipher.setAAD(Buffer.from(JSON.stringify([userId, url])));
  return Buffer.concat([
    cipher.update(bytes.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
export const findJellyfin = (userId: string) =>
  db.select().from(userJellyfin).where(eq(userJellyfin.userId, userId)).get();
export function jellyfinSummary(userId: string) {
  const row = findJellyfin(userId);
  return personalJellyfinSchema.parse({
    configured: !!row,
    url: row?.url ?? null,
    serverName: row?.serverName ?? null,
  });
}
export function jellyfinContext(userId: string) {
  const row = findJellyfin(userId);
  if (!row) return null;
  return {
    url: row.url,
    apiKey: decryptCredential(userId, row.url, row.credential),
    userId: row.jellyfinUserId,
  };
}
export function saveJellyfin(
  userId: string,
  input: PersonalJellyfinInput,
  serverName: string,
  jellyfinUserId: string | null,
) {
  const url = input.url.replace(/\/+$/, "");
  const values = {
    userId,
    url,
    serverName,
    jellyfinUserId,
    credential: encryptCredential(userId, url, input.apiKey),
  };
  db.insert(userJellyfin)
    .values(values)
    .onConflictDoUpdate({ target: userJellyfin.userId, set: values })
    .run();
  return jellyfinSummary(userId);
}
export function removeJellyfin(userId: string) {
  db.delete(userJellyfin).where(eq(userJellyfin.userId, userId)).run();
  return jellyfinSummary(userId);
}
