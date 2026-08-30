import { describe, expect, it, vi } from "vitest";
import type { TelephonyProvider } from "../src/providers/contracts.js";
import type { RiskSignal } from "../src/services/screening.js";
import { evaluateTransfer, executeTransfer } from "../src/services/transfer.js";

const cleanSignals: RiskSignal[] = [{ type: "UNSOLICITED_MARKETING", confidence: 0.9, evidence: "selling something" }];
// Deliberately low confidence: a hard signal blocks a transfer at any confidence, no threshold.
const hardSignals: RiskSignal[] = [{ type: "REMOTE_ACCESS_REQUEST", confidence: 0.05, evidence: "asked to install software" }];
const publicApiUrl = "https://api.example.com";

describe("evaluateTransfer", () => {
  it("allows a transfer with clean signals and a forwarding number on file", () => {
    expect(evaluateTransfer({ signals: cleanSignals, forwardingNumber: "+14155550000" })).toEqual({ allowed: true });
  });

  it("never allows a transfer once a hard signal is present, regardless of a forwarding number", () => {
    expect(evaluateTransfer({ signals: hardSignals, forwardingNumber: "+14155550000" })).toEqual({
      allowed: false,
      reason: "hard_signal"
    });
  });

  it("refuses a transfer when there is no forwarding number on file", () => {
    expect(evaluateTransfer({ signals: cleanSignals, forwardingNumber: null })).toEqual({
      allowed: false,
      reason: "missing_forwarding_number"
    });
  });

  it("reports the hard-signal reason even when both problems are present", () => {
    expect(evaluateTransfer({ signals: hardSignals, forwardingNumber: null })).toEqual({
      allowed: false,
      reason: "hard_signal"
    });
  });
});

function fakeTelephony() {
  const redirectCall = vi.fn<TelephonyProvider["redirectCall"]>(() => Promise.resolve());
  const telephony: TelephonyProvider = { redirectCall };
  return { telephony, redirectCall };
}

describe("executeTransfer", () => {
  it("redirects the call and reports initiated when the transfer is allowed", async () => {
    const { telephony, redirectCall } = fakeTelephony();
    const outcome = await executeTransfer(telephony, {
      callSid: "CA123",
      callerId: "+14155559999",
      forwardingNumber: "+14155550000",
      signals: cleanSignals,
      publicApiUrl
    });
    expect(outcome).toEqual({ status: "initiated" });
    expect(redirectCall).toHaveBeenCalledTimes(1);
    const [call] = redirectCall.mock.calls[0] ?? [];
    expect(call?.callSid).toBe("CA123");
    expect(call?.twiml).toContain("+14155550000");
    expect(call?.twiml).toContain('timeout="20"');
    expect(call?.twiml).toContain("https://api.example.com/webhooks/twilio/dial-complete");
    expect(call?.twiml).toContain("https://api.example.com/webhooks/twilio/call-status");
  });

  it("never calls the telephony provider when a hard signal is present, even at low confidence", async () => {
    const { telephony, redirectCall } = fakeTelephony();
    const outcome = await executeTransfer(telephony, {
      callSid: "CA123",
      callerId: "+14155559999",
      forwardingNumber: "+14155550000",
      signals: hardSignals,
      publicApiUrl
    });
    expect(outcome).toEqual({ status: "rejected", reason: "hard_signal" });
    expect(redirectCall).not.toHaveBeenCalled();
  });

  it("rejects without calling the telephony provider when there is no forwarding number", async () => {
    const { telephony, redirectCall } = fakeTelephony();
    const outcome = await executeTransfer(telephony, {
      callSid: "CA123",
      callerId: "+14155559999",
      forwardingNumber: null,
      signals: cleanSignals,
      publicApiUrl
    });
    expect(outcome).toEqual({ status: "rejected", reason: "missing_forwarding_number" });
    expect(redirectCall).not.toHaveBeenCalled();
  });

  it("reports failed when the telephony provider throws", async () => {
    const telephony: TelephonyProvider = { redirectCall: () => Promise.reject(new Error("twilio down")) };
    const outcome = await executeTransfer(telephony, {
      callSid: "CA123",
      callerId: "+14155559999",
      forwardingNumber: "+14155550000",
      signals: cleanSignals,
      publicApiUrl
    });
    expect(outcome).toEqual({ status: "failed", reason: "telephony_error" });
  });
});
