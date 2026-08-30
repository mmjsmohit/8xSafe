import { and, eq } from "drizzle-orm";
import { meResponseSchema, type MeResponse, type OnboardingProfileRequest, type UpdateMeRequest } from "@call-screener/contracts";
import type { Database } from "../db/client.js";
import { phoneNumbers, users } from "../db/schema.js";

export type StoredUser = typeof users.$inferSelect;

export async function findUserByEmail(db: Database, email: string): Promise<StoredUser | null> {
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0] ?? null;
}

export async function findUserById(db: Database, id: string): Promise<StoredUser | null> {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createUser(input: {
  db: Database;
  email: string;
  passwordHash: string;
  displayName?: string | null;
  forwardingNumber?: string | null;
}): Promise<StoredUser> {
  const result = await input.db.insert(users).values({
    email: input.email,
    passwordHash: input.passwordHash,
    displayName: input.displayName ?? null,
    forwardingNumber: input.forwardingNumber ?? null
  }).returning();
  const user = result[0];
  if (user === undefined) throw new Error("User insert did not return a row");
  return user;
}

export async function updateOwnerProfile(input: {
  db: Database;
  ownerId: string;
  profile: UpdateMeRequest | OnboardingProfileRequest;
  completeOnboarding?: boolean;
}): Promise<StoredUser | null> {
  const update = {
    ...input.profile,
    ...(input.completeOnboarding === true ? { onboardingCompletedAt: new Date() } : {}),
    updatedAt: new Date()
  };
  const result = await input.db.update(users).set(update).where(eq(users.id, input.ownerId)).returning();
  return result[0] ?? null;
}

export async function findOwnerMe(input: { db: Database; ownerId: string }): Promise<MeResponse | null> {
  const result = await input.db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      forwardingNumber: users.forwardingNumber,
      voiceStatus: users.voiceStatus,
      voiceConsentedAt: users.voiceConsentedAt,
      voiceUpdatedAt: users.updatedAt,
      onboardingCompletedAt: users.onboardingCompletedAt,
      shieldNumber: phoneNumbers.phoneNumber
    })
    .from(users)
    .innerJoin(phoneNumbers, and(eq(phoneNumbers.ownerId, users.id), eq(phoneNumbers.isActive, true)))
    .where(eq(users.id, input.ownerId))
    .limit(1);
  const owner = result[0];
  if (owner === undefined) return null;

  const hasProfile = owner.displayName !== null && owner.forwardingNumber !== null;
  const onboarding = !hasProfile
    ? { status: "profile_required" }
    : owner.voiceStatus !== "ready"
      ? { status: "voice_required" }
      : { status: "complete", completedAt: (owner.onboardingCompletedAt ?? owner.voiceUpdatedAt).toISOString() };
  const voice = owner.voiceStatus === "not_started"
    ? { status: "not_started" }
    : owner.voiceStatus === "processing" && owner.voiceConsentedAt !== null
      ? { status: "processing", consentedAt: owner.voiceConsentedAt.toISOString() }
      : owner.voiceStatus === "ready" && owner.voiceConsentedAt !== null
        ? { status: "ready", consentedAt: owner.voiceConsentedAt.toISOString(), updatedAt: owner.voiceUpdatedAt.toISOString() }
        : { status: "failed", retryable: true };

  return meResponseSchema.parse({
    id: owner.id,
    email: owner.email,
    displayName: owner.displayName,
    forwardingNumber: owner.forwardingNumber,
    shieldNumber: owner.shieldNumber,
    onboarding,
    voice
  });
}
