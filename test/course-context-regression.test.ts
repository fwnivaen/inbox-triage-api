import { describe, expect, it } from 'vitest';
import { classifyEmail } from '../src/pipeline.js';
import { currentAttention } from '../src/attention.js';
import { isInboundEmail } from '../src/validation.js';
import type { InboundEmail } from '../src/types.js';

// Synthetic counterparts only: no real sender, course title, mail ID or mail text.
const now=new Date('2026-11-05T14:30:00Z');
const base:InboundEmail={id:'synthetic-course',fromAddress:'no-reply@portal.example.edu',fromName:'Course Portal',subject:'Course notice',body:'',receivedAt:'2026-11-04T18:00:00Z',hasAttachment:false};
const classify=(changes:Partial<InboundEmail>)=>classifyEmail({...base,...changes},undefined,now);

describe('upcoming course obligations',()=>{
 it.each([
  {subject:'Computer Systems bulletin: allocation quiz on Thursday',body:'Posted Wednesday, November 4, 2026. The quiz about memory allocation will take place this Thursday in the lab.'},
  {subject:'Number Theory bulletin: Exam III',body:'Posted Wednesday, November 4, 2026. Read this notice carefully. The next exam is next week in the tutorial'},
  {fromAddress:'no-reply@training.example.com',fromName:'Learning Portal',subject:'Enrollment reminder: Laboratory safety',body:'You are enrolled in the laboratory safety training for this term but have not yet completed the'},
 ])('includes a bounded assessment/training notice without inventing a due date: $subject',async changes=>{
  const r=await classify(changes);
  expect(r).toMatchObject({label:'School',route:'Actions',actionRequired:true,priority:'normal',deadline:null,meetingDate:null,suggested_reply:null});
 });

 it.each([
  'A practice quiz on Thursday is available for optional self study.',
  'Exam results will be released next week.',
  'The exam was on Thursday last term.',
  'The quiz on Thursday is canceled.',
  'No quiz next week; the laboratory will run as usual.',
  'The exam review is on Thursday.',
  'You are enrolled in laboratory safety training and have now completed the module.',
  'Explore our catalog of training courses for the next term.',
  'The course reading list is available.',
 ])('leaves informational or completed course material in Review: %s',async body=>{
  expect((await classify({body})).route).toBe('Review');
 });

 it('keeps a personal incomplete requirement even if the course vendor offers list opt-out',async()=>{
  const r=await classify({fromAddress:'no-reply@training.example.com',listUnsubscribe:true,body:'Your mandatory training is incomplete.'});
  expect(r).toMatchObject({label:'School',route:'Actions',deadline:null});
 });

 it('does not promote legacy course Review records from a summary alone',()=>{
  const r=currentAttention({id:'synthetic-legacy',label:'School',priority:'low',basePriority:'low',summary:'The quiz will take place next week.',deadline:null,suggested_reply:null,has_attachment:false,actionRequired:false,route:'Review'},base.receivedAt,now);
  expect(r.route).toBe('Review');
 });
});

