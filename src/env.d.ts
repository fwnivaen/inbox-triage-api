// Secrets set via `wrangler secret put` (never in wrangler.toml or source).
// `wrangler types` can only see declared bindings, not secrets, so they're
// declared here and merged into the global `Env` interface it generates in
// worker-configuration.d.ts.
interface Env {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  DIGEST_API_KEY?: string;
}
