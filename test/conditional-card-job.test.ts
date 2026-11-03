import { expect,it } from 'vitest';
import { classifyEmail } from '../src/pipeline.js';
const base={id:'invented',fromAddress:'alex@jobs.example',fromName:'Alex Example',receivedAt:'2026-11-03T05:35:00Z',hasAttachment:false};
for(const [change,body] of [
 ['linked','A card has been linked from your account. Was this you? If you did not make this change, check your account security using the official app.'],
 ['unlinked','A card has been unlinked from your account. Was this you? If you did not make this change, check your account security using the official app.'],
] as const) it(`routes the exact invented ${change} notice to conditional Actions`,async()=>{
 const r=await classifyEmail({...base,fromAddress:'service@wallet.example',fromName:'Example Wallet',subject:`Payment card ${change}`,body});
 expect(r.route).toBe('Actions');expect(r.priority).toBe('normal');expect(r.suggested_reply).toBeNull();expect(r.summarySource).toBe('fallback');
 expect(r.summary).toContain('if you did not make this change');
});
for(const change of ['linked','unlinked']) it(`retains conditional ${change} action beyond preview`,async()=>{
 const r=await classifyEmail({...base,subject:`Payment card ${change}`,body:`A card has been ${change} from your account. `+'Details. '.repeat(80)+'If you did not make this change, review account security.'});
 expect(r.route).toBe('Actions');expect(r.priority).toBe('normal');expect(r.suggested_reply).toBeNull();expect(r.summary).toContain('if you did not make this change');expect(r.summarySource).toBe('fallback');
});
it('keeps rhetorical job pitches in Review and concrete requests in Needs Reply',async()=>{
 const email={...base,subject:'Campus ambassador opportunity',body:'Do you love meeting students? Our ambassador program offers flexible hours. Browse the role to learn more.'};
 expect((await classifyEmail(email)).route).toBe('Review');
 expect((await classifyEmail({...email,body:email.body+' Could you send your interview availability?'})).route).toBe('Needs Reply');
});
it('keeps OTP notices with hypothetical card footers in Review',async()=>{
 const r=await classifyEmail({...base,subject:'Verification code',body:'Your sign-in code is 123456. If a card was linked without your permission, review account security.'});expect(r.route).toBe('Review');expect(r.suggested_reply).toBeNull();
});
it('does not promote a hypothetical card-change warning without a real notice',async()=>{
 const r=await classifyEmail({...base,subject:'Account tips',body:'If a card was linked without your permission, review account security.'});
 expect(r.route).toBe('Review');
});
it('does not combine unrelated subject and body phrases into a card event',async()=>{
 const r=await classifyEmail({...base,subject:'Card update',body:'Your social profile is linked to rewards.'});
 expect(r.route).toBe('Review');
});
it('preserves self-mail suppression for a card-change statement',async()=>{
 const env={GMAIL_ACCOUNT_EMAILS:JSON.stringify({work:'alex@jobs.example'})} as Env;
 const r=await classifyEmail({...base,subject:'Payment card linked',body:'A card has been linked from your account.'},env);
 expect(r.route).toBe('Review');
});
