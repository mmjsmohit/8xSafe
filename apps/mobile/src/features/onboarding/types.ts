export type OnboardingStep =
  | "profile"
  | "voice_consent"
  | "voice_record"
  | "voice_cloning"
  | "voice_preview"
  | "complete";

export type MicPermissionState = "undetermined" | "granted" | "denied";

export type CloneStatus = "idle" | "uploading" | "processing" | "ready" | "failed";

export const MIN_RECORDING_SECONDS = 60;
export const MAX_RECORDING_SECONDS = 180;
