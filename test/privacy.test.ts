import { describe, expect, it } from "vitest";
import { firstNameOf, isAutomatedAddress, redactSensitive, safePreview } from "../src/privacy.js";

describe("redactSensitive", () => {
  it("redacts a verification code next to its label", () => {
    const out = redactSensitive("Your verification code: 483920. Thanks.");
    expect(out).not.toContain("483920");
  });

  it("redacts a bearer token", () => {
    const out = redactSensitive("Authorization: Bearer abcDEF123456xyz");
    expect(out).not.toContain("abcDEF123456xyz");
  });

  it("redacts a social-security-number-shaped string", () => {
    const out = redactSensitive("Your SSN on file is 123-45-6789.");
    expect(out).not.toContain("123-45-6789");
  });

  it("redacts a long card/account-number-shaped string", () => {
    const out = redactSensitive("Card ending in 4242 4242 4242 4242 was charged.");
    expect(out).not.toContain("4242 4242 4242 4242");
  });

  it("leaves ordinary sentences untouched", () => {
    const text = "Your package is arriving Thursday.";
    expect(redactSensitive(text)).toBe(text);
  });
});

describe("safePreview", () => {
  it("never returns more than the requested prefix of the body", () => {
    const body = "x".repeat(2000);
    expect(safePreview(body, 500).length).toBeLessThanOrEqual(500);
  });

  it("redacts sensitive content even within the truncated preview", () => {
    const body = `one-time code: 998877 ${"x".repeat(600)}`;
    expect(safePreview(body, 500)).not.toContain("998877");
  });
});

describe("firstNameOf", () => {
  it("returns only the first name from a full display name", () => {
    expect(firstNameOf("Jordan Ellis")).toBe("Jordan");
  });

  it("falls back to a generic label when no name is present", () => {
    expect(firstNameOf("")).toBe("Someone");
  });
});

describe("isAutomatedAddress", () => {
  it("recognizes common no-reply/notifications senders", () => {
    expect(isAutomatedAddress("no-reply@example.com")).toBe(true);
    expect(isAutomatedAddress("notifications@github.com")).toBe(true);
    expect(isAutomatedAddress("support@example.com")).toBe(true);
  });

  it("does not flag a normal person's address", () => {
    expect(isAutomatedAddress("jordan.ellis@riverview.edu")).toBe(false);
  });
});
