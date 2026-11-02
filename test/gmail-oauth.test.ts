import { afterEach, describe, expect, it, vi } from "vitest";
import { buildConsentUrl, completeOAuthCallback, refreshAccessToken } from "../src/gmail/oauth.js";
import { createOAuthState, getRefreshToken } from "../src/gmail/tokenStore.js";
import { fakeKv } from "./fakeKv.js";

function envWithCreds(): Env {
  return {
    INBOX_KV: fakeKv(),
    WORKER_BASE_URL: "https://inbox-triage-api.inbox-triage-api.workers.dev",
    GMAIL_ACCOUNT_EMAILS: JSON.stringify({ personal: "personal@example.com" }),
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  } as unknown as Env;
}

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 400 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildConsentUrl", () => {
  it("requests exactly the read-only Gmail scope at the fixed redirect URI", async () => {
    const env = envWithCreds();
    const url = new URL(await buildConsentUrl(env, "work"));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://inbox-triage-api.inbox-triage-api.workers.dev/oauth/callback",
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBeTruthy();
  });
});

describe("completeOAuthCallback", () => {
  it("stores the refresh token when Google grants exactly read-only Gmail", async () => {
    const env = envWithCreds();
    const state = await createOAuthState(env, "personal");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          emailAddress: "personal@example.com",
          access_token: "a",
          refresh_token: "personal-refresh",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/gmail.readonly",
          token_type: "Bearer",
        }),
      ),
    );

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ access_token: "a", refresh_token: "personal-refresh" }))
      .mockResolvedValueOnce(jsonResponse({ emailAddress: "personal@example.com" }));
    const result = await completeOAuthCallback(env, "auth-code", state);

    expect(result.account).toBe("personal");
    expect(await getRefreshToken(env, "personal")).toBe("personal-refresh");
  });

  it("refuses and does not store a token when Google grants more than read-only Gmail", async () => {
    const env = envWithCreds();
    const state = await createOAuthState(env, "work");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          emailAddress: "personal@example.com",
          access_token: "a",
          refresh_token: "should-not-be-saved",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
          token_type: "Bearer",
        }),
      ),
    );

    await expect(completeOAuthCallback(env, "auth-code", state)).rejects.toThrow(/unexpected scope/i);
    expect(await getRefreshToken(env, "work")).toBeNull();
  });

  it("rejects a missing, expired, or already-used state value", async () => {
    const env = envWithCreds();
    await expect(completeOAuthCallback(env, "auth-code", "bogus-state")).rejects.toThrow(/state/i);
  });

  it("rejects when Google does not return a refresh token", async () => {
    const env = envWithCreds();
    const state = await createOAuthState(env, "school");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          emailAddress: "personal@example.com",
          access_token: "a",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/gmail.readonly",
          token_type: "Bearer",
        }),
      ),
    );

    await expect(completeOAuthCallback(env, "auth-code", state)).rejects.toThrow(/refresh token/i);
  });
});

describe("refreshAccessToken", () => {
  it("returns the access token when the refresh grant stays within read-only Gmail", async () => {
    const env = envWithCreds();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ access_token: "fresh-access-token", expires_in: 3600, token_type: "Bearer" })),
    );

    expect(await refreshAccessToken(env, "some-refresh-token")).toBe("fresh-access-token");
  });

  it("refuses an access token when the refresh grant reports a broader scope", async () => {
    const env = envWithCreds();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          access_token: "fresh-access-token",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/gmail.modify",
          token_type: "Bearer",
        }),
      ),
    );

    await expect(refreshAccessToken(env, "some-refresh-token")).rejects.toThrow(/unexpected scope/i);
  });
});

it("rejects the wrong inbox identity without saving a refresh token", async () => {
  const env = envWithCreds();
  const state = await createOAuthState(env, "personal");
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(jsonResponse({ access_token: "a", refresh_token: "wrong" }))
    .mockResolvedValueOnce(jsonResponse({ emailAddress: "wrong@example.com" })));
  await expect(completeOAuthCallback(env, "code", state)).rejects.toThrow(/does not match/);
  expect(await getRefreshToken(env, "personal")).toBeNull();
});
