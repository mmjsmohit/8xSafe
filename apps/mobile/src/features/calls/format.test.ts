import { describe, expect, it } from "vitest";
import { formatCallTimestamp, formatCallerLabel, formatDuration, formatRiskScore } from "./format";

describe("format", () => {
  it("formats caller label with display name", () => {
    expect(formatCallerLabel({ callerDisplayName: "Alex", callerNumber: "+14155550100" })).toBe("Alex");
  });

  it("falls back to phone number", () => {
    expect(formatCallerLabel({ callerDisplayName: null, callerNumber: "+14155550100" })).toBe("+14155550100");
  });

  it("formats duration", () => {
    expect(formatDuration(75)).toBe("1m 15s");
    expect(formatDuration(null)).toBe("—");
  });

  it("formats risk score", () => {
    expect(formatRiskScore(0.42)).toBe("42%");
    expect(formatRiskScore(null)).toBe("Unknown");
  });

  it("formats timestamps", () => {
    expect(formatCallTimestamp("2026-08-30T10:15:00.000Z")).toMatch(/Aug/);
  });
});
