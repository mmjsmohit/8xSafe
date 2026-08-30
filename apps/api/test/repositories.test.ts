import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { deleteAllCalls, deleteCall, findCallDetail, listCalls } from "../src/repositories/calls.js";
import { rotateRefreshToken } from "../src/repositories/refresh-tokens.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const callIds = [
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444"
];
const tokenId = "55555555-5555-4555-8555-555555555555";
const familyId = "66666666-6666-4666-8666-666666666666";
const dialect = new PgDialect();

function callRow(id: string, startedAt: string) {
  return {
    id,
    callerNumber: "+14155550101",
    callerDisplayName: "Caller",
    category: "business",
    outcome: "message_taken",
    riskScore: 0.2,
    startedAt: new Date(startedAt),
    durationSeconds: 42
  };
}

function render(statement: SQL): { sql: string; params: unknown[] } {
  return dialect.sqlToQuery(statement);
}

describe("refresh token repository", () => {
  it("treats a token not found under the row lock as missing", async () => {
    const db = {
      transaction: (callback: (transaction: { execute: () => Promise<{ rows: unknown[] }> }) => unknown) =>
        Promise.resolve(callback({ execute: () => Promise.resolve({ rows: [] }) }))
    };

    await expect(rotateRefreshToken({
      db: db as never,
      tokenHash: "old-hash",
      replacementTokenHash: "new-hash",
      replacementExpiresAt: new Date("2026-02-01T00:00:00.000Z")
    })).resolves.toEqual({ kind: "missing" });
  });

  it("revokes every usable token in the family when an already-rotated token is reused", async () => {
    const statements: SQL[] = [];
    const db = {
      transaction: (callback: (transaction: { execute: (statement: SQL) => Promise<{ rows: unknown[] }> }) => unknown) =>
        Promise.resolve(callback({
          execute: (statement) => {
            statements.push(statement);
            return Promise.resolve({ rows: statements.length === 1 ? [{
              id: tokenId,
              userId: ownerId,
              familyId,
              expiresAt: "2026-02-01T00:00:00.000Z",
              rotatedAt: "2026-01-02T00:00:00.000Z",
              revokedAt: null
            }] : [] });
          }
        }))
    };

    await expect(rotateRefreshToken({
      db: db as never,
      tokenHash: "reused-hash",
      replacementTokenHash: "unused-hash",
      replacementExpiresAt: new Date("2026-02-01T00:00:00.000Z")
    })).resolves.toEqual({ kind: "reused" });

    expect(statements).toHaveLength(2);
    const revocation = render(statements[1]);
    expect(revocation.sql).toContain("UPDATE refresh_tokens");
    expect(revocation.sql).toContain("WHERE family_id = $");
    expect(revocation.sql).toContain("revoked_at IS NULL");
    expect(revocation.params).toEqual([familyId]);
  });

  it("marks an expired token revoked instead of issuing a replacement", async () => {
    const updates: unknown[] = [];
    const db = {
      transaction: (callback: (transaction: {
        execute: () => Promise<{ rows: unknown[] }>;
        update: () => { set: (values: unknown) => { where: (condition: unknown) => Promise<void> } };
      }) => unknown) => Promise.resolve(callback({
        execute: () => Promise.resolve({ rows: [{
          id: tokenId,
          userId: ownerId,
          familyId,
          expiresAt: "2025-01-01T00:00:00.000Z",
          rotatedAt: null,
          revokedAt: null
        }] }),
        update: () => ({ set: (values) => ({ where: () => {
          updates.push(values);
          return Promise.resolve();
        } }) })
      }))
    };

    await expect(rotateRefreshToken({
      db: db as never,
      tokenHash: "expired-hash",
      replacementTokenHash: "unused-hash",
      replacementExpiresAt: new Date("2026-02-01T00:00:00.000Z")
    })).resolves.toEqual({ kind: "expired" });

    expect(updates).toHaveLength(1);
    const update = updates[0];
    if (typeof update !== "object" || update === null || !("revokedAt" in update)) {
      throw new Error("Expected expired token revocation");
    }
    expect(update.revokedAt).toBeInstanceOf(Date);
  });

  it("inserts a replacement and marks the original token rotated for a valid refresh", async () => {
    const inserts: unknown[] = [];
    const updates: unknown[] = [];
    const user = {
      id: ownerId,
      email: "owner@example.com",
      passwordHash: "password-hash",
      displayName: "Owner",
      forwardingNumber: "+14155550100",
      voiceId: null,
      voiceStatus: "ready",
      voiceConsentedAt: new Date("2026-01-01T00:00:00.000Z"),
      onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    };
    const db = {
      transaction: (callback: (transaction: {
        execute: () => Promise<{ rows: unknown[] }>;
        insert: () => { values: (values: unknown) => { returning: () => Promise<Array<{ id: string }>> } };
        update: () => { set: (values: unknown) => { where: (condition: unknown) => Promise<void> } };
        select: () => { from: () => { where: (condition: unknown) => { limit: () => Promise<unknown[]> } } };
      }) => unknown) => Promise.resolve(callback({
        execute: () => Promise.resolve({ rows: [{
          id: tokenId,
          userId: ownerId,
          familyId,
          expiresAt: "2027-02-01T00:00:00.000Z",
          rotatedAt: null,
          revokedAt: null
        }] }),
        insert: () => ({ values: (values) => {
          inserts.push(values);
          return { returning: () => Promise.resolve([{ id: "77777777-7777-4777-8777-777777777777" }]) };
        } }),
        update: () => ({ set: (values) => ({ where: () => {
          updates.push(values);
          return Promise.resolve();
        } }) }),
        select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([user]) }) }) })
      }))
    };

    const rotation = await rotateRefreshToken({
      db: db as never,
      tokenHash: "current-hash",
      replacementTokenHash: "replacement-hash",
      replacementExpiresAt: new Date("2027-02-01T00:00:00.000Z")
    });

    expect(rotation).toMatchObject({ kind: "rotated", user: { id: ownerId } });
    expect(inserts).toHaveLength(1);
    const insert = inserts[0];
    if (typeof insert !== "object" || insert === null || !("tokenHash" in insert) || !("familyId" in insert)) {
      throw new Error("Expected the replacement refresh token to be inserted");
    }
    expect(insert.tokenHash).toBe("replacement-hash");
    expect(insert.familyId).toBe(familyId);
    expect(updates).toHaveLength(1);
  });
});

