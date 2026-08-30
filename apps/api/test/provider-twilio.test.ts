import { describe, expect, it, vi } from "vitest";
import type { TwilioClient } from "../src/providers/twilio.js";
import {
  DIAL_RING_TIMEOUT_SECONDS,
  buildDialTwiml,
  buildHangupTwiml,
  buildRejectTwiml,
  buildUnavailableTwiml,
  createTwilioTelephonyProvider
} from "../src/providers/twilio.js";

const publicApiUrl = "https://api.example.com";

describe("TwiML builders", () => {
  it("builds a reject response for blocked callers", () => {
    const twiml = buildRejectTwiml();
    expect(twiml).toContain("<Reject");
    expect(twiml).toContain('reason="rejected"');
  });

  it("builds an unavailable response that says something and hangs up, with no dial or stream", () => {
    const twiml = buildUnavailableTwiml();
    expect(twiml).toContain("<Say>");
    expect(twiml).toContain("<Hangup");
    expect(twiml).not.toContain("<Dial");
    expect(twiml).not.toContain("<Connect");
  });

  it("builds a dial response with recording disabled, a 20s ring timeout, and callback URLs", () => {
    const twiml = buildDialTwiml({ to: "+14155550000", callerId: "+14155559999", publicApiUrl });
    expect(twiml).toContain("<Dial");
    expect(twiml).toContain('record="do-not-record"');
    expect(twiml).toContain(`timeout="${String(DIAL_RING_TIMEOUT_SECONDS)}"`);
    expect(twiml).toContain('callerId="+14155559999"');
    expect(twiml).toContain('action="https://api.example.com/webhooks/twilio/dial-complete"');
    expect(twiml).toContain('statusCallback="https://api.example.com/webhooks/twilio/call-status"');
    expect(twiml).toContain('statusCallbackEvent="initiated ringing answered completed"');
    expect(twiml).toContain(">+14155550000</Number>");
  });

  it("builds a hangup response", () => {
    expect(buildHangupTwiml()).toContain("<Hangup");
  });
});

describe("createTwilioTelephonyProvider", () => {
  it("redirects the live call by updating it with the given TwiML", async () => {
    const update = vi.fn(() => Promise.resolve());
    const callsMock = vi.fn(() => ({ update }));
    const client = { calls: callsMock } as unknown as TwilioClient;

    const provider = createTwilioTelephonyProvider({ accountSid: "AC123", authToken: "token" }, client);
    await provider.redirectCall({ callSid: "CA123", twiml: "<Response></Response>" });

    expect(callsMock).toHaveBeenCalledWith("CA123");
    expect(update).toHaveBeenCalledWith({ twiml: "<Response></Response>" });
  });
});
