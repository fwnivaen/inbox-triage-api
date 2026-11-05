# Smart Inbox Triage API

Classifies incoming email into one of nine labels + a priority tier, drafts
a short summary (and, where useful, a reply you can review before sending),
and assembles a daily digest. Built in TypeScript on **Cloudflare Workers**,
with optional Workers AI summaries.

Full behavior spec — labels, priority rules, output shape, digest format,
and privacy rules — lives in [`SPEC.md`](./SPEC.md). This README covers how
to run, test, and deploy the implementation.

## How it works

- **Labeling & priority are deterministic, not AI.** [`src/classifier.ts`](./src/classifier.ts)
  and [`src/priority.ts`](./src/priority.ts) match sender domain/address,
  subject keywords, and a short preview of the body against the rules in
  SPEC.md §1–2. This keeps classification fast, free, and fully testable
  without any model calls.
- **Workers AI is used only for `summary` and `suggested_reply`**
  ([`src/summarize.ts`](./src/summarize.ts)), via `@cf/meta/llama-3.1-8b-instruct-fp8`.
  JSON object mode with an explicit schema constrains generation; the raw binding
  response is decoded as JSON and must contain an informative redacted summary.
  It only ever sees the redacted ~500-character preview, never the full body.
  If no `AI` binding is available (e.g. local dev without a Cloudflare
  account), a model call fails, or its response is unusable, it falls back
  to a deterministic heuristic summary/reply. `/classify` reports the actual
  summary path through `summarySource`; HTTP 200 alone does not prove AI use.
- **Privacy rules** ([`src/privacy.ts`](./src/privacy.ts)) redact OTPs,
  tokens, SSNs, and account/card numbers before anything is classified,
  summarized, or returned, and ensure full email addresses never appear in
  output — only first names already visible in the sender display name.

## Project layout

```
src/
  types.ts        InboundEmail / ClassifiedEmail shapes
  classifier.ts    Label rules (SPEC.md §1)
  deadline.ts      Date/deadline extraction used by both classifier & priority
  priority.ts      Priority rules (SPEC.md §2)
  privacy.ts       Redaction + "safe preview" helpers (SPEC.md §5)
  summarize.ts     Workers AI summary/reply, with heuristic fallback
  digest.ts        Daily digest formatting (SPEC.md §4)
  pipeline.ts      Wires the above into classifyEmail / buildDailyDigest
  multiAccountDigest.ts  Combined digest across Gmail accounts, tagged by inbox
  scheduled.ts     Daily cron entry point — syncs every connected Gmail account
  gmail/
    accounts.ts    Known account keys (work/personal/school) + the one scope used
    oauth.ts       Consent URL, code exchange, refresh — enforces gmail.readonly only
    tokenStore.ts  Per-account refresh tokens + OAuth state nonces (Workers KV)
    client.ts      Gmail API calls — metadata only, never a full message body
    retention.ts   90-day-TTL classification metadata + latest digest (Workers KV)
  index.ts         Worker entry point (HTTP routes)
test/              Vitest unit + end-to-end tests (fabricated fixtures only)
```

## Running locally

```bash
npm install
npm test          # unit + end-to-end tests, no network/AI calls needed
npm run typecheck
npm run dev        # wrangler dev — requires `npx wrangler login` once,
                   # since Workers AI has no local simulator and always
                   # proxies to your Cloudflare account
```

## API

### Stateless classification mode

`/classify` and `/digest` classify a batch without persisting it. Production
connected Gmail intake uses `/ingest` and `/digest/latest` below. An assistant
with mail access can POST batches to either mode. All private routes require
the Worker secret `DIGEST_API_KEY` as a bearer token.

```bash
curl -s https://inbox-triage-api.inbox-triage-api.workers.dev/digest \
  -H "Authorization: Bearer <DIGEST_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '[{
    "id": "1",
    "fromAddress": "someone@example.com",
    "fromName": "Someone",
    "subject": "Can we reschedule?",
    "body": "Would Thursday work instead?",
    "receivedAt": "2026-11-02T12:00:00Z",
    "hasAttachment": false
  }]'
```

