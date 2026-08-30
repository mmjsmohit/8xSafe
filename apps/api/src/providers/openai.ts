import { riskAssessmentSchema, type RiskAssessment } from "@call-screener/contracts";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { RiskAnalyzer, ScreeningContext } from "./contracts.js";

/** Small, fast, structured-output-capable model — screening must stay low latency. */
const SCREENING_MODEL = "gpt-4.1-mini";
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
- Only recommend CONNECT_TO_USER when the caller's identity and purpose are credible and there is no
  credential or remote-access risk signal.
- Recommend TAKE_MESSAGE when the purpose is legitimate but does not need to interrupt the owner right now.
- Recommend BLOCK_CALL or END_CALL for clear scams, and MARK_AS_MARKETING / MARK_AS_SUSPICIOUS /
  MARK_AS_SCAM to categorize the call even when you also end it.
- Ask ASK_MORE_QUESTIONS with a concrete nextQuestion whenever intent or identity is still unclear.

Output only the structured fields — no extra commentary.`;

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
  client: Pick<OpenAI, "chat"> = new OpenAI({ apiKey: config.apiKey })
): RiskAnalyzer {
  return {
    async assess(context: ScreeningContext): Promise<RiskAssessment> {
      const completion = await client.chat.completions.parse(
        {
          model: SCREENING_MODEL,
          temperature: 0,
          messages: [
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
          response_format: zodResponseFormat(riskAssessmentSchema, RESPONSE_FORMAT_NAME)
        },
        { timeout: SCREENING_TIMEOUT_MS }
      );

      const message = completion.choices[0]?.message;
      if (!message || message.refusal || !message.parsed) {
        throw new Error("openai_screening_invalid_output");
      }

      return message.parsed;
    }
  };
}
