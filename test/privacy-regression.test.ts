import { expect, it } from 'vitest';
import { classifyEmail } from '../src/pipeline.js';
import { buildDigest } from '../src/digest.js';
import { safePreview } from '../src/privacy.js';
const email = { id:'synthetic-privacy', fromAddress:'sender@example.com', fromName:'Sam Example', subject:'Verification code: 765432 for person@example.com', body:'', receivedAt:'2026-11-02T12:00:00Z', hasAttachment:false };
function safe(value: unknown) { expect(JSON.stringify(value)).not.toMatch(/765432|person@example.com/); }
it('redacts addresses and subject fallback without AI', async()=> { safe(safePreview('Contact person@example.com for the interview.')); safe(await classifyEmail(email)); });
for (const mode of ['throw','invalid','echo']) it(`protects AI input/output and fallback: ${mode}`, async()=> {
 const env = {AI:{run:async (_model:unknown,input:unknown)=>{ safe(input); if(mode==='throw') throw Error('unavailable'); if(mode==='invalid') return {response:'invalid'}; return {response:JSON.stringify({summary:'Please contact person@example.com using verification code: 765432.',suggested_reply:'Contact person@example.com with code: 765432.'})}; }}} as unknown as Env;
 const result=await classifyEmail({...email,subject:'Please reply to person@example.com',body:'Can you confirm your interview?'}, env);
 safe(result); safe(buildDigest([result]));
});
