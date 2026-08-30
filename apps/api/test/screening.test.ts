import type { RiskAssessment } from "@call-screener/contracts";
import { describe, expect, it } from "vitest";
import type { RiskAnalyzer, ScreeningContext } from "../src/providers/contracts.js";
import {
  BLOCK_RISK_THRESHOLD,
  CONNECT_CONFIDENCE_THRESHOLD,
  CONNECT_RISK_THRESHOLD,
  MAX_SCREENING_CALLER_TURNS,
  MAX_SCREENING_ELAPSED_SECONDS,
  categoryForAction,
  decideScreeningAction,
  hasHardSignal,
  outcomeForAction,
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
  it("is true for a hard signal at high confidence", () => {
    expect(hasHardSignal([{ type: "OTP_REQUEST", confidence: 0.9, evidence: "asked for the code" }])).toBe(true);
  });

  it("is true for a hard signal at any confidence, however low — there is no threshold", () => {
    expect(hasHardSignal([{ type: "OTP_REQUEST", confidence: 0.01, evidence: "maybe mentioned a code" }])).toBe(true);
  });

  it("is false for signal types that are not hard signals, regardless of confidence", () => {
    expect(hasHardSignal([{ type: "UNSOLICITED_MARKETING", confidence: 0.99, evidence: "selling insurance" }])).toBe(
      false
    );
  });

  it("is false with no signals", () => {
    expect(hasHardSignal([])).toBe(false);
  });
});

