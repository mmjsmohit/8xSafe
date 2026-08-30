import { describe, expect, it, vi } from "vitest";
import type { TwilioClient } from "../src/providers/twilio.js";
import {
  buildConnectStreamTwiml,
  buildDialTwiml,
  buildHangupTwiml,
  buildRejectTwiml,
  createTwilioTelephonyProvider
} from "../src/providers/twilio.js";

describe("TwiML builders", () => {
  it("builds a reject response for blocked callers", () => {
    const twiml = buildRejectTwiml();
    expect(twiml).toContain("<Reject");
    expect(twiml).toContain('reason="rejected"');
  });

  it("builds a dial response with recording explicitly disabled", () => {
    const twiml = buildDialTwiml({ to: "+14155550000", callerId: "+14155559999" });
    expect(twiml).toContain("<Dial");
    expect(twiml).toContain('record="do-not-record"');
    expect(twiml).toContain('callerId="+14155559999"');
    expect(twiml).toContain("<Number>+14155550000</Number>");
  });

  it("builds a connect/stream response carrying per-call context as custom parameters", () => {
    const twiml = buildConnectStreamTwiml({
      websocketUrl: "wss://api.elevenlabs.io/v1/convai/conversation?signature=abc",
      parameters: { call_id: "call_123", owner_name: "Asha" }
    });
    expect(twiml).toContain("<Connect>");
    expect(twiml).toContain("<Stream");
    expect(twiml).toContain('url="wss://api.elevenlabs.io/v1/convai/conversation?signature=abc"');
    expect(twiml).toContain('name="call_id"');
    expect(twiml).toContain('value="call_123"');
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
