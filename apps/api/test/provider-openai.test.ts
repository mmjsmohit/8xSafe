import type { RiskAssessment } from "@call-screener/contracts";
import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { createOpenAiRiskAnalyzer } from "../src/providers/openai.js";

const assessment: RiskAssessment = {
  caller: { claimedName: "Priya", claimedCompany: null },
  intent: "Delivery update",
  usefulReason: "Package arriving today",
  signals: [],
  riskScore: 0.05,
  confidence: 0.9,
  recommendedAction: "CONNECT_TO_USER",
  nextQuestion: null
};

const context = {
  ownerName: "Asha",
  transcript: [{ speaker: "caller" as const, text: "Hi, I have a delivery", occurredAt: null }],
  elapsedSeconds: 5,
  callerTurns: 1
};

type ParseCall = (...args: unknown[]) => Promise<{ output_parsed: RiskAssessment | null }>;

function fakeClient(parse: ParseCall): Pick<OpenAI, "responses"> {
  return { responses: { parse } } as unknown as Pick<OpenAI, "responses">;
}

describe("createOpenAiRiskAnalyzer", () => {
  it("returns the parsed structured assessment via the Responses API", async () => {
    const parse = vi.fn<ParseCall>(() => Promise.resolve({ output_parsed: assessment }));
    const analyzer = createOpenAiRiskAnalyzer({ apiKey: "test-key" }, fakeClient(parse));

    const result = await analyzer.assess(context);

    expect(result).toEqual(assessment);
    expect(parse).toHaveBeenCalledTimes(1);
    const [body, options] = (parse.mock.calls[0] ?? []) as [
      { model: string; temperature: number; store: boolean },
      { timeout: number }
    ];
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.temperature).toBe(0);
    expect(options.timeout).toBe(8_000);
  });

  it("never lets OpenAI retain the screening payload — store is always false", async () => {
    const parse = vi.fn<ParseCall>(() => Promise.resolve({ output_parsed: assessment }));
    const analyzer = createOpenAiRiskAnalyzer({ apiKey: "test-key" }, fakeClient(parse));
    await analyzer.assess(context);

    const [body] = (parse.mock.calls[0] ?? []) as [{ store: boolean }];
    expect(body.store).toBe(false);
  });

  it("never lets a caller influence the response format — it is always the server-owned schema", async () => {
    const parse = vi.fn<ParseCall>(() => Promise.resolve({ output_parsed: assessment }));
    const analyzer = createOpenAiRiskAnalyzer({ apiKey: "test-key" }, fakeClient(parse));
    await analyzer.assess(context);

    const [body] = (parse.mock.calls[0] ?? []) as [{ text: { format: { name: string; type: string } } }];
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.name).toBe("risk_assessment");
  });

  it("throws when the response has no parsed output (refusal, incomplete, or otherwise)", async () => {
    const parse = vi.fn<ParseCall>(() => Promise.resolve({ output_parsed: null }));
    const analyzer = createOpenAiRiskAnalyzer({ apiKey: "test-key" }, fakeClient(parse));

    await expect(analyzer.assess(context)).rejects.toThrow();
  });

  it("propagates a timeout/transport error from the client", async () => {
    const parse = vi.fn<ParseCall>(() => Promise.reject(new Error("request timed out")));
    const analyzer = createOpenAiRiskAnalyzer({ apiKey: "test-key" }, fakeClient(parse));

    await expect(analyzer.assess(context)).rejects.toThrow("request timed out");
  });
});
