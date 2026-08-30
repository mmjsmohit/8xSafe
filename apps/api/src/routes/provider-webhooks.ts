import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { blockedCallers, calls, conversations, phoneNumbers, trustedCallers, users, webhookEvents } from "../db/schema.js";
import { verifyElevenLabsSignature, verifyTwilioSignature } from "../providers/signatures.js";
import { buildConnectStreamTwiml, buildDialTwiml, buildRejectTwiml } from "../providers/twilio.js";
import { decideRoute, normalizePhoneNumber, resolveConversationLanguage } from "../services/routing.js";

/** Used only if a caller reaches an owner who has not finished voice enrollment yet. */
const FALLBACK_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

const twilioVoiceParamsSchema = z.object({
  CallSid: z.string().min(1),
  From: z.string().min(1),
  To: z.string().min(1)
});

function firstHeaderValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

const elevenLabsPostCallSchema = z.object({
  conversation_id: z.string().min(1),
  transcript: z
    .array(
      z.object({
        role: z.enum(["agent", "user"]),
        message: z.string().nullable().optional()
      })
    )
    .optional(),
  analysis: z
    .object({
      transcript_summary: z.string().nullable().optional()
    })
    .optional()
});

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync must return a Promise; all awaits live in the route handlers registered below.
export const providerWebhookRoutes: FastifyPluginAsync = async (app) => {
  const { config, db, providers } = app.dependencies;

  app.post("/webhooks/twilio/voice", async (request, reply) => {
    if (!config.TWILIO_AUTH_TOKEN) {
      return reply.code(503).send();
    }

    const parsedParams = twilioVoiceParamsSchema.safeParse(request.body);
    if (!parsedParams.success) {
      return reply.code(400).send();
    }
    const params = parsedParams.data;

    const webhookUrl = new URL("/webhooks/twilio/voice", config.PUBLIC_API_URL).toString();
    const signatureHeader = firstHeaderValue(request.headers["x-twilio-signature"]);
    const signatureValid = verifyTwilioSignature({
      authToken: config.TWILIO_AUTH_TOKEN,
      url: webhookUrl,
      params: request.body as Record<string, string>,
      signatureHeader
    });
    if (!signatureValid) {
      return reply.code(403).send();
    }

    const [phoneNumber] = await db
      .select()
      .from(phoneNumbers)
      .where(eq(phoneNumbers.phoneNumber, params.To))
      .limit(1);
    if (!phoneNumber?.isActive) {
      reply.type("text/xml");
      return buildRejectTwiml();
    }

    const [owner] = await db.select().from(users).where(eq(users.id, phoneNumber.ownerId)).limit(1);
    if (!owner) {
      reply.type("text/xml");
      return buildRejectTwiml();
    }

    const [blockedRows, trustedRows] = await Promise.all([
      db
        .select({ normalizedNumber: blockedCallers.normalizedNumber })
        .from(blockedCallers)
        .where(eq(blockedCallers.ownerId, owner.id)),
      db
        .select({ normalizedNumber: trustedCallers.normalizedNumber })
        .from(trustedCallers)
        .where(eq(trustedCallers.ownerId, owner.id))
    ]);

    const route = decideRoute(params.From, {
      blockedNumbers: new Set(blockedRows.map((row) => row.normalizedNumber)),
      trustedNumbers: new Set(trustedRows.map((row) => row.normalizedNumber))
    });
    const normalizedFrom = normalizePhoneNumber(params.From);

    if (route.kind === "blocked") {
      await recordCall(db, {
        ownerId: owner.id,
        phoneNumberId: phoneNumber.id,
        twilioCallSid: params.CallSid,
        callerNumber: normalizedFrom,
        calledNumber: params.To,
        category: "unknown",
        outcome: "blocked",
        completedAt: new Date()
      });
      reply.type("text/xml");
      return buildRejectTwiml();
    }

    if (route.kind === "trusted" && owner.forwardingNumber) {
      await recordCall(db, {
        ownerId: owner.id,
        phoneNumberId: phoneNumber.id,
        twilioCallSid: params.CallSid,
        callerNumber: normalizedFrom,
        calledNumber: params.To,
        category: "trusted",
        outcome: "direct_forward",
        transferStatus: "initiated"
      });
      reply.type("text/xml");
      return buildDialTwiml({ to: owner.forwardingNumber, callerId: params.To });
    }

    // Unknown caller: hand off to the AI screening agent.
    const call = await recordCall(db, {
      ownerId: owner.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: params.CallSid,
      callerNumber: normalizedFrom,
      calledNumber: params.To,
      category: "unknown",
      outcome: "processing"
    });

    const { conversationId, websocketUrl } = await providers.conversations.registerCall({
      callId: call.id,
      ownerName: owner.displayName ?? "the owner",
      voiceId: owner.voiceStatus === "ready" && owner.voiceId ? owner.voiceId : FALLBACK_VOICE_ID,
      language: resolveConversationLanguage(params.To)
    });

    await db
      .insert(conversations)
      .values({ callId: call.id, elevenLabsConversationId: conversationId })
      .onConflictDoNothing({ target: conversations.callId });

    reply.type("text/xml");
    return buildConnectStreamTwiml({
      websocketUrl,
      parameters: { call_id: call.id, owner_name: owner.displayName ?? "the owner" }
    });
  });

  app.post(
    "/webhooks/elevenlabs/post-call",
    { config: { rawBody: true } },
    async (request, reply) => {
      if (!config.ELEVENLABS_WEBHOOK_SECRET) {
        return reply.code(503).send();
      }

      const signatureHeader = firstHeaderValue(request.headers["elevenlabs-signature"]);
      const rawBody = typeof request.rawBody === "string" ? request.rawBody : request.rawBody?.toString("utf8");
      const signatureValid = verifyElevenLabsSignature({
        secret: config.ELEVENLABS_WEBHOOK_SECRET,
        rawBody: rawBody ?? "",
        signatureHeader
      });
      if (!signatureValid) {
        return reply.code(403).send();
      }

      const parsedBody = elevenLabsPostCallSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send();
      }
      const payload = parsedBody.data;

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.elevenLabsConversationId, payload.conversation_id))
        .limit(1);
      if (!conversation) {
        // Nothing to reconcile — the conversation was never registered by this server.
        return reply.code(200).send({ ok: true });
      }

      const alreadyProcessed = await isDuplicateWebhookEvent(db, "elevenlabs", payload.conversation_id);
      if (alreadyProcessed) {
        return reply.code(200).send({ ok: true });
      }

      const transcript = (payload.transcript ?? []).map((turn) => ({
        speaker: turn.role === "agent" ? ("assistant" as const) : ("caller" as const),
        text: turn.message ?? "",
        occurredAt: null
      }));

      await db
        .update(conversations)
        .set({
          transcript,
          turnCount: transcript.length,
          summary: payload.analysis?.transcript_summary ?? null,
          updatedAt: new Date()
        })
        .where(eq(conversations.id, conversation.id));

      await db
        .update(calls)
        .set({ completedAt: new Date() })
        .where(eq(calls.id, conversation.callId));

      return reply.code(200).send({ ok: true });
    }
  );
};

async function recordCall(
  db: Database,
  values: {
    ownerId: string;
    phoneNumberId: string;
    twilioCallSid: string;
    callerNumber: string;
    calledNumber: string;
    category: "unknown" | "trusted";
    outcome: "blocked" | "direct_forward" | "processing";
    transferStatus?: "initiated";
    completedAt?: Date;
  }
) {
  const inserted = await db
    .insert(calls)
    .values(values)
    .onConflictDoNothing({ target: calls.twilioCallSid })
    .returning();
  if (inserted[0]) {
    return inserted[0];
  }
  const [existing] = await db.select().from(calls).where(eq(calls.twilioCallSid, values.twilioCallSid)).limit(1);
  if (!existing) {
    throw new Error("call_upsert_failed");
  }
  return existing;
}

async function isDuplicateWebhookEvent(
  db: Database,
  provider: string,
  eventKey: string
): Promise<boolean> {
  const inserted = await db
    .insert(webhookEvents)
    .values({ provider, eventKey, eventType: "post-call" })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.eventKey] })
    .returning();
  return inserted.length === 0;
}