A request with a missing or wrong token gets `401 Unauthorized` before the
body is even read — nothing from an unauthorized POST is parsed, classified,
or logged.

### `POST /classify` *(requires bearer token)*
Body: a single `InboundEmail` object, or an array of them.
Returns the matching `ClassifiedEmail` (or array) per SPEC.md §3.

### `POST /digest` *(requires bearer token)*
Body: an array of `InboundEmail`.
Returns `{ digest: string, emails: ClassifiedEmail[] }` — `digest` is the
formatted daily digest text (SPEC.md §4); `emails` is every classified item
(including Newsletters, which are labeled but excluded from `digest` itself).

### `GET /health`
Returns `{ ok: true }`. No token required.

### `POST /sync` *(requires bearer token)*

Runs the same Gmail sync as cron immediately and returns the stored digest and
per-account results. Inspect every account status before treating a run as complete.

### Gmail OAuth mode (optional)

The Worker can also pull mail itself via Gmail's read-only API, instead of
being fed by an agent. This is fully built but optional — leave the Google
OAuth secrets unset to run in agent-fed mode only.

### `GET /oauth/start?account=work|personal|school` *(requires bearer token)*
Redirects to Google's consent screen for that Gmail account, requesting only
`https://www.googleapis.com/auth/gmail.readonly`.

### `GET /oauth/callback`
Google redirects here after consent. Exchanges the code for tokens, refuses
and discards anything granting more than read-only Gmail, and stores the
refresh token for that account (Workers KV, never the repo).

### `GET /digest/latest` *(requires bearer token)*
Returns the most recent scheduled or manual Gmail sync digest, including per-account
`accounts` status (`ok`, `failed`, or `not_connected`) and processed counts,
plus which Gmail accounts have stored tokens. A stored token does not prove
that an account synced successfully. Agent-fed `/digest` results are not persisted:
`{ generatedAt, text, connectedAccounts }`.

```ts
interface InboundEmail {
  id: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  body: string;
  receivedAt: string; // ISO 8601
  hasAttachment: boolean;
}
```

## Sample digest

