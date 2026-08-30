import { riskSignalTypeSchema, type ScreeningAction } from "@call-screener/contracts";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { calls, riskSignals, users } from "../db/schema.js";
import { constantTimeEqual } from "../providers/signatures.js";
import { categoryForAction, outcomeForAction, screenCaller, type RiskSignal } from "../services/screening.js";
import { executeTransfer, type TransferOutcome } from "../services/transfer.js";

const transcriptTurnSchema = z.object({
  speaker: z.enum(["assistant", "caller"]),
  text: z.string()
});

const screenCallRequestSchema = z.object({
  parameters: z.object({
    call_id: z.string().min(1),
    transcript: z.array(transcriptTurnSchema).default([])
  })
});

function firstHeaderValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

/**
 * The single endpoint the ElevenLabs agent's webhook tool calls mid-conversation (see
 * providers/elevenlabs.ts `buildAgentToolDefinitions`), guarded by the shared
 * `AGENT_TOOL_SECRET` — never by the caller-facing model's own judgment. Screening and
 * transfer are one call: the server only ever redirects the live call to the owner when
 * its own deterministic rules land on CONNECT_TO_USER, and only after re-checking every
 * hard signal recorded for the call so far (not just this turn's).
 */
// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync must return a Promise; all awaits live in the route handler registered below.
export const agentToolRoutes: FastifyPluginAsync = async (app) => {
  const { config, db, providers } = app.dependencies;

  app.addHook("preHandler", async (request, reply) => {
    const secret = firstHeaderValue(request.headers["x-agent-tool-secret"]);
    if (!secret || !constantTimeEqual(config.AGENT_TOOL_SECRET, secret)) {
      await reply.code(401).send();
    }
  });

  app.post("/agent-tools/screen-call", async (request, reply) => {
    const parsed = screenCallRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send();
    }
    const { call_id: callId, transcript } = parsed.data.parameters;

    const [call] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    if (!call) {
      return reply.code(404).send();
    }
    const [owner] = await db.select().from(users).where(eq(users.id, call.ownerId)).limit(1);

    const elapsedSeconds = Math.max(0, Math.round((Date.now() - call.startedAt.getTime()) / 1000));
    const callerTurns = transcript.filter((turn) => turn.speaker === "caller").length;

    const { assessment, action, usedFallback } = await screenCaller(providers.risk, {
      ownerName: owner?.displayName ?? "the owner",
      transcript: transcript.map((turn) => ({ ...turn, occurredAt: null })),
      elapsedSeconds,
      callerTurns
    });

    if (assessment.signals.length > 0) {
      await db.insert(riskSignals).values(
        assessment.signals.map((signal) => ({
          callId,
          type: signal.type,
          confidence: signal.confidence,
          evidence: signal.evidence
        }))
      );
    }

    let finalAction: ScreeningAction = action;
    let transferOutcome: TransferOutcome | undefined;

    if (action === "CONNECT_TO_USER") {
      const signalRows = await db.select().from(riskSignals).where(eq(riskSignals.callId, callId));
      // Re-validate persisted signal types against the shared enum rather than casting, and
      // check every signal ever recorded for this call — not just this turn's — before ever
      // touching the telephony provider.
      const signals: RiskSignal[] = signalRows.flatMap((row) => {
        const type = riskSignalTypeSchema.safeParse(row.type);
        return type.success ? [{ type: type.data, confidence: row.confidence, evidence: row.evidence }] : [];
      });
      transferOutcome = await executeTransfer(providers.telephony, {
        callSid: call.twilioCallSid,
        callerId: call.calledNumber,
        forwardingNumber: owner?.forwardingNumber ?? null,
        signals,
        publicApiUrl: config.PUBLIC_API_URL
      });
      if (transferOutcome.status !== "initiated") {
        // The transfer gate refused at the last line of defense even though this turn's
        // assessment alone looked safe (e.g. an earlier turn already recorded a hard
        // signal, or there is no forwarding number) — never report a connect that didn't
        // happen back to the agent.
        finalAction = "TAKE_MESSAGE";
      }
    }

    const category = categoryForAction(finalAction);
    const outcome = transferOutcome
      ? transferOutcome.status === "initiated"
        ? "connected"
        : "message_taken"
      : outcomeForAction(finalAction);

    await db
      .update(calls)
      .set({
        riskScore: assessment.riskScore,
        confidence: assessment.confidence,
        reason: assessment.intent,
        ...(assessment.caller.claimedName ? { callerDisplayName: assessment.caller.claimedName } : {}),
        ...(assessment.caller.claimedCompany ? { claimedCompany: assessment.caller.claimedCompany } : {}),
        ...(category ? { category } : {}),
        ...(outcome ? { outcome } : {}),
        ...(transferOutcome ? { transferStatus: transferOutcome.status } : {})
      })
      .where(eq(calls.id, callId));

    return reply.send({
      result: {
        action: finalAction,
        nextQuestion: assessment.nextQuestion,
        usedFallback,
        transferred: transferOutcome?.status === "initiated"
      }
    });
  });
};
