import { describe, expect, it } from "vitest";
import { isAuthorized } from "../src/auth.js";

function envWithKey(key?: string): Env {
  return { DIGEST_API_KEY: key } as unknown as Env;
}

function requestWithAuth(header?: string): Request {
  const headers = new Headers();
  if (header !== undefined) headers.set("authorization", header);
  return new Request("https://example.com/digest", { method: "POST", headers });
}

describe("isAuthorized", () => {
  it("rejects every request when DIGEST_API_KEY isn't configured yet", () => {
    expect(isAuthorized(requestWithAuth("Bearer anything"), envWithKey(undefined))).toBe(false);
  });

  it("rejects a request with no Authorization header", () => {
    expect(isAuthorized(requestWithAuth(undefined), envWithKey("secret-key"))).toBe(false);
  });

  it("rejects a non-Bearer scheme or the wrong key", () => {
    const env = envWithKey("secret-key");
    expect(isAuthorized(requestWithAuth("Basic secret-key"), env)).toBe(false);
    expect(isAuthorized(requestWithAuth("Bearer wrong-key"), env)).toBe(false);
  });

  it("accepts the exact configured key", () => {
    const env = envWithKey("secret-key");
    expect(isAuthorized(requestWithAuth("Bearer secret-key"), env)).toBe(true);
  });
});
