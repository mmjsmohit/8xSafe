import { riskSignalTypeSchema } from "@call-screener/contracts";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { calls, riskSignals, users } from "../db/schema.js";
import { constantTimeEqual } from "../providers/signatures.js";
import { categoryForAction, outcomeForAction, resolveAction, screenCaller, type RiskSignal } from "../services/screening.js";
import { executeTransfer } from "../services/transfer.js";

const transcriptTurnSchema = z.object({
  speaker: z.enum(["assistant", "caller"]),
  text: z.string()
});

const screenRequestSchema = z.object({
  parameters: z.object({
    call_id: z.string().min(1),
    transcript: z.array(transcriptTurnSchema).default([])
  })
});

const transferRequestSchema = z.object({
  parameters: z.object({
    call_id: z.string().min(1)
  })
});

function firstHeaderValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

/**
 * Endpoints the ElevenLabs agent's webhook tools call mid-conversation (see
 * providers/elevenlabs.ts `buildAgentToolDefinitions`). Every route here is guarded by
 * the shared `AGENT_TOOL_SECRET`, never by the caller-facing model's own judgment.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync must return a Promise; all awaits live in the route handlers registered below.
export const agentToolRoutes: FastifyPluginAsync = async (app) => {
  const { config, db, providers } = app.dependencies;

  app.addHook("preHandler", async (request, reply) => {
    const secret = firstHeaderValue(request.headers["x-agent-tool-secret"]);
    if (!secret || !constantTimeEqual(config.AGENT_TOOL_SECRET, secret)) {
      await reply.code(401).send();
    }
  });

  app.post("/agent-tools/screen", async (request, reply) => {
    const parsed = screenRequestSchema.safeParse(request.body);
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

    const { assessment, usedFallback } = await screenCaller(providers.risk, {
      ownerName: owner?.displayName ?? "the owner",
      transcript: transcript.map((turn) => ({ ...turn, occurredAt: null })),
      elapsedSeconds,
      callerTurns
    });

    const action = resolveAction(assessment);
    const category = categoryForAction(action);
    const outcome = outcomeForAction(action);

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

    await db
      .update(calls)
      .set({
        riskScore: assessment.riskScore,
        confidence: assessment.confidence,
        reason: assessment.intent,
        ...(assessment.caller.claimedName ? { callerDisplayName: assessment.caller.claimedName } : {}),
        ...(assessment.caller.claimedCompany ? { claimedCompany: assessment.caller.claimedCompany } : {}),
        ...(category ? { category } : {}),
        ...(outcome ? { outcome } : {})
      })
      .where(eq(calls.id, callId));

    return reply.send({
      result: { action, nextQuestion: assessment.nextQuestion, usedFallback }
    });
  });

  app.post("/agent-tools/transfer", async (request, reply) => {
    const parsed = transferRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send();
    }
    const { call_id: callId } = parsed.data.parameters;

    const [call] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    if (!call) {
      return reply.code(404).send();
    }
    const [owner] = await db.select().from(users).where(eq(users.id, call.ownerId)).limit(1);
    const signalRows = await db.select().from(riskSignals).where(eq(riskSignals.callId, callId));

    // Re-validate persisted signal types against the shared enum rather than casting —
    // this is the last gate before a telephony call, so a corrupted row fails closed.
    const signals: RiskSignal[] = signalRows.flatMap((row) => {
      const type = riskSignalTypeSchema.safeParse(row.type);
      return type.success ? [{ type: type.data, confidence: row.confidence, evidence: row.evidence }] : [];
    });

    const transferOutcome = await executeTransfer(providers.telephony, {
      callSid: call.twilioCallSid,
      callerId: call.calledNumber,
      forwardingNumber: owner?.forwardingNumber ?? null,
      signals
    });

    await db
      .update(calls)
      .set({
        transferStatus: transferOutcome.status,
        ...(transferOutcome.status === "initiated" ? { outcome: "connected" as const } : {})
      })
      .where(eq(calls.id, callId));

    return reply.send({ result: transferOutcome });
  });
};
