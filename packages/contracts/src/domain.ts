import { z } from "zod";

export const userIdSchema = z.uuid().brand<"UserId">();
export const callIdSchema = z.uuid().brand<"CallId">();
export const callerRuleIdSchema = z.uuid().brand<"CallerRuleId">();

export type UserId = z.infer<typeof userIdSchema>;
export type CallId = z.infer<typeof callIdSchema>;
export type CallerRuleId = z.infer<typeof callerRuleIdSchema>;

export const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Enter a phone number in E.164 format");

export const riskSignalTypeSchema = z.enum([
  "OTP_REQUEST",
  "PASSWORD_REQUEST",
  "UPI_PIN_REQUEST",
  "CARD_CREDENTIAL_REQUEST",
  "REMOTE_ACCESS_REQUEST",
  "SCREEN_SHARING_REQUEST",
  "MONEY_REQUEST",
  "URGENCY_PRESSURE",
  "IDENTITY_MISMATCH",
  "UNSOLICITED_MARKETING",
  "VAGUE_PURPOSE",
  "OTHER"
]);

export const screeningActionSchema = z.enum([
  "ASK_MORE_QUESTIONS",
  "CONNECT_TO_USER",
  "TAKE_MESSAGE",
  "BLOCK_CALL",
  "END_CALL",
  "MARK_AS_MARKETING",
  "MARK_AS_SUSPICIOUS",
  "MARK_AS_SCAM"
]);

export const callCategorySchema = z.enum([
  "trusted",
  "delivery",
  "personal",
  "business",
  "marketing",
  "suspicious",
  "scam",
  "unknown"
]);

export const callOutcomeSchema = z.enum([
  "direct_forward",
  "connected",
  "message_taken",
  "blocked",
  "ended",
  "missed_transfer",
  "unavailable",
  "processing"
]);

export const transferStatusSchema = z.enum([
  "not_requested",
  "initiated",
  "ringing",
  "answered",
  "completed",
  "busy",
  "rejected",
  "failed",
  "no_answer"
]);

export const riskSignalSchema = z.object({
  type: riskSignalTypeSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1).max(500)
});

export const riskAssessmentSchema = z.object({
  caller: z.object({
    claimedName: z.string().min(1).max(120).nullable(),
    claimedCompany: z.string().min(1).max(160).nullable()
  }),
  intent: z.string().min(1).max(500),
  usefulReason: z.string().min(1).max(500).nullable(),
  signals: z.array(riskSignalSchema).max(20),
  riskScore: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  recommendedAction: screeningActionSchema,
  nextQuestion: z.string().min(1).max(300).nullable()
});

export type RiskSignalType = z.infer<typeof riskSignalTypeSchema>;
export type ScreeningAction = z.infer<typeof screeningActionSchema>;
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;
export type CallCategory = z.infer<typeof callCategorySchema>;
export type CallOutcome = z.infer<typeof callOutcomeSchema>;
export type TransferStatus = z.infer<typeof transferStatusSchema>;

