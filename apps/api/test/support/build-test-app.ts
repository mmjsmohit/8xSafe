import type { FastifyPluginAsync } from "fastify";
import { vi } from "vitest";
import { buildApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";
import type { Database } from "../../src/db/client.js";
import type { Providers } from "../../src/providers/contracts.js";
import { agentToolRoutes } from "../../src/routes/agent-tools.js";
import { providerWebhookRoutes } from "../../src/routes/provider-webhooks.js";
import { createFakeDb, type FakeDbSetup } from "./fake-db.js";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: "test",
    PORT: 3000,
    DATABASE_URL: "postgresql://localhost:5432/test",
    PUBLIC_API_URL: "https://api.example.com",
    JWT_SECRET: "a".repeat(32),
    AGENT_TOOL_SECRET: "agent-tool-secret",
    ELEVENLABS_WEBHOOK_SECRET: "elevenlabs-webhook-secret",
    DEMO_EMAIL: "owner@example.com",
    DEMO_PASSWORD: "password123",
    TWILIO_ACCOUNT_SID: "AC_test",
    TWILIO_AUTH_TOKEN: "twilio-auth-token",
    TWILIO_PHONE_NUMBER: "+15005550006",
    ELEVENLABS_API_KEY: "elevenlabs-key",
    ELEVENLABS_AGENT_ID: "agent_test",
    OPENAI_API_KEY: "openai-key",
    ...overrides
  };
}

/**
 * Builds the fake `Providers` plus a parallel bag of standalone mock references. Assert
 * against `mocks.*`, not `providers.conversations.registerCall` etc. — the latter is typed
 * through the interface's method-shorthand signature, which trips
 * `@typescript-eslint/unbound-method` when handed straight to `expect(...)`.
 */
export function fakeProviders(overrides: Partial<Providers> = {}) {
  const registerCall = vi.fn(() => Promise.resolve({ twiml: "<Response><Say>fake conversation</Say></Response>" }));
  const sendGeneric = vi.fn(() => Promise.resolve({ rejectedTokens: [] }));
  const assess = vi.fn(() => Promise.reject(new Error("risk analyzer not configured for this test")));
  const redirectCall = vi.fn(() => Promise.resolve());
  const createClone = vi.fn(() => Promise.resolve({ voiceId: "voice_generated" }));
  const createPreview = vi.fn(() => Promise.resolve({ audio: new Uint8Array(), mimeType: "audio/mpeg" as const }));

  const providers: Providers = {
    conversations: { registerCall },
    push: { sendGeneric },
    risk: { assess },
    telephony: { redirectCall },
    voiceClone: { createClone, createPreview },
    ...overrides
  };

  return { providers, mocks: { registerCall, sendGeneric, assess, redirectCall, createClone, createPreview } };
}

const DEFAULT_ROUTE_PLUGINS: FastifyPluginAsync[] = [providerWebhookRoutes, agentToolRoutes];

export async function buildTestApp(
  input: {
    dbSetup?: FakeDbSetup;
    configOverrides?: Partial<AppConfig>;
    providerOverrides?: Partial<Providers>;
    plugins?: FastifyPluginAsync[];
  } = {}
) {
  const fake = createFakeDb(input.dbSetup);
  const config = testConfig(input.configOverrides);
  const { providers, mocks } = fakeProviders(input.providerOverrides);
  const app = await buildApp({ config, db: fake.db as unknown as Database, providers });
  for (const plugin of input.plugins ?? DEFAULT_ROUTE_PLUGINS) {
    await app.register(plugin);
  }
  return { app, config, providers, mocks, ...fake };
}
