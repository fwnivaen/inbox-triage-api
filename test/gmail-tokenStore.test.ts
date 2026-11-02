import { describe, expect, it } from "vitest";
import {
  consumeOAuthState,
  createOAuthState,
  getConnectedAccounts,
  getRefreshToken,
  setRefreshToken,
} from "../src/gmail/tokenStore.js";
import { fakeKv } from "./fakeKv.js";

function envWithKv(): Env {
  return { INBOX_KV: fakeKv() } as unknown as Env;
}

describe("refresh token storage", () => {
  it("round-trips a refresh token for one account without affecting others", async () => {
    const env = envWithKv();
    await setRefreshToken(env, "work", "work-refresh-token");

    expect(await getRefreshToken(env, "work")).toBe("work-refresh-token");
    expect(await getRefreshToken(env, "personal")).toBeNull();
  });

  it("reports only accounts that have a stored token as connected", async () => {
    const env = envWithKv();
    await setRefreshToken(env, "school", "school-refresh-token");

    expect(await getConnectedAccounts(env, ["work", "personal", "school"])).toEqual(["school"]);
  });
});

describe("OAuth state nonce", () => {
  it("consumes the nonce exactly once and returns the account it was created for", async () => {
    const env = envWithKv();
    const state = await createOAuthState(env, "work");

    expect(await consumeOAuthState(env, state)).toBe("work");
    expect(await consumeOAuthState(env, state)).toBeNull(); // single use
  });

  it("rejects an unknown or expired state value", async () => {
    const env = envWithKv();
    expect(await consumeOAuthState(env, "never-issued")).toBeNull();
  });
});
