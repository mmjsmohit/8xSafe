import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { ConversationProvider, VoiceCloneProvider } from "./contracts.js";

/** ElevenLabs-hosted OpenAI model used for the live screening conversation. */
export const CONVERSATION_LLM_MODEL = "gpt-5.6-luna";
/** Telephony-grade audio the agent must speak/listen in so Twilio media stays in sync. */
export const TELEPHONY_AUDIO_FORMAT = "ulaw_8000";
/** Format used only for the short owner-facing voice preview clip, not live calls. */
const PREVIEW_OUTPUT_FORMAT = "mp3_44100_128";
const PREVIEW_TTS_MODEL = "eleven_multilingual_v2";
const HINGLISH_LANGUAGE_OVERRIDE = "hi";

export type ConversationLanguage = "en" | "hi";

export type ElevenLabsProviderConfig = {
  apiKey: string;
  agentId: string;
  /** Base URL the agent's webhook tools call back into, e.g. https://api.example.com */
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
 * The narrow slice of the ElevenLabs SDK this module actually calls. Depending on this
 * instead of the full `ElevenLabsClient` type keeps the provider trivially testable with
 * a hand-written fake and avoids leaking SDK internals through the provider boundary.
 */
export type ElevenLabsSdkClient = {
  conversationalAi: {
    conversations: {
      getSignedUrl(request: { agentId: string; includeConversationId?: boolean }): Promise<{ signedUrl: string }>;
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
 * The per-call conversation_initiation_client_data override ElevenLabs' native Twilio
 * media-stream integration reads from the signed websocket URL. This is the server-owned
 * knob that keeps the agent on the approved model/voice/audio format/language for every
 * call — the agent's own dashboard configuration is never trusted for these fields.
 */
export type ConversationOverrides = {
  conversationConfigOverride: {
    agent: {
      language: ConversationLanguage;
      prompt: { llm: string };
    };
    tts: {
      voiceId: string;
      agentOutputAudioFormat: string;
    };
  };
  dynamicVariables: {
    ownerName: string;
    callId: string;
    languageStyle: "hindi_or_hinglish" | "english";
  };
};

export function buildConversationOverrides(input: {
  ownerName: string;
  voiceId: string;
  language: ConversationLanguage;
  callId: string;
}): ConversationOverrides {
  return {
    conversationConfigOverride: {
      agent: {
        // "hi" lets the agent freely mix Hindi and English (Hinglish) rather than forcing
        // a single language — the owner's stated preference, not the caller's, decides this.
        language: input.language === "hi" ? HINGLISH_LANGUAGE_OVERRIDE : "en",
        prompt: { llm: CONVERSATION_LLM_MODEL }
      },
      tts: {
        voiceId: input.voiceId,
        agentOutputAudioFormat: TELEPHONY_AUDIO_FORMAT
      }
    },
    dynamicVariables: {
      ownerName: input.ownerName,
      callId: input.callId,
      languageStyle: input.language === "hi" ? "hindi_or_hinglish" : "english"
    }
  };
}

/** Appends the call's overrides to a freshly-issued signed URL as a single JSON query param. */
export function appendConversationOverrides(signedUrl: string, overrides: ConversationOverrides): string {
  const url = new URL(signedUrl);
  url.searchParams.set("conversation_initiation_client_data", JSON.stringify(overrides));
  return url.toString();
}

/** ElevenLabs echoes a conversation id back on the signed URL when one was requested. */
function extractConversationId(signedUrl: string, fallback: string): string {
  try {
    return new URL(signedUrl).searchParams.get("conversation_id") ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * The webhook tool definition the agent must be provisioned with so it can hand a call back
 * to our server (screening decisions, transfers) mid-conversation. Authentication is a static
 * shared secret header, never a value the caller-facing model could see or influence.
 */
export function buildAgentToolDefinitions(config: Pick<ElevenLabsProviderConfig, "publicApiUrl" | "agentToolSecret">) {
  const authHeader = { "X-Agent-Tool-Secret": config.agentToolSecret };
  return [
    {
      type: "webhook",
      name: "screen_caller",
      description:
        "Send the conversation so far for a risk assessment before deciding whether to keep asking questions, take a message, connect the caller, or end the call.",
      apiSchema: {
        url: `${config.publicApiUrl}/agent-tools/screen`,
        method: "POST",
        requestHeaders: authHeader
      }
    },
    {
      type: "webhook",
      name: "transfer_to_owner",
      description: "Connect the caller live to the phone's owner. Only call this after screen_caller recommends CONNECT_TO_USER.",
      apiSchema: {
        url: `${config.publicApiUrl}/agent-tools/transfer`,
        method: "POST",
        requestHeaders: authHeader
      }
    }
  ] as const;
}

/**
 * Server-owned baseline the ElevenLabs agent must run with. This does not run on every call —
 * it is the configuration a one-time provisioning step (outside this app's request path) pushes
 * to the agent so gpt-5.6-luna, ulaw_8000 telephony audio, the secret-authed webhook tools, and
 * disabled call recording are never left to per-conversation drift.
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
    async registerCall({ callId, ownerName, voiceId, language }) {
      const { signedUrl } = await client.conversationalAi.conversations.getSignedUrl({
        agentId: config.agentId,
        includeConversationId: true
      });
      const overrides = buildConversationOverrides({ ownerName, voiceId, language, callId });
      return {
        conversationId: extractConversationId(signedUrl, callId),
        websocketUrl: appendConversationOverrides(signedUrl, overrides)
      };
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
