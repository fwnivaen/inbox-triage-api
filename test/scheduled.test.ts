import { describe, expect, it, vi } from "vitest";
import { runDailySync } from "../src/scheduled.js";
import { getLatestDigest } from "../src/gmail/retention.js";
import { fakeKv } from "./fakeKv.js";

function envWithKv(): Env {
  return { INBOX_KV: fakeKv() } as unknown as Env;
}

describe("runDailySync", () => {
  it("skips every account silently when none has a stored refresh token, and saves an empty digest", async () => {
    const env = envWithKv();

    const digest = await runDailySync(env);

    expect(digest).toBe("");
    const stored = await getLatestDigest(env);
    expect(stored?.text).toBe("");
    expect(stored?.accounts).toEqual({ work: { status: "not_connected", count: 0 }, personal: { status: "not_connected", count: 0 }, school: { status: "not_connected", count: 0 } });
  });
});

it('isolates failed message reads and reports partial coverage',async()=>{
 const env={INBOX_KV:fakeKv(),GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test'} as unknown as Env;
 await env.INBOX_KV.put('gmail:refresh-token:work','fabricated-token');
 const fetch=vi.fn(async (url:string)=> {
  if(url.includes('oauth2.googleapis.com')) return Response.json({access_token:'test',scope:'https://www.googleapis.com/auth/gmail.readonly'});
  if(url.includes('/messages?')) return Response.json({messages:[{id:'bad'},{id:'good'}]});
  if(url.includes('/messages/bad')) return new Response('',{status:404});
  return Response.json({id:'good',internalDate:String(Date.now()),snippet:'Please confirm your appointment.',payload:{headers:[{name:'From',value:'Sam Example <sam@example.com>'},{name:'Subject',value:'Please reply'}]}});
 });
 vi.stubGlobal('fetch',fetch);
 try {await runDailySync(env);const latest=await getLatestDigest(env);expect(latest?.accounts?.work).toEqual({status:'partial',count:1});expect(latest?.accounts?.personal.status).toBe('not_connected');} finally {vi.unstubAllGlobals();}
});
