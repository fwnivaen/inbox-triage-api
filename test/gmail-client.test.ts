import { afterEach, describe, expect, it, vi } from "vitest";
import { getMessageAsInboundEmail, listRecentMessageIds, parseFromHeader } from "../src/gmail/client.js";

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

it('preserves publication and thread context from metadata without fetching body or replies',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({id:'synthetic-list',threadId:'synthetic-thread',internalDate:'1793815200000',snippet:'A bounded teaser.',payload:{headers:[{name:'From',value:'Alex Example <alex@example.com>'},{name:'Subject',value:'Publication question'},{name:'List-Unsubscribe',value:'<https://example.com/opt-out>'}]}})));
 vi.stubGlobal('fetch',fetcher);
 const result=await getMessageAsInboundEmail('synthetic-token','work','synthetic-list');
 expect(result).toMatchObject({id:'work:synthetic-list',threadId:'synthetic-thread',listUnsubscribe:true,body:'A bounded teaser.'});
 const url=new URL(fetcher.mock.calls[0][0]);
 expect(url.searchParams.get('format')).toBe('metadata');
 expect(url.searchParams.getAll('metadataHeaders')).toContain('List-Unsubscribe');
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(result).not.toHaveProperty('sentReply');
 expect(JSON.stringify(result)).not.toContain('https://example.com/opt-out');
});
