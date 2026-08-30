import { parsePhoneNumberFromString } from "libphonenumber-js";

export type CallRoute =
  | { kind: "blocked" }
  | { kind: "trusted" }
  | { kind: "unknown" };

export type CallerLists = {
  blockedNumbers: ReadonlySet<string>;
  trustedNumbers: ReadonlySet<string>;
};

/**
 * Normalizes a phone number to E.164 for list matching. Numbers that already arrive in
 * E.164 (as Twilio's `From` does) round-trip unchanged; anything libphonenumber can't parse
 * falls back to a trimmed copy of the input so a lookup miss fails closed as "unknown"
 * rather than throwing.
 */
export function normalizePhoneNumber(value: string): string {
  const parsed = parsePhoneNumberFromString(value);
  return parsed?.isValid() ? parsed.number : value.trim();
}

/**
 * Decides how an inbound call should be routed. Precedence is fixed and non-negotiable:
 * a number on both lists is treated as blocked, and only a number on neither list is
 * screened by AI. Trusted callers bypass screening entirely.
 */
export function decideRoute(callerNumber: string, lists: CallerLists): CallRoute {
  const normalized = normalizePhoneNumber(callerNumber);
  if (lists.blockedNumbers.has(normalized)) {
    return { kind: "blocked" };
  }
  if (lists.trustedNumbers.has(normalized)) {
    return { kind: "trusted" };
  }
  return { kind: "unknown" };
}

/**
 * Picks the screening agent's spoken language. The owner has no stored language
 * preference (not part of this app's schema), so this is resolved from the owner's own
 * *forwarding* number, not the shield number — the shield number is always a Twilio
 * number in whatever country it was provisioned in (e.g. a US number for every owner),
 * while the forwarding number is the owner's real personal number and so is the only
 * signal that actually reflects their locale. Indian forwarding numbers get
 * Hindi/Hinglish; everything else stays English.
 */
export function resolveConversationLanguage(forwardingNumber: string): "en" | "hi" {
  const parsed = parsePhoneNumberFromString(forwardingNumber);
  return parsed?.country === "IN" ? "hi" : "en";
}

const PRIVATE_NUMBER_SENTINELS = new Set(["anonymous", "restricted", "unavailable", "unknown", "private"]);

/**
 * True for a caller number this server can't safely screen or call back: Twilio's own
 * "caller ID withheld" sentinels, or anything libphonenumber can't parse as a real number.
 * An unknown caller behind a private number never reaches AI screening — there's no
 * identity to build a risk assessment against and no number to transfer or call back.
 */
export function isPrivateNumber(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0 || PRIVATE_NUMBER_SENTINELS.has(normalized)) {
    return true;
  }
  const parsed = parsePhoneNumberFromString(value);
  return !(parsed?.isValid() ?? false);
}
