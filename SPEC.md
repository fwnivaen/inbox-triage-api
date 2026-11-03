# Smart Inbox Triage API — Spec

Built on Cloudflare Workers, with optional Workers AI summaries and a deterministic fallback. Processes mail across three inboxes (school, work, personal) and classifies each incoming message into one label + one priority, with a structured summary and, where useful, a suggested reply. Also assembles a daily digest.

Examples below are anonymized (fabricated names, companies, and amounts) — no real addresses or personal content.

## 1. Labels and rules

Rules are evaluated top to bottom; the first label that matches wins. Match on sender domain/address, subject keywords, and a short classification pass over the first ~500 characters of body text (never the full body — see Privacy).

### Needs Reply
A real human (not a bot/no-reply/notifications address) is waiting on a response, or the message is a direct question/request addressed to the user.
- Rule: sender is a person (display name maps to an individual, not a company/team), AND body contains a question, request, or "Re:"/"RE:" thread continuation, AND sender is not a notifications/no-reply/noreply/support/newsletter address.
- Overrides Newsletters/Spam if both patterns weakly match; a direct personal reply-thread always wins.
- Examples:
  - "Re: Wellbeing Ally Interview Invitation" — advisor asking to confirm a time
  - "RE: Project kickoff — need your availability" — coworker asking for a date
  - "Correction: Data Engineering Intern Email" — recruiter correcting earlier info, awaiting ack
  - "Quick question about the shared doc" — classmate asking for input
  - "Re: Midterm Progress Check-In" — professor asking student to respond

### Deadline
Message states or implies a due date, cutoff, or expiring window tied to an action the user must take.
- Rule: body/subject contains a date, "due", "by [day/date]", "last day", "deadline", "expires", "closes", or a countdown ("today", "tomorrow", "this week") tied to an action item (submit, pay, RSVP, apply, renew).
- Can co-occur with Needs Reply or Recruiter/Job — Deadline takes priority for date extraction, but the label itself is whichever category the content is primarily about (a job with a deadline is still Recruiter/Job, with `deadline` field populated).
- Examples:
  - "Last day to submit for this month's challenge"
  - "HW 5 due Friday — submission window closes at 11:59pm"
  - "Housing: Monthly installment due by the 5th"
  - "Final notice: RSVP by Nov 13 for the info session"
  - "Application closes in 48 hours"

### Recruiter/Job
Outreach or updates about internships, jobs, fellowships, or career-platform activity.
- Rule: sender domain is a job board/ATS (e.g. handshake, greenhouse, lever, workday, indeed, lensa-style boards) OR subject/body mentions a role title + company + "interview"/"hiring"/"opportunity"/"fellowship"/"internship", OR sender is a recruiter/talent-acquisition address.
- Examples:
  - "New Data & Analytics Consultant role at a mid-size firm — apply now"
  - "A hiring manager wants to connect with you"
  - "Set up your account to continue your application"
  - "Interview invitation — Operations Student Worker"
  - "Thank you for applying — next steps inside"

### School
Coursework, class logistics, advising, or campus-department mail not tied to money.
- Rule: sender domain is the school's domain (e.g. `.edu`) AND is from faculty, a department, or a course system (LMS/Gradescope-style), AND is not about financial aid or a job/recruiting platform.
- Examples:
  - "Missed classes and in-class work — please see me"
  - "[Course] canceling Monday's reading"
  - "Successfully submitted to HW 5"
  - "Student Services Case submission confirmation"
  - "Math Colloquium Series this Thursday"

### Financial Aid
Anything about tuition, aid, scholarships, billing from a school, or loan servicers.
- Rule: sender is the school's financial aid/bursar office OR a loan servicer, OR subject/body contains "financial aid", "tuition", "award letter", "FAFSA", "balance due" from an educational institution.
- Examples:
  - "Re: Office of Financial Aid — missing document"
  - "Your Spring award letter is ready to view"
  - "Tuition balance reminder"
  - "FAFSA verification requested"
  - "Scholarship disbursement confirmation"

### Receipts
Confirmation of a completed transaction, statement, or payment — informational, no action needed.
- Rule: sender is a bank, brokerage, payment processor, or merchant, AND subject/body indicates a completed order, statement, or payment (not a bill still owed).
- Examples:
  - "Your monthly brokerage statement is available"
  - "Your paperless statement is ready"
  - "Order confirmed — arriving Thursday"
  - "Payment received — thank you"
  - "Your ride receipt from last night"

### Newsletters
Recurring editorial/community content the user opted into; no personal action implied.
- Rule: sender is a digest/newsletter platform (beehiiv, substack, Skool-style community digest, campus-life bulletin) OR subject contains "digest", "weekly", "roundup", OR unsubscribe footer is the dominant content with no personal ask.
- Examples:
  - "Weekly digest — Nov 1 2026"
  - "83 new jobs this week — don't miss these"
  - "This week in markets: what to watch"
  - "The Transfer Times — November issue"
  - "4 new features to try this week"

