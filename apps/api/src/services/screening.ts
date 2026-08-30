import type { CallCategory, CallOutcome, RiskAssessment, ScreeningAction, riskSignalSchema } from "@call-screener/contracts";
import type { z } from "zod";
import type { RiskAnalyzer, ScreeningContext } from "../providers/contracts.js";

export type RiskSignal = z.infer<typeof riskSignalSchema>;

/**
 * Signal types that describe someone trying to extract a credential or take remote control
 * of a device. Per policy, any one of these present at any confidence permanently rules out
 * connecting the caller for the rest of the call — see `hasHardSignal` and services/transfer.ts.
 */
export const HARD_SIGNAL_TYPES: ReadonlySet<RiskSignal["type"]> = new Set([
  "OTP_REQUEST",
  "PASSWORD_REQUEST",
  "UPI_PIN_REQUEST",
  "CARD_CREDENTIAL_REQUEST",
  "REMOTE_ACCESS_REQUEST",
  "SCREEN_SHARING_REQUEST"
]);

/**
 * True if any hard-signal type appears in the signals list, at any confidence. There is
 * deliberately no confidence threshold here — even a low-confidence mention of a credential
 * or remote-access request is enough to permanently disqualify a connect/transfer for this call.
 */
export function hasHardSignal(signals: readonly RiskSignal[]): boolean {
  return signals.some((signal) => HARD_SIGNAL_TYPES.has(signal.type));
}

/** Risk score at or above this always blocks the call, regardless of anything else. */
export const BLOCK_RISK_THRESHOLD = 0.75;
/** Connecting requires a risk score strictly below this. */
export const CONNECT_RISK_THRESHOLD = 0.35;
/** Connecting requires model confidence at or above this. */
export const CONNECT_CONFIDENCE_THRESHOLD = 0.65;
/** Once a call has run this long, stop asking questions and take a message instead. */
export const MAX_SCREENING_ELAPSED_SECONDS = 45;
/** Once the caller has had this many turns, stop asking questions and take a message instead. */
export const MAX_SCREENING_CALLER_TURNS = 5;

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
  action: ScreeningAction;
  /** True when the analyzer failed (timeout, network error, invalid output) and the safe fallback was used. */
  usedFallback: boolean;
};

/**
 * The deterministic, server-owned decision tree. The model's own `recommendedAction` is
 * advisory only — every actual routing decision comes from these numeric/structural checks,
 * evaluated in a fixed priority order so the same inputs always produce the same action:
 *
 * 1. Marketing calls always end.
 * 2. A risk score at or above `BLOCK_RISK_THRESHOLD` always blocks, independent of everything else.
 * 3. Connecting requires ALL of: no hard signal at any confidence, risk below `CONNECT_RISK_THRESHOLD`,
 *    confidence at or above `CONNECT_CONFIDENCE_THRESHOLD`, and a non-empty `usefulReason`.
 * 4. Once the call has run long enough or had enough caller turns, stop asking and take a message.
 * 5. Otherwise, keep asking.
 */
export function decideScreeningAction(input: {
  assessment: RiskAssessment;
  elapsedSeconds: number;
  callerTurns: number;
}): ScreeningAction {
  const { assessment, elapsedSeconds, callerTurns } = input;

  if (assessment.recommendedAction === "MARK_AS_MARKETING") {
    return "MARK_AS_MARKETING";
  }

  if (assessment.riskScore >= BLOCK_RISK_THRESHOLD) {
    return "BLOCK_CALL";
  }

  const canConnect =
    !hasHardSignal(assessment.signals) &&
    assessment.riskScore < CONNECT_RISK_THRESHOLD &&
    assessment.confidence >= CONNECT_CONFIDENCE_THRESHOLD &&
    assessment.usefulReason !== null &&
    assessment.usefulReason.trim().length > 0;

  if (canConnect) {
    return "CONNECT_TO_USER";
  }

  if (elapsedSeconds >= MAX_SCREENING_ELAPSED_SECONDS || callerTurns >= MAX_SCREENING_CALLER_TURNS) {
    return "TAKE_MESSAGE";
  }

  return "ASK_MORE_QUESTIONS";
}

/**
 * Runs one screening turn end to end: calls the analyzer, and always resolves to a
 * server-decided action — never throws. A timeout, transport error, or an analyzer that
 * returns output failing the structured schema all land here as a thrown error from
 * `risk.assess`; per policy that unconditionally takes a message rather than guessing.
 */
export async function screenCaller(risk: RiskAnalyzer, context: ScreeningContext): Promise<ScreeningTurnResult> {
  try {
    const assessment = await risk.assess(context);
    const action = decideScreeningAction({
      assessment,
      elapsedSeconds: context.elapsedSeconds,
      callerTurns: context.callerTurns
    });
    return { assessment, action, usedFallback: false };
  } catch {
    return { assessment: FALLBACK_ASSESSMENT, action: "TAKE_MESSAGE", usedFallback: true };
  }
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
    case "MARK_AS_MARKETING":
      return "ended";
    default:
      return null;
  }
}
