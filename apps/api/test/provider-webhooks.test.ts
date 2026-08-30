import { createHmac } from "node:crypto";
import { getExpectedTwilioSignature } from "twilio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blockedCallers, calls, jobs, phoneNumbers, trustedCallers, users, webhookEvents } from "../src/db/schema.js";
import { buildTestApp, testConfig } from "./support/build-test-app.js";
import { tableRows, type FakeRow } from "./support/fake-db.js";

const PUBLIC_API_URL = "https://api.example.com";
const AUTH_TOKEN = testConfig().TWILIO_AUTH_TOKEN as string;

function twilioSignature(url: string, params: Record<string, string>): string {
  return getExpectedTwilioSignature(AUTH_TOKEN, url, params);
}

function twilioForm(params: Record<string, string>) {
  return {
    payload: new URLSearchParams(params).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" }
  };
}

const owner: FakeRow = {
  id: "owner-1",
  displayName: "Asha",
  forwardingNumber: "+14155550000",
  voiceStatus: "ready",
  voiceId: "voice-1"
};

const phoneNumberRow: FakeRow = { id: "phone-1", ownerId: "owner-1", phoneNumber: "+14155550100", isActive: true };

const apps: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

describe("POST /webhooks/twilio/inbound", () => {
  const path = "/webhooks/twilio/inbound";
  const url = `${PUBLIC_API_URL}${path}`;

  it("rejects a request whose signature doesn't match the exact configured URL", async () => {
    const { app } = await buildTestApp({
      dbSetup: { tables: tableRows([[phoneNumbers, [phoneNumberRow]], [users, [owner]]]) }
    });
    apps.push(app);
    const params = { CallSid: "CA1", From: "+15551234567", To: "+14155550100" };
    const response = await app.inject({
      method: "POST",
      url: path,
      ...twilioForm(params),
      headers: {
        ...twilioForm(params).headers,
        // Signed for a different host — must be rejected even though the params match exactly.
        "x-twilio-signature": twilioSignature("https://evil.example.com" + path, params)
      }
    });
    expect(response.statusCode).toBe(403);
  });

  it("accepts a request signed for the exact configured public URL and full form params", async () => {
    const { app, mocks } = await buildTestApp({
      dbSetup: {
        tables: tableRows([
          [phoneNumbers, [phoneNumberRow]],
          [users, [owner]],
          [blockedCallers, []],
          [trustedCallers, []]
        ]),
        insertReturns: tableRows([[calls, [{ id: "call-1" }]]])
      }
    });
    apps.push(app);
    const params = { CallSid: "CA1", From: "+14155551111", To: "+14155550100" };
    const response = await app.inject({
      method: "POST",
      url: path,
      ...twilioForm(params),
      headers: { ...twilioForm(params).headers, "x-twilio-signature": twilioSignature(url, params) }
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.registerCall).toHaveBeenCalledTimes(1);
  });

  it("blocks a blocked caller with a Reject and never registers a provider conversation", async () => {
    const { app, mocks } = await buildTestApp({
      dbSetup: {
        tables: tableRows([
          [phoneNumbers, [phoneNumberRow]],
          [users, [owner]],
          [blockedCallers, [{ normalizedNumber: "+15551234567" }]],
          [trustedCallers, []]
        ]),
        insertReturns: tableRows([[calls, [{ id: "call-1" }]]])
      }
    });
    apps.push(app);
    const params = { CallSid: "CA1", From: "+15551234567", To: "+14155550100" };
    const response = await app.inject({
      method: "POST",
      url: path,
      ...twilioForm(params),
      headers: { ...twilioForm(params).headers, "x-twilio-signature": twilioSignature(url, params) }
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("<Reject");
    expect(mocks.registerCall).not.toHaveBeenCalled();
  });

  it("gives blocked precedence over trusted for a number on both lists", async () => {
    const { app } = await buildTestApp({
      dbSetup: {
        tables: tableRows([
          [phoneNumbers, [phoneNumberRow]],
          [users, [owner]],
          [blockedCallers, [{ normalizedNumber: "+15551234567" }]],
          [trustedCallers, [{ normalizedNumber: "+15551234567" }]]
        ]),
        insertReturns: tableRows([[calls, [{ id: "call-1" }]]])
      }
    });
    apps.push(app);
    const params = { CallSid: "CA1", From: "+15551234567", To: "+14155550100" };
    const response = await app.inject({
      method: "POST",
      url: path,
      ...twilioForm(params),
      headers: { ...twilioForm(params).headers, "x-twilio-signature": twilioSignature(url, params) }
    });
    expect(response.body).toContain("<Reject");
  });

  it("dials a trusted caller directly and never calls AI screening", async () => {
    const { app, mocks } = await buildTestApp({
      dbSetup: {
        tables: tableRows([
          [phoneNumbers, [phoneNumberRow]],
          [users, [owner]],
          [blockedCallers, []],
          [trustedCallers, [{ normalizedNumber: "+15551234567" }]]
        ]),
        insertReturns: tableRows([[calls, [{ id: "call-1" }]]])
      }
    });
    apps.push(app);
    const params = { CallSid: "CA1", From: "+15551234567", To: "+14155550100" };
    const response = await app.inject({
      method: "POST",
      url: path,
      ...twilioForm(params),
      headers: { ...twilioForm(params).headers, "x-twilio-signature": twilioSignature(url, params) }
    });
    expect(response.body).toContain("<Dial");
    expect(response.body).toContain("+14155550000");
    expect(mocks.registerCall).not.toHaveBeenCalled();
    expect(mocks.assess).not.toHaveBeenCalled();
  });

  it("treats a trusted caller with no forwarding number as unavailable, never AI", async () => {
    const trustedNoForwarding: FakeRow = { ...owner, forwardingNumber: null };
    const { app, mocks } = await buildTestApp({
      dbSetup: {
        tables: tableRows([
          [phoneNumbers, [phoneNumberRow]],
          [users, [trustedNoForwarding]],
          [blockedCallers, []],
          [trustedCallers, [{ normalizedNumber: "+15551234567" }]]
        ]),
        insertReturns: tableRows([[calls, [{ id: "call-1" }]]])
      }
    });
    apps.push(app);
    const params = { CallSid: "CA1", From: "+15551234567", To: "+14155550100" };
    const response = await app.inject({
      method: "POST",
      url: path,
      ...twilioForm(params),
      headers: { ...twilioForm(params).headers, "x-twilio-signature": twilioSignature(url, params) }
    });
    expect(response.body).toContain("<Say>");
    expect(response.body).toContain("<Hangup");
    expect(response.body).not.toContain("<Dial");
    expect(mocks.registerCall).not.toHaveBeenCalled();
  });

  it("treats an unknown caller with incomplete onboarding as unavailable, with no provider call", async () => {
    const notOnboarded: FakeRow = { ...owner, voiceStatus: "processing", voiceId: null };
    const { app, mocks } = await buildTestApp({
      dbSetup: {
        tables: tableRows([
          [phoneNumbers, [phoneNumberRow]],
          [users, [notOnboarded]],
          [blockedCallers, []],
          [trustedCallers, []]
        ]),
        insertReturns: tableRows([[calls, [{ id: "call-1" }]]])
      }
    });
    apps.push(app);
    const params = { CallSid: "CA1", From: "+14155552222", To: "+14155550100" };
    const response = await app.inject({
      method: "POST",
      url: path,
      ...twilioForm(params),
      headers: { ...twilioForm(params).headers, "x-twilio-signature": twilioSignature(url, params) }
    });
    expect(response.body).toContain("<Say>");
    expect(response.body).toContain("<Hangup");
    expect(mocks.registerCall).not.toHaveBeenCalled();
    expect(mocks.assess).not.toHaveBeenCalled();
  });

  it("treats an unknown caller with a private/withheld number as unavailable, with no provider call", async () => {
    const { app, mocks } = await buildTestApp({
      dbSetup: {
        tables: tableRows([
          [phoneNumbers, [phoneNumberRow]],
          [users, [owner]],
          [blockedCallers, []],
          [trustedCallers, []]
        ]),
        insertReturns: tableRows([[calls, [{ id: "call-1" }]]])
      }
    });
    apps.push(app);
    const params = { CallSid: "CA1", From: "anonymous", To: "+14155550100" };
    const response = await app.inject({
      method: "POST",
      url: path,
      ...twilioForm(params),
      headers: { ...twilioForm(params).headers, "x-twilio-signature": twilioSignature(url, params) }
    });
    expect(response.body).toContain("<Say>");
    expect(response.body).toContain("<Hangup");
    expect(mocks.registerCall).not.toHaveBeenCalled();
  });

  it("registers a fully-eligible unknown caller with the official ElevenLabs Twilio integration", async () => {
    const { app, mocks } = await buildTestApp({
      dbSetup: {
        tables: tableRows([
          [phoneNumbers, [phoneNumberRow]],
          [users, [owner]],
          [blockedCallers, []],
          [trustedCallers, []]
        ]),
        insertReturns: tableRows([[calls, [{ id: "call-1" }]]])
      }
    });
    apps.push(app);
    const params = { CallSid: "CA1", From: "+14155552222", To: "+14155550100" };
    const response = await app.inject({
      method: "POST",
      url: path,
      ...twilioForm(params),
      headers: { ...twilioForm(params).headers, "x-twilio-signature": twilioSignature(url, params) }
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.registerCall).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call-1",
        ownerName: "Asha",
        voiceId: "voice-1",
        language: "en",
        fromNumber: "+14155552222",
        toNumber: "+14155550100"
      })
    );
  });

  it("never re-registers a provider conversation for a duplicate CallSid", async () => {
    const { app, mocks } = await buildTestApp({
      dbSetup: {
        tables: tableRows([
          [phoneNumbers, [phoneNumberRow]],
          [users, [owner]],
          [blockedCallers, []],
          [trustedCallers, []],
          // The fallback SELECT after a conflicting insert finds the already-recorded call.
          [calls, [{ id: "call-1", twilioCallSid: "CA1" }]]
        ]),
        // Empty .returning() from the insert simulates the unique twilioCallSid conflict.
        insertReturns: tableRows([[calls, []]])
      }
    });
    apps.push(app);
    const params = { CallSid: "CA1", From: "+14155552222", To: "+14155550100" };
    const response = await app.inject({
      method: "POST",
      url: path,
      ...twilioForm(params),
      headers: { ...twilioForm(params).headers, "x-twilio-signature": twilioSignature(url, params) }
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("<Hangup");
    expect(mocks.registerCall).not.toHaveBeenCalled();
  });
});

describe("POST /webhooks/twilio/call-status", () => {
  const path = "/webhooks/twilio/call-status";
  const url = `${PUBLIC_API_URL}${path}`;

  it("rejects an invalid signature", async () => {
    const { app } = await buildTestApp();
    apps.push(app);
    const params = { CallSid: "CA1", CallStatus: "ringing" };
    const response = await app.inject({ method: "POST", url: path, ...twilioForm(params) });
    expect(response.statusCode).toBe(403);
  });

  it.each([
    ["initiated", "initiated"],
    ["ringing", "ringing"],
    ["in-progress", "answered"],
    ["completed", "completed"]
  ])("maps Twilio CallStatus %s to transferStatus %s", async (callStatus, transferStatus) => {
    const { app, updates } = await buildTestApp();
    apps.push(app);
    const params = { CallSid: "CA1", CallStatus: callStatus };
    const response = await app.inject({
      method: "POST",
      url: path,
      ...twilioForm(params),
      headers: { ...twilioForm(params).headers, "x-twilio-signature": twilioSignature(url, params) }
    });
    expect(response.statusCode).toBe(200);
    expect(updates).toContainEqual(expect.objectContaining({ table: calls, values: { transferStatus } }));
  });
});

describe("POST /webhooks/twilio/dial-complete", () => {
  const path = "/webhooks/twilio/dial-complete";
  const url = `${PUBLIC_API_URL}${path}`;

  it.each([
    ["completed", "completed", "connected"],
    ["busy", "busy", "missed_transfer"],
    ["no-answer", "no_answer", "missed_transfer"],
    ["failed", "failed", "missed_transfer"]
  ])("maps Twilio DialCallStatus %s to transferStatus %s and outcome %s", async (dialCallStatus, transferStatus, outcome) => {
    const { app, updates } = await buildTestApp();
    apps.push(app);
    const params = { CallSid: "CA1", DialCallStatus: dialCallStatus };
    const response = await app.inject({
      method: "POST",
      url: path,
      ...twilioForm(params),
      headers: { ...twilioForm(params).headers, "x-twilio-signature": twilioSignature(url, params) }
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("<Hangup");
    expect(updates).toContainEqual(expect.objectContaining({ table: calls, values: { transferStatus, outcome } }));
  });
});

describe("POST /webhooks/elevenlabs/post-call", () => {
  const path = "/webhooks/elevenlabs/post-call";
  const secret = testConfig().ELEVENLABS_WEBHOOK_SECRET as string;

  function sign(rawBody: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac("sha256", secret).update(`${String(timestamp)}.${rawBody}`).digest("hex");
    return `t=${String(timestamp)},v0=${digest}`;
  }

  it("rejects an invalid HMAC signature", async () => {
    const { app } = await buildTestApp();
    apps.push(app);
    const body = JSON.stringify({ conversation_id: "conv_1" });
    const response = await app.inject({
      method: "POST",
      url: path,
      payload: body,
      headers: { "content-type": "application/json", "elevenlabs-signature": "t=1,v0=deadbeef" }
    });
    expect(response.statusCode).toBe(403);
  });

  it("enqueues a pending job and a unique webhook event on first delivery, without touching calls/conversations", async () => {
    const { app, inserts, updates } = await buildTestApp({
      dbSetup: { insertReturns: tableRows([[webhookEvents, [{ id: "event-1" }]]]) }
    });
    apps.push(app);
    const body = JSON.stringify({ conversation_id: "conv_1", transcript: [] });
    const response = await app.inject({
      method: "POST",
      url: path,
      payload: body,
      headers: { "content-type": "application/json", "elevenlabs-signature": sign(body) }
    });
    expect(response.statusCode).toBe(200);
    expect(inserts.some((entry) => entry.table === webhookEvents)).toBe(true);
    expect(inserts.some((entry) => entry.table === jobs)).toBe(true);
    expect(updates).toEqual([]);
  });

  it("is idempotent for a duplicate delivery — no second job is enqueued", async () => {
    const { app, inserts } = await buildTestApp({
      // Empty .returning() simulates the unique (provider, eventKey) conflict on retry.
      dbSetup: { insertReturns: tableRows([[webhookEvents, []]]) }
    });
    apps.push(app);
    const body = JSON.stringify({ conversation_id: "conv_1", transcript: [] });
    const response = await app.inject({
      method: "POST",
      url: path,
      payload: body,
      headers: { "content-type": "application/json", "elevenlabs-signature": sign(body) }
    });
    expect(response.statusCode).toBe(200);
    expect(inserts.some((entry) => entry.table === webhookEvents)).toBe(true);
    expect(inserts.some((entry) => entry.table === jobs)).toBe(false);
  });
});
