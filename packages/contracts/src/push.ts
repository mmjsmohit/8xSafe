import { z } from "zod";

export const pushPlatformSchema = z.enum(["android", "ios"]);

export const registerPushTokenRequestSchema = z.object({
  token: z.string().min(10).max(300),
  platform: pushPlatformSchema,
  deviceId: z.string().min(1).max(200)
});

export const deletePushTokenParamsSchema = z.object({
  token: z.string().min(10).max(300)
});

export type RegisterPushTokenRequest = z.infer<typeof registerPushTokenRequestSchema>;

