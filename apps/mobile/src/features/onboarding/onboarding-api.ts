import {
  meResponseSchema,
  onboardingProfileRequestSchema,
  voiceCloneMetadataSchema,
  voiceCloneResponseSchema,
  voicePreviewResponseSchema,
  type MeResponse,
  type OnboardingProfileRequest,
  type VoiceCloneMetadata,
  type voiceEnrollmentSchema
} from "@call-screener/contracts";
import { z } from "zod";
import { api } from "../../api";
import { ApiRequestError } from "../../api/client";
import { tokenStore } from "../../auth/token-store";

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export type VoiceCloneResponse = z.infer<typeof voiceCloneResponseSchema>;
export type VoicePreviewResponse = z.infer<typeof voicePreviewResponseSchema>;
export type VoiceEnrollment = z.infer<typeof voiceEnrollmentSchema>;

export async function fetchOwnerMe(): Promise<MeResponse> {
  try {
    return await api.request({
      path: "/owner/me",
      schema: meResponseSchema
    });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return api.request({
        path: "/me",
        schema: meResponseSchema
      });
    }
    throw error;
  }
}

export async function submitOnboardingProfile(
  profile: OnboardingProfileRequest
): Promise<MeResponse> {
  const validated = onboardingProfileRequestSchema.parse(profile);
  return api.request({
    path: "/owner/onboarding/profile",
    method: "POST",
    body: validated,
    schema: meResponseSchema
  });
}

export type UploadVoiceSampleInput = {
  fileUri: string;
  durationSeconds: number;
  consent: true;
  fileName?: string | undefined;
  mimeType?: string | undefined;
};

export async function uploadVoiceSample(
  input: UploadVoiceSampleInput
): Promise<VoiceCloneResponse> {
  // Validate metadata through contract schema
  const metadata: VoiceCloneMetadata = voiceCloneMetadataSchema.parse({
    consent: input.consent,
    durationSeconds: input.durationSeconds
  });

  const token = await tokenStore.readAccessToken();

  const formData = new FormData();
  formData.append("consent", "true");
  formData.append("durationSeconds", String(Math.round(metadata.durationSeconds)));
  formData.append("audio", {
    uri: input.fileUri,
    name: input.fileName ?? "voice_sample.m4a",
    type: input.mimeType ?? "audio/m4a"
  } as unknown as Blob);

  const requestUpload = async (path: string) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(token === null ? {} : { Authorization: `Bearer ${token}` })
      },
      body: formData
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const errorParsed = z
        .object({ error: z.object({ code: z.string(), message: z.string() }) })
        .safeParse(data);

      throw new ApiRequestError(
        errorParsed.success ? errorParsed.data.error.message : "Voice clone upload failed",
        response.status,
        errorParsed.success ? errorParsed.data.error.code : "VOICE_CLONE_FAILED"
      );
    }

    return voiceCloneResponseSchema.parse(data);
  };

  try {
    return await requestUpload("/owner/onboarding/voice");
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return await requestUpload("/owner/voice/clone");
    }
    throw error;
  }
}

export async function fetchVoicePreview(): Promise<VoicePreviewResponse> {
  try {
    return await api.request({
      path: "/owner/onboarding/voice/preview",
      schema: voicePreviewResponseSchema
    });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return await api.request({
        path: "/owner/voice/preview",
        schema: voicePreviewResponseSchema
      });
    }
    throw error;
  }
}
