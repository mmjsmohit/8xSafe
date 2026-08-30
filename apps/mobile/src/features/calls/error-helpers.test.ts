import { describe, expect, it } from "vitest";
import { getRetryableErrorMessage, shouldShowRetry } from "./error-helpers";

describe("error-helpers", () => {
  it("maps 401 errors to an expired session message", () => {
    expect(getRetryableErrorMessage({ name: "ApiRequestError", status: 401, message: "Unauthorized" })).toContain("session expired");
  });

  it("hides retry for expired sessions", () => {
    const unauthorized = { name: "ApiRequestError", status: 401, message: "Unauthorized" };
    expect(shouldShowRetry(unauthorized, true)).toBe(false);
    expect(shouldShowRetry({ name: "ApiRequestError", status: 500, message: "Server error" }, true)).toBe(true);
  });
});
