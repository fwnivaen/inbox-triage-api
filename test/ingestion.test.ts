import { expect,it } from 'vitest';
import worker from '../src/index.js';
import { ingest,IngestionStore,excludeMessages } from '../src/ingestion.js';
import { fakeKv } from './fakeKv.js';
const email={id:'message-1',account:'work',fromAddress:'sam@example.com',fromName:'Sam Example',subject:'Please reply',body:'Can you confirm a meeting today?',receivedAt:new Date().toISOString(),hasAttachment:false};
function setup(){
 const data=new Map<string,unknown>();
 const storage={setAlarm:async()=>{},get:async(k:string)=>data.get(k),put:async(k:string,v:unknown)=>{data.set(k,v);},delete:async(k:string)=>data.delete(k),list:async()=>new Map([...data].filter(([k])=>k.startsWith('message:'))),transaction:async(fn:(s:unknown)=>unknown)=>fn(storage)};
 const store=new IngestionStore({storage} as unknown as DurableObjectState);
 const env={DIGEST_API_KEY:'test',INBOX_KV:fakeKv(),INGESTION:{idFromName:()=>'',get:()=>({fetch:(url:string,init:RequestInit)=>store.fetch(new Request(url,init))})}} as unknown as Env;
 return {env,data};
}
it('authenticates ingestion and rejects malformed/oversized requests',async()=>{
 expect((await worker.fetch(new Request('https://example.com/ingest',{method:'POST'}),{} as Env)).status).toBe(401);
 const {env}=setup();for(const payload of [{emails:[{...email,receivedAt:'bad'}],accounts:{work:{status:'ok',count:1}}},{emails:Array(101).fill(email),accounts:{}},{emails:[email],accounts:{}}]) expect((await ingest(payload,env)).status).toBe(400);
});
it('persists unique message identities across replays and retains different replies and inboxes',async()=>{
 const {env,data}=setup();const accounts={work:{status:'ok',count:2},personal:{status:'failed',count:0},school:{status:'ok',count:0}};
 const first=await (await ingest({emails:[email,email,{...email,id:'message-2'}],accounts},env)).json() as any;
 expect(first.inserted).toBe(2);expect(first.batchDuplicates).toBe(1);expect(first.accounts.personal.status).toBe('failed');expect(first.accounts.school).toMatchObject({status:'ok',count:0});
 const replay=await (await ingest({emails:[email],accounts:{work:{status:'partial',count:1}}},env)).json() as any;
 expect(replay.inserted).toBe(0);expect(replay.duplicates).toBe(1);expect(replay.accounts.personal.status).toBe('failed');
 const other=await (await ingest({emails:[{...email,account:'personal'}],accounts:{personal:{status:'ok',count:1}}},env)).json() as any;
 expect(other.inserted).toBe(1);expect([...data.keys()].filter(k=>k.startsWith('message:'))).toHaveLength(3);
 expect(JSON.stringify([...data.values()])).not.toContain('sam@example.com');
});
it('records all-empty coverage without implying failure',async()=>{const {env}=setup();const r=await (await ingest({emails:[],accounts:{work:{status:'ok',count:0},personal:{status:'failed',count:0},school:{status:'partial',count:0}}},env)).json() as any;expect(r.text).toBe('');expect(r.accounts.work.status).toBe('ok');expect(r.accounts.personal.status).toBe('failed');});

it('suppresses outgoing records from digest and future replays without Gmail mutation',async()=>{
 const {env}=setup();const accounts={work:{status:'ok',count:1}};
 const first=await (await ingest({emails:[email],accounts},env)).json() as any;expect(first.text).toContain('work');
 const suppressed=await (await excludeMessages({messages:[{account:'work',id:email.id}]},env)).json() as any;
 expect(suppressed.excluded).toBe(1);expect(suppressed.text).toBe('');
 const replay=await (await ingest({emails:[email],accounts},env)).json() as any;expect(replay.inserted).toBe(0);expect(replay.text).toBe('');
 expect((await excludeMessages({messages:[{account:'other',id:'x'}]},env)).status).toBe(400);
});
