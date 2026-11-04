import { expect,it,vi } from 'vitest';
import worker from '../src/index.js';
import { ingest,IngestionStore,excludeMessages,repairMessages,inspectMessages } from '../src/ingestion.js';
import { fakeKv } from './fakeKv.js';
const email={id:'message-1',account:'work',fromAddress:'sam@example.com',fromName:'Sam Example',subject:'Please reply',body:'Can you confirm a meeting today?',receivedAt:new Date().toISOString(),hasAttachment:false};
function setup(){
 const data=new Map<string,unknown>();
 const storage={setAlarm:async()=>{},get:async(k:string)=>data.get(k),put:async(k:string,v:unknown)=>{data.set(k,v);},delete:async(k:string)=>data.delete(k),list:async(options:{startAfter?:string;limit?:number})=>new Map([...data].filter(([k])=>k.startsWith('message:') && (!options.startAfter || k>options.startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,options.limit ?? Infinity)),transaction:async(fn:(s:unknown)=>unknown)=>fn(storage)};
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

it('renders idle latest as-of now without refreshing coverage, and pages historical metadata',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-03T03:30:00Z'));
 try {
 const {env,data}=setup();
 for(let i=0;i<150;i++) data.set(`message:work:old-${String(i).padStart(3,'0')}`,{email:{...email,id:`old-${i}`,account:'work',label:'Needs Reply',route:'Needs Reply',priority:'normal',summary:'Please confirm your availability.',deadline:null,suggested_reply:null,has_attachment:false},receivedAt:'2026-10-30T00:00:00Z'});
 const mail={...email,id:'fresh',receivedAt:'2026-11-03T03:00:00Z'};
 const first=await (await ingest({emails:[mail],accounts:{work:{status:'ok',count:1}}},env)).json() as any;
 expect(first.text).toContain('work');
 vi.setSystemTime(new Date('2026-11-04T04:00:00Z'));
 const latest=await (await env.INGESTION.get(env.INGESTION.idFromName('consolidated')).fetch('https://internal/latest')).json() as any;
 expect(latest.text).toBe('');expect(latest.accounts.work.checkedAt).toBe(first.accounts.work.checkedAt);expect(latest.generatedAt).toBe(first.generatedAt);expect(latest.renderedAt).not.toBe(first.renderedAt);
 } finally {vi.useRealTimers();}
});

it('repairs existing derived facts atomically without reingestion, coverage advance or resurrection',async()=>{
 const {env,data}=setup();
 const first=await (await ingest({emails:[email],accounts:{work:{status:'ok',count:1}}},env)).json() as any;
 const fixed=await repairMessages({emails:[{...email,subject:'Weekly digest',body:'Newsletter unsubscribe.'}]},env);
 expect(fixed.status).toBe(200);
 const r=await fixed.json() as any;expect(r.repaired).toBe(1);expect(r.text).toBe('');expect(r.accounts).toEqual(first.accounts);expect(r.generatedAt).toBe(first.generatedAt);
 expect([...data.keys()].filter(k=>k.startsWith('message:'))).toHaveLength(1);
 const replay=await (await ingest({emails:[email],accounts:{}},env)).json() as any;expect(replay.error).toBeDefined();
 const missing=await repairMessages({emails:[{...email,id:'missing'}]},env);expect(missing.status).toBe(409);
 expect([...data.keys()].filter(k=>k.startsWith('message:'))).toHaveLength(1);
 expect((await repairMessages({emails:[{...email,receivedAt:'2020-01-01T00:00:00Z'}]},env)).status).toBe(409);
 await excludeMessages({messages:[{account:'work',id:email.id}]},env);
 const excluded=await (await repairMessages({emails:[email]},env)).json() as any;expect(excluded.text).toBe('');
});

it('inspects exact account/message facts without mail text, storage writes or coverage changes',async()=>{
 const {env,data}=setup();
 await ingest({emails:[email],accounts:{work:{status:'ok',count:1}}},env);
 const before=JSON.stringify([...data]);
 const request=new Request('https://example.com/ingest/inspect',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({messages:[{account:'work',id:email.id},{account:'personal',id:email.id},{account:'work',id:email.id}]})});
 const response=await worker.fetch(request,env);
 expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');
 const result=await response.json() as any;
 expect(result.messages).toHaveLength(2);
 expect(result.messages[0]).toMatchObject({account:'work',id:email.id,found:true,excluded:false,receivedAt:email.receivedAt,withinWindow:true,selection:'included',label:'Needs Reply'});
 expect(result.messages[1]).toMatchObject({account:'personal',id:email.id,found:false,selection:'missing'});
 expect(JSON.stringify(result)).not.toMatch(/"summary":|suggested_reply|sam@example|Can you confirm/);
 expect(JSON.stringify([...data])).toBe(before);
 expect((await worker.fetch(new Request('https://example.com/ingest/inspect',{method:'POST'}),env)).status).toBe(401);
 for(const messages of [[],Array(101).fill({account:'work',id:'x'}),[{account:'other',id:'x'}],[{account:'work',id:'bad id'}]]) expect((await inspectMessages({messages},env)).status).toBe(400);
 await excludeMessages({messages:[{account:'work',id:email.id}]},env);
 const excluded=await (await inspectMessages({messages:[{account:'work',id:email.id}]},env)).json() as any;
 expect(excluded.messages[0].selection).toBe('excluded');
});

