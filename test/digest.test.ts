import { describe, expect, it } from "vitest";
import { buildDigest } from "../src/digest.js";
import type { ClassifiedEmail } from "../src/types.js";

function fakeClassified(partial: Partial<ClassifiedEmail>): ClassifiedEmail {
  return {
    id: "x",
    label: "Needs Reply",
    priority: "normal",
    summary: "placeholder",
    deadline: null,
    suggested_reply: null,
    has_attachment: false,
    ...partial,
  };
}

describe("buildDigest", () => {
  it("groups into Urgent/Normal/Low, in that order", () => {
    const emails = [
      fakeClassified({ id: "1", priority: "low", label: "Receipts", summary: "Statement posted" }),
      fakeClassified({ id: "2", priority: "urgent", label: "Needs Reply", summary: "Reply needed" }),
      fakeClassified({ id: "3", priority: "normal", label: "School", summary: "Check-in requested" }),
    ];
    const digest = buildDigest(emails);
    const urgentIdx = digest.indexOf("URGENT");
    const normalIdx = digest.indexOf("NORMAL");
    const lowIdx = digest.indexOf("LOW");
    expect(urgentIdx).toBeGreaterThanOrEqual(0);
    expect(urgentIdx).toBeLessThan(normalIdx);
    expect(normalIdx).toBeLessThan(lowIdx);
  });

  it("sorts shortest summary first within a section", () => {
    const emails = [
      fakeClassified({ id: "1", priority: "urgent", summary: "A much longer summary sentence here" }),
      fakeClassified({ id: "2", priority: "urgent", summary: "Short one" }),
    ];
    const digest = buildDigest(emails);
    expect(digest.indexOf("Short one")).toBeLessThan(digest.indexOf("A much longer"));
  });

  it("excludes Newsletters entirely, even if marked low priority", () => {
    const emails = [
      fakeClassified({ id: "1", priority: "low", label: "Newsletters", summary: "Weekly roundup" }),
      fakeClassified({ id: "2", priority: "low", label: "Receipts", summary: "Order confirmed" }),
    ];
    const digest = buildDigest(emails);
    expect(digest).not.toContain("Weekly roundup");
    expect(digest).toContain("Order confirmed");
  });

  it("omits a section with zero items", () => {
    const emails = [fakeClassified({ id: "1", priority: "low", label: "Receipts", summary: "Order confirmed" })];
    const digest = buildDigest(emails);
    expect(digest).not.toContain("URGENT");
    expect(digest).not.toContain("NORMAL");
    expect(digest).toContain("LOW");
  });

  it("includes the deadline suffix only when present", () => {
    const emails = [
      fakeClassified({ id: "1", priority: "urgent", summary: "Doc due", deadline: "2026-11-03" }),
      fakeClassified({ id: "2", priority: "urgent", summary: "No date here", deadline: null }),
    ];
    const digest = buildDigest(emails);
    expect(digest).toContain("Doc due — 2026-11-03");
    expect(digest).toContain("No date here");
    expect(digest).not.toContain("No date here —");
  });
});
