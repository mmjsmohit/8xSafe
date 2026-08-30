import { timingSafeEqual } from "node:crypto";
import { createHmac } from "node:crypto";
import twilio from "twilio";

/**
 * Compares two secrets in constant time, tolerating different lengths so callers
 * never leak timing information about the expected secret's length.
 */
export function constantTimeEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) {
    // Still run a comparison of equal-length buffers so this branch takes
    // roughly the same time as the equal-length case.
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export type TwilioSignatureInput = {
  authToken: string;
  /** The exact, fully-qualified URL Twilio was configured to call — never one reconstructed from request headers. */
  url: string;
  params: Record<string, string>;
  signatureHeader: string | undefined;
};

/**
 * Validates a Twilio webhook request against the exact URL configured in Twilio,
 * per https://www.twilio.com/docs/usage/webhooks/webhooks-security. Twilio signs
 * the fully-qualified URL plus the sorted form parameters, so a mismatched host,
 * scheme, or path (for example one inferred from a proxy header) always fails.
 */
export function verifyTwilioSignature(input: TwilioSignatureInput): boolean {
  if (!input.signatureHeader) {
    return false;
  }
  return twilio.validateRequest(input.authToken, input.signatureHeader, input.url, input.params);
}

export type ElevenLabsSignatureInput = {
  secret: string;
  rawBody: string;
  signatureHeader: string | undefined;
  /** How far a signature's timestamp may drift from now before it is rejected as stale/replayed. */
  toleranceSeconds?: number;
  /** Injectable clock for tests. Defaults to Date.now(). */
  nowMs?: number;
};

const DEFAULT_TOLERANCE_SECONDS = 30 * 60;

/**
 * Validates an ElevenLabs webhook signature. ElevenLabs signs webhooks with a
 * header shaped like `t=<unix seconds>,v0=<hex hmac-sha256 of "t.rawBody">`,
 * so the raw request body (not the re-serialized JSON) must be used.
 */
export function verifyElevenLabsSignature(input: ElevenLabsSignatureInput): boolean {
  const header = input.signatureHeader;
  if (!header) {
    return false;
  }

  const fields = new Map<string, string>();
  for (const part of header.split(",")) {
    const [key, value] = part.split("=");
    if (key && value) {
      fields.set(key.trim(), value.trim());
    }
  }

  const timestamp = fields.get("t");
  const signature = fields.get("v0");
  if (!timestamp || !signature) {
    return false;
  }

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  const toleranceMs = (input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS) * 1000;
  const nowMs = input.nowMs ?? Date.now();
  if (Math.abs(nowMs - timestampMs) > toleranceMs) {
    return false;
  }

  const expectedSignature = createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex");

  return constantTimeEqual(expectedSignature, signature);
}
