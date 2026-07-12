import { db } from "../db";
import { user } from "../db/schema";

export const LOCAL_APP_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Local viewer",
  email: "local@introspect.invalid",
  image: null,
} as const;

export async function ensureLocalAppUser(): Promise<void> {
  const now = new Date();
  await db
    .insert(user)
    .values({
      ...LOCAL_APP_USER,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}
