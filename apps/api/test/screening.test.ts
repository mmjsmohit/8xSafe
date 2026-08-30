import type { RiskAssessment } from "@call-screener/contracts";
import { describe, expect, it } from "vitest";
import type { RiskAnalyzer, ScreeningContext } from "../src/providers/contracts.js";
import {
  categoryForAction,
  hasHardSignal,
  outcomeForAction,
  resolveAction,
  screenCaller
} from "../src/services/screening.js";

const context: ScreeningContext = {
  ownerName: "Asha",
  transcript: [{ speaker: "caller", text: "Hi, I need your OTP", occurredAt: null }],
  elapsedSeconds: 12,
  callerTurns: 1
};

function assessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    caller: { claimedName: null, claimedCompany: null },
    intent: "Unclear",
    usefulReason: null,
    signals: [],
    riskScore: 0.2,
    confidence: 0.8,
    recommendedAction: "ASK_MORE_QUESTIONS",
    nextQuestion: "Who is calling?",
    ...overrides
  };
}

describe("hasHardSignal", () => {
  it("is true for a confident credential request", () => {
    expect(hasHardSignal([{ type: "OTP_REQUEST", confidence: 0.9, evidence: "asked for the code" }])).toBe(true);
  });

  it("is true for a confident remote-access request", () => {
    expect(hasHardSignal([{ type: "REMOTE_ACCESS_REQUEST", confidence: 0.75, evidence: "asked to install AnyDesk" }])).toBe(
      true
    );
  });

  it("is false when confidence is below the threshold", () => {
    expect(hasHardSignal([{ type: "OTP_REQUEST", confidence: 0.2, evidence: "maybe mentioned a code" }])).toBe(false);
  });

  it("is false for signal types that are not hard signals", () => {
    expect(hasHardSignal([{ type: "UNSOLICITED_MARKETING", confidence: 0.99, evidence: "selling insurance" }])).toBe(
      false
    );
  });

  it("is false with no signals", () => {
    expect(hasHardSignal([])).toBe(false);
  });
});

describe("resolveAction", () => {
  it("passes through the model's recommendation when there is no hard signal", () => {
    const result = assessment({ recommendedAction: "CONNECT_TO_USER" });
    expect(resolveAction(result)).toBe("CONNECT_TO_USER");
  });

  it("downgrades CONNECT_TO_USER to TAKE_MESSAGE once a hard signal is present", () => {
    const result = assessment({
      recommendedAction: "CONNECT_TO_USER",
      signals: [{ type: "CARD_CREDENTIAL_REQUEST", confidence: 0.95, evidence: "asked for card number" }]
    });
    expect(resolveAction(result)).toBe("TAKE_MESSAGE");
  });

  it("downgrades ASK_MORE_QUESTIONS to TAKE_MESSAGE once a hard signal is present", () => {
    const result = assessment({
      recommendedAction: "ASK_MORE_QUESTIONS",
      signals: [{ type: "SCREEN_SHARING_REQUEST", confidence: 0.8, evidence: "asked to share screen" }]
    });
    expect(resolveAction(result)).toBe("TAKE_MESSAGE");
  });

  it("leaves BLOCK_CALL alone even with a hard signal present", () => {
    const result = assessment({
      recommendedAction: "BLOCK_CALL",
      signals: [{ type: "REMOTE_ACCESS_REQUEST", confidence: 0.9, evidence: "asked for remote access" }]
    });
    expect(resolveAction(result)).toBe("BLOCK_CALL");
  });
});

describe("categoryForAction / outcomeForAction", () => {
  it("maps marketing, suspicious, scam, and block actions to a category", () => {
    expect(categoryForAction("MARK_AS_MARKETING")).toBe("marketing");
    expect(categoryForAction("MARK_AS_SUSPICIOUS")).toBe("suspicious");
    expect(categoryForAction("MARK_AS_SCAM")).toBe("scam");
    expect(categoryForAction("BLOCK_CALL")).toBe("suspicious");
  });

  it("leaves the category undecided for actions that don't classify the caller", () => {
    expect(categoryForAction("ASK_MORE_QUESTIONS")).toBeNull();
    expect(categoryForAction("CONNECT_TO_USER")).toBeNull();
  });

  it("maps terminal actions to a call outcome", () => {
    expect(outcomeForAction("CONNECT_TO_USER")).toBe("connected");
    expect(outcomeForAction("TAKE_MESSAGE")).toBe("message_taken");
    expect(outcomeForAction("BLOCK_CALL")).toBe("blocked");
    expect(outcomeForAction("END_CALL")).toBe("ended");
  });

  it("leaves the outcome undecided while still screening", () => {
    expect(outcomeForAction("ASK_MORE_QUESTIONS")).toBeNull();
  });
});

describe("screenCaller", () => {
  it("returns the analyzer's assessment on success", async () => {
    const risk: RiskAnalyzer = { assess: () => Promise.resolve(assessment({ recommendedAction: "TAKE_MESSAGE" })) };
    const result = await screenCaller(risk, context);
    expect(result.usedFallback).toBe(false);
    expect(result.assessment.recommendedAction).toBe("TAKE_MESSAGE");
  });

  it("falls back to a safe TAKE_MESSAGE assessment when the analyzer times out", async () => {
    const risk: RiskAnalyzer = {
      assess: () => Promise.reject(new Error("timeout"))
    };
    const result = await screenCaller(risk, context);
    expect(result.usedFallback).toBe(true);
    expect(result.assessment.recommendedAction).toBe("TAKE_MESSAGE");
  });

  it("falls back to a safe TAKE_MESSAGE assessment when the analyzer throws on invalid output", async () => {
    const risk: RiskAnalyzer = {
      assess: () => Promise.reject(new Error("openai_screening_invalid_output"))
    };
    const result = await screenCaller(risk, context);
    expect(result.usedFallback).toBe(true);
    expect(result.assessment.recommendedAction).toBe("TAKE_MESSAGE");
  });
});
