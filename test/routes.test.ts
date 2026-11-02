import { expect, it } from "vitest";
import worker from "../src/index.js";
it("protects stored digests, OAuth initiation, and manual sync", async () => {
  for (const [path, method] of [["/digest/latest", "GET"], ["/oauth/start?account=work", "GET"], ["/sync", "POST"]]) {
    const response = await worker.fetch(new Request(`https://example.com${path}`, { method }), {} as Env);
    expect(response.status).toBe(401);
  }
});
