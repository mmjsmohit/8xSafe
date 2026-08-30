import { createHash, randomBytes, randomUUID } from "node:crypto";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createTokenFamilyId(): string {
  return randomUUID();
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function expiresAtFromNow(seconds: number, now = new Date()): Date {
  return new Date(now.getTime() + seconds * 1000);
}
