/** The three inboxes sir wants sorted (work, personal, school/NYU). */
export type GmailAccountKey = "work" | "personal" | "school";

export const GMAIL_ACCOUNTS: readonly GmailAccountKey[] = ["work", "personal", "school"];

/** Read-only Gmail access only — never request anything broader. */
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function isGmailAccountKey(value: string): value is GmailAccountKey {
  return (GMAIL_ACCOUNTS as readonly string[]).includes(value);
}
