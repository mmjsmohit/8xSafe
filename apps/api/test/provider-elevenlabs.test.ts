import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  CONVERSATION_LLM_MODEL,
  TELEPHONY_AUDIO_FORMAT,
  appendConversationOverrides,
  buildAgentToolDefinitions,
  buildConversationOverrides,
  createElevenLabsProviders,
  type ElevenLabsSdkClient
} from "../src/providers/elevenlabs.js";

const config = {
  apiKey: "test-api-key",
  agentId: "agent_123",
  publicApiUrl: "https://api.example.com",
  agentToolSecret: "shared-secret"
};

describe("buildConversationOverrides", () => {
  it("pins the ElevenLabs-hosted OpenAI model and telephony audio format", () => {
    const overrides = buildConversationOverrides({ ownerName: "Asha", voiceId: "voice_1", language: "en", callId: "call_1" });
    expect(overrides.conversationConfigOverride.agent.prompt.llm).toBe(CONVERSATION_LLM_MODEL);
    expect(overrides.conversationConfigOverride.tts.agentOutputAudioFormat).toBe(TELEPHONY_AUDIO_FORMAT);
    expect(overrides.conversationConfigOverride.tts.voiceId).toBe("voice_1");
  });

  it("switches to the Hindi/Hinglish language override when requested", () => {
    const overrides = buildConversationOverrides({ ownerName: "Asha", voiceId: "voice_1", language: "hi", callId: "call_1" });
    expect(overrides.conversationConfigOverride.agent.language).toBe("hi");
    expect(overrides.dynamicVariables.languageStyle).toBe("hindi_or_hinglish");
  });

  it("defaults to English when no Hindi override is requested", () => {
    const overrides = buildConversationOverrides({ ownerName: "Asha", voiceId: "voice_1", language: "en", callId: "call_1" });
    expect(overrides.conversationConfigOverride.agent.language).toBe("en");
    expect(overrides.dynamicVariables.languageStyle).toBe("english");
  });
});

describe("appendConversationOverrides", () => {
  it("attaches the overrides as a JSON query parameter without losing existing params", () => {
    const overrides = buildConversationOverrides({ ownerName: "Asha", voiceId: "voice_1", language: "en", callId: "call_1" });
    const url = appendConversationOverrides("wss://api.elevenlabs.io/v1/convai/conversation?signature=abc", overrides);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("signature")).toBe("abc");
    expect(JSON.parse(parsed.searchParams.get("conversation_initiation_client_data") ?? "{}")).toEqual(overrides);
  });
});

describe("buildAgentToolDefinitions", () => {
  it("points both tools at this server with the shared secret header, never a caller-visible value", () => {
    const [screen, transfer] = buildAgentToolDefinitions(config);
    expect(screen.apiSchema.url).toBe("https://api.example.com/agent-tools/screen");
    expect(screen.apiSchema.method).toBe("POST");
    expect(screen.apiSchema.requestHeaders).toEqual({ "X-Agent-Tool-Secret": "shared-secret" });
    expect(transfer.apiSchema.url).toBe("https://api.example.com/agent-tools/transfer");
    expect(transfer.apiSchema.requestHeaders).toEqual({ "X-Agent-Tool-Secret": "shared-secret" });
  });
});

function fakeClient(overrides: Partial<ElevenLabsSdkClient> = {}): ElevenLabsSdkClient {
  return {
    conversationalAi: {
      conversations: {
        getSignedUrl: vi.fn(() => Promise.resolve({ signedUrl: "wss://api.elevenlabs.io/v1/convai/conversation?conversation_id=conv_generated" }))
      }
    },
    voices: {
      ivc: { create: vi.fn(() => Promise.resolve({ voiceId: "voice_generated" })) }
    },
    textToSpeech: {
      convert: vi.fn(() =>
        Promise.resolve(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2, 3]));
              controller.close();
            }
          })
        )
      )
    },
    ...overrides
  };
}

describe("createElevenLabsProviders", () => {
  it("registers a call and returns the conversation id embedded in the signed URL", async () => {
    const client = fakeClient();
    const provider = createElevenLabsProviders(config, client);

    const result = await provider.registerCall({ callId: "call_1", ownerName: "Asha", voiceId: "voice_1", language: "en" });

    expect(result.conversationId).toBe("conv_generated");
    expect(result.websocketUrl).toContain("conversation_initiation_client_data=");
  });

  it("falls back to the call id when the signed URL carries no conversation id", async () => {
    const client = fakeClient({
      conversationalAi: {
        conversations: {
          getSignedUrl: vi.fn(() => Promise.resolve({ signedUrl: "wss://api.elevenlabs.io/v1/convai/conversation" }))
        }
      }
    });
    const provider = createElevenLabsProviders(config, client);

    const result = await provider.registerCall({ callId: "call_fallback", ownerName: "Asha", voiceId: "voice_1", language: "en" });

    expect(result.conversationId).toBe("call_fallback");
  });

  it("creates a voice clone from the enrollment sample", async () => {
    const client = fakeClient();
    const provider = createElevenLabsProviders(config, client);
    const sample = Readable.from([Buffer.from("audio-bytes")]);

    const result = await provider.createClone({ name: "Asha's voice", mimeType: "audio/wav", sample });

    expect(result.voiceId).toBe("voice_generated");
  });

  it("creates a preview clip as mp3 bytes through the enrolled voice", async () => {
    const client = fakeClient();
    const provider = createElevenLabsProviders(config, client);

    const result = await provider.createPreview({ voiceId: "voice_1", text: "Hello, this is your assistant." });

    expect(result.mimeType).toBe("audio/mpeg");
    expect(result.audio).toEqual(new Uint8Array([1, 2, 3]));
  });
});
