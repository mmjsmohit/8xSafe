import { z } from "zod";
import {
  callCategorySchema,
  callIdSchema,
  callOutcomeSchema,
  e164Schema,
  riskSignalSchema,
  transferStatusSchema
} from "./domain.js";

export const transcriptTurnSchema = z.object({
  speaker: z.enum(["assistant", "caller"]),
  text: z.string(),
  occurredAt: z.iso.datetime().nullable()
});

export const callListItemSchema = z.object({
  id: callIdSchema,
  callerNumber: e164Schema,
  callerDisplayName: z.string().nullable(),
  category: callCategorySchema,
  outcome: callOutcomeSchema,
  riskScore: z.number().min(0).max(1).nullable(),
  startedAt: z.iso.datetime(),
  durationSeconds: z.number().int().min(0).nullable()
});

export const callDetailSchema = callListItemSchema.extend({
  claimedCompany: z.string().nullable(),
  reason: z.string().nullable(),
  summary: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  signals: z.array(riskSignalSchema),
  transcript: z.array(transcriptTurnSchema),
  transferStatus: transferStatusSchema,
  completedAt: z.iso.datetime().nullable()
});

export const callsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const callsPageSchema = z.object({
  items: z.array(callListItemSchema),
  nextCursor: z.string().nullable()
});

export const dashboardMetricsSchema = z.object({
  screened: z.number().int().min(0),
  connected: z.number().int().min(0),
  blocked: z.number().int().min(0),
  messages: z.number().int().min(0)
});

export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>;
export type CallListItem = z.infer<typeof callListItemSchema>;
export type CallDetail = z.infer<typeof callDetailSchema>;
export type CallsQuery = z.infer<typeof callsQuerySchema>;
export type CallsPage = z.infer<typeof callsPageSchema>;

