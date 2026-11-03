import { expect,it } from 'vitest';
import data from './card-marketing-fixtures.json';
import { classifyEmail } from '../src/pipeline.js';
for(const [i,email] of data.fixtures.entries()) it(email.id,async()=>expect((await classifyEmail(email)).route).toBe(data.expected[i]));
it('recognizes described card products without named brand exceptions',async()=>{
 const r=await classifyEmail({...data.fixtures[0],subject:'Your premium travel Valuecard was delivered',body:'Your premium travel Valuecard is ready to go. Activate it.'});expect(r.route).toBe('Actions');
});
it('preserves a genuine human question about an interview',async()=>{
 const r=await classifyEmail({...data.fixtures[1],fromAddress:'alex@example.edu',fromName:'Alex Example',subject:'Interview availability',body:'Have you seen the interview schedule? Could you send your availability?'});expect(r.route).toBe('Needs Reply');
});
