import { fetchRetry } from "../resilience.js";
import { GMAIL_READONLY_SCOPE, type GmailAccountKey } from "./accounts.js";
import { consumeOAuthState, createOAuthState, setRefreshToken } from "./tokenStore.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

function redirectUri(env: Env): string {
  // One fixed, Google-registered redirect URI for every account — which
  // account this is for travels in `state` instead, so adding an account
  // never requires touching the OAuth client's redirect URI list.
  return `${env.WORKER_BASE_URL}/oauth/callback`;
}

function requireClientCredentials(env: Env): { clientId: string; clientSecret: string } {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not configured (wrangler secret put).");
  }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

/** Builds the Google consent URL for one account. `prompt=consent` forces a
 * refresh_token even on re-consent; scope is always exactly read-only Gmail. */
export async function buildConsentUrl(env: Env, account: GmailAccountKey): Promise<string> {
  const { clientId } = requireClientCredentials(env);
  const state = await createOAuthState(env, account);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(env),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_READONLY_SCOPE,
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

function assertReadOnlyScope(grantedScope: string | undefined): void {
  if (!grantedScope) return; // refresh responses don't always echo `scope` back
  const granted = grantedScope.split(" ").filter(Boolean);
  const unexpected = granted.filter((s) => s !== GMAIL_READONLY_SCOPE);
  if (unexpected.length > 0) {
    throw new Error(`Refusing to store a token with unexpected scope(s): ${unexpected.join(", ")}`);
  }
}

export interface OAuthCallbackResult {
  account: GmailAccountKey;
}

/** Exchanges the authorization code for tokens, refuses anything granting
 * more than read-only Gmail, and persists the refresh token for that account. */
export async function completeOAuthCallback(env: Env, code: string, state: string): Promise<OAuthCallbackResult> {
  const account = await consumeOAuthState(env, state);
  if (!account) {
    throw new Error("OAuth state is missing, expired, or already used.");
  }
  const { clientId, clientSecret } = requireClientCredentials(env);

  const response = await fetchRetry(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(env),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status}`);
  }

  const tokens = (await response.json()) as GoogleTokenResponse;
  assertReadOnlyScope(tokens.scope);
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token — try the consent link again.");
  }

  const expected = JSON.parse(env.GMAIL_ACCOUNT_EMAILS ?? "{}") as Partial<Record<GmailAccountKey, string>>;
  if (!expected[account]) throw new Error("Expected Gmail account identity is not configured.");
  const profile = await fetchRetry("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profile.ok) throw new Error(`Gmail identity verification failed: ${profile.status}`);
  const identity = await profile.json() as { emailAddress?: string };
  if (identity.emailAddress?.toLowerCase() !== expected[account]!.toLowerCase()) {
    throw new Error("Selected Google account does not match the requested inbox.");
  }
  await setRefreshToken(env, account, tokens.refresh_token);
  return { account };
}

/** Exchanges a stored refresh token for a short-lived access token. */
export async function refreshAccessToken(env: Env, refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = requireClientCredentials(env);
  const response = await fetchRetry(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(`Google access-token refresh failed: ${response.status}`);
  }
  const tokens = (await response.json()) as GoogleTokenResponse;
  assertReadOnlyScope(tokens.scope);
  return tokens.access_token;
}
