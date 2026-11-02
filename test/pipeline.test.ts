import { describe, expect, it } from "vitest";
import { buildDailyDigest, classifyBatch, classifyEmail } from "../src/pipeline.js";
import type { InboundEmail } from "../src/types.js";
import * as fx from "./fixtures.js";

function isEmail(value: unknown): value is InboundEmail {
  return typeof value === "object" && value !== null && "fromAddress" in value;
}

describe("classifyEmail (no AI binding — local dev / unauthenticated Cloudflare)", () => {
  it("returns a fully-shaped ClassifiedEmail using the heuristic fallback", async () => {
    const result = await classifyEmail(fx.needsReplyAdvisor);
    expect(result).toMatchObject({
      id: fx.needsReplyAdvisor.id,
      label: "Needs Reply",
      priority: "urgent",
      has_attachment: false,
    });
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.suggested_reply).not.toBeNull();
  });

  it("never attaches a suggested_reply for labels other than Needs Reply/Deadline", async () => {
    const result = await classifyEmail(fx.receiptBrokerage);
    expect(result.suggested_reply).toBeNull();
  });

  it("never leaks the full email address or an OTP into the output", async () => {
    const result = await classifyEmail(fx.spamOtpInBody);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(fx.spamOtpInBody.fromAddress);
    expect(serialized).not.toContain("483920");
  });
});

describe("buildDailyDigest end-to-end", () => {
  it("produces a digest covering every non-newsletter fixture", async () => {
    const all = Object.values(fx).filter(isEmail);
    const digest = await buildDailyDigest(all);
    expect(digest).toContain("URGENT");
    expect(digest).toContain("NORMAL");
    expect(digest).toContain("LOW");
    expect(digest).not.toContain("Weekly digest");
  });

  it("matches the exact shape for the fixture set used in the sample report", async () => {
    const sample = [
      fx.financialAidMissingDoc,
      fx.needsReplyAdvisor,
      fx.needsReplyProfessor,
      fx.recruiterInterviewInvite,
      fx.receiptBrokerage,
      fx.notificationBuildFailed,
      fx.newsletterDigest,
    ];
    const classified = await classifyBatch(sample);
    const byId = Object.fromEntries(classified.map((c) => [c.id, c]));
    expect(byId[fx.financialAidMissingDoc.id].priority).toBe("urgent");
    expect(byId[fx.needsReplyAdvisor.id].priority).toBe("urgent");
    expect(byId[fx.needsReplyProfessor.id].priority).toBe("normal");
    expect(byId[fx.recruiterInterviewInvite.id].priority).toBe("normal");
    expect(byId[fx.receiptBrokerage.id].priority).toBe("low");
    expect(byId[fx.notificationBuildFailed.id].priority).toBe("low");
    expect(byId[fx.newsletterDigest.id].priority).toBe("low");
  });
});
