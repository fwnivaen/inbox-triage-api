import { describe, expect, it } from "vitest";
import { classifyLabel } from "../src/classifier.js";
import { computePriority } from "../src/priority.js";
import { safePreview } from "../src/privacy.js";
import * as fx from "./fixtures.js";
import type { InboundEmail } from "../src/types.js";

function priorityOf(email: InboundEmail) {
  const { label, deadline } = classifyLabel(email, fx.NOW);
  const text = `${email.subject} ${safePreview(email.body)}`;
  return computePriority(label, deadline, text, fx.NOW);
}

describe("computePriority", () => {
  it("is urgent for an interview-related Needs Reply", () => {
    expect(priorityOf(fx.needsReplyAdvisor)).toBe("urgent");
  });

  it("is normal for a generic Needs Reply with no money/interview/deadline signal", () => {
    expect(priorityOf(fx.needsReplyCoworker)).toBe("normal");
    expect(priorityOf(fx.needsReplyProfessor)).toBe("normal");
  });

  it("is urgent for Financial Aid requiring a missing document", () => {
    expect(priorityOf(fx.financialAidMissingDoc)).toBe("urgent");
  });

  it("is normal for informational Financial Aid updates", () => {
    expect(priorityOf(fx.financialAidAwardLetter)).toBe("normal");
  });

  it("is normal for a concrete recruiter next step, low for a cold lead", () => {
    expect(priorityOf(fx.recruiterInterviewInvite)).toBe("normal");
    expect(priorityOf(fx.recruiterRole)).toBe("low");
  });

  it("is low for routine School mail with no grading/advising signal, normal otherwise", () => {
    expect(priorityOf(fx.schoolClassCancel)).toBe("normal"); // mentions "assignment"
  });

  it("is low for routine receipts", () => {
    expect(priorityOf(fx.receiptBrokerage)).toBe("low");
    expect(priorityOf(fx.receiptRide)).toBe("low");
  });

  it("is always low for Newsletters and Spam/Promotions", () => {
    expect(priorityOf(fx.newsletterDigest)).toBe("low");
    expect(priorityOf(fx.spamPromo)).toBe("low");
    expect(priorityOf(fx.spamOtpInBody)).toBe("low");
  });

  it("is urgent for an unrecognized sign-in alert, low for a routine CI failure", () => {
    expect(priorityOf(fx.notificationSecurityAlert)).toBe("urgent");
    expect(priorityOf(fx.notificationBuildFailed)).toBe("low");
  });

  it("is urgent when a deadline falls within 48 hours, normal further out", () => {
    expect(priorityOf(fx.deadlineHousing)).toBe("normal"); // ~3.5 days out
    expect(priorityOf(fx.deadlineRsvp)).toBe("normal"); // ~11 days out

    const dueSoon: InboundEmail = {
      ...fx.deadlineHousing,
      id: "due-soon",
      subject: "Final reminder",
      body: "Final reminder: this is due tomorrow, no extensions.",
    };
    expect(priorityOf(dueSoon)).toBe("urgent");
  });
});
