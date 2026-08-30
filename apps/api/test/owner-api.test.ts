import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerOwnerRoutes } from "../src/routes/owner.js";

const callsRepository = vi.hoisted(() => ({
  deleteAllCalls: vi.fn(),
  deleteCall: vi.fn(),
  findCallDetail: vi.fn(),
  listCalls: vi.fn()
}));
const usersRepository = vi.hoisted(() => ({
  findOwnerMe: vi.fn(),
  findUserById: vi.fn(),
  updateOwnerProfile: vi.fn()
}));

vi.mock("../src/repositories/calls.js", () => callsRepository);
vi.mock("../src/repositories/users.js", () => usersRepository);

const ownerId = "11111111-1111-4111-8111-111111111111";
const callId = "22222222-2222-4222-8222-222222222222";
const call = {
  id: callId,
  callerNumber: "+14155550101",
  callerDisplayName: "Caller",
  claimedCompany: "Example Co",
  reason: "A question",
  category: "business",
  outcome: "message_taken",
  transferStatus: "not_requested",
  riskScore: 0.2,
  confidence: 0.9,
  durationSeconds: 42,
  startedAt: "2026-01-03T00:00:00.000Z",
  completedAt: "2026-01-03T00:01:00.000Z",
  summary: "Caller asked a question.",
  signals: [{ type: "VAGUE_PURPOSE", confidence: 0.7, evidence: "No clear reason" }],
  transcript: [{ speaker: "caller", text: "Hello", occurredAt: "2026-01-03T00:00:05.000Z" }]
};

async function createApp(apps: FastifyInstance[]): Promise<{ app: FastifyInstance; authorization: string }> {
  const app = Fastify();
  apps.push(app);
  app.decorate("dependencies", { config: { JWT_SECRET: "a".repeat(32) }, db: undefined, providers: undefined });
  await registerOwnerRoutes(app);
  return {
    app,
    authorization: `Bearer ${app.jwt.sign({ sub: ownerId, email: "owner@example.com" })}`
  };
}

describe("owner API", () => {
  const apps: FastifyInstance[] = [];

  beforeEach(() => {
    callsRepository.deleteAllCalls.mockReset();
    callsRepository.deleteCall.mockReset();
    callsRepository.findCallDetail.mockReset();
    callsRepository.listCalls.mockReset();
    usersRepository.findOwnerMe.mockReset();
    usersRepository.findUserById.mockReset();
    usersRepository.updateOwnerProfile.mockReset();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("requires an access token before exposing owner data", async () => {
    const { app } = await createApp(apps);

    const response = await app.inject({ method: "GET", url: "/owner/calls" });

    expect(response.statusCode).toBe(401);
    expect(callsRepository.listCalls).not.toHaveBeenCalled();
  });

  it("passes the authenticated owner to list, detail, one-call deletion, and delete-all", async () => {
    const { app, authorization } = await createApp(apps);
    callsRepository.listCalls.mockResolvedValue({ items: [call], nextCursor: null });
    callsRepository.findCallDetail.mockResolvedValue(call);
    callsRepository.deleteCall.mockResolvedValue(true);
    callsRepository.deleteAllCalls.mockResolvedValue(3);

    const list = await app.inject({ method: "GET", url: "/owner/calls?limit=1", headers: { authorization } });
    const detail = await app.inject({ method: "GET", url: `/owner/calls/${callId}`, headers: { authorization } });
    const deleted = await app.inject({ method: "DELETE", url: `/owner/calls/${callId}`, headers: { authorization } });
    const deletedAll = await app.inject({ method: "DELETE", url: "/owner/calls", headers: { authorization } });

    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ items: [{ id: callId }], nextCursor: null });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id: callId });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true });
    expect(deletedAll.statusCode).toBe(200);
    expect(deletedAll.json()).toEqual({ ok: true });
    expect(callsRepository.listCalls).toHaveBeenCalledWith({ db: undefined, ownerId, query: { limit: 1 } });
    expect(callsRepository.findCallDetail).toHaveBeenCalledWith({ db: undefined, ownerId, callId });
    expect(callsRepository.deleteCall).toHaveBeenCalledWith({ db: undefined, ownerId, callId });
    expect(callsRepository.deleteAllCalls).toHaveBeenCalledWith({ db: undefined, ownerId });
  });
});