describe('publication and reply evidence',()=>{
 const rhetorical={fromAddress:'alex@publication.example.com',fromName:'Alex Example',subject:'You can design it, but can you grow it?',body:'Ideas for reaching new customers. '+ '\u200c '.repeat(75)};
 const request={fromAddress:'riley@example.edu',fromName:'Riley Example',subject:'Desk schedule',body:'You said you sent a message, but it has not arrived. Could you share your preferred hours?',threadId:'synthetic-desk-thread'};
 const sentReply={id:'synthetic-outgoing',threadId:'synthetic-desk-thread',sentAt:'2026-11-04T21:00:00Z',labels:['SENT']};

 it('uses the publication header when a bounded teaser omits the unsubscribe footer',async()=>{
  expect((await classify({...rhetorical,listUnsubscribe:true}))).toMatchObject({label:'Newsletters',route:'Review',deadline:null,suggested_reply:null});
  // The wording alone cannot distinguish a newsletter from a personal request.
  expect((await classify(rhetorical)).route).toBe('Needs Reply');
  expect((await classify({...rhetorical,listUnsubscribe:true,body:'Could you share the current project brief?'})).route).toBe('Needs Reply');
 });

 it('does not relabel ordinary course service notices from the unsubscribe header alone',async()=>{
  const r=await classify({subject:'Service incident comments added',body:'Incident details: configuration and setup.',listUnsubscribe:true});
  expect(r).toMatchObject({label:'School',route:'Review'});
 });

 it('suppresses the answered request only with a verified later SENT reply in its thread',async()=>{
  expect((await classify(request)).route).toBe('Needs Reply');
  expect((await classify({...request,sentReply}))).toMatchObject({route:'Review',attentionSuppressed:true,deadline:null,suggested_reply:null});
  // A fresh incoming follow-up after that outgoing reply remains outstanding.
  expect((await classify({...request,receivedAt:'2026-11-04T22:00:00Z',sentReply})).route).toBe('Needs Reply');
 });

 it.each([
  {...sentReply,threadId:'another-thread'},
  {...sentReply,sentAt:'2026-11-04T17:00:00Z'},
  {...sentReply,sentAt:'2026-11-05T16:00:00Z'},
  {...sentReply,labels:['DRAFT']},
  {...sentReply,labels:['SENT','DRAFT']},
  {...sentReply,id:base.id},
 ])('does not close the request with unrelated, earlier, future or unconfirmed evidence: %j',async evidence=>{
  expect((await classify({...request,sentReply:evidence})).route).toBe('Needs Reply');
 });

 it('requires the incoming thread identity and never treats incoming assertions as a sent record',async()=>{
  expect((await classify({...request,threadId:undefined,sentReply})).route).toBe('Needs Reply');
  expect((await classify({...request,body:'I already replied. Could you confirm your preferred hours?'})).route).toBe('Needs Reply');
 });

 it('validates and bounds optional context, while keeping legacy input valid',()=>{
  expect(isInboundEmail(base)).toBe(true);
  expect(isInboundEmail({...base,listUnsubscribe:true,...request,sentReply})).toBe(true);
  for(const changes of [
   {listUnsubscribe:'yes'}, {threadId:'x'.repeat(201)}, {sentReply:true},
   {sentReply:{...sentReply,sentAt:'unknown'}}, {sentReply:{...sentReply,id:'bad id'}},
   {sentReply:{...sentReply,labels:Array(41).fill('SENT')}}, {sentReply:{...sentReply,labels:[123]}},
  ]) expect(isInboundEmail({...base,...changes})).toBe(false);
 });
});

describe('new sign-in access and unchanged controls',()=>{
 it('offers conditional official-site review for newly enabled sign-in access',async()=>{
  const r=await classify({fromAddress:'security@service.example.com',fromName:'Security Updates',subject:'Sign-in access enabled',body:'The Example account analyst@example.net can now sign in to your Service account. If you did not enable this, review your account settings.'});
  expect(r).toMatchObject({label:'Notifications/GitHub',route:'Actions',actionRequired:true,priority:'normal',deadline:null,suggested_reply:null,summarySource:'fallback'});
  expect(r.summary).toContain('if you did not');
  expect(r.summary).not.toMatch(/analyst@|unauthori[sz]ed|compromis|fraud|hacked/i);
 });

 it.each([
  'An Example account can now sign in to your Service account.',
  'A debit card was added to your account.',
  'Your account is overdrawn.',
 ])('does not let a publication header hide a concrete security or financial event: %s',async body=>{
  expect((await classify({fromAddress:'no-reply@service.example.com',subject:'Account update',listUnsubscribe:true,body})).route).toBe('Actions');
 });

 it.each([
  'If an Example account can now sign in to your Service account, review your settings.',
  'An Example account will soon be able to sign in to your Service account.',
  'You can sign in to your Service account using the official site.',
  'Use this one-time code to finish signing in. If you did not request it, ignore this message.',
 ])('does not invent an observed security event: %s',async body=>{
  expect((await classify({fromAddress:'no-reply@service.example.com',subject:'Account information',body})).route).toBe('Review');
 });

 it('leaves an expired scheduling cue unresolved without inferring its later outcome',async()=>{
  const r=await classify({fromAddress:'service@example.edu',fromName:'University Service Desk',subject:'Installation request',body:'As requested, I can come by today for the installation. When would be a good time?'});
  expect(r).toMatchObject({label:'School',route:'Review',deadline:'2026-11-04',actionRequired:false,meetingDate:null});
 });

 it.each([
  {fromAddress:'receipts@stripe.com',subject:'Payment receipt',body:'Payment received. Your receipt is available.'},
  {fromAddress:'no-reply@github.com',subject:'Build succeeded',body:'The workflow completed successfully.'},
  {fromAddress:'no-reply@bank.example.com',subject:'Card status confirmation',body:'Your card is disabled as requested.'},
  {fromAddress:'no-reply@bank.example.com',subject:'Dispute outcome',body:'Your dispute is resolved. No further action is required.'},
 ])('keeps a routine notice in Review: $subject',async changes=>{
  expect((await classify(changes)).route).toBe('Review');
 });
});
