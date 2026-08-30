import { createHmac } from "node:crypto";
import { getExpectedTwilioSignature } from "twilio";
import { describe, expect, it } from "vitest";
import { constantTimeEqual, verifyElevenLabsSignature, verifyTwilioSignature } from "../src/providers/signatures.js";

describe("constantTimeEqual", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEqual("shared-secret", "shared-secret")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(constantTimeEqual("shared-secret", "shared-SECRET")).toBe(false);
  });

  it("returns false for different lengths without throwing", () => {
    expect(constantTimeEqual("short", "a-much-longer-secret")).toBe(false);
  });
});

describe("verifyTwilioSignature", () => {
  const authToken = "test-auth-token";
  const url = "https://api.example.com/webhooks/twilio/voice";
  const params = { CallSid: "CA123", From: "+15551234567", To: "+15557654321" };

  it("accepts a signature computed for the exact configured URL and params", () => {
    const signatureHeader = getExpectedTwilioSignature(authToken, url, params);
    expect(verifyTwilioSignature({ authToken, url, params, signatureHeader })).toBe(true);
  });

  it("rejects a signature computed for a different URL (e.g. a proxy-inferred host)", () => {
    const signatureHeader = getExpectedTwilioSignature(authToken, "https://evil.example.com/webhooks/twilio/voice", params);
    expect(verifyTwilioSignature({ authToken, url, params, signatureHeader })).toBe(false);
  });

  it("rejects a signature computed with tampered params", () => {
    const signatureHeader = getExpectedTwilioSignature(authToken, url, params);
    const tamperedParams = { ...params, From: "+19995550000" };
    expect(verifyTwilioSignature({ authToken, url, params: tamperedParams, signatureHeader })).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyTwilioSignature({ authToken, url, params, signatureHeader: undefined })).toBe(false);
  });
});

describe("verifyElevenLabsSignature", () => {
  const secret = "test-webhook-secret";
  const rawBody = JSON.stringify({ conversation_id: "conv_123", transcript: [] });

  function sign(body: string, timestampSeconds: number): string {
    const digest = createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
    return `t=${timestampSeconds},v0=${digest}`;
  }

  it("accepts a freshly signed request", () => {
    const nowMs = 1_700_000_000_000;
    const signatureHeader = sign(rawBody, Math.floor(nowMs / 1000));
    expect(verifyElevenLabsSignature({ secret, rawBody, signatureHeader, nowMs })).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const nowMs = 1_700_000_000_000;
    const digest = createHmac("sha256", "wrong-secret").update(`${Math.floor(nowMs / 1000)}.${rawBody}`).digest("hex");
    const signatureHeader = `t=${Math.floor(nowMs / 1000)},v0=${digest}`;
    expect(verifyElevenLabsSignature({ secret, rawBody, signatureHeader, nowMs })).toBe(false);
  });

  it("rejects a signature whose body does not match the raw body actually received", () => {
    const nowMs = 1_700_000_000_000;
    const signatureHeader = sign(rawBody, Math.floor(nowMs / 1000));
    const tamperedBody = JSON.stringify({ conversation_id: "conv_999", transcript: [] });
    expect(verifyElevenLabsSignature({ secret, rawBody: tamperedBody, signatureHeader, nowMs })).toBe(false);
  });

  it("rejects a stale/replayed timestamp outside the tolerance window", () => {
    const nowMs = 1_700_000_000_000;
    const staleTimestampSeconds = Math.floor(nowMs / 1000) - 60 * 60; // 1 hour old
    const signatureHeader = sign(rawBody, staleTimestampSeconds);
    expect(verifyElevenLabsSignature({ secret, rawBody, signatureHeader, nowMs })).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    expect(verifyElevenLabsSignature({ secret, rawBody, signatureHeader: "not-a-valid-header", nowMs: Date.now() })).toBe(
      false
    );
  });

  it("rejects a missing signature header", () => {
    expect(verifyElevenLabsSignature({ secret, rawBody, signatureHeader: undefined })).toBe(false);
  });
});
