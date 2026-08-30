import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";
import type { ConversationProvider, VoiceCloneProvider } from "./contracts.js";

/** ElevenLabs-hosted OpenAI model used for the live screening conversation. */
export const CONVERSATION_LLM_MODEL: ElevenLabs.Llm = "gpt-5.6-luna";
/**
 * Telephony-grade audio the agent must speak/listen in. This is an agent-level baseline
 * setting only (see `buildAgentBaselineConfig`) — the per-call override type ElevenLabs
 * exposes for a registered Twilio call (`TtsConversationalConfigOverride`) has no
 * audio-format field, so it is never invented on the per-call path.
 */
export const TELEPHONY_AUDIO_FORMAT = "ulaw_8000";
/** Format used only for the short owner-facing voice preview clip, not live calls. */
const PREVIEW_OUTPUT_FORMAT = "mp3_44100_128";
const PREVIEW_TTS_MODEL = "eleven_multilingual_v2";

export type ConversationLanguage = "en" | "hi";

export type ElevenLabsProviderConfig = {
  apiKey: string;
  agentId: string;
  /** Base URL the agent's webhook tool calls back into, e.g. https://api.example.com */
  publicApiUrl: string;
  /** Shared secret the agent-tools routes require on the `X-Agent-Tool-Secret` header. */
  agentToolSecret: string;
};

/**
 * The slice of the official ElevenLabs SDK this module actually calls, expressed as a
 * `Pick` of the real client class rather than a hand-rolled duck-typed interface — so
 * `registerCall`, `ivc.create`, and `textToSpeech.convert` are all compiler-checked
 * against the installed SDK's own request/response types, and the default client below
 * needs no cast to satisfy it.
 */
export type ElevenLabsSdkClient = Pick<ElevenLabsClient, "conversationalAi" | "voices" | "textToSpeech">;

function createDefaultClient(apiKey: string): ElevenLabsSdkClient {
  return new ElevenLabsClient({ apiKey });
}

/**
 * The exact, server-owned first line the agent speaks — never left to the model to
 * improvise. It discloses up front that the caller is speaking with an AI assistant and
 * that the conversation is transcribed, not the phone's owner.
 */
export function buildFirstDisclosureMessage(input: { ownerName: string; language: ConversationLanguage }): string {
  return input.language === "hi"
    ? `Namaste, aap ${input.ownerName} ke AI call assistant se baat kar rahe hain. Main is screening conversation ko transcribe karta hoon. Kripya apna naam aur call ki wajah bataiye.`
    : `Hi, you've reached ${input.ownerName}'s AI call assistant. I transcribe this screening conversation. Please tell me your name and what you're calling about.`;
}

/** Server-owned system prompt for the live screening conversation. */
export function buildScreeningPromptText(input: { ownerName: string; language: ConversationLanguage }): string {
  return [
    "# Personality",
    `You are a calm, courteous assistant screening phone calls for ${input.ownerName}.`,
    "# Environment",
    `You have just answered a call on ${input.ownerName}'s phone. The caller does not know whether ${input.ownerName} is available; you speak with them first.`,
    "# Tone",
    "- Warm, brief, and businesslike",
    "- Never claim to be the phone's owner",
    "- Never share the owner's personal details, schedule, or location",
    "- Never ask for, accept, or repeat back a one-time code, password, PIN, card number, or a request to install remote-access or screen-sharing software",
    "# Goal",
    "1. Learn who is calling and why, in as few turns as possible.",
    "2. After every caller turn, call the screen_call tool with the conversation so far.",
    "3. If the tool reports the caller has been connected, say a brief goodbye — the transfer already happened on the server.",
    "4. If the tool says to take a message, thank the caller, note the message will be passed along, and end the call.",
    "5. If the tool says the call should end, end it politely without a message.",
    "6. Otherwise, ask exactly the follow-up question the tool returned."
  ].join("\n");
}

/**
 * The per-call conversation_initiation_client_data ElevenLabs' native Twilio integration
 * applies to this one registered call — the server-owned language, disclosure, prompt,
 * model, and cloned voice for this call. No audio-format field is set here.
 */
export function buildConversationInitiationClientData(input: {
  callId: string;
  ownerName: string;
  voiceId: string;
  language: ConversationLanguage;
}): ElevenLabs.ConversationInitiationClientDataRequestInput {
  return {
    dynamicVariables: {
      call_id: input.callId,
      owner_name: input.ownerName
    },
    conversationConfigOverride: {
      agent: {
        language: input.language,
        firstMessage: buildFirstDisclosureMessage(input),
        prompt: {
          prompt: buildScreeningPromptText(input),
          llm: CONVERSATION_LLM_MODEL
        }
      },
      tts: {
        voiceId: input.voiceId
      }
    }
  };
}

