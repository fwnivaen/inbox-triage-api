export type Label =
  | "Needs Reply"
  | "Deadline"
  | "Recruiter/Job"
  | "School"
  | "Financial Aid"
  | "Receipts"
  | "Newsletters"
  | "Notifications/GitHub"
  | "Spam/Promotions";

export type Priority = "urgent" | "normal" | "low";

/** Raw inbound email. `body` should be the full message; only the first
 * ~500 chars are ever used for classification/summarization (SPEC.md §1, §5). */
export interface InboundEmail {
  id: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  body: string;
  receivedAt: string; // ISO 8601
  hasAttachment: boolean;
}

/** Per-email output shape (SPEC.md §3). Never includes a full email address. */
export interface ClassifiedEmail {
  id: string;
  meetingDate?: string | null;
  actionRequired?: boolean;
  basePriority?: Priority;
  route?: "Needs Reply" | "Meetings Today" | "Deadlines" | "Actions" | "Review";
  label: Label;
  priority: Priority;
  summary: string;
  deadline: string | null; // YYYY-MM-DD or null
  suggested_reply: string | null;
  has_attachment: boolean;
}

// `Env` is declared globally by `wrangler types` in worker-configuration.d.ts
// (regenerate with `npx wrangler types` after changing wrangler.toml bindings).
