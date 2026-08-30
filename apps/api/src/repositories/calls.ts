import { and, desc, eq, lt, or } from "drizzle-orm";
import { callDetailSchema, callListItemSchema, type CallDetail, type CallsPage, type CallsQuery, type TranscriptTurn } from "@call-screener/contracts";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { calls, conversations, riskSignals } from "../db/schema.js";

const callCursorSchema = z.object({
  startedAt: z.coerce.date(),
  id: z.uuid()
});

const transcriptSchema = z.array(z.object({
  speaker: z.enum(["assistant", "caller"]),
  text: z.string(),
  occurredAt: z.coerce.date().nullable()
}));

type CallCursor = z.infer<typeof callCursorSchema>;

function encodeCursor(cursor: CallCursor): string {
  return Buffer.from(JSON.stringify({ startedAt: cursor.startedAt.toISOString(), id: cursor.id })).toString("base64url");
}

function decodeCursor(cursor: string): CallCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return callCursorSchema.parse(parsed);
  } catch {
    throw new Error("Invalid call cursor");
  }
}

export async function listCalls(input: { db: Database; ownerId: string; query: CallsQuery }): Promise<CallsPage> {
  const cursor = input.query.cursor === undefined ? undefined : decodeCursor(input.query.cursor);
  const page = await input.db
    .select({
      id: calls.id,
      callerNumber: calls.callerNumber,
      callerDisplayName: calls.callerDisplayName,
      category: calls.category,
      outcome: calls.outcome,
      riskScore: calls.riskScore,
      startedAt: calls.startedAt,
      durationSeconds: calls.durationSeconds
    })
    .from(calls)
    .where(and(
      eq(calls.ownerId, input.ownerId),
      cursor === undefined
        ? undefined
        : or(lt(calls.startedAt, cursor.startedAt), and(eq(calls.startedAt, cursor.startedAt), lt(calls.id, cursor.id)))
    ))
    .orderBy(desc(calls.startedAt), desc(calls.id))
    .limit(input.query.limit + 1);
  const items = page.slice(0, input.query.limit).map((call) => callListItemSchema.parse({
    ...call,
    startedAt: call.startedAt.toISOString()
  }));
  const lastReturned = page[input.query.limit - 1];
  return {
    items,
    nextCursor: page.length <= input.query.limit || lastReturned === undefined
      ? null
      : encodeCursor({ startedAt: lastReturned.startedAt, id: lastReturned.id })
  };
}

export async function findCallDetail(input: { db: Database; ownerId: string; callId: string }): Promise<CallDetail | null> {
  const result = await input.db
    .select({
      id: calls.id,
      callerNumber: calls.callerNumber,
      callerDisplayName: calls.callerDisplayName,
      claimedCompany: calls.claimedCompany,
      reason: calls.reason,
      category: calls.category,
      outcome: calls.outcome,
      transferStatus: calls.transferStatus,
      riskScore: calls.riskScore,
      confidence: calls.confidence,
      durationSeconds: calls.durationSeconds,
      startedAt: calls.startedAt,
      completedAt: calls.completedAt,
      transcript: conversations.transcript,
      summary: conversations.summary
    })
    .from(calls)
    .leftJoin(conversations, eq(conversations.callId, calls.id))
    .where(and(eq(calls.ownerId, input.ownerId), eq(calls.id, input.callId)))
    .limit(1);
  const call = result[0];
  if (call === undefined) return null;
  const signals = await input.db.select({
    type: riskSignals.type,
    confidence: riskSignals.confidence,
    evidence: riskSignals.evidence
  }).from(riskSignals).where(eq(riskSignals.callId, call.id));
  const transcript = transcriptSchema.parse(call.transcript ?? []).map<TranscriptTurn>((turn) => ({
    speaker: turn.speaker,
    text: turn.text,
    occurredAt: turn.occurredAt === null ? null : turn.occurredAt.toISOString()
  }));
  return callDetailSchema.parse({
    ...call,
    startedAt: call.startedAt.toISOString(),
    completedAt: call.completedAt === null ? null : call.completedAt.toISOString(),
    signals,
    transcript
  });
}

export async function deleteCall(input: { db: Database; ownerId: string; callId: string }): Promise<boolean> {
  const result = await input.db.delete(calls)
    .where(and(eq(calls.ownerId, input.ownerId), eq(calls.id, input.callId)))
    .returning({ id: calls.id });
  return result.length === 1;
}

export async function deleteAllCalls(input: { db: Database; ownerId: string }): Promise<number> {
  const result = await input.db.delete(calls).where(eq(calls.ownerId, input.ownerId)).returning({ id: calls.id });
  return result.length;
}
