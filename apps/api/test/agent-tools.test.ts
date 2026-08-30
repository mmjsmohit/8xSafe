import type { RiskAssessment } from "@call-screener/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calls, riskSignals, users } from "../src/db/schema.js";
import { agentToolRoutes } from "../src/routes/agent-tools.js";
import { buildTestApp } from "./support/build-test-app.js";
import { tableRows, type FakeRow } from "./support/fake-db.js";

const SECRET_HEADER = { "x-agent-tool-secret": "agent-tool-secret" };

const owner: FakeRow = { id: "owner-1", displayName: "Asha", forwardingNumber: "+14155550000" };
const callRow: FakeRow = {
  id: "call-1",
  ownerId: "owner-1",
  twilioCallSid: "CA1",
  calledNumber: "+14155550100",
  startedAt: new Date()
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

const connectEligible = assessment({
  riskScore: 0.1,
  confidence: 0.9,
  usefulReason: "Confirmed a delivery for today",
  signals: []
});

const apps: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

async function callScreenCall(
  input: Parameters<typeof buildTestApp>[0],
  transcript: { speaker: "assistant" | "caller"; text: string }[] = [{ speaker: "caller", text: "hi" }]
) {
  const built = await buildTestApp({ ...input, plugins: [agentToolRoutes] });
  apps.push(built.app);
  const response = await built.app.inject({
    method: "POST",
    url: "/agent-tools/screen-call",
    headers: SECRET_HEADER,
    payload: { parameters: { call_id: "call-1", transcript } }
  });
  return { ...built, response };
}

describe("POST /agent-tools/screen-call auth", () => {
  it("rejects a request with no secret header", async () => {
    const built = await buildTestApp({ plugins: [agentToolRoutes] });
    apps.push(built.app);
    const response = await built.app.inject({
      method: "POST",
      url: "/agent-tools/screen-call",
      payload: { parameters: { call_id: "call-1", transcript: [] } }
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a request with the wrong secret", async () => {
    const built = await buildTestApp({ plugins: [agentToolRoutes] });
    apps.push(built.app);
    const response = await built.app.inject({
      method: "POST",
      url: "/agent-tools/screen-call",
      headers: { "x-agent-tool-secret": "wrong-secret" },
      payload: { parameters: { call_id: "call-1", transcript: [] } }
    });
    expect(response.statusCode).toBe(401);
  });

  it("404s for a call id that doesn't exist", async () => {
    const { response } = await callScreenCall({
      dbSetup: { tables: tableRows([[calls, []]]) }
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("POST /agent-tools/screen-call screening + auto-transfer", () => {
  it("connects and automatically redirects the call when every connect condition is met", async () => {
    const { response, mocks, updates } = await callScreenCall({
      dbSetup: { tables: tableRows([[calls, [callRow]], [users, [owner]], [riskSignals, []]]) },
      providerOverrides: { risk: { assess: vi.fn(() => Promise.resolve(connectEligible)) } }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ result: { action: "CONNECT_TO_USER", transferred: true } });
    expect(mocks.redirectCall).toHaveBeenCalledTimes(1);
    const callsUpdate = updates.find((entry) => entry.table === calls);
    expect(callsUpdate?.values).toMatchObject({ outcome: "connected", transferStatus: "initiated" });
  });

  it("never connects when this turn's assessment carries a hard signal, even at low confidence", async () => {
    const hardSignalAssessment = assessment({
      ...connectEligible,
      signals: [{ type: "OTP_REQUEST", confidence: 0.05, evidence: "asked for a code" }]
    });
    const { response, mocks } = await callScreenCall({
      dbSetup: { tables: tableRows([[calls, [callRow]], [users, [owner]], [riskSignals, []]]) },
      providerOverrides: { risk: { assess: vi.fn(() => Promise.resolve(hardSignalAssessment)) } }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toMatchObject({ result: { action: "CONNECT_TO_USER" } });
    expect(mocks.redirectCall).not.toHaveBeenCalled();
  });

  it("ends the call for marketing and never transfers", async () => {
    const { response, mocks } = await callScreenCall({
      dbSetup: { tables: tableRows([[calls, [callRow]], [users, [owner]], [riskSignals, []]]) },
      providerOverrides: {
        risk: { assess: vi.fn(() => Promise.resolve(assessment({ recommendedAction: "MARK_AS_MARKETING" }))) }
      }
    });
    expect(response.json()).toMatchObject({ result: { action: "MARK_AS_MARKETING" } });
    expect(mocks.redirectCall).not.toHaveBeenCalled();
  });

  it("blocks a high-risk call and never transfers", async () => {
    const { response, mocks } = await callScreenCall({
      dbSetup: { tables: tableRows([[calls, [callRow]], [users, [owner]], [riskSignals, []]]) },
      providerOverrides: {
        risk: { assess: vi.fn(() => Promise.resolve(assessment({ riskScore: 0.9, usefulReason: "seems legit" }))) }
      }
    });
    expect(response.json()).toMatchObject({ result: { action: "BLOCK_CALL" } });
    expect(mocks.redirectCall).not.toHaveBeenCalled();
  });

  it("takes a message once the caller-turn budget is exhausted, even though 'ask more' would otherwise apply", async () => {
    const oldCallRow: FakeRow = { ...callRow, startedAt: new Date(Date.now() - 60_000) };
    const { response, mocks } = await callScreenCall(
      {
        dbSetup: { tables: tableRows([[calls, [oldCallRow]], [users, [owner]], [riskSignals, []]]) },
        providerOverrides: {
          risk: { assess: vi.fn(() => Promise.resolve(assessment({ riskScore: 0.4, confidence: 0.5 }))) }
        }
      },
      [
        { speaker: "caller", text: "1" },
        { speaker: "caller", text: "2" },
        { speaker: "caller", text: "3" },
        { speaker: "caller", text: "4" },
        { speaker: "caller", text: "5" }
      ]
    );
    expect(response.json()).toMatchObject({ result: { action: "TAKE_MESSAGE" } });
    expect(mocks.redirectCall).not.toHaveBeenCalled();
  });

  it("takes a message and never transfers when the analyzer times out", async () => {
    const { response, mocks } = await callScreenCall({
      dbSetup: { tables: tableRows([[calls, [callRow]], [users, [owner]], [riskSignals, []]]) },
      providerOverrides: { risk: { assess: vi.fn(() => Promise.reject(new Error("timeout"))) } }
    });
    expect(response.json()).toMatchObject({ result: { action: "TAKE_MESSAGE", usedFallback: true } });
    expect(mocks.redirectCall).not.toHaveBeenCalled();
  });

  it("refuses the transfer as a last line of defense when an earlier turn already recorded a hard signal, even though this turn looks safe", async () => {
    const priorHardSignal: FakeRow = { type: "REMOTE_ACCESS_REQUEST", confidence: 0.2, evidence: "earlier turn" };
    const { response, mocks } = await callScreenCall({
      dbSetup: { tables: tableRows([[calls, [callRow]], [users, [owner]], [riskSignals, [priorHardSignal]]]) },
      providerOverrides: { risk: { assess: vi.fn(() => Promise.resolve(connectEligible)) } }
    });
    expect(response.json()).toMatchObject({ result: { action: "TAKE_MESSAGE", transferred: false } });
    expect(mocks.redirectCall).not.toHaveBeenCalled();
  });

  it("falls back to taking a message when there is no forwarding number to transfer to", async () => {
    const ownerWithoutForwarding: FakeRow = { ...owner, forwardingNumber: null };
    const { response, mocks } = await callScreenCall({
      dbSetup: { tables: tableRows([[calls, [callRow]], [users, [ownerWithoutForwarding]], [riskSignals, []]]) },
      providerOverrides: { risk: { assess: vi.fn(() => Promise.resolve(connectEligible)) } }
    });
    expect(response.json()).toMatchObject({ result: { action: "TAKE_MESSAGE", transferred: false } });
    expect(mocks.redirectCall).not.toHaveBeenCalled();
  });
});
