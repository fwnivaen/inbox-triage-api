import { expect,it } from 'vitest';
import data from './remaining-analogues-fixtures.json';
import { classifyEmail } from '../src/pipeline.js';
for(const [i,email] of data.fixtures.entries()) it(email.id,async()=>expect((await classifyEmail(email,undefined,new Date('2026-11-03T05:45:00Z'))).route).toBe(data.expected[i]));

it('preserves personal questions, new requests after a truncated courtesy, and financial/security events',async()=>{
 const base=data.fixtures[0];
 for(const body of ['Could you send your interview availability?','What time works for you?','Are you available for advising tomorrow?','This has been approved. Please upload your signed form. Please let me know if you have']) {
  expect((await classifyEmail({...base,body})).route).toBe('Needs Reply');
 }
 for(const body of ['Your account is overdrawn.','Security alert: your password was changed.','Your card was delivered. Activate it.']) {
  expect((await classifyEmail({...base,subject:'Account notice',body})).route).toBe('Actions');
 }
});
it('does not turn a bare activation pronoun or publication question into an action',async()=>{
 for(const body of ['The first waves created fortunes. Could the next wave be even bigger?','Your free trial is ready. Activate it.']) {
  expect((await classifyEmail({...data.fixtures[0],subject:'Update',body})).route).toBe('Review');
 }
});
it('normalizes encoded browser footers without hiding explicit new requests',async()=>{
 const r=await classifyEmail({...data.fixtures[1],body:'Can&#39;t view this email? See it online. Could you send your advising form?'});
 expect(r.route).toBe('Needs Reply');
});
