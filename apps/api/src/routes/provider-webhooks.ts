import type { TransferStatus } from "@call-screener/contracts";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import { calls, jobs, phoneNumbers, trustedCallers, blockedCallers, users, webhookEvents } from "../db/schema.js";
import { verifyElevenLabsSignature, verifyTwilioSignature } from "../providers/signatures.js";
import { buildDialTwiml, buildHangupTwiml, buildRejectTwiml, buildUnavailableTwiml } from "../providers/twilio.js";
import { decideRoute, isPrivateNumber, normalizePhoneNumber, resolveConversationLanguage } from "../services/routing.js";

const twilioVoiceParamsSchema = z.object({
  CallSid: z.string().min(1),
  From: z.string().min(1),
  To: z.string().min(1)
});

const twilioCallStatusParamsSchema = z.object({
  CallSid: z.string().min(1),
  CallStatus: z.string().min(1),
  // Twilio's <Number statusCallback> fires on the dialed *child* leg, whose own CallSid is
  // not the call row we stored — ParentCallSid (when present) is the original inbound
  // call's sid and takes precedence; see the lookup below.
  ParentCallSid: z.string().min(1).optional()
});

const twilioDialCompleteParamsSchema = z.object({
  CallSid: z.string().min(1),
  DialCallStatus: z.string().min(1)
});

const elevenLabsPostCallEventSchema = z.object({
  conversation_id: z.string().min(1)
});

function firstHeaderValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

/**
 * Twilio's `<Number statusCallback>` fires on the dialed *child* leg, whose own `CallSid`
 * is not the row this server stored (that's the original inbound call). When the callback
 * carries `ParentCallSid` — the original call's sid — that's what must be used to find the
 * right `calls` row; `CallSid` is only a fallback for callbacks that never had a parent.
 */
export function resolveTwilioCallbackSid(params: { CallSid: string; ParentCallSid?: string | undefined }): string {
  return params.ParentCallSid ?? params.CallSid;
}

function verifyTwilioWebhookRequest(request: FastifyRequest, config: AppConfig, path: string): boolean {
  if (!config.TWILIO_AUTH_TOKEN) {
    return false;
  }
  const url = new URL(path, config.PUBLIC_API_URL).toString();
  const signatureHeader = firstHeaderValue(request.headers["x-twilio-signature"]);
  return verifyTwilioSignature({
    authToken: config.TWILIO_AUTH_TOKEN,
    url,
    params: request.body as Record<string, string>,
    signatureHeader
  });
}

type OwnerRow = typeof users.$inferSelect;

/**
 * Onboarding is only "complete" once the owner has finished the onboarding flow itself
 * (`onboardingCompletedAt`), has a forwarding number, and has a ready cloned voice.
 */
function isOwnerReadyForScreening(owner: OwnerRow): boolean {
  return (
    owner.onboardingCompletedAt !== null &&
    owner.displayName !== null &&
    owner.forwardingNumber !== null &&
    owner.voiceStatus === "ready" &&
    owner.voiceId !== null
  );
}

const CALL_STATUS_TO_TRANSFER_STATUS: Partial<Record<string, TransferStatus>> = {
  initiated: "initiated",
  ringing: "ringing",
  "in-progress": "answered",
  completed: "completed"
};

