import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONVERSATION_LLM_MODEL,
  TELEPHONY_AUDIO_FORMAT,
  buildAgentBaselineConfig,
  buildAgentToolDefinitions,
  buildConversationInitiationClientData,
  buildFirstDisclosureMessage,
  createElevenLabsProviders,
  type ElevenLabsSdkClient
} from "../src/providers/elevenlabs.js";

const config = {
  apiKey: "test-api-key",
  agentId: "agent_123",
  publicApiUrl: "https://api.example.com",
  agentToolSecret: "shared-secret"
};

describe("buildFirstDisclosureMessage", () => {
  it("is exactly the required English disclosure, with the real owner name interpolated", () => {
    const message = buildFirstDisclosureMessage({ ownerName: "Asha", language: "en" });
    expect(message).toBe(
      "Hi, you've reached Asha's AI call assistant. I transcribe this screening conversation. Please tell me your name and what you're calling about."
    );
  });

  it("discloses both AI and transcription in the Hindi/Hinglish version, with the real owner name interpolated", () => {
    const message = buildFirstDisclosureMessage({ ownerName: "Asha", language: "hi" });
    expect(message).toContain("Asha");
    expect(message.toLowerCase()).toContain("ai");
    expect(message.toLowerCase()).toContain("transcribe");
  });
});

describe("buildConversationInitiationClientData", () => {
  it("pins the ElevenLabs-hosted OpenAI model, the cloned voice, and call_id/owner_name dynamic variables", () => {
    const data = buildConversationInitiationClientData({
      callId: "call_1",
      ownerName: "Asha",
      voiceId: "voice_1",
      language: "en"
    });
    expect(data.conversationConfigOverride?.agent?.prompt?.llm).toBe(CONVERSATION_LLM_MODEL);
    expect(data.conversationConfigOverride?.tts?.voiceId).toBe("voice_1");
    expect(data.conversationConfigOverride?.agent?.language).toBe("en");
    expect(data.dynamicVariables).toEqual({ call_id: "call_1", owner_name: "Asha" });
  });

  it("never sets an audio-format field on the per-call override", () => {
    const data = buildConversationInitiationClientData({
      callId: "call_1",
      ownerName: "Asha",
      voiceId: "voice_1",
      language: "en"
    });
    expect(JSON.stringify(data)).not.toMatch(/audio.?format/i);
    expect(JSON.stringify(data)).not.toContain(TELEPHONY_AUDIO_FORMAT);
  });

  it("sets an exact, server-owned first disclosure message and switches language to hi", () => {
    const data = buildConversationInitiationClientData({
      callId: "call_1",
      ownerName: "Asha",
      voiceId: "voice_1",
      language: "hi"
    });
    expect(data.conversationConfigOverride?.agent?.language).toBe("hi");
    expect(data.conversationConfigOverride?.agent?.firstMessage).toBe(
      buildFirstDisclosureMessage({ ownerName: "Asha", language: "hi" })
    );
  });
});

describe("buildAgentToolDefinitions", () => {
  it("defines exactly one webhook tool, pointed at /agent-tools/screen-call with the shared secret header", () => {
    const [screenCall] = buildAgentToolDefinitions(config);
    expect(screenCall?.apiSchema.url).toBe("https://api.example.com/agent-tools/screen-call");
    expect(screenCall?.apiSchema.method).toBe("POST");
    expect(screenCall?.apiSchema.requestHeaders).toEqual({ "X-Agent-Tool-Secret": "shared-secret" });
  });

  it("populates call_id from the server-owned call_id dynamic variable — never left for the LLM to fill in", () => {
    const [screenCall] = buildAgentToolDefinitions(config);
    const schema = screenCall?.apiSchema.requestBodySchema;
    expect(schema?.type).toBe("object");
    expect(schema?.required).toEqual(expect.arrayContaining(["call_id", "transcript"]));
    const callId = schema?.properties?.call_id;
    // dynamicVariable (populated by the platform) is mutually exclusive with description
    // (which is what lets the LLM choose the value) — asserting both proves the LLM has
    // no path to spoof a different call's id.
    expect(callId).toMatchObject({ type: "string", dynamicVariable: "call_id" });
    expect(callId).not.toHaveProperty("description");
  });

  it("requires transcript as an array of caller/assistant turns matching what the screen-call route accepts", () => {
    const [screenCall] = buildAgentToolDefinitions(config);
    const schema = screenCall?.apiSchema.requestBodySchema;
    const transcript = schema?.properties?.transcript as
      | { type?: string; items?: { type?: string; required?: string[]; properties?: Record<string, unknown> } }
      | undefined;
    expect(transcript?.type).toBe("array");
    expect(transcript?.items?.type).toBe("object");
    expect(transcript?.items?.required).toEqual(expect.arrayContaining(["speaker", "text"]));
    expect(transcript?.items?.properties?.speaker).toMatchObject({ enum: ["assistant", "caller"] });
    expect(transcript?.items?.properties?.text).toMatchObject({ type: "string" });
  });
});

describe("buildAgentBaselineConfig", () => {
  it("is the only place ulaw_8000 appears, and carries the webhook tool + disabled recording", () => {
    const baseline = buildAgentBaselineConfig(config);
    expect(baseline.conversationConfig.tts.agentOutputAudioFormat).toBe(TELEPHONY_AUDIO_FORMAT);
    expect(baseline.conversationConfig.asr.userInputAudioFormat).toBe(TELEPHONY_AUDIO_FORMAT);
    expect(baseline.conversationConfig.agent.prompt.llm).toBe(CONVERSATION_LLM_MODEL);
    expect(baseline.conversationConfig.agent.prompt.tools).toHaveLength(1);
    expect(baseline.platformSettings.privacy.recordVoice).toBe(false);
  });
});

type RegisterCallRequest = {
  agentId: string;
  fromNumber: string;
  toNumber: string;
  direction?: string;
  conversationInitiationClientData?: { dynamicVariables?: Record<string, unknown> };
};

const registerCallMock = vi.fn<(request: RegisterCallRequest) => Promise<string>>(() =>
  Promise.resolve('<Response><Connect><Stream url="wss://api.elevenlabs.io/fake"/></Connect></Response>')
);

function fakeClient(): ElevenLabsSdkClient {
  return {
    conversationalAi: {
      twilio: {
        registerCall: registerCallMock
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
    }
    // The real SDK's client classes carry many more members than this test needs to fake;
    // this double only needs to satisfy the calls createElevenLabsProviders actually makes.
  } as unknown as ElevenLabsSdkClient;
}

describe("createElevenLabsProviders", () => {
  beforeEach(() => {
    registerCallMock.mockClear();
  });

  it("registers a call through the official ElevenLabs Twilio integration and returns its TwiML verbatim", async () => {
    const client = fakeClient();
    const provider = createElevenLabsProviders(config, client);

    const result = await provider.registerCall({
      callId: "call_1",
      ownerName: "Asha",
      voiceId: "voice_1",
      language: "en",
      fromNumber: "+14155559999",
      toNumber: "+14155550000"
    });

    expect(result.twiml).toContain("wss://api.elevenlabs.io/fake");
    expect(registerCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent_123",
        fromNumber: "+14155559999",
        toNumber: "+14155550000",
        direction: "inbound"
      })
    );
    const [request] = registerCallMock.mock.calls[0] ?? [];
    expect(request?.conversationInitiationClientData?.dynamicVariables).toEqual({
      call_id: "call_1",
      owner_name: "Asha"
    });
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
