import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { registerOwnerRoutes } from "../src/routes/owner.js";

describe("owner API", () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("requires an access token for owner data", async () => {
    const app = Fastify();
    apps.push(app);
    app.decorate("dependencies", { config: { JWT_SECRET: "a".repeat(32) }, db: undefined, providers: undefined });
    await registerOwnerRoutes(app);
    const response = await app.inject({ method: "GET", url: "/owner/me" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects malformed onboarding requests", async () => {
    const app = Fastify();
    apps.push(app);
    app.decorate("dependencies", { config: { JWT_SECRET: "a".repeat(32) }, db: undefined, providers: undefined });
    await registerOwnerRoutes(app);
    const response = await app.inject({
      method: "POST",
      url: "/owner/onboarding/profile",
      payload: { displayName: "", forwardingNumber: "not-a-number" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });
});
