import { describe, expect, it } from "vitest";
import { decideRoute, isPrivateNumber, normalizePhoneNumber, resolveConversationLanguage } from "../src/services/routing.js";

describe("normalizePhoneNumber", () => {
  it("passes through an already-E.164 number unchanged", () => {
    expect(normalizePhoneNumber("+14155552671")).toBe("+14155552671");
  });

  it("falls back to a trimmed copy of unparsable input instead of throwing", () => {
    expect(normalizePhoneNumber("  not-a-number  ")).toBe("not-a-number");
  });
});

describe("decideRoute", () => {
  const blocked = "+14155550001";
  const trusted = "+14155550002";
  const unknown = "+14155550003";
  const lists = {
    blockedNumbers: new Set([blocked]),
    trustedNumbers: new Set([trusted])
  };

  it("routes a blocked number to blocked", () => {
    expect(decideRoute(blocked, lists)).toEqual({ kind: "blocked" });
  });

  it("routes a trusted number to trusted", () => {
    expect(decideRoute(trusted, lists)).toEqual({ kind: "trusted" });
  });

  it("routes anything on neither list to unknown", () => {
    expect(decideRoute(unknown, lists)).toEqual({ kind: "unknown" });
  });

  it("gives blocked precedence over trusted when a number is on both lists", () => {
    const both = "+14155550099";
    const conflictingLists = {
      blockedNumbers: new Set([both]),
      trustedNumbers: new Set([both])
    };
    expect(decideRoute(both, conflictingLists)).toEqual({ kind: "blocked" });
  });
});

describe("resolveConversationLanguage", () => {
  it("uses Hindi/Hinglish for Indian shield numbers", () => {
    expect(resolveConversationLanguage("+919876543210")).toBe("hi");
  });

  it("defaults to English for non-Indian shield numbers", () => {
    expect(resolveConversationLanguage("+14155552671")).toBe("en");
  });
});

describe("isPrivateNumber", () => {
  it("is false for a real, valid E.164 number", () => {
    expect(isPrivateNumber("+14155552671")).toBe(false);
  });

  it.each(["anonymous", "ANONYMOUS", "restricted", "unavailable", "unknown", "private", ""])(
    "is true for the caller-ID-withheld sentinel %j",
    (value) => {
      expect(isPrivateNumber(value)).toBe(true);
    }
  );

  it("is true for anything libphonenumber can't parse as a real number", () => {
    expect(isPrivateNumber("not-a-number")).toBe(true);
  });
});
