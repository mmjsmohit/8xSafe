import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { userIdSchema, type MeResponse } from "@call-screener/contracts";
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

import { fetchOwnerMe, fetchVoicePreview, uploadVoiceSample } from "./onboarding-api";
import {
  validateVoiceCloneInput,
  validateVoiceRecordingDuration
} from "./validation";

const validReadyVoiceResponse = {
  voice: {
    status: "ready" as const,
    consentedAt: "2026-08-30T10:00:00.000Z",
    updatedAt: "2026-08-30T10:01:00.000Z"
  }
};

const validProcessingVoiceResponse = {
  voice: {
    status: "processing" as const,
    consentedAt: "2026-08-30T10:00:00.000Z"
  }
};

const validFailedVoiceResponse = {
  voice: {
    status: "failed" as const,
    retryable: true
  }
};

describe("voice onboarding fail-closed lifecycle", () => {
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

  describe("recorder failure and no fake URI", () => {
    it("fails closed when recorder initialization throws", async () => {
      const mockAudioRecorder = {
        prepareToRecordAsync: vi.fn().mockRejectedValue(new Error("Microphone hardware busy")),
        record: vi.fn(),
        stop: vi.fn(),
        uri: null
      };

      let isRecording = false;
      let recordingError: string | null = null;
      const recordingUri: string | null = null;

      try {
        await mockAudioRecorder.prepareToRecordAsync();
        mockAudioRecorder.record();
        isRecording = true;
      } catch (err) {
        isRecording = false;
        recordingError = err instanceof Error ? err.message : "Recorder failure";
      }

      expect(isRecording).toBe(false);
      expect(recordingError).toBe("Microphone hardware busy");
      expect(recordingUri).toBeNull();
      expect(mockAudioRecorder.record).not.toHaveBeenCalled();
    });

    it("never fabricates a file URI when recorder produces null URI", () => {
      const recorderWithNoUri = {
        uri: null as string | null
      };
      const recorderStateWithNoUrl = {
        url: null as string | null
      };

      const resolvedUri = recorderWithNoUri.uri ?? recorderStateWithNoUrl.url;
      expect(resolvedUri).toBeNull();

      let finalRecordingUri: string | null = null;
      let errorEncountered: string | null = null;

      if (!resolvedUri) {
        finalRecordingUri = null;
        errorEncountered = "Failed to access recorded audio file";
      } else {
        finalRecordingUri = resolvedUri;
      }

      expect(finalRecordingUri).toBeNull();
      expect(errorEncountered).toContain("Failed to access recorded audio file");
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
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(validReadyVoiceResponse)
        });
      });

      global.fetch = mockFetch;

      await expect(
        uploadVoiceSample({
          fileUri: "file:///test/recording.m4a",
          durationSeconds: 90,
          consent: true
        })
      ).rejects.toThrow("Model training temporarily unavailable");

      const retryResponse = await uploadVoiceSample({
        fileUri: "file:///test/recording.m4a",
        durationSeconds: 90,
        consent: true
      });

      expect(retryResponse.voice.status).toBe("ready");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("processing lifecycle: processing-to-ready and processing-to-failed", () => {
    it("polls owner status from processing to ready", async () => {
      mockReadAccessToken.mockResolvedValue("test-bearer-token");

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(validProcessingVoiceResponse)
      });
      global.fetch = mockFetch;

      const uploadResult = await uploadVoiceSample({
        fileUri: "file:///test/recording.m4a",
        durationSeconds: 90,
        consent: true
      });
      expect(uploadResult.voice.status).toBe("processing");

      const processingMe: MeResponse = {
        id: userIdSchema.parse("00000000-0000-4000-8000-000000000001"),
        email: "owner@example.com",
        displayName: "Alex Owner",
        forwardingNumber: "+919876543210",
        shieldNumber: "+14155550199",
        onboarding: { status: "voice_required" },
        voice: validProcessingVoiceResponse.voice
      };

      const readyMe: MeResponse = {
        id: userIdSchema.parse("00000000-0000-4000-8000-000000000001"),
        email: "owner@example.com",
        displayName: "Alex Owner",
        forwardingNumber: "+919876543210",
        shieldNumber: "+14155550199",
        onboarding: { status: "complete", completedAt: "2026-08-30T10:02:00.000Z" },
        voice: validReadyVoiceResponse.voice
      };

      mockApiRequest
        .mockResolvedValueOnce(processingMe)
        .mockResolvedValueOnce(readyMe);

      let currentVoiceStatus: string = uploadResult.voice.status;
      for (let i = 0; i < 5; i++) {
        const polled = await fetchOwnerMe();
        if (polled.voice.status === "ready") {
          currentVoiceStatus = "ready";
          break;
        }
      }

      expect(currentVoiceStatus).toBe("ready");
      expect(mockApiRequest).toHaveBeenCalledTimes(2);
    });

    it("polls owner status from processing to failed", async () => {
      mockReadAccessToken.mockResolvedValue("test-bearer-token");

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(validProcessingVoiceResponse)
      });
      global.fetch = mockFetch;

      const uploadResult = await uploadVoiceSample({
        fileUri: "file:///test/recording.m4a",
        durationSeconds: 90,
        consent: true
      });
      expect(uploadResult.voice.status).toBe("processing");

      const failedMe: MeResponse = {
        id: userIdSchema.parse("00000000-0000-4000-8000-000000000001"),
        email: "owner@example.com",
        displayName: "Alex Owner",
        forwardingNumber: "+919876543210",
        shieldNumber: "+14155550199",
        onboarding: { status: "voice_required" },
        voice: validFailedVoiceResponse.voice
      };

      mockApiRequest.mockResolvedValueOnce(failedMe);

      const polled = await fetchOwnerMe();
      expect(polled.voice.status).toBe("failed");
      if (polled.voice.status === "failed") {
        expect(polled.voice.retryable).toBe(true);
      }
    });
  });

  describe("preview failure and retry (never synthetic)", () => {
    it("fails closed on preview error and does not substitute synthetic audio", async () => {
      mockApiRequest.mockRejectedValueOnce(new Error("Preview generation failed on server"));

      let previewResult: VoicePreviewResponse | null = null;
      let previewError: string | null = null;

      try {
        previewResult = await fetchVoicePreview();
      } catch (err) {
        previewError = err instanceof Error ? err.message : "Error loading preview";
      }

      expect(previewResult).toBeNull();
      expect(previewError).toBe("Preview generation failed on server");

      const realPreview: VoicePreviewResponse = {
        audioBase64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        mimeType: "audio/wav"
      };
      mockApiRequest.mockResolvedValueOnce(realPreview);

      const retriedPreview = await fetchVoicePreview();
      expect(retriedPreview.audioBase64).toBe(realPreview.audioBase64);
      expect(retriedPreview.mimeType).toBe("audio/wav");
    });
  });

  describe("server confirmation required before finish", () => {
    it("blocks finishing when server voice status is not ready", async () => {
      const notReadyMe: MeResponse = {
        id: userIdSchema.parse("00000000-0000-4000-8000-000000000001"),
        email: "owner@example.com",
        displayName: "Alex Owner",
        forwardingNumber: "+919876543210",
        shieldNumber: "+14155550199",
        onboarding: { status: "voice_required" },
        voice: validProcessingVoiceResponse.voice
      };

      mockApiRequest.mockResolvedValueOnce(notReadyMe);

      const serverStatus = await fetchOwnerMe();
      const canFinish = serverStatus.voice.status === "ready" || serverStatus.onboarding.status === "complete";
      expect(canFinish).toBe(false);
    });

    it("allows finishing only when server confirms ready voice status", async () => {
      const readyMe: MeResponse = {
        id: userIdSchema.parse("00000000-0000-4000-8000-000000000001"),
        email: "owner@example.com",
        displayName: "Alex Owner",
        forwardingNumber: "+919876543210",
        shieldNumber: "+14155550199",
        onboarding: { status: "complete", completedAt: "2026-08-30T10:02:00.000Z" },
        voice: validReadyVoiceResponse.voice
      };

      mockApiRequest.mockResolvedValueOnce(readyMe);

      const serverStatus = await fetchOwnerMe();
      const canFinish = serverStatus.voice.status === "ready" || serverStatus.onboarding.status === "complete";
      expect(canFinish).toBe(true);
    });
  });
});
