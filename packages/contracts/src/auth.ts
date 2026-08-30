import { z } from "zod";
import { userIdSchema } from "./domain.js";

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200)
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(32)
});

export const logoutRequestSchema = refreshRequestSchema;

export const authUserSchema = z.object({
  id: userIdSchema,
  email: z.email(),
  displayName: z.string().nullable()
});

export const authSessionSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.iso.datetime(),
  refreshToken: z.string().min(32),
  refreshTokenExpiresAt: z.iso.datetime(),
  user: authUserSchema
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;

