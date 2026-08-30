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

type UploadableSample = {
  data: NodeJS.ReadableStream;
  filename: string;
  contentType: string;
};

/**
 * The narrow slice of the official ElevenLabs SDK this module actually calls. Depending
 * on this instead of the full `ElevenLabsClient` type keeps the provider trivially
 * testable with a hand-written fake and avoids leaking SDK internals through the
 * provider boundary.
 */
export type ElevenLabsSdkClient = {
  conversationalAi: {
    twilio: {
      registerCall(request: {
        agentId: string;
        fromNumber: string;
        toNumber: string;
        direction?: ElevenLabs.TelephonyDirection;
        conversationInitiationClientData?: ElevenLabs.ConversationInitiationClientDataRequestInput;
      }): Promise<string>;
    };
  };
  voices: {
    ivc: {
      create(request: { name: string; files: UploadableSample[] }): Promise<{ voiceId: string }>;
    };
  };
  textToSpeech: {
    convert(
      voiceId: string,
      request: { text: string; modelId: string; outputFormat: string }
    ): Promise<ReadableStream<Uint8Array>>;
  };
};

function createDefaultClient(apiKey: string): ElevenLabsSdkClient {
  return new ElevenLabsClient({ apiKey }) as unknown as ElevenLabsSdkClient;
}

/**
 * The exact, server-owned first line the agent speaks — never left to the model to
 * improvise. It discloses up front that the caller is speaking with an AI screening
 * assistant, not the phone's owner.
 */
export function buildFirstDisclosureMessage(input: { ownerName: string; language: ConversationLanguage }): string {
  return input.language === "hi"
    ? `Namaste, main ${input.ownerName} ka AI call-screening assistant hoon. Kripya bataiye aap kaun hain aur kis wajah se call kar rahe hain.`
    : `Hi, this is ${input.ownerName}'s AI call-screening assistant. Could you tell me who's calling and why?`;
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
 */
export function buildAgentToolDefinitions(config: Pick<ElevenLabsProviderConfig, "publicApiUrl" | "agentToolSecret">) {
  return [
    {
      type: "webhook",
      name: "screen_call",
      description:
        "Send the conversation so far for a risk assessment. The server decides whether to keep asking questions, take a message, connect the caller, or end the call, and automatically connects the caller when it returns CONNECT_TO_USER.",
      apiSchema: {
        url: `${config.publicApiUrl}/agent-tools/screen-call`,
        method: "POST",
        requestHeaders: { "X-Agent-Tool-Secret": config.agentToolSecret }
      }
    }
  ] as const;
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
