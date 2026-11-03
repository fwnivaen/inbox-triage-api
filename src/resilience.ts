/** Bound external work; do not log upstream bodies or credentials. */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
 let timer: ReturnType<typeof setTimeout>;
 try { return await Promise.race([work, new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Upstream timeout')),ms);})]); }
 finally { clearTimeout(timer!); }
}
export async function fetchRetry(url: string, init: RequestInit = {}): Promise<Response> {
 for(let attempt=0;;attempt++) {
  try {
   const response=await fetch(url,{...init,signal:AbortSignal.timeout(10000)});
   if(attempt===1 || (response.status!==429 && response.status<500)) return response;
   await response.body?.cancel();
  } catch { if(attempt===1) throw new Error('Upstream unavailable'); }
  await new Promise(resolve=>setTimeout(resolve,250));
 }
}
