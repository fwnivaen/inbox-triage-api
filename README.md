# Smart Inbox Triage API

Classifies incoming email into one of nine labels + a priority tier, drafts
a short summary (and, where useful, a reply you can review before sending),
and assembles a daily digest. Built on **Cloudflare Workers + Workers AI**,
in TypeScript.

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
  ([`src/summarize.ts`](./src/summarize.ts)), via `@cf/meta/llama-3.1-8b-instruct`.
  It only ever sees the redacted ~500-character preview, never the full body.
  If no `AI` binding is available (e.g. local dev without a Cloudflare
  account, or a model call fails), it falls back to a deterministic
  heuristic summary/reply so the API still works end-to-end.
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

### Agent-fed mode (primary usage)

`/classify` and `/digest` are the primary way this API is used in practice:
an assistant with its own mail access (reading sir's real inboxes) POSTs
batches of mail here to get them classified and digested, instead of this
Worker pulling mail itself. Both routes require a bearer token — the Worker
secret `DIGEST_API_KEY` — so only an authorized caller can feed it real mail.

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
The separate 7:30 AM Eastern assistant automation handles chat delivery.

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
prints counts only. Add `--show-digest` for delivery to the owner. Never put the
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

`GET /digest/latest` prefers the strongly consistent connected-app digest over
the optional native Gmail cron's KV result. The native cron therefore cannot
overwrite connected-app results. This repo does not install an assistant
schedule: the Gmail owner must configure and test the existing morning automation
with this contract. Advance a last-success checkpoint **only after** all pages
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
Quoted history does not supply new requests/deadlines. Broadcast questions and
promotional expiry do not become personal reply tasks; financial/security
warnings and concrete support requests remain visible as Actions. An approval
without a new request does not require a reply. Configured inbox identities
suppress incoming self-mail from personal reply routing.

Acceptance refinements distinguish subscriber editions/introductory trial expiry
from actual requests and deadlines. A question mark in a subject alone is not a
reply request; explicit requests still work with single-name senders such as a
professor. Flattened `Earlier message:` quoted history is ignored. Routine sign-in
codes with hypothetical security footers are suppressed, while observed new-sign-in
security alerts remain actionable. Replacement-card activation is an explicit
account action. Fabricated acceptance regressions cover each case plus positive
security and document-deadline counterexamples.
