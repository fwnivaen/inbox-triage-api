import { expect,it } from 'vitest';
import fixtures from './email-exact-fixtures.json';
import { classifyEmail } from '../src/pipeline.js';
for(const [i,email] of fixtures.fixtures.entries()) it(email.id,async()=>expect((await classifyEmail(email,undefined,new Date('2026-11-03T03:35:00Z'))).route).toBe(fixtures.expected[i]));

it('preserves explicit new requests after approval and material account/financial events beside OTP language',async()=>{
 const base=fixtures.fixtures[2];
 for(const body of ['This has been approved. Please share your interview availability. Let me know if you have any questions.','This has been approved. Could you upload your signed form?']) {
  expect((await classifyEmail({...base,body})).route).toBe('Needs Reply');
 }
 for(const body of ['Security alert: a third-party app was added. Your authentication code is [code].','Your password was changed. A one-time authentication code is [code].','Your account is overdrawn. Your verification code is [code].']) {
  expect((await classifyEmail({...fixtures.fixtures[3],body})).route).toBe('Actions');
 }
});

it('retains a direct interview request even with a browser footer',async()=>{
 const r=await classifyEmail({...fixtures.fixtures[5],body:'Please share your interview availability. View in browser.'});
 expect(r.route).toBe('Needs Reply');
});
