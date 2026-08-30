import twilio from "twilio";
import type { TelephonyProvider } from "./contracts.js";

export type TwilioClient = Pick<ReturnType<typeof twilio>, "calls">;

export type TwilioProviderConfig = {
  accountSid: string;
  authToken: string;
};

/** How long Twilio rings the owner's forwarding number before giving up. */
export const DIAL_RING_TIMEOUT_SECONDS = 20;

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

function webhookUrl(publicApiUrl: string, path: string): string {
  return new URL(path, publicApiUrl).toString();
}

/** Rejects the call outright with no ringing — used for blocked callers. */
export function buildRejectTwiml(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.reject({ reason: "rejected" });
  return response.toString();
}

/**
 * Tells the caller the line can't take their call right now and hangs up. Used whenever
 * a trusted caller has no forwarding number on file, or an unknown caller can't be safely
 * screened (owner onboarding/voice not ready, or the caller's own number is private) —
 * never a path that reaches AI screening or provider registration.
 */
export function buildUnavailableTwiml(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say("This number can't take your call right now. Please try again later.");
  response.hangup();
  return response.toString();
}

/**
 * Dials the owner's forwarding number. Recording is always explicitly disabled; this is
 * used both for a trusted-caller direct forward and for a live transfer out of an
 * in-progress AI screening call. The `<Dial>` action callback and the per-leg status
 * callback report progress back to this server so `calls.transferStatus` stays accurate.
 */
export function buildDialTwiml(input: { to: string; callerId: string; publicApiUrl: string }): string {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({
    callerId: input.callerId,
    record: "do-not-record",
    timeout: DIAL_RING_TIMEOUT_SECONDS,
    action: webhookUrl(input.publicApiUrl, "/webhooks/twilio/dial-complete"),
    method: "POST"
  });
  dial.number(
    {
      statusCallback: webhookUrl(input.publicApiUrl, "/webhooks/twilio/call-status"),
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST"
    },
    input.to
  );
  return response.toString();
}

/** Ends the call immediately, used when screening determines the call must stop. */
export function buildHangupTwiml(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.hangup();
  return response.toString();
}
