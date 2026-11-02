import { isGmailAccountKey, type GmailAccountKey } from "./accounts.js";

const refreshTokenKey = (account: GmailAccountKey) => `gmail:refresh-token:${account}`;
const oauthStateKey = (nonce: string) => `gmail:oauth-state:${nonce}`;

/** Ten minutes is plenty for sir to click a consent link right after it's sent. */
const OAUTH_STATE_TTL_SECONDS = 600;

export async function getRefreshToken(env: Env, account: GmailAccountKey): Promise<string | null> {
  return env.INBOX_KV.get(refreshTokenKey(account));
}

export async function setRefreshToken(env: Env, account: GmailAccountKey, refreshToken: string): Promise<void> {
  await env.INBOX_KV.put(refreshTokenKey(account), refreshToken);
}

/** Which accounts already have a stored refresh token (i.e. are connected). */
export async function getConnectedAccounts(env: Env, accounts: readonly GmailAccountKey[]): Promise<GmailAccountKey[]> {
  const checks = await Promise.all(accounts.map(async (account) => ((await getRefreshToken(env, account)) ? account : null)));
  return checks.filter((a): a is GmailAccountKey => a !== null);
}

/** One-time-use CSRF nonce for the OAuth round trip; carries the account key
 * so the callback route doesn't need it in the (single, Google-registered) redirect URI. */
export async function createOAuthState(env: Env, account: GmailAccountKey): Promise<string> {
  const nonce = crypto.randomUUID();
  await env.INBOX_KV.put(oauthStateKey(nonce), account, { expirationTtl: OAUTH_STATE_TTL_SECONDS });
  return nonce;
}

export async function consumeOAuthState(env: Env, nonce: string): Promise<GmailAccountKey | null> {
  const key = oauthStateKey(nonce);
  const account = await env.INBOX_KV.get(key);
  if (!account) return null;
  await env.INBOX_KV.delete(key);
  return isGmailAccountKey(account) ? account : null;
}