/**
 * The webhook tool definition the agent must be provisioned with so it can hand a call
 * back to this server mid-conversation. The server automatically executes the Twilio
 * transfer when this tool's result is CONNECT_TO_USER — the agent never calls a separate
 * transfer tool. Authentication is a static shared secret header.
 *
 * `call_id` is deliberately populated from the conversation's own `call_id` dynamic
 * variable (`dynamicVariable: "call_id"`) rather than described for the LLM to fill in —
 * that field is mutually exclusive with `description` in ElevenLabs' tool-parameter
 * schema, so the model has no way to substitute a different call's id. `transcript` stays
 * LLM-provided (there is nothing else that could supply it) and is constrained to the
 * caller/assistant turn shape the /agent-tools/screen-call route actually parses.
 */
export function buildAgentToolDefinitions(
  config: Pick<ElevenLabsProviderConfig, "publicApiUrl" | "agentToolSecret">
): ElevenLabs.ToolRequestModelToolConfig.Webhook[] {
  const requestBodySchema: ElevenLabs.ObjectJsonSchemaPropertyInput = {
    type: "object",
    required: ["call_id", "transcript"],
    properties: {
      call_id: {
        type: "string",
        dynamicVariable: "call_id"
      },
      transcript: {
        type: "array",
        description: "The conversation so far, oldest turn first.",
        items: {
          type: "object",
          required: ["speaker", "text"],
          properties: {
            speaker: {
              type: "string",
              enum: ["assistant", "caller"],
              description: "Who said this turn."
            },
            text: {
              type: "string",
              description: "What was said, verbatim."
            }
          }
        }
      }
    }
  };

  return [
    {
      type: "webhook",
      name: "screen_call",
      description:
        "Send the conversation so far for a risk assessment. The server decides whether to keep asking questions, take a message, connect the caller, or end the call, and automatically connects the caller when it returns CONNECT_TO_USER.",
      apiSchema: {
        url: `${config.publicApiUrl}/agent-tools/screen-call`,
        method: "POST",
        requestHeaders: { "X-Agent-Tool-Secret": config.agentToolSecret },
        requestBodySchema
      }
    }
  ];
}

/**
 * Server-owned baseline the ElevenLabs agent must run with. This is not sent on every
 * call — it is the configuration a one-time provisioning step (outside this app's
 * request path) pushes to the agent so gpt-5.6-luna, ulaw_8000 telephony audio, the
 * secret-authed webhook tool, and disabled call recording are never left to
 * per-conversation drift. `ulaw_8000` is intentionally only ever referenced here.
 */
export function buildAgentBaselineConfig(config: ElevenLabsProviderConfig) {
  return {
    conversationConfig: {
      agent: {
        prompt: {
          llm: CONVERSATION_LLM_MODEL,
          tools: buildAgentToolDefinitions(config)
        }
      },
      tts: {
        agentOutputAudioFormat: TELEPHONY_AUDIO_FORMAT
      },
      asr: {
        userInputAudioFormat: TELEPHONY_AUDIO_FORMAT
      }
    },
    platformSettings: {
      // Best-effort mirror of the dashboard's "do not record calls" setting. The durable
      // guarantee against captured audio lives in the Twilio adapter (never `record: true`);
      // this only stops ElevenLabs' own platform from persisting a copy on its side too.
      privacy: { recordVoice: false }
    }
  };
}

export function createElevenLabsProviders(
  config: ElevenLabsProviderConfig,
  client: ElevenLabsSdkClient = createDefaultClient(config.apiKey)
): ConversationProvider & VoiceCloneProvider {
  return {
    async registerCall({ callId, ownerName, voiceId, language, fromNumber, toNumber }) {
      const twiml = await client.conversationalAi.twilio.registerCall({
        agentId: config.agentId,
        fromNumber,
        toNumber,
        direction: "inbound",
        conversationInitiationClientData: buildConversationInitiationClientData({ callId, ownerName, voiceId, language })
      });
      return { twiml };
    },

    async createClone({ name, mimeType, sample }) {
      const response = await client.voices.ivc.create({
        name,
        files: [{ data: sample, filename: name, contentType: mimeType }]
      });
      return { voiceId: response.voiceId };
    },

    async createPreview({ voiceId, text }) {
      const stream = await client.textToSpeech.convert(voiceId, {
        text,
        modelId: PREVIEW_TTS_MODEL,
        outputFormat: PREVIEW_OUTPUT_FORMAT
      });
      const audio = await readAllBytes(stream);
      return { audio, mimeType: "audio/mpeg" };
    }
  };
}

async function readAllBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    totalLength += value.length;
  }
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
