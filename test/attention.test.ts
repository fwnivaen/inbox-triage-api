import { expect,it } from 'vitest';
import { classifyEmail } from '../src/pipeline.js';
import { currentAttention } from '../src/attention.js';
import { computePriority } from '../src/priority.js';
const base={id:'synthetic',fromAddress:'calendar@example.com',fromName:'Calendar',subject:'Meeting today',body:'Your appointment is today at 11 PM.',receivedAt:'2026-11-03T03:30:00Z',hasAttachment:false};
it('expires Meetings Today across Eastern midnight within the rolling mail window',async()=>{
 const result=await classifyEmail(base,undefined,new Date('2026-11-03T04:30:00Z'));
 expect(result.route).toBe('Meetings Today');
 expect(currentAttention(result,base.receivedAt,new Date('2026-11-03T05:01:00Z')).route).toBe('Review');
});
it('promotes tomorrow meeting when its date arrives',async()=>{
 const email={...base,subject:'Appointment tomorrow',body:'Your appointment is tomorrow.'};
 const result=await classifyEmail(email,undefined,new Date('2026-11-03T04:30:00Z'));
 expect(result.route).toBe('Review');
 expect(currentAttention(result,email.receivedAt,new Date('2026-11-03T05:01:00Z')).route).toBe('Meetings Today');
});
it('re-evaluates urgency using current time and removes expired deadline routes',async()=>{
 const email={...base,subject:'Submit by November 5, 2026',body:'Your form is due November 5, 2026.'};
 const result=await classifyEmail(email,undefined,new Date('2026-11-02T12:00:00Z'));
 expect(result.priority).toBe('normal');
 expect(currentAttention(result,email.receivedAt,new Date('2026-11-05T15:00:00Z')).priority).toBe('urgent');
 expect(currentAttention(result,email.receivedAt,new Date('2026-11-06T15:00:00Z')).route).toBe('Review');
 expect(computePriority('Deadline','2026-11-01','',new Date('2026-11-03T12:00:00Z'))).toBe('normal');
});
it('keeps concrete account/application actions but suppresses routine ads/announcements',async()=>{
 const action=await classifyEmail({...base,subject:'Application incomplete',body:'Please complete your application.'});expect(action.route).toBe('Actions');
 const routine=await classifyEmail({...base,fromAddress:'notice@example.edu',subject:'School weekly announcement',body:'The weekly newsletter is available.'});expect(routine.route).toBe('Review');
});
