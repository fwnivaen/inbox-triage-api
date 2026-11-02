import type { Label, Priority } from "./types.js";

const MONEY_OR_SCHOOL_REQUIREMENT =
  /\b(balance due|payment|tuition|financial aid|missing document|verification requested|enrollment|grading|grade)\b/i;
const INTERVIEW_WORD = /\binterview\b/i;
const SECURITY_ALERT =
  /\b(security alert|unrecognized|new sign-?in|suspicious|third-party app was added|password (?:was )?changed)\b/i;
const CONCRETE_NEXT_STEP =
  /\b(interview (?:invitation|scheduled)|confirm (?:your )?attendance|next steps|application started|set up your account to continue)\b/i;
const GRADES_ASSIGNMENTS_ADVISING =
  /\b(grade|grading|assignment|homework|hw\s?\d|advising|advisor|office hours|midterm|syllabus)\b/i;
const FINANCIAL_AID_INFORMATIONAL =
  /\b(award letter is ready|disbursement confirmation|here(?:'|’)s your|statement is ready)\b/i;
const RECEIPT_NEEDS_REVIEW = /\b(unexpected charge|failed payment|declined|dispute|unauthorized)\b/i;

function hoursUntil(deadline: string | null, receivedAt: Date): number | null {
  if (!deadline) return null;
  const deadlineDate = new Date(`${deadline}T23:59:59Z`);
  return (deadlineDate.getTime() - receivedAt.getTime()) / 3_600_000;
}

export function computePriority(
  label: Label,
  deadline: string | null,
  text: string,
  receivedAt: Date,
): Priority {
  if (label === "Newsletters" || label === "Spam/Promotions") return "low";

  const hours = hoursUntil(deadline, receivedAt);
  const deadlineIsUrgent = hours !== null && hours <= 48;

  if (deadlineIsUrgent) return "urgent";
  if (label === "Notifications/GitHub" && SECURITY_ALERT.test(text)) return "urgent";
  if (
    label === "Needs Reply" &&
    (MONEY_OR_SCHOOL_REQUIREMENT.test(text) || INTERVIEW_WORD.test(text))
  ) {
    return "urgent";
  }
  if (label === "Financial Aid" && /\b(missing document|verification requested)\b/i.test(text)) {
    return "urgent";
  }

  if (label === "Needs Reply" || label === "Deadline") return "normal";
  if (label === "Recruiter/Job") return CONCRETE_NEXT_STEP.test(text) ? "normal" : "low";
  if (label === "School") return GRADES_ASSIGNMENTS_ADVISING.test(text) ? "normal" : "low";
  if (label === "Financial Aid") return FINANCIAL_AID_INFORMATIONAL.test(text) ? "normal" : "low";
  if (label === "Receipts") return RECEIPT_NEEDS_REVIEW.test(text) ? "normal" : "low";
  if (label === "Notifications/GitHub") return "low";

  return "normal";
}
