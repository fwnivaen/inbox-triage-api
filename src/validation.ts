import type { InboundEmail } from './types.js';
export const MAX_BATCH = 100;
const validId=(value:unknown):value is string=>typeof value==='string' && /^[a-zA-Z0-9:_-]{1,200}$/.test(value);
const validDate=(value:unknown):value is string=>typeof value==='string' && value.length<=40 && Number.isFinite(Date.parse(value));
export function isInboundEmail(value: unknown): value is InboundEmail {
 if(!value || typeof value!=='object') return false;
 const v=value as Record<string,unknown>;
 const limits:Record<string,number>={id:200,fromAddress:320,fromName:200,subject:1000,body:10000,receivedAt:40};
 for(const [field,max] of Object.entries(limits)) if(typeof v[field]!=='string' || (v[field] as string).length>max) return false;
 if(v.listUnsubscribe!==undefined && typeof v.listUnsubscribe!=='boolean') return false;
 if(v.threadId!==undefined && !validId(v.threadId)) return false;
 if(v.sentReply!==undefined) {
  if(!v.sentReply || typeof v.sentReply!=='object' || Array.isArray(v.sentReply)) return false;
  const reply=v.sentReply as Record<string,unknown>;
  if(!validId(reply.id)||!validId(reply.threadId)||!validDate(reply.sentAt)||!Array.isArray(reply.labels)
   ||reply.labels.length>40||reply.labels.some(label=>typeof label!=='string'||label.length>100)) return false;
 }
 return /^[a-zA-Z0-9:_-]{1,200}$/.test(v.id as string) && Number.isFinite(Date.parse(v.receivedAt as string)) && Date.parse(v.receivedAt as string) <= Date.now()+300000 && typeof v.hasAttachment==='boolean';
}
export async function readJson(request:Request):Promise<unknown> {
 if(!request.body) return null;
 const reader=request.body.getReader(); let size=0; const chunks:Uint8Array[]=[];
 try { for(;;) { const {value,done}=await reader.read(); if(done) break; size+=value.length; if(size>1_000_000) { await reader.cancel(); return null; } chunks.push(value); }
 const data=new Uint8Array(size); let offset=0; for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;} return JSON.parse(new TextDecoder().decode(data));
 } catch {return null;}
}
