import { callIdSchema, callsPageSchema, callsQuerySchema, meResponseSchema, okResponseSchema, onboardingProfileRequestSchema, updateMeRequestSchema } from "@call-screener/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate, registerJwt } from "../auth/jwt.js";
import { deleteAllCalls, deleteCall, findCallDetail, listCalls } from "../repositories/calls.js";
import { findOwnerMe, findUserById, updateOwnerProfile } from "../repositories/users.js";

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({ error: { code, message } });
}

async function ownerId(request: FastifyRequest): Promise<string> {
  const user = await authenticate(request);
  return user.sub;
}

export async function registerOwnerRoutes(app: FastifyInstance): Promise<void> {
  await registerJwt(app, app.dependencies.config);

  app.get("/owner/me", async (request, reply) => {
    const id = await ownerId(request);
    const me = await findOwnerMe({ db: app.dependencies.db, ownerId: id });
    if (me === null) return sendError(reply, 404, "OWNER_NOT_FOUND", "Owner profile was not found");
    return meResponseSchema.parse(me);
  });

  app.patch("/owner/me", async (request, reply) => {
    const parsed = updateMeRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_REQUEST", "Provide a valid profile update");
    const id = await ownerId(request);
    const updated = await updateOwnerProfile({ db: app.dependencies.db, ownerId: id, profile: parsed.data });
    if (updated === null) return sendError(reply, 404, "OWNER_NOT_FOUND", "Owner profile was not found");
    const me = await findOwnerMe({ db: app.dependencies.db, ownerId: id });
    if (me === null) return sendError(reply, 404, "OWNER_NOT_FOUND", "Owner profile was not found");
    return meResponseSchema.parse(me);
  });

  app.post("/owner/onboarding/profile", async (request, reply) => {
    const parsed = onboardingProfileRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "INVALID_REQUEST", "Provide a valid name and forwarding number");
    const id = await ownerId(request);
    const user = await findUserById(app.dependencies.db, id);
    if (user === null) return sendError(reply, 404, "OWNER_NOT_FOUND", "Owner profile was not found");
    await updateOwnerProfile({
      db: app.dependencies.db,
      ownerId: id,
      profile: parsed.data,
      completeOnboarding: user.voiceStatus === "ready"
    });
    const me = await findOwnerMe({ db: app.dependencies.db, ownerId: id });
    if (me === null) return sendError(reply, 404, "OWNER_NOT_FOUND", "Owner profile was not found");
    return meResponseSchema.parse(me);
  });

  app.get("/owner/calls", async (request, reply) => {
    const parsed = callsQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendError(reply, 400, "INVALID_REQUEST", "Provide valid pagination parameters");
    const id = await ownerId(request);
    try {
      return callsPageSchema.parse(await listCalls({ db: app.dependencies.db, ownerId: id, query: parsed.data }));
    } catch {
      return sendError(reply, 400, "INVALID_CURSOR", "Provide a valid call cursor");
    }
  });

  app.get("/owner/calls/:callId", async (request, reply) => {
    const parsed = z.object({ callId: callIdSchema }).safeParse(request.params);
    if (!parsed.success) return sendError(reply, 400, "INVALID_REQUEST", "Provide a valid call id");
    const id = await ownerId(request);
    const call = await findCallDetail({ db: app.dependencies.db, ownerId: id, callId: parsed.data.callId });
    if (call === null) return sendError(reply, 404, "CALL_NOT_FOUND", "Call was not found");
    return call;
  });

  app.delete("/owner/calls/:callId", async (request, reply) => {
    const parsed = z.object({ callId: callIdSchema }).safeParse(request.params);
    if (!parsed.success) return sendError(reply, 400, "INVALID_REQUEST", "Provide a valid call id");
    const id = await ownerId(request);
    const deleted = await deleteCall({ db: app.dependencies.db, ownerId: id, callId: parsed.data.callId });
    if (!deleted) return sendError(reply, 404, "CALL_NOT_FOUND", "Call was not found");
    return okResponseSchema.parse({ ok: true });
  });

  app.delete("/owner/calls", async (request) => {
    const id = await ownerId(request);
    await deleteAllCalls({ db: app.dependencies.db, ownerId: id });
    return okResponseSchema.parse({ ok: true });
  });
}
