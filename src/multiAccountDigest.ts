import type { GmailAccountKey } from "./gmail/accounts.js";
import type { ClassifiedEmail, Priority } from "./types.js";

export type AccountClassifiedEmail = ClassifiedEmail & { account: GmailAccountKey };

const SECTION_ORDER: Priority[] = ["urgent", "normal", "low"];
const SECTION_TITLE: Record<Priority, string> = {
  urgent: "URGENT",
  normal: "NORMAL",
  low: "LOW",
};

function formatLine(email: AccountClassifiedEmail): string {
  const deadlineSuffix = email.deadline ? ` — ${email.deadline}` : "";
  return `[${email.account}] ${email.route ? `[${email.route}] ` : ""}[${email.label}] ${email.summary}${deadlineSuffix}`;
}

/**
 * Same section/sort rules as buildDigest (SPEC.md §4) — Urgent/Normal/Low,
 * shortest summary first, Newsletters excluded, empty sections omitted —
 * but every line is tagged with which inbox it came from, for the combined
 * multi-account digest.
 */
export function buildMultiAccountDigest(emails: AccountClassifiedEmail[]): string {
  const sections: string[] = [];

  for (const tier of SECTION_ORDER) {
    const items = emails
      .filter((e) => e.priority === tier && e.label !== "Newsletters")
      .sort((a, b) => a.summary.length - b.summary.length)
      .map(formatLine);

    if (items.length > 0) {
      sections.push(`${SECTION_TITLE[tier]}\n${items.join("\n")}`);
    }
  }

  return sections.join("\n\n");
}
