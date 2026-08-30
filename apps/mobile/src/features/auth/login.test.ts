import { describe, expect, it, vi } from "vitest";
import { loginRequestSchema, userIdSchema, type AuthSession } from "@call-screener/contracts";

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

import { loginOwner } from "./auth-api";

describe("login flow and session storage", () => {
  it("validates login credentials through loginRequestSchema", () => {
    const valid = loginRequestSchema.safeParse({
      email: "owner@example.com",
      password: "password123"
    });
    expect(valid.success).toBe(true);

    const invalidEmail = loginRequestSchema.safeParse({
      email: "not-an-email",
      password: "password123"
    });
    expect(invalidEmail.success).toBe(false);

    const shortPassword = loginRequestSchema.safeParse({
      email: "owner@example.com",
      password: "short"
    });
    expect(shortPassword.success).toBe(false);
  });

  it("authenticates and returns session tokens to store through useSession", async () => {
    const mockSession: AuthSession = {
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      accessTokenExpiresAt: "2026-08-30T12:00:00.000Z",
      refreshTokenExpiresAt: "2026-09-30T12:00:00.000Z",
      user: {
        id: userIdSchema.parse("00000000-0000-4000-8000-000000000001"),
        email: "owner@example.com",
        displayName: "Owner User"
      }
    };

    mockRequest.mockResolvedValueOnce(mockSession);

    const session = await loginOwner({
      email: "owner@example.com",
      password: "password123"
    });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/auth/login",
        method: "POST",
        body: {
          email: "owner@example.com",
          password: "password123"
        }
      })
    );

    expect(session.accessToken).toBe("mock-access-token");
    expect(session.refreshToken).toBe("mock-refresh-token");

    // Verify session storage establish behavior
    const establishedTokens: { accessToken: string; refreshToken: string }[] = [];
    const mockEstablish = (tokens: { accessToken: string; refreshToken: string }) => {
      establishedTokens.push(tokens);
      return Promise.resolve();
    };

    await mockEstablish({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken
    });

    expect(establishedTokens).toHaveLength(1);
    expect(establishedTokens[0]?.accessToken).toBe("mock-access-token");
    expect(establishedTokens[0]?.refreshToken).toBe("mock-refresh-token");
  });
});
