export { IngestionStore } from "./ingestion.js";
import { ingest, excludeMessages, repairMessages, inspectMessages } from "./ingestion.js";
import { isInboundEmail, MAX_BATCH, readJson } from "./validation.js";
import { isAuthorized } from "./auth.js";
import { buildDigest } from "./digest.js";
import { GMAIL_ACCOUNTS, isGmailAccountKey } from "./gmail/accounts.js";
import { buildConsentUrl, completeOAuthCallback } from "./gmail/oauth.js";
import { getLatestDigest } from "./gmail/retention.js";
import { getConnectedAccounts } from "./gmail/tokenStore.js";
import { classifyBatch, classifyEmail } from "./pipeline.js";
import { runDailySync } from "./scheduled.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handle(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/ingest/inspect" && request.method === "POST") {
    if (!isAuthorized(request, env)) return json({error:"Unauthorized"},401);
    return inspectMessages(await readJson(request),env);
  }
  if (url.pathname === "/ingest/repair" && request.method === "POST") {
    if (!isAuthorized(request, env)) return json({error:"Unauthorized"},401);
    return repairMessages(await readJson(request),env);
  }
  if (url.pathname === "/ingest/exclude" && request.method === "POST") {
    if (!isAuthorized(request, env)) return json({error:"Unauthorized"},401);
    return excludeMessages(await readJson(request),env);
  }
  if (url.pathname === "/ingest" && request.method === "POST") {
    if (!isAuthorized(request, env)) return json({error:"Unauthorized"},401);
    return ingest(await readJson(request),env);
  }
  if (url.pathname === "/health") {
    return json({ ok: true });
  }

  if (url.pathname === "/classify" && request.method === "POST") {
    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }
    const body = await readJson(request);
    if (isInboundEmail(body)) {
      return json(await classifyEmail(body, env));
    }
    if (Array.isArray(body) && body.length <= MAX_BATCH && body.every(isInboundEmail)) {
      return json(await classifyBatch(body, env));
    }
    return json({ error: "Expected an InboundEmail or InboundEmail[] body." }, 400);
  }

  if (url.pathname === "/digest" && request.method === "POST") {
    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }
    const body = await readJson(request);
    if (!Array.isArray(body) || body.length > MAX_BATCH || !body.every(isInboundEmail)) {
      return json({ error: "Expected an InboundEmail[] body." }, 400);
    }
    const classified = await classifyBatch(body, env);
    console.log(JSON.stringify({ message: "digest built", count: classified.length }));
    return json({ digest: buildDigest(classified), emails: classified });
  }

  if (url.pathname === "/oauth/start" && request.method === "GET") {
    if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, 401);
    const account = url.searchParams.get("account") ?? "";
    if (!isGmailAccountKey(account)) {
      return json({ error: `account must be one of: ${GMAIL_ACCOUNTS.join(", ")}` }, 400);
    }
    const consentUrl = await buildConsentUrl(env, account);
    return Response.redirect(consentUrl, 302);
  }

  if (url.pathname === "/oauth/callback" && request.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return json({ error: "Missing code or state." }, 400);
    }
    // Reported directly (not just the generic 500 below) since the only
    // caller is sir's own browser finishing a consent click, and the
    // failure reasons here (bad/expired state, unexpected scope, no
    // refresh token returned) are all things he needs to see to retry.
    try {
      const { account } = await completeOAuthCallback(env, code, state);
      return json({ ok: true, account, message: `${account} inbox connected (read-only).` });
    } catch (error) {
      console.error(JSON.stringify({ message: "oauth callback failed", error: "Operation failed" }));
      return json({ ok: false, error: "Operation failed" }, 400);
    }
  }

  if (url.pathname === "/digest/latest" && request.method === "GET") {
    if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, 401);
    const [stored, connected] = await Promise.all([getLatestDigest(env), getConnectedAccounts(env, GMAIL_ACCOUNTS)]);
    const ingested = env.INGESTION ? await (await env.INGESTION.get(env.INGESTION.idFromName("consolidated")).fetch("https://internal/latest")).json() : null;
    const digest = ingested ?? stored;
    if (!digest) {
      return json({ digest: null, connectedAccounts: connected, message: "No digest has run yet." });
    }
    return json({ ...digest, connectedAccounts: connected });
  }

  if (url.pathname === "/sync" && request.method === "POST") {
    if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, 401);
    await runDailySync(env);
    return json(await getLatestDigest(env));
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);


    try {
      return await handle(request, env, url);
    } catch (error) {
      console.error(JSON.stringify({ message: "unhandled error", error: "Operation failed" }));
      return json({ error: "Internal server error" }, 500);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    console.log(JSON.stringify({ message: "daily gmail sync starting" }));
    await runDailySync(env);
    console.log(JSON.stringify({ message: "daily gmail sync complete" }));
  },
} satisfies ExportedHandler<Env>;
