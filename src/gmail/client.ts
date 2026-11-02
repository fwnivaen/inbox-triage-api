import type { InboundEmail } from "../types.js";
import type { GmailAccountKey } from "./accounts.js";

const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessageMetadata {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[] };
}

function header(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Splits `"Jordan Ellis <jordan@example.com>"` into name/address; falls back
 * to treating the whole value as the address when there's no display name. */
export function parseFromHeader(value: string): { name: string; address: string } {
  const match = value.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), address: match[2].trim() };
  }
  return { name: "", address: value.trim() };
}

async function gmailGet(accessToken: string, path: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Gmail API request failed: ${response.status} ${path}`);
  }
  return response.json();
}

/** IDs of messages received in roughly the last `windowHours` hours. */
export async function listRecentMessageIds(accessToken: string, windowHours = 24): Promise<string[]> {
  const days = Math.max(1, Math.ceil(windowHours / 24));
  const query = encodeURIComponent(`newer_than:${days}d`);
  const ids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: decodeURIComponent(query), maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await gmailGet(accessToken, `/messages?${params}`) as {
      messages?: { id: string }[]; nextPageToken?: string;
    };
    for (const message of result.messages ?? []) ids.add(message.id);
    pageToken = result.nextPageToken;
  } while (pageToken);
  return [...ids];
}

/**
 * Fetches headers + snippet only (`format=metadata`) — never the full body
 * (SPEC.md §5). `hasAttachment` is conservatively always `false`: metadata
 * format doesn't expose MIME parts, and detecting attachments reliably would
 * mean fetching more of the message than classification actually needs.
 */
export async function getMessageAsInboundEmail(
  accessToken: string,
  account: GmailAccountKey,
  messageId: string,
): Promise<InboundEmail & { account: GmailAccountKey }> {
  const params = new URLSearchParams({ format: "metadata" });
  params.append("metadataHeaders", "From");
  params.append("metadataHeaders", "Subject");
  const message = (await gmailGet(accessToken, `/messages/${messageId}?${params.toString()}`)) as GmailMessageMetadata;

  const { name, address } = parseFromHeader(header(message.payload?.headers, "From"));
  const receivedAt = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString();

  return {
    // Prefixed so IDs stay unique once multiple inboxes share one KV/retention store.
    id: `${account}:${message.id}`,
    fromAddress: address,
    fromName: name,
    subject: header(message.payload?.headers, "Subject"),
    body: message.snippet ?? "",
    receivedAt,
    hasAttachment: false,
    account,
  };
}
