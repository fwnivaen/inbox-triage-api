import { expect,it } from 'vitest';
import { classifyEmail } from '../src/pipeline.js';
const now=new Date('2026-11-03T03:00:00Z');
const base={id:'fabricated-quality',fromAddress:'alex@example.edu',fromName:'Alex Example',subject:'Question',body:'',receivedAt:'2026-11-02T15:00:00Z',hasAttachment:false};
const classify=(changes:Partial<typeof base>,env?:Env)=>classifyEmail({...base,...changes},env,now);
it('suppresses broadcast rhetorical questions, publication dates, and coupon expiry',async()=>{
 for(const body of ['Want a better day? Subscribe to our newsletter.','Weekly digest November 2, 2026. What happens by tomorrow?','Daily puzzle November 2, 2026. Answers due tomorrow.','Your coupon expires November 3, 2026.']) {
  const r=await classify({subject:'What comes next?',body});expect(r.label).not.toBe('Needs Reply');expect(r.deadline).toBeNull();expect(r.route).toBe('Review');
 }
 const social=await classify({fromAddress:'notifications@linkedin.com',subject:'Your notification expires November 3, 2026',body:'View your notification.'});expect(social.deadline).toBeNull();expect(social.route).toBe('Review');
});
it('binds due tomorrow to the assignment rather than publication or quoted history dates',async()=>{
 const r=await classify({subject:'Course bulletin November 1, 2026',body:'Your assignment is due tomorrow.\n> Previous task due 2025-01-01.'});expect(r.deadline).toBe('2026-11-03');expect(r.route).toBe('Deadlines');
 const quoted=await classify({subject:'Re: old assignment',body:'Thanks for the update.\n> Please reply by 2025-01-01.'});expect(quoted.deadline).toBeNull();expect(quoted.label).not.toBe('Needs Reply');
});
it('does not treat resolved approvals as reply requests, preserving explicit new requests',async()=>{
 const r=await classify({subject:'Re: Action request',body:'This has been approved. Recheck later.'});expect(r.route).toBe('Review');expect(r.suggested_reply).toBeNull();
 for(const body of ['Can you confirm your interview availability?','Could you send the advising form?','This has been approved. Please confirm your attendance.']) expect((await classify({body})).label).toBe('Needs Reply');
});
it('suppresses self resume links using designated identity mapping',async()=>{
 const env={GMAIL_ACCOUNT_EMAILS:JSON.stringify({work:'self@example.com',personal:'other@example.com'})} as Env;
 const r=await classify({fromAddress:'self@example.com',subject:'Re: Resume link?',body:'Here is my resume link.'},env);expect(r.route).toBe('Review');expect(r.label).not.toBe('Needs Reply');
});
it('keeps below-zero banking, security, and student finance support actions visible',async()=>{
 for(const body of ['Your account balance is below zero. Please add funds.','Security alert: unauthorized activity.','Your financial aid support case is pending review.']) {
  const r=await classify({fromAddress:'support@example.com',subject:'Account update',body});expect(r.route).toBe('Actions');
 }
 expect((await classify({body:'Your account is overdrawn.'})).priority).toBe('urgent');
});
it('reports fallback provenance explicitly',async()=>expect((await classify({body:'Please confirm your availability.'})).summarySource).toBe('fallback'));

it('interprets tomorrow by Eastern arrival day after UTC midnight',async()=>{
 const r=await classify({subject:'Assignment',body:'Your assignment is due tomorrow.',receivedAt:'2026-11-03T03:00:00Z'});
 expect(r.deadline).toBe('2026-11-03');
});
