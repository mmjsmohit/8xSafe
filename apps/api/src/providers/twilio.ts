import twilio from "twilio";
import type { TelephonyProvider } from "./contracts.js";

export type TwilioClient = Pick<ReturnType<typeof twilio>, "calls">;

export type TwilioProviderConfig = {
  accountSid: string;
  authToken: string;
};

/**
 * Builds the TelephonyProvider adapter. Never sets `record: true` anywhere in this
 * module — raw call audio must never be captured or persisted by Twilio.
 */
export function createTwilioTelephonyProvider(
  config: TwilioProviderConfig,
  client: TwilioClient = twilio(config.accountSid, config.authToken)
): TelephonyProvider {
  return {
    async redirectCall({ callSid, twiml }) {
      await client.calls(callSid).update({ twiml });
    }
  };
}

/** Rejects the call outright with no ringing — used for blocked callers. */
export function buildRejectTwiml(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.reject({ reason: "rejected" });
  return response.toString();
}

/**
 * Dials the owner's forwarding number. Recording is always explicitly disabled;
 * this is used both for a trusted-caller direct forward and for a live transfer
 * out of an in-progress AI screening call.
 */
export function buildDialTwiml(input: { to: string; callerId: string }): string {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({ callerId: input.callerId, record: "do-not-record" });
  dial.number(input.to);
  return response.toString();
}

/**
 * Connects the call's media to the ElevenLabs conversational agent over a
 * bidirectional stream. Custom parameters carry per-call context the agent
 * needs (owner name, cloned voice, language) without recording anything.
 */
export function buildConnectStreamTwiml(input: {
  websocketUrl: string;
  parameters: Record<string, string>;
}): string {
  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect();
  const stream = connect.stream({ url: input.websocketUrl });
  for (const [name, value] of Object.entries(input.parameters)) {
    stream.parameter({ name, value });
  }
  return response.toString();
}

/** Ends the call immediately, used when screening determines the call must stop. */
export function buildHangupTwiml(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.hangup();
  return response.toString();
}
