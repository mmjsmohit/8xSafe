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
 * preference (not part of this app's schema), so this defaults to the shield number's
 * own country: Indian numbers get Hindi/Hinglish, everything else stays English.
 */
export function resolveConversationLanguage(shieldNumber: string): "en" | "hi" {
  const parsed = parsePhoneNumberFromString(shieldNumber);
  return parsed?.country === "IN" ? "hi" : "en";
}