Generated by `npm test` against the fixtures in `test/fixtures.ts` (all
names/companies fabricated, as required by SPEC.md's anonymization note):

```
URGENT
[Needs Reply] Can you confirm a time this week for the interview?
[Financial Aid] We're missing a verification document for your file.
[Notifications/GitHub] We noticed a new sign-in to your account from an unrecognized device.

NORMAL
[Financial Aid] Your Spring award letter is ready to view in the student portal.
[Needs Reply] Can you reply and let me know how things are going so far this term?
[Deadline] This is the final notice — please RSVP by Nov 13 for the info session. — 2026-11-13
[Needs Reply] Following up — could you send over your availability for next Tuesday?
[Recruiter/Job] We'd like to schedule an interview for the Operations Student Worker role.
[School] Just a note that I'm canceling Monday's reading assignment for the seminar.
[Deadline] This is a reminder that your monthly installment is due by the 5th of this month. — 2026-11-05

LOW
[Receipts] Thanks for riding with us.
[Spam/Promotions] Your one-time verification code is ready.
[Notifications/GitHub] The nightly build workflow failed on main.
[Receipts] Your monthly brokerage statement is available to view online.
[Recruiter/Job] A new Data & Analytics Consultant role just opened at a mid-size firm.
[Spam/Promotions] Don't miss our exclusive 50% off sale on just-launched devices, today only!
```

(Run `npm run sample-digest` to regenerate this from `test/fixtures.ts`.)

(Newsletters are classified but intentionally omitted from the digest, per spec.)

## Deploying

Sir's Cloudflare account (`fwnivaen@gmail.com`) is connected. One-time setup
per machine:

```bash
npx wrangler login     # opens the browser for a one-click OAuth approval
npx wrangler deploy
```

A Worker secret protects agent-fed mode:

```bash
openssl rand -hex 32 | npx wrangler secret put DIGEST_API_KEY
```

Save the same value locally (outside the repo) for whatever calls `/digest`
or `/classify`, e.g. `~/.config/inbox-triage/key` with `chmod 600`. `/health`
needs no token; `/classify` and `/digest` reject every request with `401`
until `DIGEST_API_KEY` is set — there's no "open" fallback mode.

`/classify` and `/digest` are otherwise stateless. The Gmail integration (optional) adds:

- A `Workers KV` namespace (`INBOX_KV`) holding per-account refresh tokens,
  OAuth state nonces, 90-day-TTL classification metadata, and the latest
  combined digest — see SPEC.md §5 and [`src/gmail/retention.ts`](./src/gmail/retention.ts).
- A daily cron trigger (`[triggers]` in `wrangler.toml`) that runs
  [`src/scheduled.ts`](./src/scheduled.ts) once a day, syncing every Gmail
  account that has completed consent.
- Two Worker secrets — `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — for
  the Google OAuth client, set via `wrangler secret put` and never committed:

  ```bash
  npx wrangler secret put GOOGLE_CLIENT_ID
  npx wrangler secret put GOOGLE_CLIENT_SECRET
  ```

  These come from a Google Cloud OAuth 2.0 Client (Gmail API enabled),
  configured with redirect URI
  `https://inbox-triage-api.inbox-triage-api.workers.dev/oauth/callback`
  and scope `https://www.googleapis.com/auth/gmail.readonly` only. Creating
  that client is an account-level decision (app branding, verification
  status) made by whoever owns the Google Cloud project, not by this repo.
- Once secrets are set, connect each inbox once by visiting
  `/oauth/start?account=work` (then `personal`, then `school`) and
  completing Google's consent screen.

## Privacy

- No real email addresses, names, or message content are committed to this
  repo — all test fixtures are fabricated.
- No secrets, API keys, Cloudflare account IDs, or OAuth tokens are
  committed; `wrangler deploy` reads account/auth state from the local
  `wrangler login` session, and Gmail refresh tokens live only in Workers KV.
- Mail POSTed to `/classify` or `/digest` in agent-fed mode is never
  persisted and never logged — the Worker logs only a count of classified
  emails, not their bodies, subjects, or addresses.
- Gmail messages are fetched in `metadata` format (headers + snippet only)
  — the full message body is never requested or stored (SPEC.md §5).
- Classification metadata and the latest digest auto-expire from KV after
  90 days via `expirationTtl`; no manual cleanup job is needed.

## Direct Gmail integration readiness (November 2, 2026)

The deployed Worker requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`GMAIL_ACCOUNT_EMAILS` in addition to `DIGEST_API_KEY`. Set the identity mapping
as a secret JSON object with keys `work`, `personal`, and `school` and their
expected email addresses. The callback checks Gmail's authenticated profile
before storing a refresh token; selecting a different inbox fails closed.
Never commit this mapping or credentials.

Enable Gmail API in the Google Cloud project, register the callback URI above,
and configure consent/test-user access for all three accounts (school policy
may require an NYU administrator). Each account must complete read-only consent.
Use an authenticated request to `/oauth/start?account=...` to get its redirect;
never place the API key in a URL. Only then run authenticated `POST /sync` and
verify three `ok` account results plus a real redacted digest. Cron is currently
13:00 UTC daily (8 AM Eastern standard time / 9 AM Eastern daylight time), and
stores results for authenticated retrieval; it does not deliver email or chat.
Assistant chat delivery is configured separately from the Worker cron.

OAuth state lives in eventually consistent Workers KV; it is not an atomic
replay lock. Avoid concurrent callback retries. Large inboxes may exceed Worker
execution or AI quotas; account failures are reported explicitly and can be
retried via `/sync`. Message-level checkpoints and automatic delivery are not
implemented in this Worker.

## Connected Gmail production intake

`POST /ingest` is the durable, authenticated incremental intake. Existing Gmail
connections remain in the assistant's approved account storage; no new Google
client is required for this mode. The assistant must pull each inbox read-only,
follow **every** message-list page, and fetch each **message ID** separately
(thread IDs are not message IDs). Send batches of at most 100 messages / 1 MB:

```json
{"emails":[{"account":"work","id":"fabricated-message-id","fromAddress":"sam@example.com","fromName":"Sam Example","subject":"Please reply","body":"Can you confirm the appointment?","receivedAt":"2026-11-03T01:00:00Z","hasAttachment":false}],"accounts":{"work":{"status":"partial","count":1},"personal":{"status":"failed","count":0},"school":{"status":"ok","count":0}}}
```

Use `partial` while paging or when reads fail; use `ok` only after all pages and
message reads succeed, including a confirmed empty inbox (`count: 0`). Counts
are the caller's cumulative successfully read messages for that pull. Include
all three accounts in the final coverage report. Omitted accounts retain their
previous status and `checkedAt`; `missingAccounts` explicitly lists omissions.
Coverage is evidence from the caller, not independently verified by the Worker.

Run `python3 scripts/ingest.py` with JSON on stdin. The client reads the designated
key file, sets a non-default User-Agent, retries transient HTTP failures, and
prints counts only. Add `--show-digest` for delivery to the owner. Its importable
`request('/digest/latest', include_cache_control=True)` returns
`(status, body, cache_control)` so delivery can verify the private response's
`no-store` header; ordinary callers still receive `(status, body)`. Never put the
key in command arguments or commit real input files. On November 2 the default
Python urllib User-Agent received Cloudflare **1010 / HTTP 403** even for public
health; the same request with `InboxTriage/1.0` succeeds. This is an edge client
filter, not evidence of a bad bearer key.

A SQLite-backed Durable Object atomically retains one redacted classification
per `(account, message ID)` for 90 days. Retries, replays, and concurrent requests
cannot duplicate stored entries; distinct replies and inboxes remain distinct.
The first accepted classification wins. Duplicate processing can consume AI
work but cannot duplicate persistence. Only redacted summaries/metadata are
stored, never original sender, subject or body. Daily storage alarms remove
expired records. The rolling digest includes the latest 24 hours and suppresses
routine newsletters, receipts, notifications and promotions unless actionable
by deadline or meeting. Needs Reply, Meetings Today and Deadlines are tagged;
meetings are detected from explicit `today` language, not a calendar integration.
Suggested replies are drafts only; no email mutation occurs.

Intake can also pass `listUnsubscribe: true` when the actual List-Unsubscribe
header is present. This disambiguates a subject-only rhetorical reply cue when
the bounded teaser omits its publication footer; a fresh personal request in the
preview or a concrete course obligation still takes precedence. Ordinary service
notices do not become newsletters from this header alone. The optional native
Gmail metadata reader preserves the boolean and `threadId` too.

An answered reply task needs separate verified outgoing evidence. When the
intake owner has checked a reply in the **same account and thread** and confirmed
it answers this request, it can pass the incoming `threadId` and
`sentReply: {"id":"synthetic-sent-id","threadId":"synthetic-thread-id","sentAt":"2026-11-04T21:00:00Z","labels":["SENT"]}`.
The reply must have a different message ID, the same thread ID, the SENT label,
and a timestamp later than the request and no later than evaluation time.
Earlier, future, draft or unrelated evidence cannot close the task. A later
incoming request reopens it. Incoming prose claiming a reply is insufficient.
Without this context the classifier continues to flag an explicit unanswered
request. The Worker does not search sent mail itself, and a SENT item is never
ingested as received mail for this check. Only the resulting suppression flag
is stored; the evidence and original headers remain transient.

`GET /digest/latest` prefers the strongly consistent connected-app digest over
the optional native Gmail cron's KV result. The native cron therefore cannot
overwrite connected-app results. This repo does not install an assistant
schedule. The assistant's 8:00 AM Eastern report uses this contract. As of
November 3, 2026, a separate 7:30 AM Email digest is still enabled and must
be consolidated to avoid duplicate morning reports. Advance a last-success
checkpoint **only after** all pages
are fetched and every batch is acknowledged; on partial/failure retain it and
retry with a 24-hour overlap. Deduplication makes this safe. Report failures and
stale `checkedAt` values in delivery, never silently treat them as empty inboxes.

External Gmail calls have 10-second attempt timeouts and at most one retry for
network/429/5xx failures. AI has an 8-second deadline and deterministic redacted
fallback. Input strings, dates, message identifiers and batch sizes are bounded.
All errors returned/logged are generic; original upstream bodies are omitted.

If an outgoing message was accidentally ingested, authenticated
`POST /ingest/exclude` accepts `{"messages":[{"account":"work","id":"message-id"}]}`.
It suppresses that derived record from the saved digest and future replays,
then rebuilds the digest atomically. It never deletes or changes Gmail mail.
The intake owner must filter SENT/DRAFT messages before ingestion; exclusion
is a correction for an incorrectly scoped pull, not sender inference by AI.

### Current-time attention contract

Saved digest retrieval re-renders metadata as of the request's current time; it
never trusts the cached text. `renderedAt` is the evaluation time. `generatedAt`
and each account's `checkedAt` remain the last ingestion/coverage acknowledgement,
so retrieval cannot make an idle or failed account appear freshly checked.
Records older than 24 hours are omitted. Meetings carry a safe resolved calendar
date in Eastern time, and are shown as Meetings Today only on that date. Active
(deadline today or later) deadlines gain urgency against the current clock;
past-date deadlines stop routing as Deadlines. Independent reply/account actions
may remain actionable. Concrete Actions include incomplete applications, missing
documents, failed payments and account-security steps. Routine school updates,
job ads and other Review items are not attention items. Newsletters/promotions
are suppressed even when their text contains a promotional deadline.

Upcoming quiz/exam announcements and explicit personal enrollment with incomplete
training also count as Actions. Practice material, results, canceled/past exams,
completed training and general course notices remain Review. These rules do not
turn publication dates, a weekday or “next week” into a due date. Newly enabled
account sign-in access receives conditional official-site security review; it
does not establish unauthorized access. An expired scheduling cue does not
establish whether the underlying request was answered or resolved.

Only safe booleans/date facts and baseline priority are added to stored metadata;
original text remains transient. Legacy metadata is conservatively interpreted
from its redacted summary until a replay upgrades safe temporal facts (the
original classification summary and message identity remain unchanged). Explicit
meeting dates/today/tomorrow are supported; vague meeting language requires review
outside the attention digest, not an invented appointment date.

Storage scans use pages of 128 records, capped at 512 pages and 5,000 current
attention items. Capacity exhaustion returns a generic failure rather than a
silently incomplete digest; callers must retain checkpoints and alert. This
keeps allocations bounded as 90-day retention grows. Private responses include
`Cache-Control: no-store` on ingestion, correction and retrieval paths.

### Correcting previously classified messages

For a specific suspected omission, authenticated `POST /ingest/inspect` accepts
`{"messages":[{"account":"work","id":"message-id"}]}` (1–100 references,
below 1 MB). It reads only those existing account/message keys and returns the
stored receipt time, safe classification/attention flags, exclusion status,
and current selection reason (`included`, `review`, `newsletter`, `excluded`,
`outside-window`, or `missing`). It returns no summary, reply or original mail
content and changes no storage, coverage or checkpoints. Use it to distinguish
a classification defect from natural rolling-window expiry before repairing.

`POST /ingest/repair` requires the same bearer credential as ingestion. Supply
`{"emails": [InboundEmail + {"account":"work|personal|school"}]}` with at most
100 items and a JSON request below 1 MB. Use each original Gmail **message ID**
and original `receivedAt`; send only the redacted bounded metadata used for
classification. Do not use thread IDs. Every ID and arrival time must match an
existing stored record or the whole batch returns 409 without writes.

This explicit repair replaces derived classification, summary and attention facts;
it inserts no mail, advances no intake cursor, and preserves coverage counts,
coverage timestamps and the original digest `generatedAt`. Exclusions remain in
force. `repaired` and `repairedAt` report repair activity. `/digest/latest` renders
these stored repairs immediately against the current Eastern date and rolling
24-hour window. Ordinary `/ingest` replay remains first-write-wins. Repair does
not change Gmail labels or send replies. Old records cannot be reliably rebuilt
from their summaries alone: the authorized ingestion owner must supply the
original redacted metadata for the IDs needing correction.

`/classify` outputs `summarySource: "ai" | "fallback"`; this describes summary
generation only. Labels, deadlines, priorities and routes remain deterministic.
The saved `/digest/latest` text does not expose per-message summary provenance;
its HTTP status, `source: "connected-app"`, and fresh `renderedAt` are not
evidence that AI generated summaries. Email's November 2–3 real-mail quality
check recorded 136 summary outputs, all reporting `fallback`. A fabricated live
`/classify` check on November 3 initially also returned `fallback`. The summarizer
now uses the catalog-supported FP8 variant, JSON object mode/schema, and raw
binding response decoding instead of relying on text-only postprocessing.
A fresh fabricated, stateless deployed `/classify` on November 3 returned
`summarySource: "ai"` with an informative summary in 3.64 seconds. This verifies
the Worker path; direct model inference alone does not. No stored records were
repaired for this check. Fallback diagnostics contain only fixed enums and numeric
status/provider-code fields, never prompts, provider error text or email content.
Real Gmail metadata and stored routing were checked separately, but a genuinely
empty source inbox and a live provider outage remain unobserved; those paths
have synthetic/local tests.
Quoted history does not supply new requests/deadlines. Broadcast questions and
promotional expiry do not become personal reply tasks; financial/security
warnings and concrete support requests remain visible as Actions. An approval
without a new request does not require a reply. Configured inbox identities
suppress incoming self-mail from personal reply routing.

Completed payment/credit/debit-card additions to the recipient's account or
wallet follow the same conditional Actions handling as linked/unlinked cards:
normal priority, an official-app/site security-review suggestion if the recipient
did not make the change, and no reply draft or asserted fraud. Marketing calls to
add a card, possible/future additions, hypothetical footers and cart/catalog
additions do not establish an observed account change.

Acceptance refinements distinguish subscriber editions/introductory trial expiry
from actual requests and deadlines. A question mark in a subject alone is not a
reply request; explicit requests still work with single-name senders such as a
professor. Flattened `Earlier message:` quoted history is ignored. Routine sign-in
codes with hypothetical security footers are suppressed, while observed new-sign-in
security alerts remain actionable. Replacement-card activation is an explicit
account action. Fabricated acceptance regressions cover each case plus positive
security and document-deadline counterexamples.

Email acceptance also covers person-display publications with browser-view
footers, free-drink/exclusive-offer expiry, resolved approvals followed by a
courtesy questions invitation, routine one-time authentication codes, explicit
card activation, and human interview time requests. Courtesy invitations do not
cancel a resolution; an explicit new request does. OTP notices stay in Review,
while observed security changes and financial warnings remain Actions, even
when authentication-code language is also present.

Question marks alone do not create reply tasks. Reply detection requires an
explicit request or a question directed to the recipient; undirected editorial
questions stay in Review. Browser-view boilerplate and truncated courtesy
endings are removed before that decision. Numeric/common named HTML entities
in previews are decoded before privacy filtering. Explicit new requests after
an approval remain reply tasks. Card context plus "activate it" is an action;
a bare activation pronoun without card context is insufficient. These rules
require no new fields or raw mail headers in the ingestion contract.

Promotional sender mailboxes (offers, deals, marketing, promotions and news) are treated
as automated for reply detection. Concrete banking/security and card activation
actions remain eligible for Actions. Card activation accepts described product
names ending in "card", with bounded context after "your"/"the" plus an explicit
"activate it" request; no payment brand exception is used.

Product-discovery questions such as "Have you seen our new ...?" are promotional
when the preview contains no explicit personal request. This decision does not
rely on a retailer name, local part, or marketing subdomain. A real new request
in the preview takes precedence; banking/security and activation actions retain
their separate action checks. No new ingestion fields or raw headers are needed.

Human interview invitations, indirect requests to confirm scheduling preferences,
and short personal questions about forwarded material remain eligible for reply
attention. Forwarded history cannot introduce a new request or deadline.
Registration-guide review requests and outstanding-balance notices are Actions;
registration opening dates are not submission deadlines. Optional free guest-pass
expiry is promotional. Observed payment-method additions and third-party
application additions receive conditional account-security guidance without a
reply draft or an assertion of compromise. These rules use source facts and
wording patterns, never private identities or sender-name exceptions.
