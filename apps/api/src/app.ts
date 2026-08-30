import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import rawBody from "fastify-raw-body";
import type { AppConfig } from "./config.js";
import type { Database } from "./db/client.js";
import type { Providers } from "./providers/contracts.js";
import { agentToolRoutes } from "./routes/agent-tools.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOwnerRoutes } from "./routes/owner.js";
import { providerWebhookRoutes } from "./routes/provider-webhooks.js";

export type AppDependencies = {
  config: AppConfig;
  db: Database;
  providers: Providers;
};

export async function buildApp(
  dependencies: AppDependencies,
  options: { registerFeatureRoutes?: boolean } = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.body.password",
        "req.body.refreshToken",
        "req.body.transcript",
        "privateNumber"
      ]
    }
  });

  await app.register(cors, { origin: false });
  await app.register(formbody);
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
  await app.register(rawBody, { global: false, encoding: "utf8", runFirst: true });

  app.decorate("dependencies", dependencies);

  app.get("/health/live", () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await dependencies.db.execute("select 1");
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });

  if (options.registerFeatureRoutes !== false) {
    await app.register(registerAuthRoutes, { prefix: "/v1" });
    await app.register(registerOwnerRoutes, { prefix: "/v1" });
    await app.register(providerWebhookRoutes);
    await app.register(agentToolRoutes);
  }

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    dependencies: AppDependencies;
  }
}
