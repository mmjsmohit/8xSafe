import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { refreshTokens, users } from "../db/schema.js";

const refreshTokenRowSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  familyId: z.uuid(),
  expiresAt: z.coerce.date(),
  rotatedAt: z.coerce.date().nullable(),
  revokedAt: z.coerce.date().nullable()
});

export type RefreshRotation =
  | { kind: "missing" }
  | { kind: "expired" }
  | { kind: "reused" }
  | { kind: "rotated"; user: typeof users.$inferSelect };

export async function createRefreshToken(input: {
  db: Database;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}): Promise<void> {
  await input.db.insert(refreshTokens).values({
    userId: input.userId,
    tokenHash: input.tokenHash,
    familyId: input.familyId,
    expiresAt: input.expiresAt
  });
}

export async function revokeRefreshToken(input: { db: Database; tokenHash: string }): Promise<void> {
  await input.db.update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, input.tokenHash), isNull(refreshTokens.revokedAt)));
}

export async function rotateRefreshToken(input: {
  db: Database;
  tokenHash: string;
  replacementTokenHash: string;
  replacementExpiresAt: Date;
}): Promise<RefreshRotation> {
  return input.db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, user_id AS "userId", family_id AS "familyId", expires_at AS "expiresAt",
             rotated_at AS "rotatedAt", revoked_at AS "revokedAt"
      FROM refresh_tokens
      WHERE token_hash = ${input.tokenHash}
      FOR UPDATE
    `);
    const row = rows.rows[0];
    if (row === undefined) return { kind: "missing" };
    const token = refreshTokenRowSchema.parse(row);

    if (token.revokedAt !== null || token.rotatedAt !== null) {
      await tx.execute(sql`
        UPDATE refresh_tokens
        SET revoked_at = NOW()
        WHERE family_id = ${token.familyId} AND revoked_at IS NULL
      `);
      return { kind: "reused" };
    }
    if (token.expiresAt.getTime() <= Date.now()) {
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, token.id));
      return { kind: "expired" };
    }

    const replacements = await tx.insert(refreshTokens).values({
      userId: token.userId,
      tokenHash: input.replacementTokenHash,
      familyId: token.familyId,
      expiresAt: input.replacementExpiresAt
    }).returning({ id: refreshTokens.id });
    const replacement = replacements[0];
    if (replacement === undefined) throw new Error("Refresh token insert did not return a row");
    await tx.update(refreshTokens).set({ rotatedAt: new Date(), replacedById: replacement.id }).where(eq(refreshTokens.id, token.id));

    const foundUsers = await tx.select().from(users).where(eq(users.id, token.userId)).limit(1);
    const user = foundUsers[0];
    if (user === undefined) throw new Error("Refresh token user was not found");
    return { kind: "rotated", user };
  });
}
