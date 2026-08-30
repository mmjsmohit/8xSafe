import { z } from "zod";

const optionalSecret = z.string().min(1).optional();

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url(),
  PUBLIC_API_URL: z.url(),
  JWT_SECRET: z.string().min(32),
  AGENT_TOOL_SECRET: z.string().min(16),
  ELEVENLABS_WEBHOOK_SECRET: optionalSecret,
  DEMO_EMAIL: z.email(),
  DEMO_PASSWORD: z.string().min(8),
  TWILIO_ACCOUNT_SID: optionalSecret,
  TWILIO_AUTH_TOKEN: optionalSecret,
  TWILIO_PHONE_NUMBER: z.string().regex(/^\+[1-9]\d{7,14}$/),
  ELEVENLABS_API_KEY: optionalSecret,
  ELEVENLABS_AGENT_ID: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  EXPO_ACCESS_TOKEN: optionalSecret,
  EXPO_PROJECT_ID: optionalSecret
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(environment);
}
