import { describe, expect, it } from "vitest";
import { buildMultiAccountDigest, type AccountClassifiedEmail } from "../src/multiAccountDigest.js";

function email(overrides: Partial<AccountClassifiedEmail>): AccountClassifiedEmail {
  return {
    id: "1",
    label: "Needs Reply",
    priority: "normal",
    summary: "A summary.",
    deadline: null,
    suggested_reply: null,
    has_attachment: false,
    account: "work",
    ...overrides,
  };
}

describe("buildMultiAccountDigest", () => {
  it("tags each line with its account", () => {
    const digest = buildMultiAccountDigest([email({ account: "work" }), email({ account: "school", priority: "urgent" })]);
    expect(digest).toContain("[work] [Needs Reply] A summary.");
    expect(digest).toContain("[school] [Needs Reply] A summary.");
  });

  it("excludes Newsletters and omits empty sections, same as the single-account digest", () => {
    const digest = buildMultiAccountDigest([
      email({ account: "personal", label: "Newsletters", priority: "low" }),
      email({ account: "work", priority: "urgent" }),
    ]);
    expect(digest).not.toContain("Newsletters");
    expect(digest).not.toContain("LOW");
    expect(digest).toContain("URGENT");
  });
});
