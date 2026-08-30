import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { createElevenLabsProviders } from "./providers/elevenlabs.js";
import { createFakeProviders } from "./providers/fakes.js";
import { createOpenAiRiskAnalyzer } from "./providers/openai.js";
import { createTwilioTelephonyProvider } from "./providers/twilio.js";
import { seedDemo } from "./services/seed-demo.js";

function requireProviderConfig(value: string | undefined, name: string): string {
  if (value === undefined) {
    throw new Error(`${name} must be configured`);
  }
  return value;
}

const config = loadConfig();
const { db, pool } = createDatabase(config);
await seedDemo({ db, config });
const elevenLabs = createElevenLabsProviders({
  apiKey: requireProviderConfig(config.ELEVENLABS_API_KEY, "ELEVENLABS_API_KEY"),
  agentId: requireProviderConfig(config.ELEVENLABS_AGENT_ID, "ELEVENLABS_AGENT_ID"),
  publicApiUrl: config.PUBLIC_API_URL,
  agentToolSecret: config.AGENT_TOOL_SECRET
});
const providers = {
  ...createFakeProviders(),
  conversations: elevenLabs,
  risk: createOpenAiRiskAnalyzer({
    apiKey: requireProviderConfig(config.OPENAI_API_KEY, "OPENAI_API_KEY")
  }),
  telephony: createTwilioTelephonyProvider({
    accountSid: requireProviderConfig(config.TWILIO_ACCOUNT_SID, "TWILIO_ACCOUNT_SID"),
    authToken: requireProviderConfig(config.TWILIO_AUTH_TOKEN, "TWILIO_AUTH_TOKEN")
  }),
  voiceClone: elevenLabs
};
const app = await buildApp({ config, db, providers });

const shutdown = async () => {
  await app.close();
  await pool.end();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await app.listen({ host: "0.0.0.0", port: config.PORT });
