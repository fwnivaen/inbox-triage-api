import { GMAIL_ACCOUNTS, type GmailAccountKey } from "./gmail/accounts.js";
import { getMessageAsInboundEmail, listRecentMessageIds } from "./gmail/client.js";
import { refreshAccessToken } from "./gmail/oauth.js";
import { recordClassification, saveLatestDigest } from "./gmail/retention.js";
import { getRefreshToken } from "./gmail/tokenStore.js";
import { buildMultiAccountDigest, type AccountClassifiedEmail } from "./multiAccountDigest.js";
import { classifyEmail } from "./pipeline.js";

/**
 * Daily cron entry point: for every Gmail account with a stored refresh
 * token, pulls the last 24h of mail (headers + snippet only — SPEC.md §5),
 * classifies it, records 90-day-TTL metadata, and assembles one combined
 * digest tagged by inbox. An account with no stored token yet (not
 * consented) or a failing account is skipped rather than aborting the run.
 */
export async function runDailySync(env: Env): Promise<string> {
  const tagged: AccountClassifiedEmail[] = [];

  for (const account of GMAIL_ACCOUNTS) {
    await syncAccount(env, account, tagged);
  }

  const digest = buildMultiAccountDigest(tagged);
  await saveLatestDigest(env, digest);
  return digest;
}

async function syncAccount(env: Env, account: GmailAccountKey, out: AccountClassifiedEmail[]): Promise<void> {
  const refreshToken = await getRefreshToken(env, account);
  if (!refreshToken) return; // not connected yet

  try {
    const accessToken = await refreshAccessToken(env, refreshToken);
    const ids = await listRecentMessageIds(accessToken, 24);

    for (const id of ids) {
      const email = await getMessageAsInboundEmail(accessToken, account, id);
      const classified = await classifyEmail(email, env);
      out.push({ ...classified, account });
      await recordClassification(env, {
        messageId: email.id,
        account,
        timestamp: email.receivedAt,
        label: classified.label,
        priority: classified.priority,
        deadline: classified.deadline,
        summary: classified.summary,
      });
    }

    console.log(JSON.stringify({ message: "gmail sync ok", account, count: ids.length }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ message: "gmail sync failed", account, error: message }));
  }
}
