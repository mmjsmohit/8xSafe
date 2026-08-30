import { z } from "zod";
import { e164Schema, userIdSchema } from "./domain.js";

export const voiceEnrollmentSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_started") }),
  z.object({ status: z.literal("processing"), consentedAt: z.iso.datetime() }),
  z.object({ status: z.literal("ready"), consentedAt: z.iso.datetime(), updatedAt: z.iso.datetime() }),
  z.object({ status: z.literal("failed"), retryable: z.boolean() })
]);

export const onboardingStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("profile_required") }),
  z.object({ status: z.literal("voice_required") }),
  z.object({ status: z.literal("complete"), completedAt: z.iso.datetime() })
]);

export const meResponseSchema = z.object({
  id: userIdSchema,
  email: z.email(),
  displayName: z.string().nullable(),
  forwardingNumber: e164Schema.nullable(),
  shieldNumber: e164Schema,
  onboarding: onboardingStateSchema,
  voice: voiceEnrollmentSchema
});

export const updateMeRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    forwardingNumber: e164Schema.optional()
  })
  .refine((value) => value.displayName !== undefined || value.forwardingNumber !== undefined, {
    message: "Provide at least one field"
  });

export const onboardingProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  forwardingNumber: e164Schema
});

export const voiceCloneMetadataSchema = z.object({
  consent: z.literal(true),
  durationSeconds: z.coerce.number().min(60).max(180)
});

export const voiceCloneResponseSchema = z.object({
  voice: voiceEnrollmentSchema
});

export const voicePreviewResponseSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.enum(["audio/mpeg", "audio/wav"])
});

export type MeResponse = z.infer<typeof meResponseSchema>;
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;
export type OnboardingProfileRequest = z.infer<typeof onboardingProfileRequestSchema>;
export type VoiceCloneMetadata = z.infer<typeof voiceCloneMetadataSchema>;

