/**
 * Privacy helpers (SPEC.md §5). Nothing here ever returns a full email
 * address, a credential-looking string, or an account-number-tagged amount.
 */

const CREDENTIAL_PATTERNS: RegExp[] = [
  /\b\d{6}\b(?=.{0,20}\b(code|otp|verification|passcode)\b)/gi,
  /\b(code|otp|verification code|passcode|one-time code)\b[:\s]+[A-Za-z0-9-]{4,12}/gi,
  /\b(token|api[_ ]?key|secret|password)\b[:\s]+\S{6,}/gi,
  /\bBearer\s+[A-Za-z0-9._-]{10,}/gi,
];

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const ACCOUNT_NUMBER_NEAR_BALANCE =
  /\b(account|acct)\.?\s*(#|no\.?|number)?\s*[:\s]*\d{4,}\b/gi;
const CARD_NUMBER_PATTERN = /\b(?:\d[ -]*?){13,16}\b/g;
const REDACTION_PLACEHOLDER_PATTERN = /\[redacted[a-z-]*\]/gi;

/** Redact OTPs, tokens, SSNs, and account/card numbers from free text. */
export function redactSensitive(text: string): string {
  let out = text;
  for (const pattern of CREDENTIAL_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  out = out.replace(SSN_PATTERN, "[redacted-id]");
  out = out.replace(CARD_NUMBER_PATTERN, "[redacted-number]");
  out = out.replace(ACCOUNT_NUMBER_NEAR_BALANCE, "account [redacted]");
  return out;
}

/**
 * True if `text` still carries real content once redaction placeholders are
 * stripped out. A short line that is almost entirely "[redacted]" (e.g. an
 * OTP email whose whole first sentence was a verification code) reads as
 * length > 0 but tells the reader nothing — callers should treat that as
 * "no usable summary" and fall back to something else, such as the subject.
 */
export function hasInformativeContent(text: string, minChars = 10): boolean {
  return text.replace(REDACTION_PLACEHOLDER_PATTERN, "").trim().length > minChars;
}

/** First name only — never the full display name if it looks like "First Last <addr>". */
export function firstNameOf(fromName: string): string {
  const trimmed = fromName.trim();
  if (!trimmed) return "Someone";
  const first = trimmed.split(/\s+/)[0];
  return first.replace(/[^A-Za-z'-]/g, "") || "Someone";
}

/** The only slice of the body classification/summarization may ever see. */
export function safePreview(body: string, maxChars = 500): string {
  return redactSensitive(body.slice(0, maxChars));
}

/** True if the address is a no-reply/notifications/automated sender. */
export function isAutomatedAddress(address: string): boolean {
  return /^(no-?reply|notifications?|support|newsletter|digest|alerts?|updates?|bounce)[@._-]/i.test(
    address.trim(),
  );
}
