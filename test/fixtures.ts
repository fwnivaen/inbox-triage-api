import type { InboundEmail } from "../src/types.js";

/** Reference "now" for every fixture below — all relative dates in bodies are keyed to this. */
export const NOW = new Date("2026-11-02T12:00:00Z");

let counter = 0;
function email(partial: Partial<InboundEmail> & Pick<InboundEmail, "fromAddress" | "fromName" | "subject" | "body">): InboundEmail {
  counter += 1;
  return {
    id: `fixture-${counter}`,
    receivedAt: NOW.toISOString(),
    hasAttachment: false,
    ...partial,
  };
}

// All names, companies, and amounts below are fabricated, per SPEC.md's anonymization note.

export const needsReplyAdvisor = email({
  fromAddress: "jordan.ellis@riverview.edu",
  fromName: "Jordan Ellis",
  subject: "Re: Wellbeing Ally Interview Invitation",
  body: "Can you confirm a time this week for the interview? Let me know what works.",
});

export const needsReplyCoworker = email({
  fromAddress: "sam.oduya@brightlane.io",
  fromName: "Sam Oduya",
  subject: "RE: Project kickoff — need your availability",
  body: "Following up — could you send over your availability for next Tuesday?",
});

export const deadlineHousing = email({
  fromAddress: "billing@northgate-housing.com",
  fromName: "Northgate Housing",
  subject: "Housing: Monthly installment due by the 5th",
  body: "This is a reminder that your monthly installment is due by the 5th of this month.",
});

export const deadlineRsvp = email({
  fromAddress: "events@careerconnect.org",
  fromName: "CareerConnect Events",
  subject: "Final notice: RSVP by Nov 13 for the info session",
  body: "This is the final notice — please RSVP by Nov 13 for the info session.",
});

export const recruiterRole = email({
  fromAddress: "no-reply@handshake.com",
  fromName: "Handshake",
  subject: "New Data & Analytics Consultant role at a mid-size firm — apply now",
  body: "A new Data & Analytics Consultant role just opened at a mid-size firm. Apply now to be considered.",
});

export const recruiterInterviewInvite = email({
  fromAddress: "recruiting@lumenworks.example",
  fromName: "Lumenworks Recruiting",
  subject: "Interview invitation — Operations Student Worker",
  body: "We'd like to schedule an interview for the Operations Student Worker role. Please confirm your availability.",
});

export const schoolClassCancel = email({
  fromAddress: "prof.martel@riverview.edu",
  fromName: "Prof. Martel",
  subject: "[Course] canceling Monday's reading",
  body: "Just a note that I'm canceling Monday's reading assignment for the seminar.",
});

export const needsReplyProfessor = email({
  fromAddress: "prof.diaz@riverview.edu",
  fromName: "Prof. Diaz",
  subject: "Re: Midterm Progress Check-In",
  body: "Can you reply and let me know how things are going so far this term?",
});

export const financialAidMissingDoc = email({
  fromAddress: "bursar@riverview.edu",
  fromName: "Office of Financial Aid",
  subject: "Re: Office of Financial Aid — missing document",
  body: "We're missing a verification document for your file. Please submit it as soon as possible.",
});

export const financialAidAwardLetter = email({
  fromAddress: "financialaid@riverview.edu",
  fromName: "Financial Aid Office",
  subject: "Your Spring award letter is ready to view",
  body: "Your Spring award letter is ready to view in the student portal.",
});

export const receiptBrokerage = email({
  fromAddress: "statements@fidelity.com",
  fromName: "Fidelity",
  subject: "Your monthly brokerage statement is available",
  body: "Your monthly brokerage statement is available to view online. No action needed.",
});

export const receiptRide = email({
  fromAddress: "receipts@uber.com",
  fromName: "Uber Receipts",
  subject: "Your ride receipt from last night",
  body: "Thanks for riding with us. Here is your ride receipt from last night. Order confirmed.",
});

export const newsletterDigest = email({
  fromAddress: "news@beehiiv.com",
  fromName: "The Markets Weekly",
  subject: "Weekly digest — Nov 1 2026",
  body: "This week in markets: what to watch. Unsubscribe anytime from the footer below.",
});

export const notificationBuildFailed = email({
  fromAddress: "notifications@github.com",
  fromName: "GitHub",
  subject: "[sample-repo] Run failed: nightly build — main",
  body: "The nightly build workflow failed on main. View the run for details.",
});

export const notificationSecurityAlert = email({
  fromAddress: "no-reply@accounts.google.com",
  fromName: "Google",
  subject: "Security alert: new sign-in to your account",
  body: "We noticed a new sign-in to your account from an unrecognized device. If this wasn't you, secure your account.",
});

export const spamPromo = email({
  fromAddress: "deals@megastyle-outlet.example",
  fromName: "MegaStyle Outlet",
  subject: "50% off just-launched devices — exclusive offer",
  body: "Don't miss our exclusive 50% off sale on just-launched devices, today only!",
});

export const spamOtpInBody = email({
  fromAddress: "deals@megastyle-outlet.example",
  fromName: "MegaStyle Outlet",
  subject: "Your one-time verification code is ready",
  body: "Your verification code: 483920. Also check out our 50% off sale this week.",
});
