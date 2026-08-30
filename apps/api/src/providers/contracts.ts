import type { RiskAssessment, TranscriptTurn } from "@call-screener/contracts";

export type ScreeningContext = {
  ownerName: string;
  transcript: TranscriptTurn[];
  elapsedSeconds: number;
  callerTurns: number;
};

export interface RiskAnalyzer {
  assess(context: ScreeningContext): Promise<RiskAssessment>;
}

export interface VoiceCloneProvider {
  createClone(input: {
    name: string;
    mimeType: string;
    sample: NodeJS.ReadableStream;
  }): Promise<{ voiceId: string }>;
  createPreview(input: { voiceId: string; text: string }): Promise<{ audio: Uint8Array; mimeType: "audio/mpeg" | "audio/wav" }>;
}

export interface ConversationProvider {
  registerCall(input: {
    callId: string;
    ownerName: string;
    voiceId: string;
    language: "en" | "hi";
  }): Promise<{ conversationId: string; websocketUrl: string }>;
}

export interface TelephonyProvider {
  redirectCall(input: { callSid: string; twiml: string }): Promise<void>;
}

export interface PushProvider {
  sendGeneric(input: {
    tokens: string[];
    category: string;
    outcome: string;
    callId: string;
  }): Promise<{ rejectedTokens: string[] }>;
}

export type Providers = {
  conversations: ConversationProvider;
  push: PushProvider;
  risk: RiskAnalyzer;
  telephony: TelephonyProvider;
  voiceClone: VoiceCloneProvider;
};

