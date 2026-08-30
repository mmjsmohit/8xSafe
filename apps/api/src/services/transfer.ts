import type { TransferStatus } from "@call-screener/contracts";
import type { TelephonyProvider } from "../providers/contracts.js";
import { buildDialTwiml } from "../providers/twilio.js";
import { hasHardSignal, type RiskSignal } from "./screening.js";

export type TransferRejectionReason = "hard_signal" | "missing_forwarding_number";

export type TransferDecision = { allowed: true } | { allowed: false; reason: TransferRejectionReason };

/**
 * The authoritative transfer gate. This is checked again here regardless of what the
 * screening model or the live agent already decided — a credential or remote-access
 * request anywhere in the call's signals permanently rules out connecting the caller,
 * and there is no forwarding number to dial without one on file.
 */
export function evaluateTransfer(input: {
  signals: readonly RiskSignal[];
  forwardingNumber: string | null;
}): TransferDecision {
  if (hasHardSignal(input.signals)) {
    return { allowed: false, reason: "hard_signal" };
  }
  if (!input.forwardingNumber) {
    return { allowed: false, reason: "missing_forwarding_number" };
  }
  return { allowed: true };
}

export type TransferOutcome = {
  status: TransferStatus;
  reason?: TransferRejectionReason | "telephony_error";
};

/**
 * Attempts to connect an in-progress screening call to the owner's forwarding number.
 * Never calls the telephony provider unless `evaluateTransfer` allows it.
 */
export async function executeTransfer(
  telephony: TelephonyProvider,
  input: {
    callSid: string;
    callerId: string;
    forwardingNumber: string | null;
    signals: readonly RiskSignal[];
  }
): Promise<TransferOutcome> {
  const decision = evaluateTransfer({ signals: input.signals, forwardingNumber: input.forwardingNumber });
  if (!decision.allowed) {
    return { status: "rejected", reason: decision.reason };
  }

  // Re-narrowed rather than asserted: `decision.allowed` only tells the type checker about
  // `decision`, so forwardingNumber is checked again before it is used.
  const { forwardingNumber } = input;
  if (!forwardingNumber) {
    return { status: "rejected", reason: "missing_forwarding_number" };
  }

  const twiml = buildDialTwiml({ to: forwardingNumber, callerId: input.callerId });
  try {
    await telephony.redirectCall({ callSid: input.callSid, twiml });
    return { status: "initiated" };
  } catch {
    return { status: "failed", reason: "telephony_error" };
  }
}
