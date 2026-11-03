import { currentAttention } from "./attention.js";
import { GMAIL_ACCOUNTS, isGmailAccountKey, type GmailAccountKey } from './gmail/accounts.js';
import { classifyEmail } from './pipeline.js';
import { buildMultiAccountDigest, type AccountClassifiedEmail } from './multiAccountDigest.js';
import { isInboundEmail, MAX_BATCH } from './validation.js';
export interface Coverage { status:'ok'|'failed'|'partial'; count:number; checkedAt?:string; }
interface Entry { email:AccountClassifiedEmail; receivedAt:string; }
const privateJson=(value:unknown,status=200)=>Response.json(value,{status,headers:{"cache-control":"no-store"}});
type Storage = DurableObjectStorage | DurableObjectTransaction;
/** Page storage to bound each allocation; fail explicitly rather than truncate large stores. */
async function* pages(storage:Storage) {
 let startAfter:string|undefined;
 for(let page=0;page<512;page++) {
  const records=await storage.list<Entry>({prefix:'message:',limit:128,...(startAfter ? {startAfter} : {})});
  yield records;
  if(records.size<128) return;
  startAfter=[...records.keys()][records.size-1];
 }
 throw new Error('Storage scan capacity exceeded');
}
async function render(storage:Storage,now:Date) {
 const entries:AccountClassifiedEmail[]=[];
 for await(const records of pages(storage)) for(const entry of records.values()) {
  if(Date.parse(entry.receivedAt)<now.getTime()-86400000 || await storage.get(`excluded:${entry.email.account}:${entry.email.id}`)) continue;
  const current={...currentAttention(entry.email,entry.receivedAt,now),account:entry.email.account};
  if(current.route!=='Review') entries.push(current);
  if(entries.length>5000) throw new Error('Digest capacity exceeded');
 }
 return buildMultiAccountDigest(entries);
}
/** Serialized transactions make replay and concurrent persistence atomic. GET renders as-of now. */
export class IngestionStore {
 constructor(private state:DurableObjectState) {}
 async alarm():Promise<void> {
  for await(const records of pages(this.state.storage)) for(const [key,entry] of records) if(Date.parse(entry.receivedAt)<Date.now()-90*86400000) await this.state.storage.delete(key);
  const latest=await this.state.storage.get<{generatedAt:string}>("latest");
  if(latest && Date.parse(latest.generatedAt)<Date.now()-90*86400000) await this.state.storage.delete("latest");
  await this.state.storage.setAlarm(Date.now()+86400000);
 }
 async fetch(request:Request):Promise<Response> {
  if(request.method === "GET") {
   const result=await this.state.storage.transaction(async storage=>{
    const latest=await storage.get<Record<string,unknown>>('latest');
    if(!latest) return null;
    const now=new Date();
    return {...latest,text:await render(storage,now),renderedAt:now.toISOString()};
   });
   return privateJson(result);
  }
  const input=await request.json() as {entries:Entry[];accounts:Partial<Record<GmailAccountKey,Coverage>>;exclude?:{account:GmailAccountKey;id:string}[]};
  if(new URL(request.url).pathname==='/repair') {
   const result=await this.state.storage.transaction(async storage=>{
    for(const entry of input.entries) {
     const existing=await storage.get<Entry>(`message:${entry.email.account}:${entry.email.id}`);
     if(!existing || Date.parse(existing.receivedAt)!==Date.parse(entry.receivedAt)) return {error:"Repair requires existing message IDs and original receivedAt",status:409};
    }
    for(const entry of input.entries) {
     const key=`message:${entry.email.account}:${entry.email.id}`;
     const existing=await storage.get<Entry>(key);
     await storage.put(key,{...entry,receivedAt:existing!.receivedAt});
    }
    const latest=await storage.get<Record<string,unknown>>('latest') ?? {};
    const result={...latest,repaired:input.entries.length,repairedAt:new Date().toISOString(),text:await render(storage,new Date())};
    await storage.put('latest',result);return result;
   });
   return privateJson(result,'status' in result ? 409 : 200);
  }
  await this.state.storage.setAlarm(Date.now()+86400000);
  const result=await this.state.storage.transaction(async storage=>{
   let inserted=0;
   for(const message of input.exclude ?? []) await storage.put(`excluded:${message.account}:${message.id}`,true);
   for(const entry of input.entries) {
    const key=`message:${entry.email.account}:${entry.email.id}`;
    if(await storage.get(`excluded:${entry.email.account}:${entry.email.id}`)) continue;
    const existing=await storage.get<Entry>(key);
    if(!existing) {await storage.put(key,entry);inserted++;}
    else if(existing.email.actionRequired===undefined && entry.email.actionRequired!==undefined) {
     // One-time upgrade of safe temporal facts; preserve the original summary and identity.
     await storage.put(key,{...existing,email:{...existing.email,meetingDate:entry.email.meetingDate,actionRequired:entry.email.actionRequired,basePriority:entry.email.basePriority}});
    }
   }
   const previous=await storage.get<Partial<Record<GmailAccountKey,Coverage>>>('coverage') ?? {};
   const accounts={...previous};
   const now=new Date();
   for(const [account,coverage] of Object.entries(input.accounts)) accounts[account as GmailAccountKey]={...coverage,checkedAt:now.toISOString()};
   const result={generatedAt:now.toISOString(),renderedAt:now.toISOString(),source:'connected-app',text:await render(storage,now),accounts,inserted,duplicates:input.entries.length-inserted,windowHours:24,excluded:input.exclude?.length ?? 0};
   await storage.put('coverage',accounts);await storage.put('latest',result);return result;
  });
  return privateJson(result);
 }
}
export async function ingest(body:unknown,env:Env):Promise<Response> {
 if(!body || typeof body!=='object') return privateJson({error:'Invalid ingestion batch'},400);
 const {emails,accounts}=body as {emails:unknown;accounts:unknown};
 if(!Array.isArray(emails)||emails.length>MAX_BATCH||!accounts||typeof accounts!=='object'||Array.isArray(accounts)) return privateJson({error:'Expected emails (maximum 100) and account coverage'},400);
 for(const [key,value] of Object.entries(accounts)) {
  const c=value as Coverage;
  if(!isGmailAccountKey(key)||!c||!['ok','failed','partial'].includes(c.status)||!Number.isInteger(c.count)||c.count<0) return privateJson({error:'Invalid account coverage'},400);
 }
 if(emails.some(e=>!isInboundEmail(e)||!isGmailAccountKey((e as unknown as {account:string}).account)||!Object.prototype.hasOwnProperty.call(accounts,(e as unknown as {account:string}).account))) return privateJson({error:'Invalid message or missing account coverage'},400);
 const unique=new Map(emails.map(e=>[`${e.account}:${e.id}`,e]));
 const messages=[...unique.values()];
 const entries:Entry[]=[];
 for(let i=0;i<messages.length;i+=4) entries.push(...await Promise.all(messages.slice(i,i+4).map(async email=>({email:{...await classifyEmail(email,env),account:email.account},receivedAt:email.receivedAt}))));
 const store=env.INGESTION.get(env.INGESTION.idFromName('consolidated'));
 const response=await store.fetch('https://internal/ingest',{method:'POST',body:JSON.stringify({entries,accounts})});
 const result=await response.json() as Record<string,unknown>;

 return privateJson({...result,batchDuplicates:emails.length-unique.size,missingAccounts:GMAIL_ACCOUNTS.filter(a=>!Object.prototype.hasOwnProperty.call(accounts,a))});
}

