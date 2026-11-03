import { latestText, BROADCAST, RESOLVED, hasDirectRequest, publicationNotice, marketingDiscovery, FINANCIAL_RISK, cardChange, jobPitch } from "./signals.js";
import { extractDeadline, hasDeadlineCue } from "./deadline.js";
import { isAutomatedAddress, safePreview } from "./privacy.js";
import type { InboundEmail, Label } from "./types.js";

const JOB_BOARD_DOMAINS = [
  "handshake.com", "greenhouse.io", "lever.co", "myworkday.com",
  "indeed.com", "ziprecruiter.com", "lensa.com", "ashbyhq.com",
];
const SCHOOL_DOMAIN_SUFFIXES = [".edu"];
const FINANCIAL_AID_DOMAINS = [
  "bursar", "financialaid", "nelnet.com", "mohela.com", "navient.com",
  "fedloanservicing.com", "salliemae.com", "greatlakes.org",
];
const BANK_PAYMENT_DOMAINS = [
  "chase.com", "bankofamerica.com", "wellsfargo.com", "paypal.com",
  "venmo.com", "stripe.com", "square.com", "amazon.com", "doordash.com",
  "uber.com", "lyft.com", "fidelity.com", "schwab.com", "vanguard.com",
];
const NEWSLETTER_DOMAINS = ["substack.com", "beehiiv.com", "skool.com", "mailchimp.com"];
const NOTIFICATION_DOMAINS = [
  "github.com", "google.com", "accounts.google.com", "slack.com",
  "cloudflare.com", "aws.amazon.com", "linkedin.com", "twitter.com", "x.com",
];

function domainOf(address: string): string {
  return address.split("@")[1]?.toLowerCase().trim() ?? "";
}

function localPartOf(address: string): string {
  return address.split("@")[0]?.toLowerCase().trim() ?? "";
}

function matchesAny(domain: string, list: string[]): boolean {
  return list.some((d) => domain === d || domain.endsWith(`.${d}`) || domain.includes(d));
}

function isSchoolDomain(domain: string): boolean {
  return SCHOOL_DOMAIN_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

/** A display name that reads like a person, not a team/company/bot. */
function looksLikePerson(fromName: string): boolean {
  const name = fromName.trim();
  if (!name) return false;
  if (/\b(calendar|team|support|notifications?|no-?reply|careers|recruiting|hr|hiring|billing|office|department|admissions|services|updates?|digest|newsletter)\b/i.test(name)) {
    return false;
  }
  return /^[A-Za-z][A-Za-z.'-]*(\s+[A-Za-z][A-Za-z.'-]*)*$/.test(name);
}

function isNeedsReply(email: InboundEmail, preview: string): boolean {
  if (RESOLVED.test(preview) && !hasDirectRequest(preview)) return false;
  if (isAutomatedAddress(email.fromAddress)) return false;
  if (!looksLikePerson(email.fromName)) return false;
  return hasDirectRequest(email.subject) || hasDirectRequest(preview);
}

function isRecruiterJob(email: InboundEmail, text: string): boolean {
  const domain = domainOf(email.fromAddress);
  if (matchesAny(domain, JOB_BOARD_DOMAINS)) return true;
  if (/\b(recruit(?:er|ing)|talent acquisition)\b/i.test(email.fromName)) return true;
  return /\b(intern(?:ship)?|hiring|fellowship|interview|job|role|candidate|application|hiring manager)\b/i.test(
    text,
  );
}

function isSchool(email: InboundEmail, text: string): boolean {
  const domain = domainOf(email.fromAddress);
  if (!isSchoolDomain(domain)) return false;
  if (isFinancialAid(email, text)) return false;
  if (isRecruiterJob(email, text)) return false;
  return true;
}

function isFinancialAid(email: InboundEmail, text: string): boolean {
  const domain = domainOf(email.fromAddress);
  const localPart = localPartOf(email.fromAddress);
  if (matchesAny(domain, FINANCIAL_AID_DOMAINS)) return true;
  if (/bursar|financial[-_]?aid|finaid/i.test(localPart)) return true;
  return /\b(financial aid|tuition|award letter|fafsa|balance due|scholarship disbursement)\b/i.test(
    text,
  );
}

