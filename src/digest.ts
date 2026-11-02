import type { ClassifiedEmail, Priority } from "./types.js";

const SECTION_ORDER: Priority[] = ["urgent", "normal", "low"];
const SECTION_TITLE: Record<Priority, string> = {
  urgent: "URGENT",
  normal: "NORMAL",
  low: "LOW",
};

function formatLine(email: ClassifiedEmail): string {
  const deadlineSuffix = email.deadline ? ` — ${email.deadline}` : "";
  return `[${email.label}] ${email.summary}${deadlineSuffix}`;
}

/**
 * Builds the daily digest text (SPEC.md §4): Urgent/Normal/Low sections,
 * shortest summary first within each, Newsletters excluded, empty sections omitted.
 */
export function buildDigest(emails: ClassifiedEmail[]): string {
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
