import { describe, expect, it, vi } from "vitest";

const mockClear = vi.fn();
const mockReplace = vi.fn();

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
vi.mock("../../auth/session", () => ({
  useSession: () => ({
    clear: mockClear,
    state: { kind: "signedIn" }
  })
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() })
}));

import { act, renderHook } from "@testing-library/react-native/pure";
import { ApiRequestError } from "../../api/client";
import { useAuthErrorHandler } from "./use-auth-error-handler";

describe("useAuthErrorHandler", () => {
  it("clears the session and navigates to login on 401", async () => {
    mockClear.mockResolvedValue(undefined);
    mockReplace.mockReset();
    mockClear.mockClear();

    const { result } = renderHook(() => useAuthErrorHandler());

    await act(async () => {
      result.current(new ApiRequestError("Unauthorized", 401, "unauthorized"));
      await Promise.resolve();
    });

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("ignores non-401 errors", () => {
    mockClear.mockClear();
    mockReplace.mockReset();

    const { result } = renderHook(() => useAuthErrorHandler());

    act(() => {
      result.current(new ApiRequestError("Server error", 500, "internal_error"));
    });

    expect(mockClear).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