const DIAL_CALL_STATUS_TO_TRANSFER_STATUS: Partial<Record<string, TransferStatus>> = {
  completed: "completed",
  busy: "busy",
  failed: "failed",
  "no-answer": "no_answer",
  canceled: "failed"
};

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync must return a Promise; all awaits live in the route handlers registered below.
export const providerWebhookRoutes: FastifyPluginAsync = async (app) => {
  const { config, db, providers } = app.dependencies;

  app.post("/webhooks/twilio/inbound", async (request, reply) => {
    if (!verifyTwilioWebhookRequest(request, config, "/webhooks/twilio/inbound")) {
      return reply.code(403).send();
    }

    const parsedParams = twilioVoiceParamsSchema.safeParse(request.body);
    if (!parsedParams.success) {
      return reply.code(400).send();
    }
    const params = parsedParams.data;

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

    if (route.kind === "trusted") {
      if (!owner.forwardingNumber) {
        // Trusted creates only basic call metadata and a direct dial — never AI. Without a
        // forwarding number there is nothing to dial, so the call is unavailable, full stop.
        await recordCall(db, {
          ownerId: owner.id,
          phoneNumberId: phoneNumber.id,
          twilioCallSid: params.CallSid,
          callerNumber: normalizedFrom,
          calledNumber: params.To,
          category: "trusted",
          outcome: "unavailable",
          completedAt: new Date()
        });
        reply.type("text/xml");
        return buildUnavailableTwiml();
      }

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
      return buildDialTwiml({ to: owner.forwardingNumber, callerId: params.To, publicApiUrl: config.PUBLIC_API_URL });
    }

    // Unknown caller: AI screening requires a fully onboarded owner with a ready cloned
    // voice, and a caller number this server can actually identify. Any of those missing
    // means unavailable — never a provider registration, conversation, or risk assessment.
    if (!isOwnerReadyForScreening(owner) || isPrivateNumber(params.From)) {
      await recordCall(db, {
        ownerId: owner.id,
        phoneNumberId: phoneNumber.id,
        twilioCallSid: params.CallSid,
        callerNumber: normalizedFrom,
        calledNumber: params.To,
        category: "unknown",
        outcome: "unavailable",
        completedAt: new Date()
      });
      reply.type("text/xml");
      return buildUnavailableTwiml();
    }

    const { call, isNew } = await recordCall(db, {
      ownerId: owner.id,
      phoneNumberId: phoneNumber.id,
      twilioCallSid: params.CallSid,
      callerNumber: normalizedFrom,
      calledNumber: params.To,
      category: "unknown",
      outcome: "processing"
    });

    if (!isNew) {
      // A duplicate delivery for a CallSid we've already registered a provider conversation
      // for must never register a second one — decline gracefully instead.
      reply.type("text/xml");
      return buildUnavailableTwiml();
    }

    // voiceId and forwardingNumber are both guaranteed non-null by isOwnerReadyForScreening
    // above; re-checked here rather than asserted so a future readiness-check change can't
    // silently desync from what's actually used.
    const { voiceId, forwardingNumber } = owner;
    if (voiceId === null || forwardingNumber === null) {
      throw new Error("owner_not_ready_after_readiness_check");
    }

    const { twiml } = await providers.conversations.registerCall({
      callId: call.id,
      ownerName: owner.displayName ?? "the owner",
      voiceId,
      // Resolved from the owner's own forwarding number, not the shield number — the
      // shield number is a US Twilio number regardless of the owner's actual locale.
      language: resolveConversationLanguage(forwardingNumber),
      fromNumber: params.From,
      toNumber: params.To
    });

    reply.type("text/xml");
    return twiml;
  });

  app.post("/webhooks/twilio/call-status", async (request, reply) => {
    if (!verifyTwilioWebhookRequest(request, config, "/webhooks/twilio/call-status")) {
      return reply.code(403).send();
    }
    const parsed = twilioCallStatusParamsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send();
    }
    const transferStatus = CALL_STATUS_TO_TRANSFER_STATUS[parsed.data.CallStatus];
    if (transferStatus !== undefined) {
      const callSid = resolveTwilioCallbackSid(parsed.data);
      await db.update(calls).set({ transferStatus }).where(eq(calls.twilioCallSid, callSid));
    }
    return reply.code(200).send({ ok: true });
  });

  app.post("/webhooks/twilio/dial-complete", async (request, reply) => {
    if (!verifyTwilioWebhookRequest(request, config, "/webhooks/twilio/dial-complete")) {
      return reply.code(403).send();
    }
    const parsed = twilioDialCompleteParamsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send();
    }
    const transferStatus = DIAL_CALL_STATUS_TO_TRANSFER_STATUS[parsed.data.DialCallStatus] ?? "failed";
    await db
      .update(calls)
      .set({
        transferStatus,
        outcome: transferStatus === "completed" ? "connected" : "missed_transfer"
      })
      .where(eq(calls.twilioCallSid, parsed.data.CallSid));
    reply.type("text/xml");
    return buildHangupTwiml();
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

      const parsedEvent = elevenLabsPostCallEventSchema.safeParse(request.body);
      if (!parsedEvent.success) {
        return reply.code(400).send();
      }

      // Never touch `conversations`/`calls` from this handler: the payload is durably
      // queued and reconciled asynchronously so a duplicate or out-of-order delivery is
      // always idempotent and never races the call's own inbound/screening writes.
      await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(webhookEvents)
          .values({
            provider: "elevenlabs",
            eventKey: parsedEvent.data.conversation_id,
            eventType: "post_call_transcription"
          })
          .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.eventKey] })
          .returning();
        if (inserted.length === 0) {
          return;
        }
        await tx.insert(jobs).values({
          type: "elevenlabs_post_call",
          payload: request.body
        });
      });

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
    outcome: "blocked" | "direct_forward" | "processing" | "unavailable";
    transferStatus?: "initiated";
    completedAt?: Date;
  }
): Promise<{ call: typeof calls.$inferSelect; isNew: boolean }> {
  const inserted = await db
    .insert(calls)
    .values(values)
    .onConflictDoNothing({ target: calls.twilioCallSid })
    .returning();
  if (inserted[0]) {
    return { call: inserted[0], isNew: true };
  }
  const [existing] = await db.select().from(calls).where(eq(calls.twilioCallSid, values.twilioCallSid)).limit(1);
  if (!existing) {
    throw new Error("call_upsert_failed");
  }
  return { call: existing, isNew: false };
}
