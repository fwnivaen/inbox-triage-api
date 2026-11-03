import { GMAIL_ACCOUNTS, isGmailAccountKey, type GmailAccountKey } from './gmail/accounts.js';
import { classifyEmail } from './pipeline.js';
import { buildMultiAccountDigest, type AccountClassifiedEmail } from './multiAccountDigest.js';
import { isInboundEmail, MAX_BATCH } from './validation.js';
export interface Coverage { status:'ok'|'failed'|'partial'; count:number; checkedAt?:string; }
interface Entry { email:AccountClassifiedEmail; receivedAt:string; }
/** Single durable object serializes storage updates. Message IDs, never thread IDs, key records. */
export class IngestionStore {
 constructor(private state:DurableObjectState) {}
 async alarm():Promise<void> {
  const all=await this.state.storage.list<Entry>({prefix:"message:"});
  for(const [key,entry] of all) if(Date.parse(entry.receivedAt)<Date.now()-90*86400000) await this.state.storage.delete(key);
  const latest=await this.state.storage.get<{generatedAt:string}>("latest");
  if(latest && Date.parse(latest.generatedAt)<Date.now()-90*86400000) await this.state.storage.delete("latest");
  await this.state.storage.setAlarm(Date.now()+86400000);
 }
 async fetch(request:Request):Promise<Response> {
  if(request.method === "GET") return Response.json(await this.state.storage.get("latest") ?? null);
  const input=await request.json() as {entries:Entry[];accounts:Partial<Record<GmailAccountKey,Coverage>>};
  await this.state.storage.setAlarm(Date.now()+86400000);
  const result=await this.state.storage.transaction(async storage=>{
   let inserted=0;
   for(const entry of input.entries) {
    const key=`message:${entry.email.account}:${entry.email.id}`;
    if(!await storage.get(key)) {await storage.put(key,entry);inserted++;}
   }
   const all=await storage.list<Entry>({prefix:'message:'});
   const cutoff=Date.now()-24*60*60*1000;
   const entries:AccountClassifiedEmail[]=[];
   for(const [key,entry] of all) {
    if(Date.parse(entry.receivedAt)<Date.now()-90*86400000) await storage.delete(key);
    else if(Date.parse(entry.receivedAt)>=cutoff) entries.push(entry.email);
   }
   const previous=await storage.get<Partial<Record<GmailAccountKey,Coverage>>>('coverage') ?? {};
   const accounts={...previous};
   for(const [account,coverage] of Object.entries(input.accounts)) accounts[account as GmailAccountKey]={...coverage,checkedAt:new Date().toISOString()};
   const result={generatedAt:new Date().toISOString(),source:'connected-app',text:buildMultiAccountDigest(entries.filter(e => (e.route === "Meetings Today" || e.deadline !== null) || !["Newsletters","Receipts","Spam/Promotions","Notifications/GitHub"].includes(e.label))),accounts,inserted,duplicates:input.entries.length-inserted,windowHours:24};
   await storage.put('coverage',accounts);await storage.put('latest',result);return result;
  });
  return Response.json(result);
 }
}
export async function ingest(body:unknown,env:Env):Promise<Response> {
 if(!body || typeof body!=='object') return Response.json({error:'Invalid ingestion batch'}, {status:400});
 const {emails,accounts}=body as {emails:unknown;accounts:unknown};
 if(!Array.isArray(emails)||emails.length>MAX_BATCH||!accounts||typeof accounts!=='object'||Array.isArray(accounts)) return Response.json({error:'Expected emails (maximum 100) and account coverage'}, {status:400});
 for(const [key,value] of Object.entries(accounts)) {
  const c=value as Coverage;
  if(!isGmailAccountKey(key)||!c||!['ok','failed','partial'].includes(c.status)||!Number.isInteger(c.count)||c.count<0) return Response.json({error:'Invalid account coverage'}, {status:400});
 }
 if(emails.some(e=>!isInboundEmail(e)||!isGmailAccountKey((e as unknown as {account:string}).account)||!Object.prototype.hasOwnProperty.call(accounts,(e as unknown as {account:string}).account))) return Response.json({error:'Invalid message or missing account coverage'}, {status:400});
 const unique=new Map(emails.map(e=>[`${e.account}:${e.id}`,e]));
 const messages=[...unique.values()];
 const entries:Entry[]=[];
 for(let i=0;i<messages.length;i+=4) entries.push(...await Promise.all(messages.slice(i,i+4).map(async email=>({email:{...await classifyEmail(email,env),account:email.account},receivedAt:email.receivedAt}))));
 const store=env.INGESTION.get(env.INGESTION.idFromName('consolidated'));
 const response=await store.fetch('https://internal/ingest',{method:'POST',body:JSON.stringify({entries,accounts})});
 const result=await response.json() as Record<string,unknown>;

 return Response.json({...result,batchDuplicates:emails.length-unique.size,missingAccounts:GMAIL_ACCOUNTS.filter(a=>!Object.prototype.hasOwnProperty.call(accounts,a))});
}
