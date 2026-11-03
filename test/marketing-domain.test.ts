import { expect,it } from 'vitest';
import fixture from './marketing-domain-fixture.json';
import { classifyEmail } from '../src/pipeline.js';
it('routes the exact padded marketing-domain question to Review',async()=>expect((await classifyEmail(fixture)).route).toBe('Review'));
it('preserves explicit human requests even on the same sender domain and with the same discovery subject',async()=>{
 for(const body of ['Could you send your interview availability?','What time works for you?','Please share your signed advising form.']) {
  expect((await classifyEmail({...fixture,body})).route).toBe('Needs Reply');
 }
});
it('recognizes discovery marketing across domains and product categories',async()=>{
 for(const fromAddress of ['morgan@updates.example.net','retailer@example.org']) {
  expect((await classifyEmail({...fixture,fromAddress,subject:'Have you tried our latest workshops?',body:'Explore our collection.'})).route).toBe('Review');
 }
});
it('keeps financial/security warnings and activation actions visible inside discovery marketing',async()=>{
 for(const body of ['Your bank account is overdrawn.','Security alert: your password was changed.','Your replacement card is ready to go. Activate it.']) {
  expect((await classifyEmail({...fixture,body})).route).toBe('Actions');
 }
});