function isReceipt(email: InboundEmail, text: string): boolean {
  const domain = domainOf(email.fromAddress);
  if (!matchesAny(domain, BANK_PAYMENT_DOMAINS) && !/\b(receipt|statement|order confirm|payment received)\b/i.test(text)) {
    return false;
  }
  return /\b(statement|order confirmed|payment received|receipt|arriving|paperless)\b/i.test(text);
}

function isNewsletter(email: InboundEmail, text: string): boolean {
  const domain = domainOf(email.fromAddress);
  if (matchesAny(domain, NEWSLETTER_DOMAINS)) return true;
  return /\b(digest|weekly|roundup|this week in|unsubscribe)\b/i.test(text);
}

function isNotification(email: InboundEmail, text: string): boolean {
  const domain = domainOf(email.fromAddress);
  const automated = isAutomatedAddress(email.fromAddress) || matchesAny(domain, NOTIFICATION_DOMAINS);
  if (!automated) return false;
  if (isNewsletter(email, text)) return false;
  return /\b(run failed|build|security alert|sign-?in|verification code|reacted|third-party app|workflow)\b/i.test(
    text,
  ) || matchesAny(domain, NOTIFICATION_DOMAINS);
}

export interface ClassificationResult {
  label: Label;
  deadline: string | null;
}

/**
 * Labeling precedence (see SPEC.md §1 note on Deadline): specific categories
 * are checked first; "Deadline" only wins when a deadline cue exists but no
 * specific category claims the message. `deadline` is always extracted
 * whenever a cue is present, regardless of which label wins.
 */
export function classifyLabel(email: InboundEmail, receivedAt: Date, ownAddresses: string[] = []): ClassificationResult {
  const preview = safePreview(latestText(email.body));
  const text = `${email.subject} ${preview}`;
  const broadcast=isNewsletter(email,text) || BROADCAST.test(text) || publicationNotice(text) || marketingDiscovery(email.subject,preview);
  const self=ownAddresses.some(address=>address.toLowerCase()===email.fromAddress.trim().toLowerCase());
  const resolved=RESOLVED.test(preview) && !hasDirectRequest(preview);
  const social=matchesAny(domainOf(email.fromAddress),["linkedin.com","facebookmail.com","instagram.com","twitter.com","x.com"]);
  const deadline = !broadcast && !social && !self && !resolved && hasDeadlineCue(text) ? extractDeadline(text, receivedAt) : null;
  if (broadcast && !FINANCIAL_RISK.test(text)) return {label:isNewsletter(email,text) || /newsletter|digest|puzzle|crossword/i.test(text) ? "Newsletters" : "Spam/Promotions",deadline:null};
  if (self) return {label:"Notifications/GitHub",deadline:null};
  if (FINANCIAL_RISK.test(text)) return {label:/security alert|unrecognized|unauthorized|account (?:locked|suspended)|password (?:was )?changed|third.party app was added|recovery (?:email|phone).{0,20}changed|verify your identity/i.test(text) ? "Notifications/GitHub" : "Financial Aid",deadline};

  if (cardChange(email.subject) || cardChange(preview)) return {label:"Notifications/GitHub",deadline:null};
  if (jobPitch(text)) return {label:"Recruiter/Job",deadline:null};
  if (isNeedsReply(email, preview)) return { label: "Needs Reply", deadline };
  if (isRecruiterJob(email, text)) return { label: "Recruiter/Job", deadline };
  if (isSchool(email, text)) return { label: "School", deadline };
  if (isFinancialAid(email, text)) return { label: "Financial Aid", deadline };
  if (isReceipt(email, text)) return { label: "Receipts", deadline };
  if (isNewsletter(email, text)) return { label: "Newsletters", deadline };
  if (isNotification(email, text)) return { label: "Notifications/GitHub", deadline };
  if (deadline) return { label: "Deadline", deadline };
  return { label: "Spam/Promotions", deadline };
}
