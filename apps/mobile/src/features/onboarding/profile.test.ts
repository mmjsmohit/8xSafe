import { describe, expect, it, vi } from "vitest";
import { userIdSchema, type MeResponse } from "@call-screener/contracts";

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

const mockRequest = vi.fn();
vi.mock("../../api", () => ({
  api: {
    request: (...args: unknown[]) => mockRequest(...args) as unknown
  }
}));

vi.mock("../../auth/token-store", () => ({
  tokenStore: {
    readAccessToken: () => Promise.resolve(null)
  }
}));

import { fetchOwnerMe, submitOnboardingProfile } from "./onboarding-api";
import { validateProfileInput } from "./validation";

describe("onboarding profile and shield number", () => {
  it("validates display name and Indian E.164 forwarding number", () => {
    // Valid Indian phone numbers (+91 followed by 10 digits starting with 6-9)
    const valid = validateProfileInput({
      displayName: "Rahul Sharma",
      forwardingNumber: "+919876543210"
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.displayName).toBe("Rahul Sharma");
      expect(valid.data.forwardingNumber).toBe("+919876543210");
    }

    // Handles spaces in Indian phone number
    const validWithSpaces = validateProfileInput({
      displayName: "Priya Patel",
      forwardingNumber: "+91 98765 43210"
    });
    expect(validWithSpaces.success).toBe(true);
    if (validWithSpaces.success) {
      expect(validWithSpaces.data.forwardingNumber).toBe("+919876543210");
    }

    // Rejects non-Indian phone number (e.g. US +1)
    const usNumber = validateProfileInput({
      displayName: "John Doe",
      forwardingNumber: "+14155552671"
    });
    expect(usNumber.success).toBe(false);
    if (!usNumber.success) {
      expect(usNumber.errors.forwardingNumber).toContain("valid 10-digit Indian phone number");
    }

    // Rejects empty display name
    const emptyName = validateProfileInput({
      displayName: "   ",
      forwardingNumber: "+919876543210"
    });
    expect(emptyName.success).toBe(false);
    if (!emptyName.success) {
      expect(emptyName.errors.displayName).toContain("required");
    }

    // Rejects malformed phone numbers
    const malformed = validateProfileInput({
      displayName: "Test User",
      forwardingNumber: "12345"
    });
    expect(malformed.success).toBe(false);
  });

  it("fetches owner profile and displays allocated shield number", async () => {
    const mockMe: MeResponse = {
      id: userIdSchema.parse("00000000-0000-4000-8000-000000000001"),
      email: "owner@example.com",
      displayName: "Alex Owner",
      forwardingNumber: "+919876543210",
      shieldNumber: "+14155550199",
      onboarding: { status: "profile_required" },
      voice: { status: "not_started" }
    };

    mockRequest.mockResolvedValueOnce(mockMe);

    const me = await fetchOwnerMe();
    expect(me.shieldNumber).toBe("+14155550199");
    expect(me.onboarding.status).toBe("profile_required");
    expect(me.email).toBe("owner@example.com");
  });

  it("submits updated profile with Indian E.164 number", async () => {
    const mockUpdatedMe: MeResponse = {
      id: userIdSchema.parse("00000000-0000-4000-8000-000000000001"),
      email: "owner@example.com",
      displayName: "Rahul Sharma",
      forwardingNumber: "+919876543210",
      shieldNumber: "+14155550199",
      onboarding: { status: "voice_required" },
      voice: { status: "not_started" }
    };

    mockRequest.mockResolvedValueOnce(mockUpdatedMe);

    const result = await submitOnboardingProfile({
      displayName: "Rahul Sharma",
      forwardingNumber: "+919876543210"
    });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/owner/onboarding/profile",
        method: "POST",
        body: {
          displayName: "Rahul Sharma",
          forwardingNumber: "+919876543210"
        }
      })
    );

    expect(result.onboarding.status).toBe("voice_required");
    expect(result.displayName).toBe("Rahul Sharma");
    expect(result.forwardingNumber).toBe("+919876543210");
  });
});
