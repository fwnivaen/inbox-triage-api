import { describe, expect, it } from "vitest";
import { runDailySync } from "../src/scheduled.js";
import { getLatestDigest } from "../src/gmail/retention.js";
import { fakeKv } from "./fakeKv.js";

function envWithKv(): Env {
  return { INBOX_KV: fakeKv() } as unknown as Env;
}

describe("runDailySync", () => {
  it("skips every account silently when none has a stored refresh token, and saves an empty digest", async () => {
    const env = envWithKv();

    const digest = await runDailySync(env);

    expect(digest).toBe("");
    const stored = await getLatestDigest(env);
    expect(stored?.text).toBe("");
    expect(stored?.accounts).toEqual({ work: { status: "not_connected", count: 0 }, personal: { status: "not_connected", count: 0 }, school: { status: "not_connected", count: 0 } });
  });
});
