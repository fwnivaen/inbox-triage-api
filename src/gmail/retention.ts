import type { GmailAccountKey } from "./accounts.js";
import type { Label, Priority } from "../types.js";

/** SPEC.md §5: processed metadata auto-expires after 90 days; nothing else
 * is retained past the single classification request. KV's native TTL does
 * the expiry for us — no cleanup job needed. */
const RETENTION_SECONDS = 90 * 24 * 60 * 60;

const DIGEST_KEY = "gmail:digest:latest";

export interface StoredClassification {
  messageId: string;
  account: GmailAccountKey;
  timestamp: string;
  label: Label;
  priority: Priority;
  deadline: string | null;
  // Summary only — never the full body (SPEC.md §5).
  summary: string;
}

export async function recordClassification(env: Env, meta: StoredClassification): Promise<void> {
  const key = `gmail:meta:${meta.account}:${meta.messageId}`;
  await env.INBOX_KV.put(key, JSON.stringify(meta), { expirationTtl: RETENTION_SECONDS });
}

export interface StoredDigest {
  generatedAt: string;
  text: string;
}

export async function saveLatestDigest(env: Env, text: string): Promise<void> {
  const value: StoredDigest = { generatedAt: new Date().toISOString(), text };
  await env.INBOX_KV.put(DIGEST_KEY, JSON.stringify(value), { expirationTtl: RETENTION_SECONDS });
}

export async function getLatestDigest(env: Env): Promise<StoredDigest | null> {
  const raw = await env.INBOX_KV.get(DIGEST_KEY);
  return raw ? (JSON.parse(raw) as StoredDigest) : null;
}
