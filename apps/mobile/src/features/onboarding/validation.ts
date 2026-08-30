import { z } from "zod";
import {
  onboardingProfileRequestSchema,
  voiceCloneMetadataSchema,
  type OnboardingProfileRequest,
  type VoiceCloneMetadata
} from "@call-screener/contracts";
import { MAX_RECORDING_SECONDS, MIN_RECORDING_SECONDS } from "./types";

export const indianPhoneSchema = z
  .string()
  .trim()
  .transform((val) => val.replace(/\s+/g, ""))
  .refine(
    (val) => /^\+91[6-9]\d{9}$/.test(val),
    "Enter a valid 10-digit Indian phone number in E.164 format (e.g., +919876543210)"
  );

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required")
  .max(100, "Display name must be 100 characters or less");

export type ProfileValidationResult =
  | { success: true; data: OnboardingProfileRequest }
  | {
      success: false;
      errors: {
        displayName?: string | undefined;
        forwardingNumber?: string | undefined;
      };
    };

export function validateProfileInput(input: {
  displayName: string;
  forwardingNumber: string;
}): ProfileValidationResult {
  const nameResult = displayNameSchema.safeParse(input.displayName);
  const phoneResult = indianPhoneSchema.safeParse(input.forwardingNumber);

  if (!nameResult.success || !phoneResult.success) {
    return {
      success: false,
      errors: {
        ...(nameResult.success ? {} : { displayName: nameResult.error.issues[0]?.message ?? "Invalid name" }),
        ...(phoneResult.success ? {} : { forwardingNumber: phoneResult.error.issues[0]?.message ?? "Invalid Indian phone number" })
      }
    };
  }

  const contractValidated = onboardingProfileRequestSchema.parse({
    displayName: nameResult.data,
    forwardingNumber: phoneResult.data
  });

  return { success: true, data: contractValidated };
}

export function validateVoiceRecordingDuration(durationSeconds: number): {
  isValid: boolean;
  errorMessage: string | null;
} {
  const rounded = Math.round(durationSeconds);
  if (rounded < MIN_RECORDING_SECONDS) {
    return {
      isValid: false,
      errorMessage: `Recording is too short (${rounded}s). Voice sample must be at least ${MIN_RECORDING_SECONDS} seconds.`
    };
  }
  if (rounded > MAX_RECORDING_SECONDS) {
    return {
      isValid: false,
      errorMessage: `Recording exceeded maximum duration (${rounded}s). Voice sample must be at most ${MAX_RECORDING_SECONDS} seconds.`
    };
  }
  return { isValid: true, errorMessage: null };
}

export function validateVoiceCloneInput(input: {
  consent: boolean;
  durationSeconds: number;
}): { success: true; data: VoiceCloneMetadata } | { success: false; error: string } {
  if (!input.consent) {
    return { success: false, error: "Consent is required to create a voice clone." };
  }

  const durationCheck = validateVoiceRecordingDuration(input.durationSeconds);
  if (!durationCheck.isValid) {
    return { success: false, error: durationCheck.errorMessage ?? "Invalid duration" };
  }

  try {
    const data = voiceCloneMetadataSchema.parse({
      consent: true,
      durationSeconds: Math.round(input.durationSeconds)
    });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Invalid metadata" };
  }
}
