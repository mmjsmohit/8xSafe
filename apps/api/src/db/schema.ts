import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const voiceStatusEnum = pgEnum("voice_status", ["not_started", "processing", "ready", "failed"]);
export const callCategoryEnum = pgEnum("call_category", [
  "trusted", "delivery", "personal", "business", "marketing", "suspicious", "scam", "unknown"
]);
export const callOutcomeEnum = pgEnum("call_outcome", [
  "direct_forward", "connected", "message_taken", "blocked", "ended", "missed_transfer", "unavailable", "processing"
]);
export const transferStatusEnum = pgEnum("transfer_status", [
  "not_requested", "initiated", "ringing", "answered", "completed", "busy", "rejected", "failed", "no_answer"
]);
export const jobStatusEnum = pgEnum("job_status", ["pending", "leased", "completed", "failed"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  forwardingNumber: text("forwarding_number"),
  voiceId: text("voice_id"),
  voiceStatus: voiceStatusEnum("voice_status").notNull().default("not_started"),
  voiceConsentedAt: timestamp("voice_consented_at", { withTimezone: true }),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  ...timestamps
}, (table) => [
  check("users_voice_ready_fields", sql`${table.voiceStatus} <> 'ready' OR (${table.voiceId} IS NOT NULL AND ${table.voiceConsentedAt} IS NOT NULL)`)
]);

export const phoneNumbers = pgTable("phone_numbers", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  twilioSid: text("twilio_sid").notNull(),
  phoneNumber: text("phone_number").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps
}, (table) => [
  uniqueIndex("phone_numbers_twilio_sid_unique").on(table.twilioSid),
  uniqueIndex("phone_numbers_number_unique").on(table.phoneNumber),
  uniqueIndex("phone_numbers_owner_active_unique").on(table.ownerId).where(sql`${table.isActive} = true`)
]);

export const trustedCallers = pgTable("trusted_callers", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  normalizedNumber: text("normalized_number").notNull(),
  label: text("label"),
  ...timestamps
}, (table) => [uniqueIndex("trusted_callers_owner_number_unique").on(table.ownerId, table.normalizedNumber)]);

export const blockedCallers = pgTable("blocked_callers", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  normalizedNumber: text("normalized_number").notNull(),
  label: text("label"),
  ...timestamps
}, (table) => [uniqueIndex("blocked_callers_owner_number_unique").on(table.ownerId, table.normalizedNumber)]);

export const calls = pgTable("calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phoneNumberId: uuid("phone_number_id").notNull().references(() => phoneNumbers.id),
  twilioCallSid: text("twilio_call_sid").notNull(),
  callerNumber: text("caller_number").notNull(),
  calledNumber: text("called_number").notNull(),
  callerDisplayName: text("caller_display_name"),
  claimedCompany: text("claimed_company"),
  reason: text("reason"),
  category: callCategoryEnum("category").notNull().default("unknown"),
  outcome: callOutcomeEnum("outcome").notNull().default("processing"),
  transferStatus: transferStatusEnum("transfer_status").notNull().default("not_requested"),
  riskScore: real("risk_score"),
  confidence: real("confidence"),
  durationSeconds: integer("duration_seconds"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps
}, (table) => [
  uniqueIndex("calls_twilio_sid_unique").on(table.twilioCallSid),
  index("calls_owner_started_idx").on(table.ownerId, table.startedAt),
  check("calls_risk_score_range", sql`${table.riskScore} IS NULL OR (${table.riskScore} >= 0 AND ${table.riskScore} <= 1)`),
  check("calls_confidence_range", sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`)
]);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  callId: uuid("call_id").notNull().references(() => calls.id, { onDelete: "cascade" }).unique(),
  elevenLabsConversationId: text("elevenlabs_conversation_id").notNull().unique(),
  transcript: jsonb("transcript").notNull().default([]),
  summary: text("summary"),
  turnCount: integer("turn_count").notNull().default(0),
  ...timestamps
});

export const riskSignals = pgTable("risk_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  callId: uuid("call_id").notNull().references(() => calls.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  confidence: real("confidence").notNull(),
  evidence: text("evidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("risk_signals_call_idx").on(table.callId)]);

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  familyId: uuid("family_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  replacedById: uuid("replaced_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("refresh_tokens_user_idx").on(table.userId)]);

export const pushTokens = pgTable("push_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull(),
  deviceId: text("device_id").notNull(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  ...timestamps
}, (table) => [uniqueIndex("push_tokens_user_device_unique").on(table.userId, table.deviceId)]);

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  eventKey: text("event_key").notNull(),
  eventType: text("event_type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("webhook_events_provider_key_unique").on(table.provider, table.eventKey)]);

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  status: jobStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  leasedUntil: timestamp("leased_until", { withTimezone: true }),
  leaseOwner: text("lease_owner"),
  lastError: text("last_error"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps
}, (table) => [index("jobs_claim_idx").on(table.status, table.availableAt)]);

