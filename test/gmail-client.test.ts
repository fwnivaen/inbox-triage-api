import { afterEach, describe, expect, it, vi } from "vitest";
import { listRecentMessageIds, parseFromHeader } from "../src/gmail/client.js";

describe("parseFromHeader", () => {
  it("splits a display name and address", () => {
    expect(parseFromHeader('"Jordan Ellis" <jordan@example.com>')).toEqual({
      name: "Jordan Ellis",
      address: "jordan@example.com",
    });
  });

  it("splits a display name without surrounding quotes", () => {
    expect(parseFromHeader("Jordan Ellis <jordan@example.com>")).toEqual({
      name: "Jordan Ellis",
      address: "jordan@example.com",
    });
  });

  it("falls back to the bare address when there's no display name", () => {
    expect(parseFromHeader("no-reply@example.com")).toEqual({ name: "", address: "no-reply@example.com" });
  });
});

afterEach(() => vi.unstubAllGlobals());
it("fetches subsequent Gmail pages instead of truncating the digest", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "1" }], nextPageToken: "next" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "2" }] })));
  vi.stubGlobal("fetch", fetcher);
  expect(await listRecentMessageIds("token")).toEqual(["1", "2"]);
  expect(fetcher.mock.calls[1][0]).toContain("pageToken=next");
});
