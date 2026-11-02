import { firstNameOf, hasInformativeContent, redactSensitive } from "./privacy.js";
import type { InboundEmail, Label } from "./types.js";

const REPLY_LABELS: Label[] = ["Needs Reply", "Deadline"];

function stripThreadPrefix(subject: string): string {
  return subject.replace(/^\s*(re|fwd?):\s*/gi, "").trim();
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?\n]+[.!?]?/);
  return (match?.[0] ?? text).trim();
}

/** No-AI fallback so the API still works in local `wrangler dev` without an AI binding. */
export function heuristicSummary(email: InboundEmail, preview: string): string {
  const subject = stripThreadPrefix(email.subject);
  const body = firstSentence(redactSensitive(preview)).slice(0, 140);
  // If the first sentence was mostly a credential/OTP/account number, redaction
  // leaves a near-empty stub like "Your [redacted]." — that still has length,
  // but no real information. Prefer the subject line in that case.
  const base = hasInformativeContent(body) ? body : subject;
  return /[.!?]$/.test(base) ? base : `${base}.`;
}

function toneFor(label: Label, fromName: string): "formal" | "concise" {
  if (label === "Recruiter/Job") return "concise";
  if (/professor|advisor|financial aid|bursar/i.test(fromName)) return "formal";
  return "concise";
}

export function heuristicReply(email: InboundEmail, label: Label): string | null {
  if (!REPLY_LABELS.includes(label)) return null;
  const name = firstNameOf(email.fromName);
  const tone = toneFor(label, email.fromName);
  if (tone === "formal") {
    return `Hi ${name}, thank you for the note — I'll review the details and get back to you with a firm answer shortly. Please let me know if there's anything else you need from me in the meantime.`;
  }
  return `Hi ${name}, thanks for reaching out — I'll take a look and follow up with you soon on this.`;
}

export interface SummaryResult {
  summary: string;
  suggested_reply: string | null;
}

/**
 * Tries Workers AI for a sharper summary/reply; falls back to the heuristic
 * above if no AI binding is configured (e.g. local dev with no Cloudflare
 * account yet) or the call fails. Only ever sees the redacted preview.
 */
export async function summarizeAndReply(
  env: Env | undefined,
  email: InboundEmail,
  label: Label,
  preview: string,
): Promise<SummaryResult> {
  const fallback: SummaryResult = {
    summary: heuristicSummary(email, preview),
    suggested_reply: heuristicReply(email, label),
  };

  if (!env?.AI) return fallback;

  try {
    const needsReply = REPLY_LABELS.includes(label);
    const prompt = [
      "You triage email for a busy person. Given only this redacted preview, respond with strict JSON:",
      `{"summary": "one plain-language sentence, no names beyond a first name already shown", "suggested_reply": ${
        needsReply ? '"2-4 sentence draft reply, never inventing facts or committing to a date/amount"' : "null"
      }}`,
      `Subject: ${redactSensitive(email.subject)}`,
      `Preview: ${preview}`,
    ].join("\n");

    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
    });

    const raw = typeof result === "string" ? result : (result as { response?: string }).response ?? "";
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const redactedSummary =
      typeof parsed.summary === "string" && parsed.summary.trim() ? redactSensitive(parsed.summary) : "";
    const redactedReply =
      typeof parsed.suggested_reply === "string" && parsed.suggested_reply.trim()
        ? redactSensitive(parsed.suggested_reply)
        : "";
    return {
      // The model only ever sees the already-redacted preview, so it can echo
      // a near-content-free stub (e.g. "Your [redacted]."); treat that the
      // same as "no usable AI summary" and fall back to the heuristic.
      summary: hasInformativeContent(redactedSummary) ? redactedSummary : fallback.summary,
      suggested_reply: needsReply ? (hasInformativeContent(redactedReply) ? redactedReply : fallback.suggested_reply) : null,
    };
  } catch {
    return fallback;
  }
}
