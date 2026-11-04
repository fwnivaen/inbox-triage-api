import { expect, it } from 'vitest';
import { classifyEmail } from '../src/pipeline.js';
import { latestText } from '../src/signals.js';

// Fabricated counterparts: no private identities, IDs, amounts or mail text.
const base={id:'fabricated-omission',fromAddress:'morgan@example.edu',fromName:'Morgan Example',subject:'Update',body:'',receivedAt:'2026-11-03T18:00:00Z',hasAttachment:false};
const now=new Date('2026-11-04T14:00:00Z');
const classify=(changes:Partial<typeof base>)=>classifyEmail({...base,...changes},undefined,now);

it('keeps human interview invitations and indirect schedule requests visible without invented dates',async()=>{
 for(const changes of [
  {subject:'Assistant interview invitation',body:'We would like to invite you to a remote group interview for the library assistant position.'},
  {subject:'Office schedule preferences',body:'I wanted to get to know what your preferred work hours are for the next term.'},
  {subject:'Work-hour preferences',body:'I would like to see what office hours you would prefer for the coming term'},
  {subject:'Work-hour preferences',body:'I would like to confirm what work hours you would prefer for the coming term'},
 ]) {
  const r=await classify(changes);
  expect(r.label).toBe('Needs Reply');expect(r.route).toBe('Needs Reply');
  expect(r.deadline).toBeNull();expect(r.meetingDate).toBeNull();
 }
 const information=await classify({subject:'Schedule information',body:'I wanted to let you know what your assigned hours are. No reply needed.'});
 expect(information.route).toBe('Review');
 const approval=await classify({subject:'Re: Please reply by tomorrow',body:'Your request has been approved. Let me know if you have any questions.'});
 expect(approval.route).toBe('Review');expect(approval.deadline).toBeNull();
 const advert=await classify({fromAddress:'offers@example.com',subject:'Interview invitation',body:'We invite you to an interview workshop. Subscribe to our newsletter.'});
 expect(advert.route).toBe('Review');
});

it('recognizes a personal question about forwarded material without importing its quoted requests',async()=>{
 const forwarded=await classify({subject:'Fwd: Account notice',body:'What about this charge? ---------- Forwarded message --------- Please pay by November 8, 2026.'});
 expect(forwarded.label).toBe('Needs Reply');expect(forwarded.deadline).toBeNull();
 expect(latestText('For reference. ---------- Forwarded message --------- Can you reply by tomorrow?')).toBe('For reference. ');
 const reference=await classify({subject:'Fwd: Account notice',body:'For reference. ---------- Forwarded message --------- Can you reply by tomorrow?'});
 expect(reference.route).toBe('Review');expect(reference.deadline).toBeNull();
 const editorial=await classify({subject:'Market questions',body:'What will this mean for markets?'});
 expect(editorial.route).toBe('Review');
});

it('routes registration preparation and unpaid-balance notices as Actions without fabricating a due date',async()=>{
 for(const changes of [
  {subject:'Registration preparation',body:'Please read the registration guide and plan your courses. Registration opens November 18, 2026.'},
  {subject:'Student account notice',body:'Your account has an outstanding balance. Review your current payment status in the official portal.'},
 ]) {
  const r=await classify(changes);
  expect(r.route).toBe('Actions');expect(r.deadline).toBeNull();expect(r.suggested_reply).toBeNull();
 }
 for(const body of ['Registration opens November 18, 2026.','Your account statement is ready. Payment received.']) expect((await classify({body})).route).toBe('Review');
});

it('suppresses optional free guest-pass expiry while preserving real obligations',async()=>{
 const offer=await classify({fromAddress:'no-reply@fitness.example.com',fromName:'Guest Services',subject:'Your free 5 day guest pass expires in 5 days',body:'Enjoy your optional free guest pass. Visit the club to redeem it.'});
 expect(offer.label).toBe('Spam/Promotions');expect(offer.route).toBe('Review');expect(offer.deadline).toBeNull();
 const required=await classify({subject:'Permit renewal',body:'Your access permit expires November 5, 2026. Renew by November 5, 2026 to retain access.'});
 expect(required.route).toBe('Deadlines');expect(required.deadline).toBe('2026-11-05');
});

it('keeps observed payment-method and application events as conditional security actions',async()=>{
 for(const subject of ['A payment method was added to your account','A third-party Planning Board application has been added to your account']) {
  const r=await classify({fromAddress:'no-reply@service.example.com',fromName:'Account Updates',subject,body:'Review this event using the official site.'});
  expect(r.route).toBe('Actions');expect(r.label).toBe('Notifications/GitHub');
  expect(r.suggested_reply).toBeNull();expect(r.deadline).toBeNull();
  expect(r.summary).toContain('if you did not');expect(r.summary).not.toMatch(/fraud|compromised|hacked/i);
 }
 for(const body of ['Add a payment method to your account for easier checkout.','If a third-party application was added to your account, review it.','You can log into your account whenever you like.']) expect((await classify({fromAddress:'no-reply@service.example.com',body})).route).toBe('Review');
});
