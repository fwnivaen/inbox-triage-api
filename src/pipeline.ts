import { latestText, RESOLVED, DIRECT_REQUEST } from "./signals.js";
import { attentionMetadata, currentAttention } from "./attention.js";
import { classifyLabel } from "./classifier.js";
import { buildDigest } from "./digest.js";
import { computePriority } from "./priority.js";
import { safePreview } from "./privacy.js";
import { summarizeAndReply } from "./summarize.js";
import type { ClassifiedEmail, InboundEmail } from "./types.js";

/** Full per-email pipeline: label -> priority -> summary/reply (SPEC.md §3). */
export async function classifyEmail(email: InboundEmail, env?: Env, now = new Date()): Promise<ClassifiedEmail> {
  const receivedAt = new Date(email.receivedAt);
  const preview = safePreview(latestText(email.body));
  const text = `${email.subject} ${preview}`;

  let ownAddresses:string[]=[];
  try { ownAddresses=Object.values(JSON.parse(env?.GMAIL_ACCOUNT_EMAILS ?? '{}')); } catch { /* absent mapping */ }
  const { label, deadline } = classifyLabel({...email,body:latestText(email.body)}, receivedAt,ownAddresses);
  const priority = computePriority(label, deadline, text, now);
  const { summary, suggested_reply, summarySource } = await summarizeAndReply(env, email, label, preview);

  return currentAttention({
    id: email.id,
    label,
    ...attentionMetadata(text,receivedAt),
    attentionSuppressed: ownAddresses.some(address=>address.toLowerCase()===email.fromAddress.trim().toLowerCase()) || (RESOLVED.test(preview) && !DIRECT_REQUEST.test(preview)),
    basePriority: computePriority(label,null,text,now),
    priority,
    summary,
    summarySource,
    deadline,
    suggested_reply,
    has_attachment: email.hasAttachment,
  },email.receivedAt,now);
}

export async function classifyBatch(emails: InboundEmail[], env?: Env): Promise<ClassifiedEmail[]> {
  const unique = new Map(emails.map(e => [e.id, e]));
  const results: ClassifiedEmail[] = [];
  for (const email of unique.values()) results.push(await classifyEmail(email, env));
  return results;
}

export async function buildDailyDigest(emails: InboundEmail[], env?: Env): Promise<string> {
  const classified = await classifyBatch(emails, env);
  return buildDigest(classified);
}
