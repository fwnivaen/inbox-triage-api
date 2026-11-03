import { afterEach,expect,it,vi } from 'vitest';
import { fetchRetry,withTimeout } from '../src/resilience.js';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('retries transient errors with bounded attempts',async()=>{
 vi.useFakeTimers();const fetch=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(new Response('{}'));
 vi.stubGlobal('fetch',fetch);const pending=fetchRetry('https://example.com');await vi.runAllTimersAsync();expect((await pending).status).toBe(200);expect(fetch).toHaveBeenCalledTimes(2);
});
it('does not retry authorization failures',async()=>{const fetch=vi.fn().mockResolvedValue(new Response('',{status:401}));vi.stubGlobal('fetch',fetch);expect((await fetchRetry('https://example.com')).status).toBe(401);expect(fetch).toHaveBeenCalledTimes(1);});
it('bounds stuck model work',async()=>{vi.useFakeTimers();const result=expect(withTimeout(new Promise(()=>{}),50)).rejects.toThrow('Upstream timeout');await vi.advanceTimersByTimeAsync(50);await result;});
