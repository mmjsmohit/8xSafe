import { authSessionSchema, loginRequestSchema, logoutRequestSchema, refreshRequestSchema } from "@call-screener/contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import { registerJwt, issueAccessToken } from "../auth/jwt.js";
import { verifyPassword } from "../auth/passwords.js";
import { createOpaqueToken, createTokenFamilyId, expiresAtFromNow, hashOpaqueToken, ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "../auth/tokens.js";
import { createRefreshToken, revokeRefreshToken, rotateRefreshToken } from "../repositories/refresh-tokens.js";
import { findUserByEmail, type StoredUser } from "../repositories/users.js";

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({ error: { code, message } });
}

async function createSession(app: FastifyInstance, user: StoredUser) {
  const refreshToken = createOpaqueToken();
  const refreshTokenExpiresAt = expiresAtFromNow(REFRESH_TOKEN_TTL_SECONDS);
  await createRefreshToken({
    db: app.dependencies.db,
    userId: user.id,
    tokenHash: hashOpaqueToken(refreshToken),
    familyId: createTokenFamilyId(),
    expiresAt: refreshTokenExpiresAt
  });
  const accessTokenExpiresAt = expiresAtFromNow(ACCESS_TOKEN_TTL_SECONDS);
  return authSessionSchema.parse({
    accessToken: issueAccessToken(app, { sub: user.id, email: user.email }),
    accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    user: { id: user.id, email: user.email, displayName: user.displayName }
  });
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  await registerJwt(app, app.dependencies.config);

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_REQUEST", "Enter a valid email and password");
    const user = await findUserByEmail(app.dependencies.db, parsed.data.email);
    if (user === null || !await verifyPassword({ password: parsed.data.password, passwordHash: user.passwordHash })) {
      return sendError(reply, 401, "INVALID_CREDENTIALS", "Invalid email or password");
    }
    return createSession(app, user);
  });

  app.post("/auth/refresh", async (request, reply) => {
    const parsed = refreshRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_REQUEST", "Provide a valid refresh token");
    const replacementToken = createOpaqueToken();
    const replacementExpiresAt = expiresAtFromNow(REFRESH_TOKEN_TTL_SECONDS);
    const rotation = await rotateRefreshToken({
      db: app.dependencies.db,
      tokenHash: hashOpaqueToken(parsed.data.refreshToken),
      replacementTokenHash: hashOpaqueToken(replacementToken),
      replacementExpiresAt
    });
    if (rotation.kind !== "rotated") {
      const code = rotation.kind === "reused" ? "REFRESH_TOKEN_REUSED" : "INVALID_REFRESH_TOKEN";
      return sendError(reply, 401, code, "Refresh token is invalid or expired");
    }
    const accessTokenExpiresAt = expiresAtFromNow(ACCESS_TOKEN_TTL_SECONDS);
    return authSessionSchema.parse({
      accessToken: issueAccessToken(app, { sub: rotation.user.id, email: rotation.user.email }),
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshToken: replacementToken,
      refreshTokenExpiresAt: replacementExpiresAt.toISOString(),
      user: { id: rotation.user.id, email: rotation.user.email, displayName: rotation.user.displayName }
    });
  });

  app.post("/auth/logout", async (request, reply) => {
    const parsed = logoutRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_REQUEST", "Provide a valid refresh token");
    await revokeRefreshToken({ db: app.dependencies.db, tokenHash: hashOpaqueToken(parsed.data.refreshToken) });
    return { ok: true };
  });
}