describe("decideScreeningAction", () => {
  it("ends the call for marketing regardless of risk/confidence", () => {
    const result = assessment({ recommendedAction: "MARK_AS_MARKETING", riskScore: 0.01, confidence: 0.99 });
    expect(decideScreeningAction({ assessment: result, elapsedSeconds: 0, callerTurns: 0 })).toBe("MARK_AS_MARKETING");
  });

  it(`blocks whenever risk is at or above ${String(BLOCK_RISK_THRESHOLD)}, independent of hard signals or usefulReason`, () => {
    const result = assessment({ riskScore: BLOCK_RISK_THRESHOLD, confidence: 0.9, usefulReason: "Legit reason" });
    expect(decideScreeningAction({ assessment: result, elapsedSeconds: 0, callerTurns: 0 })).toBe("BLOCK_CALL");
  });

  it("does not block just below the risk threshold", () => {
    const result = assessment({ riskScore: BLOCK_RISK_THRESHOLD - 0.01, confidence: 0, usefulReason: null });
    expect(decideScreeningAction({ assessment: result, elapsedSeconds: 0, callerTurns: 0 })).not.toBe("BLOCK_CALL");
  });

  it("connects only when risk is below threshold, confidence is at/above threshold, and usefulReason is non-empty", () => {
    const result = assessment({
      riskScore: CONNECT_RISK_THRESHOLD - 0.01,
      confidence: CONNECT_CONFIDENCE_THRESHOLD,
      usefulReason: "Delivery confirmation",
      signals: []
    });
    expect(decideScreeningAction({ assessment: result, elapsedSeconds: 0, callerTurns: 0 })).toBe("CONNECT_TO_USER");
  });

  it("refuses to connect when risk is not strictly below the connect threshold", () => {
    const result = assessment({
      riskScore: CONNECT_RISK_THRESHOLD,
      confidence: CONNECT_CONFIDENCE_THRESHOLD,
      usefulReason: "Delivery confirmation"
    });
    expect(decideScreeningAction({ assessment: result, elapsedSeconds: 0, callerTurns: 0 })).not.toBe("CONNECT_TO_USER");
  });

  it("refuses to connect when confidence is below the connect threshold", () => {
    const result = assessment({
      riskScore: 0,
      confidence: CONNECT_CONFIDENCE_THRESHOLD - 0.01,
      usefulReason: "Delivery confirmation"
    });
    expect(decideScreeningAction({ assessment: result, elapsedSeconds: 0, callerTurns: 0 })).not.toBe("CONNECT_TO_USER");
  });

  it("refuses to connect when usefulReason is null", () => {
    const result = assessment({ riskScore: 0, confidence: 1, usefulReason: null });
    expect(decideScreeningAction({ assessment: result, elapsedSeconds: 0, callerTurns: 0 })).not.toBe("CONNECT_TO_USER");
  });

  it("refuses to connect when usefulReason is empty/whitespace", () => {
    const result = assessment({ riskScore: 0, confidence: 1, usefulReason: "   " });
    expect(decideScreeningAction({ assessment: result, elapsedSeconds: 0, callerTurns: 0 })).not.toBe("CONNECT_TO_USER");
  });

  it("never connects when a hard signal is present, even if every other condition is met", () => {
    const result = assessment({
      riskScore: 0,
      confidence: 1,
      usefulReason: "Delivery confirmation",
      signals: [{ type: "REMOTE_ACCESS_REQUEST", confidence: 0.05, evidence: "asked to install software" }]
    });
    expect(decideScreeningAction({ assessment: result, elapsedSeconds: 0, callerTurns: 0 })).not.toBe("CONNECT_TO_USER");
  });

  it(`takes a message once elapsed seconds reach ${String(MAX_SCREENING_ELAPSED_SECONDS)}, overriding the "ask more" default`, () => {
    const result = assessment({ riskScore: 0.4, confidence: 0.5, usefulReason: null });
    expect(
      decideScreeningAction({ assessment: result, elapsedSeconds: MAX_SCREENING_ELAPSED_SECONDS, callerTurns: 0 })
    ).toBe("TAKE_MESSAGE");
  });

  it(`takes a message once caller turns reach ${String(MAX_SCREENING_CALLER_TURNS)}, overriding the "ask more" default`, () => {
    const result = assessment({ riskScore: 0.4, confidence: 0.5, usefulReason: null });
    expect(
      decideScreeningAction({ assessment: result, elapsedSeconds: 0, callerTurns: MAX_SCREENING_CALLER_TURNS })
    ).toBe("TAKE_MESSAGE");
  });

  it("keeps asking when under both the time and turn budget and not connect-eligible", () => {
    const result = assessment({ riskScore: 0.4, confidence: 0.5, usefulReason: null });
    expect(
      decideScreeningAction({
        assessment: result,
        elapsedSeconds: MAX_SCREENING_ELAPSED_SECONDS - 1,
        callerTurns: MAX_SCREENING_CALLER_TURNS - 1
      })
    ).toBe("ASK_MORE_QUESTIONS");
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

  it("maps terminal actions to a call outcome, including marketing ending the call", () => {
    expect(outcomeForAction("CONNECT_TO_USER")).toBe("connected");
    expect(outcomeForAction("TAKE_MESSAGE")).toBe("message_taken");
    expect(outcomeForAction("BLOCK_CALL")).toBe("blocked");
    expect(outcomeForAction("END_CALL")).toBe("ended");
    expect(outcomeForAction("MARK_AS_MARKETING")).toBe("ended");
  });

  it("leaves the outcome undecided while still screening", () => {
    expect(outcomeForAction("ASK_MORE_QUESTIONS")).toBeNull();
  });
});

describe("screenCaller", () => {
  it("returns the analyzer's assessment and a server-decided action on success", async () => {
    const result = assessment({
      recommendedAction: "TAKE_MESSAGE",
      riskScore: 0.9,
      usefulReason: null
    });
    const risk: RiskAnalyzer = { assess: () => Promise.resolve(result) };
    const outcome = await screenCaller(risk, context);
    expect(outcome.usedFallback).toBe(false);
    expect(outcome.assessment).toBe(result);
    expect(outcome.action).toBe("BLOCK_CALL"); // decided server-side from riskScore, not recommendedAction
  });

  it("falls back to TAKE_MESSAGE unconditionally when the analyzer times out", async () => {
    const risk: RiskAnalyzer = { assess: () => Promise.reject(new Error("timeout")) };
    const outcome = await screenCaller(risk, context);
    expect(outcome.usedFallback).toBe(true);
    expect(outcome.action).toBe("TAKE_MESSAGE");
  });

  it("falls back to TAKE_MESSAGE unconditionally when the analyzer throws on refusal/invalid output", async () => {
    const risk: RiskAnalyzer = { assess: () => Promise.reject(new Error("openai_screening_invalid_output")) };
    const outcome = await screenCaller(risk, context);
    expect(outcome.usedFallback).toBe(true);
    expect(outcome.action).toBe("TAKE_MESSAGE");
  });
});
