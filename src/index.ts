import { buildDigest } from "./digest.js";
import { classifyBatch, classifyEmail } from "./pipeline.js";
import type { Env, InboundEmail } from "./types.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isInboundEmail(value: unknown): value is InboundEmail {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.fromAddress === "string" &&
    typeof v.fromName === "string" &&
    typeof v.subject === "string" &&
    typeof v.body === "string" &&
    typeof v.receivedAt === "string" &&
    typeof v.hasAttachment === "boolean"
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true });
    }

    if (url.pathname === "/classify" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (isInboundEmail(body)) {
        return json(await classifyEmail(body, env));
      }
      if (Array.isArray(body) && body.every(isInboundEmail)) {
        return json(await classifyBatch(body, env));
      }
      return json({ error: "Expected an InboundEmail or InboundEmail[] body." }, 400);
    }

    if (url.pathname === "/digest" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!Array.isArray(body) || !body.every(isInboundEmail)) {
        return json({ error: "Expected an InboundEmail[] body." }, 400);
      }
      const classified = await classifyBatch(body, env);
      return json({ digest: buildDigest(classified), emails: classified });
    }

    return json({ error: "Not found" }, 404);
  },
};