it('keeps first-write replay stable and repairs omission facts without changing identity, receipts or coverage',async()=>{
 const {env,data}=setup();
 const cases=[
  {...email,id:'fabricated-interview',subject:'Interview invitation',body:'We would like to invite you to a group interview.',label:'Recruiter/Job'},
  {...email,id:'fabricated-forward',subject:'Fwd: Statement',body:'What about this amount?',label:'Spam/Promotions'},
  {...email,id:'fabricated-hours',subject:'Office hours',body:'I would like to confirm what hours you prefer.',label:'School'},
  {...email,id:'fabricated-registration',subject:'Registration guide',body:'Please read the registration guide. Registration opens November 18, 2026.',label:'School'},
  {...email,id:'fabricated-pass',subject:'Your free 5 day guest pass expires in 5 days',body:'An optional club offer.',label:'Deadline'},
 ];
 const accounts={work:{status:'ok',count:5,checkedAt:'2026-11-04T12:00:00Z'},personal:{status:'partial',count:2,checkedAt:'2026-11-04T11:00:00Z'}};
 data.set('coverage',accounts);data.set('latest',{source:'connected-app',accounts,generatedAt:'2026-11-04T12:00:00Z'});
 for(const c of cases) data.set(`message:work:${c.id}`,{receivedAt:c.receivedAt,email:{id:c.id,account:'work',label:c.label,priority:'low',basePriority:'low',route:'Review',actionRequired:false,summary:'A saved informational update.',deadline:null,suggested_reply:null,has_attachment:false}});
 const original=JSON.stringify(cases.map(c=>data.get(`message:work:${c.id}`)));
 const replay=await (await ingest({emails:cases,accounts:{work:{status:'partial',count:5}}},env)).json() as any;
 expect(replay.inserted).toBe(0);expect(replay.duplicates).toBe(5);
 expect(JSON.stringify(cases.map(c=>data.get(`message:work:${c.id}`)))).toBe(original);
 const latestBefore=data.get('latest') as any;
 const repaired=await (await repairMessages({emails:cases},env)).json() as any;
 expect(repaired.repaired).toBe(5);expect(repaired.accounts).toEqual(latestBefore.accounts);expect(repaired.generatedAt).toBe(latestBefore.generatedAt);
 expect((repaired.text.match(/\[Needs Reply\]/g)||[])).toHaveLength(6); // route and label on three lines
 expect(repaired.text).toContain('[Actions]');expect(repaired.text).not.toContain('guest pass');
 const inspected=await (await inspectMessages({messages:cases.map(c=>({account:'work',id:c.id}))},env)).json() as any;
 expect(inspected.messages.map((m:any)=>m.receivedAt)).toEqual(cases.map(c=>c.receivedAt));
 expect(inspected.messages.filter((m:any)=>m.selection==='included')).toHaveLength(4);
 const beforeRejected=JSON.stringify([...data]);
 expect((await repairMessages({emails:[{...cases[0],body:'Please upload the form.'},{...cases[1],id:'unknown-fabricated'}]},env)).status).toBe(409);
 expect(JSON.stringify([...data])).toBe(beforeRejected);
});
