import type { CallCategory, CallOutcome, RiskAssessment, ScreeningAction, riskSignalSchema } from "@call-screener/contracts";
import type { z } from "zod";
import type { RiskAnalyzer, ScreeningContext } from "../providers/contracts.js";

export type RiskSignal = z.infer<typeof riskSignalSchema>;

/**
 * Signal types that describe someone trying to extract a credential or take remote control
 * of a device. These never justify a transfer or a connect, no matter what the model or the
 * live agent otherwise recommends — see `hasHardSignal` and services/transfer.ts.
 */
export const HARD_SIGNAL_TYPES: ReadonlySet<RiskSignal["type"]> = new Set([
  "OTP_REQUEST",
  "PASSWORD_REQUEST",
  "UPI_PIN_REQUEST",
  "CARD_CREDENTIAL_REQUEST",
  "REMOTE_ACCESS_REQUEST",
  "SCREEN_SHARING_REQUEST"
]);

/** Below this confidence a hard-signal flag is treated as noise rather than a hard stop. */
const HARD_SIGNAL_CONFIDENCE_THRESHOLD = 0.5;

export function hasHardSignal(signals: readonly RiskSignal[]): boolean {
  return signals.some(
    (signal) => HARD_SIGNAL_TYPES.has(signal.type) && signal.confidence >= HARD_SIGNAL_CONFIDENCE_THRESHOLD
  );
}

/** Returned whenever screening could not get a trustworthy model result in time. */
export const FALLBACK_ASSESSMENT: RiskAssessment = {
  caller: { claimedName: null, claimedCompany: null },
  intent: "Screening timed out or returned an invalid result before the caller's intent was established.",
  usefulReason: null,
  signals: [],
  riskScore: 0.5,
  confidence: 0,
  recommendedAction: "TAKE_MESSAGE",
  nextQuestion: null
};

export type ScreeningTurnResult = {
  assessment: RiskAssessment;
  /** True when the analyzer failed (timeout, network error, invalid output) and the safe fallback was used. */
  usedFallback: boolean;
};

/**
 * Runs one screening turn. A timeout, transport error, or an analyzer that returns output
 * failing the structured schema all land here as a thrown error — screening must never let
 * that propagate into the live call, so it always resolves to a message-taking fallback instead.
 */
export async function screenCaller(risk: RiskAnalyzer, context: ScreeningContext): Promise<ScreeningTurnResult> {
  try {
    const assessment = await risk.assess(context);
    return { assessment, usedFallback: false };
  } catch {
    return { assessment: FALLBACK_ASSESSMENT, usedFallback: true };
  }
}

/**
 * Reconciles the model's recommended action with the hard-signal guardrail. This is the
 * last line of defense inside screening itself: even a confident, well-formed recommendation
 * to connect or keep talking is downgraded to taking a message once a credential or
 * remote-access request has been seen.
 */
export function resolveAction(assessment: RiskAssessment): ScreeningAction {
  if (!hasHardSignal(assessment.signals)) {
    return assessment.recommendedAction;
  }
  if (assessment.recommendedAction === "CONNECT_TO_USER" || assessment.recommendedAction === "ASK_MORE_QUESTIONS") {
    return "TAKE_MESSAGE";
  }
  return assessment.recommendedAction;
}

/** Maps a resolved action to the caller category it should stamp on the call, if any. */
export function categoryForAction(action: ScreeningAction): CallCategory | null {
  switch (action) {
    case "MARK_AS_MARKETING":
      return "marketing";
    case "MARK_AS_SUSPICIOUS":
      return "suspicious";
    case "MARK_AS_SCAM":
      return "scam";
    case "BLOCK_CALL":
      return "suspicious";
    default:
      return null;
  }
}

/** Maps a resolved action to the call outcome it settles, if the call is now decided. */
export function outcomeForAction(action: ScreeningAction): CallOutcome | null {
  switch (action) {
    case "CONNECT_TO_USER":
      return "connected";
    case "TAKE_MESSAGE":
      return "message_taken";
    case "BLOCK_CALL":
      return "blocked";
    case "END_CALL":
      return "ended";
    default:
      return null;
  }
}