### Notifications/GitHub
Automated system/service alerts: security, account, CI/CD, platform activity.
- Rule: sender is a no-reply/notifications address from a known platform (GitHub, Google, cloud/CI providers, social platforms) AND content is a system-generated status, not a newsletter.
- Examples:
  - "[repo] Run failed: nightly build — main"
  - "Security alert: new sign-in to your account"
  - "A third-party app was added to your account"
  - "Your one-time verification code"
  - "Someone reacted to your post"

### Spam/Promotions
Unsolicited marketing, cold outreach with no relevance, or low-trust senders.
- Rule: everything else — pure marketing blasts, discount codes, cold network-invite spam, survey/points schemes, and anything failing every rule above with no personal relevance.
- Examples:
  - "50% off just-launched devices — exclusive offer"
  - "Standout styles for every look, starting at $4.99"
  - "You have an invitation to connect"
  - "Earn 50 points & unlock more surveys"
  - "Give a friend a free month"

## 2. Priority levels

- **Urgent**: Deadline within 48 hours of receipt; a human directly waiting on a reply tied to money, an interview, or a school requirement (financial aid, enrollment, grading); any security alert about an unrecognized sign-in or account change.
- **Normal**: Needs Reply or Deadline further than 48 hours out; Recruiter/Job with a concrete next step (interview scheduled, application started); School messages about grades, assignments, or advising; Financial Aid informational updates; Receipts that need review (unexpected charge, failed payment).
- **Low**: Receipts that are routine confirmations; Notifications/GitHub that are informational (not security); Recruiter/Job that's a cold lead with no deadline; everything in Newsletters and Spam/Promotions.

Deadline and security-related signals can promote a message one tier; nothing demotes below Low except Newsletters/Spam, which are always Low.

## 3. Per-email output

```json
{
  "label": "Needs Reply | Deadline | Recruiter/Job | School | Financial Aid | Receipts | Newsletters | Notifications/GitHub | Spam/Promotions",
  "priority": "urgent | normal | low",
  "summary": "one sentence, plain language, no sender PII beyond first name if already visible in the preview",
  "deadline": "YYYY-MM-DD or null",
  "suggested_reply": "2-4 sentence draft, only present when label is Needs Reply or Deadline and a reply is expected; otherwise null"
}
```

Rules for `suggested_reply`: match the tone of the thread (formal for faculty/financial aid, concise for recruiters), never invent facts not in the message, never commit to a date/amount on the user's behalf — phrase as a draft the user still reviews before sending.

## 4. Daily digest format (for sir)

- Sent once per day, grouped into three sections in this order: **Urgent**, **Normal**, **Low**.
- Within each section, sort shortest summary first.
- Newsletters are excluded entirely from the digest (they're still labeled/stored for search, just never surfaced here).
- Each line: `[label] one-line summary — deadline (if any)`.
- Section with zero items is omitted rather than shown empty.
- Digest itself contains no sender email addresses — first name or company name only, pulled from what was already visible in the subject/preview.

Example shape:
```
URGENT
[Financial Aid] Missing verification doc, due tomorrow — 2026-11-03
[Needs Reply] Advisor needs interview time by EOD — 2026-11-02

NORMAL
[School] Midterm progress check-in reply requested
[Recruiter/Job] Interview scheduled for Thursday, confirm attendance

LOW
[Receipts] Monthly brokerage statement posted
[Notifications/GitHub] Nightly build failed on main
```

## 5. Privacy rules

- Never persist full email bodies. Only store: label, priority, one-line summary, deadline, suggested reply, and the minimum metadata needed for dedup (message ID, timestamp, label).
- Never log or store attachment contents or filenames beyond a boolean `has_attachment`.
- Never store the sender's or recipient's full email address in any log, digest, or long-term record — first name / company name (as already shown in subject/preview) only. Full addresses may be held in memory for the duration of a single classification request and must not be written to disk or logs.
- Never store OAuth tokens, verification codes, one-time passcodes, or any credential-looking string encountered in a message body — detect and redact before summarization.
- Never include financial account numbers, balances with account identifiers, or government ID numbers in any stored summary — redact to a generic placeholder (e.g. "balance due" instead of an amount tied to an account number) if such detail appears in the original.
- Summaries and digests must be safe to display on an unlocked device at a glance — no sensitive health, legal, or financial detail beyond what's needed to act.
- Retention: processed metadata (label/priority/summary/deadline) auto-expires after 90 days; nothing else is retained past the single classification request.
