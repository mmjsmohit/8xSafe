import { riskAssessmentSchema, type RiskAssessment } from "@call-screener/contracts";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { RiskAnalyzer, ScreeningContext } from "./contracts.js";

/**
 * Screening model — server-owned and fixed, never influenced by caller input. This is
 * the same identifier used for the live ElevenLabs conversation (see providers/elevenlabs.ts
 * `CONVERSATION_LLM_MODEL`), kept as a separate constant here because this call goes
 * directly to OpenAI rather than through ElevenLabs' hosted routing.
 */
const SCREENING_MODEL = "gpt-5.6-luna";
/** Hard ceiling on a single screening call so a slow model never stalls a live phone call. */
const SCREENING_TIMEOUT_MS = 8_000;
const RESPONSE_FORMAT_NAME = "risk_assessment";

const SYSTEM_PROMPT = `You are the screening brain behind a phone call assistant that answers calls on
behalf of a phone's owner before deciding whether the caller reaches them.

Read the transcript so far and produce a single structured risk assessment. Be conservative:
- Flag every request for a one-time code, password, PIN, card number/CVV, or any request to install
  remote-access/screen-sharing software as a high-confidence risk signal — these are the classic shape
  of a scam call and must never be waved through.
- Distinguish a legitimate, useful reason for calling (delivery update, appointment, a real business
  matter) from vague, evasive, or high-pressure language.
- Set usefulReason only when the caller has given a concrete, verifiable reason for the call.
- Ask a concrete nextQuestion whenever intent or identity is still unclear.

Output only the structured fields — no extra commentary. The server, not you, makes the final
routing decision from these fields; recommendedAction is advisory only.`;

export type OpenAiRiskAnalyzerConfig = {
  apiKey: string;
};

function formatTranscript(context: ScreeningContext): string {
  if (context.transcript.length === 0) {
    return "(no turns yet)";
  }
  return context.transcript
    .map((turn) => `${turn.speaker === "caller" ? "Caller" : "Assistant"}: ${turn.text}`)
    .join("\n");
}

export function createOpenAiRiskAnalyzer(
  config: OpenAiRiskAnalyzerConfig,
  client: Pick<OpenAI, "responses"> = new OpenAI({ apiKey: config.apiKey })
): RiskAnalyzer {
  return {
    async assess(context: ScreeningContext): Promise<RiskAssessment> {
      const response = await client.responses.parse(
        {
          model: SCREENING_MODEL,
          temperature: 0,
          input: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                `Owner name: ${context.ownerName}`,
                `Elapsed seconds: ${context.elapsedSeconds}`,
                `Caller turns so far: ${context.callerTurns}`,
                "Transcript:",
                formatTranscript(context)
              ].join("\n")
            }
          ],
          text: { format: zodTextFormat(riskAssessmentSchema, RESPONSE_FORMAT_NAME) }
        },
        { timeout: SCREENING_TIMEOUT_MS }
      );

      if (response.output_parsed === null) {
        throw new Error("openai_screening_invalid_output");
      }

      return response.output_parsed;
    }
  };
}
