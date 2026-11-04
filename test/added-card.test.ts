import { describe, expect, it } from "vitest";
import { classifyEmail } from "../src/pipeline.js";
import type { InboundEmail } from "../src/types.js";

const exact: InboundEmail = {
  id: "fabricated-observed-payment-card-added", fromAddress: "notifications@example.com", fromName: "Example Service",
  subject: "A new payment card was added",
  body: "A new payment card was added to your account. If you did not make this change, review account security using the official website.",
  receivedAt: "2026-11-03T20:00:00Z", hasAttachment: false,
};

describe("observed payment-card additions", () => {
  it.each([
    ["exact observed notice", exact.subject, exact.body],
    ["credit card addition", "Account update", "Your credit card has been added to your wallet. If you did not make this change, review account security."],
    ["debit card addition", "Account update", "A debit card was added to your account."],
    ["event in subject beyond body preview", "A payment card has been added to your account", "Details. ".repeat(80)],
  ])("routes %s to conditional Actions without a reply", async (_name, subject, body) => {
    const result = await classifyEmail({ ...exact, subject, body });
    expect(result).toMatchObject({ label: "Notifications/GitHub", route: "Actions", priority: "normal", actionRequired: true, suggested_reply: null, summarySource: "fallback", deadline: null });
    expect(result.summary).toBe("A payment card was added; if you did not make this change, review account security using the official app or website.");
    expect(result.summary).not.toMatch(/fraud|unauthorized|unrecognized/i);
  });

  it.each([
    ["marketing offer", "Add a new payment card", "Add a new payment card to your account to get rewards. Exclusive offer. Unsubscribe."],
    ["hypothetical footer", "Account tips", "If a new payment card was added to your account, review account security."],
    ["hypothetical any-card footer", "Account tips", "If any payment card was added to your account, review account security."],
    ["OTP with hypothetical footer", "Verification code", "Your sign-in code is 123456. If a payment card was added to your account, review account security."],
    ["future card addition", "Account tips", "A new payment card will be added to your account after you sign up."],
    ["possible card addition", "Account tips", "A new payment card can be added to your account to earn rewards."],
    ["shopping cart", "New product update", "A new payment card was added to your shopping cart. Check out our offer."],
    ["product catalog", "New product update", "A new payment card was added to our product catalog. Exclusive offer. Unsubscribe."],
    ["unrelated item addition", "New product update", "A new keyboard was added to your account wishlist."],
    ["split unrelated card and addition", "Payment card", "Your profile photo was added to your account."],
  ])("keeps %s in Review", async (_name, subject, body) => {
    const result = await classifyEmail({ ...exact, subject, body });
    expect(result.route).toBe("Review");
    expect(result.priority).toBe("low");
    expect(result.suggested_reply).toBeNull();
    expect(result.actionRequired).toBe(false);
  });

  it("preserves self-mail suppression", async () => {
    const env = { GMAIL_ACCOUNT_EMAILS: JSON.stringify({ work: exact.fromAddress }) } as Env;
    expect((await classifyEmail(exact, env)).route).toBe("Review");
  });

  it("keeps conditional advice even if the AI invents a fraud assertion", async () => {
    const env = { AI: { run: async () => ({ response: { summary: "Confirmed unauthorized activity occurred on the account.", suggested_reply: "Reply to dispute this immediately." } }) } } as unknown as Env;
    const result = await classifyEmail(exact, env);
    expect(result).toMatchObject({ route: "Actions", priority: "normal", summarySource: "fallback", suggested_reply: null });
    expect(result.summary).toContain("if you did not make this change");
    expect(result.summary).not.toMatch(/fraud|unauthorized|unrecognized|confirmed/i);
  });
});
