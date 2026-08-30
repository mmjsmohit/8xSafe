import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authSessionSchema } from "@call-screener/contracts";
import { hashPassword } from "../src/auth/passwords.js";
import { hashOpaqueToken } from "../src/auth/tokens.js";
import { registerAuthRoutes } from "../src/routes/auth.js";

const repository = vi.hoisted(() => ({
  createRefreshToken: vi.fn(),
  findUserByEmail: vi.fn(),
  revokeRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn()
}));

vi.mock("../src/repositories/users.js", () => ({
  findUserByEmail: repository.findUserByEmail
}));

vi.mock("../src/repositories/refresh-tokens.js", () => ({
  createRefreshToken: repository.createRefreshToken,
  revokeRefreshToken: repository.revokeRefreshToken,
  rotateRefreshToken: repository.rotateRefreshToken
}));

const owner = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.com",
  passwordHash: "",
  displayName: "Demo Owner",
  forwardingNumber: "+14155550100",
  timezone: "America/Los_Angeles",
  isOnboarded: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

function createApp(apps: FastifyInstance[]): FastifyInstance {
  const app = Fastify();
  apps.push(app);
  app.decorate("dependencies", { config: { JWT_SECRET: "a".repeat(32) }, db: undefined, providers: undefined });
  return app;
}

function jwtTimes(token: string): { exp: number; iat: number } {
  const payload = token.split(".")[1];
  const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (
    typeof value !== "object" ||
    value === null ||
    !("exp" in value) ||
    !("iat" in value) ||
    typeof value.exp !== "number" ||
    typeof value.iat !== "number"
  ) {
    throw new Error("Expected JWT expiration and issuance times");
  }

  return { exp: value.exp, iat: value.iat };
}

describe("authentication", () => {
  const apps: FastifyInstance[] = [];

  beforeEach(async () => {
    repository.createRefreshToken.mockReset();
    repository.findUserByEmail.mockReset();
    repository.revokeRefreshToken.mockReset();
    repository.rotateRefreshToken.mockReset();
    owner.passwordHash = await hashPassword("correct horse battery staple");
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("logs in with a fifteen-minute access token and stores only a refresh-token hash", async () => {
    const app = createApp(apps);
    repository.findUserByEmail.mockResolvedValue(owner);
    repository.createRefreshToken.mockResolvedValue(undefined);
    await registerAuthRoutes(app);

    const before = Math.floor(Date.now() / 1000);
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: owner.email, password: "correct horse battery staple" }
    });
    const after = Math.floor(Date.now() / 1000);
    const session = authSessionSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(jwtTimes(session.accessToken).exp - jwtTimes(session.accessToken).iat).toBe(15 * 60);
    expect(new Date(session.accessTokenExpiresAt).getTime()).toBeGreaterThanOrEqual(before * 1_000 + 15 * 60 * 1_000);
    expect(new Date(session.accessTokenExpiresAt).getTime()).toBeLessThanOrEqual(after * 1_000 + 15 * 60 * 1_000 + 1_000);
    expect(repository.createRefreshToken).toHaveBeenCalledWith(expect.objectContaining({
      userId: owner.id,
      tokenHash: hashOpaqueToken(session.refreshToken)
    }));
  });

  it("rotates a refresh token and reports missing, expired, and reused token outcomes", async () => {
    const app = createApp(apps);
    repository.rotateRefreshToken.mockResolvedValueOnce({ kind: "rotated", user: owner });
    repository.rotateRefreshToken.mockResolvedValueOnce({ kind: "missing" });
    repository.rotateRefreshToken.mockResolvedValueOnce({ kind: "expired" });
    repository.rotateRefreshToken.mockResolvedValueOnce({ kind: "reused" });
    await registerAuthRoutes(app);

    const firstToken = "a".repeat(43);
    const missingToken = "b".repeat(43);
    const expiredToken = "c".repeat(43);
    const reusedToken = "d".repeat(43);
    const rotated = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: firstToken } });
    const rotatedSession = authSessionSchema.parse(rotated.json());
    expect(rotated.statusCode).toBe(200);
    expect(jwtTimes(rotatedSession.accessToken).exp - jwtTimes(rotatedSession.accessToken).iat).toBe(15 * 60);
    expect(repository.rotateRefreshToken).toHaveBeenCalledWith(expect.objectContaining({
      tokenHash: hashOpaqueToken(firstToken),
      replacementTokenHash: hashOpaqueToken(rotatedSession.refreshToken)
    }));

    const missing = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: missingToken } });
    const expired = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: expiredToken } });
    const reused = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: reusedToken } });

    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toMatchObject({ error: { code: "INVALID_REFRESH_TOKEN" } });
    expect(expired.statusCode).toBe(401);
    expect(expired.json()).toMatchObject({ error: { code: "INVALID_REFRESH_TOKEN" } });
    expect(reused.statusCode).toBe(401);
    expect(reused.json()).toMatchObject({ error: { code: "REFRESH_TOKEN_REUSED" } });
  });

  it("hashes the supplied token before revoking it on logout", async () => {
    const app = createApp(apps);
    repository.revokeRefreshToken.mockResolvedValue(undefined);
    await registerAuthRoutes(app);

    const refreshToken = "e".repeat(43);
    const response = await app.inject({ method: "POST", url: "/auth/logout", payload: { refreshToken } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(repository.revokeRefreshToken).toHaveBeenCalledWith({ db: undefined, tokenHash: hashOpaqueToken(refreshToken) });
  });
});