/** Reversible suppression of wrongly ingested outgoing metadata; never mutates Gmail. */
export async function excludeMessages(body:unknown,env:Env):Promise<Response> {
 const messages=(body as {messages?:unknown})?.messages;
 if(!Array.isArray(messages)||messages.length>MAX_BATCH||messages.some(m=>!m||!isGmailAccountKey(m.account)||typeof m.id!=="string"||!/^[a-zA-Z0-9:_-]{1,200}$/.test(m.id))) return privateJson({error:"Invalid exclusion list"},400);
 return env.INGESTION.get(env.INGESTION.idFromName("consolidated")).fetch("https://internal/exclude",{method:"POST",body:JSON.stringify({entries:[],accounts:{},exclude:messages})});
}

/** Explicit existing-only repair. Does not advance intake coverage or insert messages. */
export async function repairMessages(body:unknown,env:Env):Promise<Response> {
 const emails=(body as {emails?:unknown})?.emails;
 if(!Array.isArray(emails)||!emails.length||emails.length>MAX_BATCH||emails.some(e=>!isInboundEmail(e)||!isGmailAccountKey((e as unknown as {account:string}).account))) return privateJson({error:"Invalid repair batch"},400);
 const unique=[...new Map(emails.map(e=>[`${e.account}:${e.id}`,e])).values()];
 const entries:Entry[]=[];
 for(let i=0;i<unique.length;i+=4) entries.push(...await Promise.all(unique.slice(i,i+4).map(async email=>({email:{...await classifyEmail(email,env),account:email.account},receivedAt:email.receivedAt}))));
 return env.INGESTION.get(env.INGESTION.idFromName('consolidated')).fetch('https://internal/repair',{method:'POST',body:JSON.stringify({entries,accounts:{}})});
}
