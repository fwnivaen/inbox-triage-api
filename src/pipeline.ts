import { classifyLabel } from "./classifier.js";
import { buildDigest } from "./digest.js";
import { computePriority } from "./priority.js";
import { safePreview } from "./privacy.js";
import { summarizeAndReply } from "./summarize.js";
import type { ClassifiedEmail, Env, InboundEmail } from "./types.js";

/** Full per-email pipeline: label -> priority -> summary/reply (SPEC.md §3). */
export async function classifyEmail(email: InboundEmail, env?: Env): Promise<ClassifiedEmail> {
  const receivedAt = new Date(email.receivedAt);
  const preview = safePreview(email.body);
  const text = `${email.subject} ${preview}`;

  const { label, deadline } = classifyLabel(email, receivedAt);
  const priority = computePriority(label, deadline, text, receivedAt);
  const { summary, suggested_reply } = await summarizeAndReply(env, email, label, preview);

  return {
    id: email.id,
    label,
    priority,
    summary,
    deadline,
    suggested_reply,
    has_attachment: email.hasAttachment,
  };
}

export async function classifyBatch(emails: InboundEmail[], env?: Env): Promise<ClassifiedEmail[]> {
  return Promise.all(emails.map((e) => classifyEmail(e, env)));
}

export async function buildDailyDigest(emails: InboundEmail[], env?: Env): Promise<string> {
  const classified = await classifyBatch(emails, env);
  return buildDigest(classified);
}
