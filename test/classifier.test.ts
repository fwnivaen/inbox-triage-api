import { describe, expect, it } from "vitest";
import { classifyLabel } from "../src/classifier.js";
import * as fx from "./fixtures.js";

describe("classifyLabel", () => {
  it("labels a personal reply-thread as Needs Reply", () => {
    expect(classifyLabel(fx.needsReplyAdvisor, fx.NOW).label).toBe("Needs Reply");
    expect(classifyLabel(fx.needsReplyCoworker, fx.NOW).label).toBe("Needs Reply");
    expect(classifyLabel(fx.needsReplyProfessor, fx.NOW).label).toBe("Needs Reply");
  });

  it("labels job-board and recruiter mail as Recruiter/Job", () => {
    expect(classifyLabel(fx.recruiterRole, fx.NOW).label).toBe("Recruiter/Job");
    expect(classifyLabel(fx.recruiterInterviewInvite, fx.NOW).label).toBe("Recruiter/Job");
  });

  it("labels non-financial school mail as School", () => {
    expect(classifyLabel(fx.schoolClassCancel, fx.NOW).label).toBe("School");
  });

  it("labels tuition/aid mail as Financial Aid even from a .edu sender", () => {
    expect(classifyLabel(fx.financialAidMissingDoc, fx.NOW).label).toBe("Financial Aid");
    expect(classifyLabel(fx.financialAidAwardLetter, fx.NOW).label).toBe("Financial Aid");
  });

  it("labels a bursar@ sender as Financial Aid even when the body never says the phrase", () => {
    const email = {
      ...fx.financialAidMissingDoc,
      fromAddress: "bursar@example-college.edu",
      subject: "Re: missing document",
      body: "We are missing a verification document for your file.",
    };
    expect(classifyLabel(email, fx.NOW).label).toBe("Financial Aid");
  });

  it("labels completed transactions as Receipts", () => {
    expect(classifyLabel(fx.receiptBrokerage, fx.NOW).label).toBe("Receipts");
    expect(classifyLabel(fx.receiptRide, fx.NOW).label).toBe("Receipts");
  });

  it("labels opted-in recurring content as Newsletters", () => {
    expect(classifyLabel(fx.newsletterDigest, fx.NOW).label).toBe("Newsletters");
  });

  it("labels automated platform alerts as Notifications/GitHub", () => {
    expect(classifyLabel(fx.notificationBuildFailed, fx.NOW).label).toBe("Notifications/GitHub");
    expect(classifyLabel(fx.notificationSecurityAlert, fx.NOW).label).toBe("Notifications/GitHub");
  });

  it("labels a dateless action item without a better category as Deadline", () => {
    expect(classifyLabel(fx.deadlineHousing, fx.NOW).label).toBe("Deadline");
    expect(classifyLabel(fx.deadlineHousing, fx.NOW).deadline).toBe("2026-11-05");
    expect(classifyLabel(fx.deadlineRsvp, fx.NOW).label).toBe("Deadline");
    expect(classifyLabel(fx.deadlineRsvp, fx.NOW).deadline).toBe("2026-11-13");
  });

  it("falls back to Spam/Promotions for cold marketing", () => {
    expect(classifyLabel(fx.spamPromo, fx.NOW).label).toBe("Spam/Promotions");
    expect(classifyLabel(fx.spamOtpInBody, fx.NOW).label).toBe("Spam/Promotions");
  });
});
