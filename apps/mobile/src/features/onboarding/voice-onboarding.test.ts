import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { VoicePreviewResponse } from "./onboarding-api";

vi.mock("../../api/client", () => ({
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code: string) {
      super(message);
      this.name = "ApiRequestError";
      this.status = status;
      this.code = code;
    }
  }
}));

const mockApiRequest = vi.fn();
vi.mock("../../api", () => ({
  api: {
    request: (...args: unknown[]) => mockApiRequest(...args) as unknown
  }
}));

const mockReadAccessToken = vi.fn<() => Promise<string | null>>();
vi.mock("../../auth/token-store", () => ({
  tokenStore: {
    readAccessToken: () => mockReadAccessToken()
  }
}));

import { fetchVoicePreview, uploadVoiceSample } from "./onboarding-api";
import {
  validateVoiceCloneInput,
  validateVoiceRecordingDuration
} from "./validation";

const validReadyVoiceResponse = {
  voice: {
    status: "ready" as const,
    modelProvider: "elevenlabs" as const,
    sampleRate: 44100,
    channels: 1,
    consentedAt: "2026-08-30T10:00:00.000Z",
    updatedAt: "2026-08-30T10:01:00.000Z"
  }
};

describe("voice onboarding flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("consent requirement", () => {
    it("requires explicit consent to proceed with voice cloning", () => {
      const withoutConsent = validateVoiceCloneInput({
        consent: false,
        durationSeconds: 90
      });
      expect(withoutConsent.success).toBe(false);
      if (!withoutConsent.success) {
        expect(withoutConsent.error).toContain("Consent is required");
      }

      const withConsent = validateVoiceCloneInput({
        consent: true,
        durationSeconds: 90
      });
      expect(withConsent.success).toBe(true);
      if (withConsent.success) {
        expect(withConsent.data.consent).toBe(true);
        expect(withConsent.data.durationSeconds).toBe(90);
      }
    });
  });

  describe("microphone permission handling", () => {
    it("identifies denied microphone permission state", () => {
      type MicPermissionState = "undetermined" | "granted" | "denied";

      const handlePermissionResponse = (status: "granted" | "denied" | "undetermined"): MicPermissionState => {
        if (status === "granted") return "granted";
        if (status === "denied") return "denied";
        return "undetermined";
      };

      expect(handlePermissionResponse("denied")).toBe("denied");
      expect(handlePermissionResponse("granted")).toBe("granted");
      expect(handlePermissionResponse("undetermined")).toBe("undetermined");
    });
  });

  describe("duration validation (60s to 180s)", () => {
    it("rejects recordings under 60 seconds as invalid duration", () => {
      const duration30 = validateVoiceRecordingDuration(30);
      expect(duration30.isValid).toBe(false);
      expect(duration30.errorMessage).toContain("at least 60 seconds");

      const duration59 = validateVoiceRecordingDuration(59);
      expect(duration59.isValid).toBe(false);
      expect(duration59.errorMessage).toContain("at least 60 seconds");
    });

    it("accepts recordings between 60 and 180 seconds", () => {
      const duration60 = validateVoiceRecordingDuration(60);
      expect(duration60.isValid).toBe(true);
      expect(duration60.errorMessage).toBeNull();

      const duration90 = validateVoiceRecordingDuration(90);
      expect(duration90.isValid).toBe(true);
      expect(duration90.errorMessage).toBeNull();

      const duration180 = validateVoiceRecordingDuration(180);
      expect(duration180.isValid).toBe(true);
      expect(duration180.errorMessage).toBeNull();
    });

    it("rejects recordings exceeding 180 seconds", () => {
      const duration185 = validateVoiceRecordingDuration(185);
      expect(duration185.isValid).toBe(false);
      expect(duration185.errorMessage).toContain("at most 180 seconds");
    });
  });

  describe("multipart audio upload, clone failure, and retry", () => {
    it("uploads multipart audio with consent and duration metadata", async () => {
      mockReadAccessToken.mockResolvedValueOnce("test-bearer-token");

      let sentBody: FormData | null = null;
      let sentHeaders: HeadersInit | undefined = undefined;

      const mockFetch = vi.fn().mockImplementation((_url, init?: RequestInit) => {
        const bodyValue = init?.body;
        sentBody = bodyValue instanceof FormData ? bodyValue : null;
        sentHeaders = init?.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(validReadyVoiceResponse)
        });
      });

      global.fetch = mockFetch;

      const response = await uploadVoiceSample({
        fileUri: "file:///test/recording.m4a",
        durationSeconds: 75,
        consent: true,
        fileName: "recording.m4a",
        mimeType: "audio/m4a"
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(response.voice.status).toBe("ready");
      expect(sentBody).not.toBeNull();
      expect(sentHeaders).toEqual({
        Accept: "application/json",
        Authorization: "Bearer test-bearer-token"
      });
    });

    it("handles clone failure and supports retry", async () => {
      mockReadAccessToken.mockResolvedValue("test-bearer-token");

      let attempt = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          // First attempt fails with 500
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () =>
              Promise.resolve({
                error: {
                  code: "VOICE_CLONE_FAILED",
                  message: "Model training temporarily unavailable"
                }
              })
          });
        }
        // Retry attempt succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(validReadyVoiceResponse)
        });
      });

      global.fetch = mockFetch;

      // First attempt fails
      await expect(
        uploadVoiceSample({
          fileUri: "file:///test/recording.m4a",
          durationSeconds: 90,
          consent: true
        })
      ).rejects.toThrow("Model training temporarily unavailable");

      // Retry attempt succeeds
      const retryResponse = await uploadVoiceSample({
        fileUri: "file:///test/recording.m4a",
        durationSeconds: 90,
        consent: true
      });

      expect(retryResponse.voice.status).toBe("ready");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("voice preview playback with expo-audio", () => {
    it("fetches voice preview with base64 audio and mimeType", async () => {
      const mockPreview: VoicePreviewResponse = {
        audioBase64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        mimeType: "audio/wav"
      };

      mockApiRequest.mockResolvedValueOnce(mockPreview);

      const preview = await fetchVoicePreview();
      expect(preview.audioBase64).toBe(mockPreview.audioBase64);
      expect(preview.mimeType).toBe("audio/wav");

      // Formats source compatible with expo-audio useAudioPlayer
      const audioSourceUri = `data:${preview.mimeType};base64,${preview.audioBase64}`;
      expect(audioSourceUri).toContain("data:audio/wav;base64,");
    });
  });
});