describe("call repositories", () => {
  it("keeps list cursors tenant-scoped and resumes after the last returned call", async () => {
    const conditions: SQL[] = [];
    const pages = [
      [
        callRow(callIds[0], "2026-01-03T00:00:00.000Z"),
        callRow(callIds[1], "2026-01-02T00:00:00.000Z"),
        callRow(callIds[2], "2026-01-01T00:00:00.000Z")
      ],
      [callRow(callIds[2], "2026-01-01T00:00:00.000Z")]
    ];
    const db = {
      select: () => ({
        from: () => ({
          where: (condition: SQL) => {
            conditions.push(condition);
            return { orderBy: () => ({ limit: () => Promise.resolve(pages.shift() ?? []) }) };
          }
        })
      })
    };

    const first = await listCalls({ db: db as never, ownerId, query: { limit: 2 } });
    const second = await listCalls({ db: db as never, ownerId, query: { limit: 2, cursor: first.nextCursor } });

    expect(first.items.map((item) => item.id)).toEqual(callIds.slice(0, 2));
    expect(first.nextCursor).not.toBeNull();
    expect(second.items.map((item) => item.id)).toEqual([callIds[2]]);
    expect(second.nextCursor).toBeNull();
    expect(render(conditions[0]).params).toContain(ownerId);
    const afterCursor = render(conditions[1]);
    expect(afterCursor.params).toContain(ownerId);
    expect(afterCursor.params).toContain(callIds[1]);
  });

  it("scopes call details and both deletion operations to the authenticated owner", async () => {
    const conditions: SQL[] = [];
    let selectNumber = 0;
    const detail = {
      ...callRow(callIds[0], "2026-01-03T00:00:00.000Z"),
      claimedCompany: "Example Co",
      reason: "Account question",
      transferStatus: "not_requested",
      confidence: 0.9,
      completedAt: new Date("2026-01-03T00:01:00.000Z"),
      transcript: [{ speaker: "caller", text: "Hello", occurredAt: new Date("2026-01-03T00:00:05.000Z") }],
      summary: "Caller asked a question."
    };
    const db = {
      select: () => {
        selectNumber += 1;
        if (selectNumber === 1) {
          return {
            from: () => ({
              leftJoin: () => ({
                where: (condition: SQL) => ({
                  limit: () => {
                    conditions.push(condition);
                    return Promise.resolve([detail]);
                  }
                })
              })
            })
          };
        }
        return {
          from: () => ({
            where: (condition: SQL) => {
              conditions.push(condition);
              return Promise.resolve([{ type: "VAGUE_PURPOSE", confidence: 0.7, evidence: "No clear reason" }]);
            }
          })
        };
      },
      delete: () => ({
        where: (condition: SQL) => ({
          returning: () => {
            conditions.push(condition);
            return Promise.resolve(conditions.length === 3 ? [{ id: callIds[0] }] : [{ id: callIds[1] }, { id: callIds[2] }]);
          }
        })
      })
    };

    const found = await findCallDetail({ db: db as never, ownerId, callId: callIds[0] });
    const deleted = await deleteCall({ db: db as never, ownerId, callId: callIds[0] });
    const deletedCount = await deleteAllCalls({ db: db as never, ownerId });

    expect(found).toMatchObject({ id: callIds[0], signals: [{ type: "VAGUE_PURPOSE" }] });
    expect(deleted).toBe(true);
    expect(deletedCount).toBe(2);
    expect(render(conditions[0]).params).toEqual(expect.arrayContaining([ownerId, callIds[0]]));
    expect(render(conditions[2]).params).toEqual(expect.arrayContaining([ownerId, callIds[0]]));
    expect(render(conditions[3]).params).toEqual([ownerId]);
  });
});
