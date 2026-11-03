/** Latest message only: quoted history must not introduce requests or dates. */
export function latestText(body:string):string {
 const decoded=body.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|apos|quot|amp|lt|gt|nbsp|rsquo|lsquo);/gi,(entity,name:string)=>{
  if(name.startsWith('#')) {
   const value=name[1].toLowerCase()==='x' ? parseInt(name.slice(2),16) : parseInt(name.slice(1),10);
   return value>0 && value<=0x10ffff && !(value>=0xd800 && value<=0xdfff) ? String.fromCodePoint(value) : entity;
  }
  return ({apos:"'",quot:'"',amp:'&',lt:'<',gt:'>',nbsp:' ',rsquo:"'",lsquo:"'"} as Record<string,string>)[name.toLowerCase()] ?? entity;
 });
 return decoded.split(/\b(?:Earlier message|Previous message|Quoted message):/i)[0].split(/\n(?:On .+wrote:|[- ]*Original Message[- ]*|From:)/i)[0].split('\n').filter(line=>!/^\s*>/.test(line)).join('\n');
}
export const FINANCIAL_RISK=/\b(negative balance|below[- ]zero|balance (?:is |has (?:fallen|dropped) )?below|overdrawn|overdraft|insufficient funds|payment (?:failed|declined)|failed payment|unauthorized|unrecognized|security alert|account (?:locked|suspended)|password (?:was )?changed|third.party app was added|recovery (?:email|phone).{0,20}changed|verify your identity)\b/i;
export const RESOLVED=/\b(already approved|has been approved|is approved|approved your|no (?:further )?action (?:is )?(?:needed|required)|no (?:need to )?reply|resolved|recheck later|check (?:back |again )?later)\b/i;
export const BROADCAST=/\b(newsletter|exclusive offer|free drink|subscriber edition|complimentary (?:[a-z]+ )?trial|special introductory access|unsubscribe|weekly digest|daily digest|news roundup|puzzle|crossword|coupon|promo code|discount code|limited.time offer|\d+% off)\b/i;
export const DIRECT_REQUEST=/\b(can you|could you|would you|please (?:confirm|respond|reply|send|share|provide|upload|complete)|let me know|need your availability)\b/i;

/** OTP footers describe a hypothetical incident, not an observed security event. */
/** Courtesy invitations after a resolution are not new requests for action. */
export function requestText(text:string):string {
 return text
  .replace(/\b(?:please\s+)?let me know if you have any questions[.!?]?/gi,'')
  .replace(/\b(?:please\s+)?let me know if you have(?:\s+any(?:\s+questions?)?)?[.!?]?\s*$/gi,'')
  .replace(/\b(?:can['’]?t|cannot|unable to) (?:view|read) this email\?\s*(?:see|view|read) it online[.!?]?/gi,'');
}
/** A question mark alone is insufficient evidence of a request to the recipient. */
export const hasDirectRequest=(text:string):boolean=>{
 const clean=requestText(text);
 return DIRECT_REQUEST.test(clean) || /\b(?:are|will|do|did|have) you\b[^?]*\?/i.test(clean)
  || /\b(?:what|which|when|how|where)\b[^?.!]{0,80}\b(?:you|your)\b[^?.!]*\?/i.test(clean);
};
/** Browser chrome is a publication signal only when no personal request remains. */
export const publicationNotice=(text:string):boolean=>/\bview (?:this email )?in (?:your )?browser\b/i.test(text) && !hasDirectRequest(text);
export function routineOtp(text:string):boolean {
 return /\b(sign.in code|verification code|authentication code|one.time (?:authentication )?(?:code|password)|finish signing in)\b/i.test(text)
  && !/\b(security alert|new sign.in|unrecognized (?:device|sign.in)|account (?:locked|suspended)|password (?:was )?changed|third.party app was added|recovery (?:email|phone).{0,20}changed|negative balance|overdrawn|insufficient funds)\b/i.test(text);
}
export const ACCOUNT_ACTIVATION=/\bactivate (?:your|the) (?:replacement )?(?:(?:debit|credit) )?card\b/i;

export const requiresCardActivation=(text:string):boolean=>ACCOUNT_ACTIVATION.test(text)
 || (/\b(?:your|the) (?:[a-z]+\s+){0,5}(?:[a-z]*card)\b/i.test(text) && /\bactivate it\b/i.test(text));
