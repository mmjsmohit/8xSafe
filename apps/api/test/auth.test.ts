import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/passwords.js";
import { createOpaqueToken, hashOpaqueToken } from "../src/auth/tokens.js";
import { registerAuthRoutes } from "../src/routes/auth.js";

describe("authentication", () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("hashes passwords and only verifies the matching password", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword({ password: "correct horse battery staple", passwordHash })).resolves.toBe(true);
    await expect(verifyPassword({ password: "wrong password", passwordHash })).resolves.toBe(false);
  });

  it("issues non-reversible opaque refresh token material", () => {
    const token = createOpaqueToken();
    expect(token).toHaveLength(43);
    expect(hashOpaqueToken(token)).not.toBe(token);
    expect(hashOpaqueToken(token)).toHaveLength(64);
  });

  it("rejects malformed login input before reaching storage", async () => {
    const app = Fastify();
    apps.push(app);
    app.decorate("dependencies", { config: { JWT_SECRET: "a".repeat(32) }, db: undefined, providers: undefined });
    await registerAuthRoutes(app);
    const response = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "invalid" } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });
});
