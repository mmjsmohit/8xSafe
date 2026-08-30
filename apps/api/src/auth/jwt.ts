import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { ACCESS_TOKEN_TTL_SECONDS } from "./tokens.js";

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

export async function registerJwt(app: FastifyInstance, config: Pick<AppConfig, "JWT_SECRET">): Promise<void> {
  if (!app.hasDecorator("jwt")) {
    await app.register(jwt, { secret: config.JWT_SECRET });
  }
}

export function issueAccessToken(app: FastifyInstance, user: AccessTokenPayload): string {
  return app.jwt.sign(user, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

export async function authenticate(request: FastifyRequest): Promise<AccessTokenPayload> {
  await request.jwtVerify();
  return request.user;
}
