import type { Providers } from "./contracts.js";

export function createFakeProviders(): Providers {
  return {
    conversations: {
      registerCall() {
        return Promise.resolve({ conversationId: "fake-conversation", websocketUrl: "wss://example.invalid/fake" });
      }
    },
    push: {
      sendGeneric() {
        return Promise.resolve({ rejectedTokens: [] });
      }
    },
    risk: {
      assess() {
        return Promise.resolve({
          caller: { claimedName: null, claimedCompany: null },
          intent: "Unknown",
          usefulReason: null,
          signals: [],
          riskScore: 0.5,
          confidence: 0,
          recommendedAction: "TAKE_MESSAGE",
          nextQuestion: null
        });
      }
    },
    telephony: { redirectCall: () => Promise.resolve() },
    voiceClone: {
      createClone: () => Promise.resolve({ voiceId: "fake-voice" }),
      createPreview: () => Promise.resolve({ audio: new Uint8Array(), mimeType: "audio/mpeg" })
    }
  };
}
