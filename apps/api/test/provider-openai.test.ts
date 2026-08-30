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

function fakeClient(parse: ReturnType<typeof vi.fn>): Pick<OpenAI, "chat"> {
  return { chat: { completions: { parse } } } as unknown as Pick<OpenAI, "chat">;
}

describe("createOpenAiRiskAnalyzer", () => {
  it("returns the parsed structured assessment", async () => {
    const parse = vi.fn(() =>
      Promise.resolve({ choices: [{ message: { parsed: assessment, refusal: null } }] })
    );
    const analyzer = createOpenAiRiskAnalyzer({ apiKey: "test-key" }, fakeClient(parse));

    const result = await analyzer.assess(context);

    expect(result).toEqual(assessment);
    expect(parse).toHaveBeenCalledTimes(1);
    const [body, options] = parse.mock.calls[0] as [{ model: string; temperature: number }, { timeout: number }];
    expect(body.model).toBe("gpt-4.1-mini");
    expect(body.temperature).toBe(0);
    expect(options.timeout).toBeGreaterThan(0);
  });

  it("throws when the model refuses instead of returning a silent bad assessment", async () => {
    const parse = vi.fn(() =>
      Promise.resolve({ choices: [{ message: { parsed: undefined, refusal: "cannot help with that" } }] })
    );
    const analyzer = createOpenAiRiskAnalyzer({ apiKey: "test-key" }, fakeClient(parse));

    await expect(analyzer.assess(context)).rejects.toThrow();
  });

  it("throws when there is no parsed output at all", async () => {
    const parse = vi.fn(() => Promise.resolve({ choices: [{ message: { parsed: undefined, refusal: null } }] }));
    const analyzer = createOpenAiRiskAnalyzer({ apiKey: "test-key" }, fakeClient(parse));

    await expect(analyzer.assess(context)).rejects.toThrow();
  });

  it("propagates a timeout/transport error from the client", async () => {
    const parse = vi.fn(() => Promise.reject(new Error("request timed out")));
    const analyzer = createOpenAiRiskAnalyzer({ apiKey: "test-key" }, fakeClient(parse));

    await expect(analyzer.assess(context)).rejects.toThrow("request timed out");
  });
});
