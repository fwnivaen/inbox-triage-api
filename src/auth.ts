/**
 * Bearer-token guard for the endpoints that accept sir's real mail
 * (/classify, /digest). Fails closed: if DIGEST_API_KEY isn't configured as
 * a Worker secret yet, every request is rejected rather than allowed through.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isAuthorized(request: Request, env: Env): boolean {
  if (!env.DIGEST_API_KEY) return false;
  const header = request.headers.get("authorization") ?? "";
  const parts = header.split(" ");
  if (parts.length !== 2) return false;
  const [scheme, token] = parts;
  if (scheme !== "Bearer" || !token) return false;
  return timingSafeEqual(token, env.DIGEST_API_KEY);
}
