import { describe, expect, it } from "vitest";
import { rotateRefreshToken } from "../src/repositories/refresh-tokens.js";

describe("refresh token repository", () => {
  it("reports a token that is not stored", async () => {
    const db = {
      transaction: (callback: (transaction: { execute: () => Promise<{ rows: unknown[] }> }) => unknown) =>
        Promise.resolve(callback({ execute: () => Promise.resolve({ rows: [] }) }))
    };
    await expect(rotateRefreshToken({
      db,
      tokenHash: "old-hash",
      replacementTokenHash: "new-hash",
      replacementExpiresAt: new Date(Date.now() + 60_000)
    })).resolves.toEqual({ kind: "missing" });
  });
});
