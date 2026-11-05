import type { InboundEmail } from './types.js';

/** Latest message only: quoted history must not introduce requests or dates. */
export function latestText(body:string):string {
 const decoded=body.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|apos|quot|amp|lt|gt|nbsp|rsquo|lsquo);/gi,(entity,name:string)=>{
  if(name.startsWith('#')) {
   const value=name[1].toLowerCase()==='x' ? parseInt(name.slice(2),16) : parseInt(name.slice(1),10);
   return value>0 && value<=0x10ffff && !(value>=0xd800 && value<=0xdfff) ? String.fromCodePoint(value) : entity;
  }
  return ({apos:"'",quot:'"',amp:'&',lt:'<',gt:'>',nbsp:' ',rsquo:"'",lsquo:"'"} as Record<string,string>)[name.toLowerCase()] ?? entity;
 });
 return decoded.split(/\b(?:Earlier message|Previous message|Quoted message):|[-–—]{2,}\s*Forwarded message\s*[-–—]{2,}|\bBegin forwarded message:/i)[0].split(/\n(?:On .+wrote:|[- ]*Original Message[- ]*|From:)/i)[0].split('\n').filter(line=>!/^\s*>/.test(line)).join('\n');
}
export const FINANCIAL_RISK=/\b(negative balance|below[- ]zero|balance (?:is |has (?:fallen|dropped) )?below|overdrawn|overdraft|insufficient funds|payment (?:failed|declined)|failed payment|unauthorized|unrecognized|security alert|account (?:locked|suspended)|password (?:was )?changed|third.party app was added|recovery (?:email|phone).{0,20}changed|verify your identity)\b/i;
export const RESOLVED=/\b(already approved|has been approved|is approved|approved your|no (?:further )?action (?:is )?(?:needed|required)|no (?:need to )?reply|resolved|recheck later|check (?:back |again )?later)\b/i;
export const BROADCAST=/\b(newsletter|exclusive offer|free drink|(?:free|complimentary) (?:\d+[- ]day )?guest pass|subscriber edition|complimentary (?:[a-z]+ )?trial|special introductory access|unsubscribe|weekly digest|daily digest|news roundup|puzzle|crossword|coupon|promo code|discount code|limited.time offer|\d+% off)\b/i;
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
  || /\b(?:what|which|when|how|where)\b[^?.!]{0,80}\b(?:you|your)\b[^?.!]*\?/i.test(clean)
  || (/\b(?:I|we)\b[^.!?]{0,40}\b(?:want(?:ed)?|like|need)\b[^.!?]{0,60}\b(?:know|hear|see|confirm)\b[^.!?]{0,40}\b(?:your|what|which|when)\b/i.test(clean)
   && !/\b(?:let(?:ting)? (?:you|everyone) know|you (?:all )?to know)\b/i.test(clean));
};
/** Human correspondence can request a response without spelling out "you" or
 * reaching the eventual scheduling question inside the bounded snippet. */
export function hasReplyRequest(subject:string,preview:string):boolean {
 return hasDirectRequest(subject) || hasCurrentReplyRequest(subject,preview);
}
/** A resolved reply must contain a new request; an old subject cannot reopen it. */
export function hasCurrentReplyRequest(subject:string,preview:string):boolean {
 return hasDirectRequest(preview)
  || (/^\s*(?:fw|fwd):/i.test(subject) && /^\s*(?:hi\b[^.!?]{0,30}[,.!]\s*)?what\b[^?!.]{0,40}\bthis\b[^?!.]{0,20}\?/i.test(preview))
  || /\binvit(?:e|ed|ing) you\b[^.!?]{0,100}\binterview\b/i.test(preview);
}
/** Browser chrome is a publication signal only when no personal request remains. */
export const publicationNotice=(text:string):boolean=>/\bview (?:this email )?in (?:your )?browser\b/i.test(text) && !hasDirectRequest(text);
/** A publication header disambiguates a subject-only request when a bounded
 * teaser omits its footer. It does not relabel ordinary service/list notices. */
export const listPublication=(email:InboundEmail,preview:string):boolean=>email.listUnsubscribe===true
 && hasDirectRequest(email.subject) && !hasCurrentReplyRequest(email.subject,preview) && !courseAction(`${email.subject} ${preview}`)
 && !cardChange(email.subject) && !cardChange(preview) && !accountSecurityEvent(email.subject) && !accountSecurityEvent(preview);

/** Future assessments and personally incomplete enrollment are actionable even
 * without an imperative. No calendar date is inferred from announcement dates. */
export function courseAction(text:string):boolean {
 if(BROADCAST.test(text)) return false;
 const assessment=text.split(/[.!?\n]/).some(sentence=>
  /\b(?:quiz|exam(?:ination)?|midterm)\b/i.test(sentence)
  && /\b(?:quiz|exam(?:ination)?|midterm)\b[^.!?\n]{0,100}\b(?:(?:this|next) (?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|will take place|will be held|is scheduled)\b/i.test(sentence)
  && !/\b(?:practice|sample|past|completed|cancelled|canceled|results?|grades?|scores?|was|were|took place)\b|\b(?:quiz|exam|midterm) review\b|\bno (?:quiz|exam|midterm)\b/i.test(sentence));
 const training=/\b(?:training|course|module)\b/i.test(text)
  && /\b(?:you are enrolled|you're enrolled|your (?:required |mandatory )?(?:training|course|module))\b/i.test(text)
  && /\b(?:not (?:yet )?completed?|incomplete|outstanding)\b/i.test(text);
 return assessment || training;
}

/** Only a later verified SENT item in this exact thread closes a reply task.
 * A later incoming request must reopen it; prose such as "I replied" is not proof. */
export function hasSentReply(email:InboundEmail,now:Date):boolean {
 const reply=email.sentReply;
 return Boolean(reply && email.threadId && reply.threadId===email.threadId && reply.id!==email.id
  && reply.labels.includes('SENT') && !reply.labels.includes('DRAFT') && Date.parse(reply.sentAt)>Date.parse(email.receivedAt)
  && Date.parse(reply.sentAt)<=now.getTime());
}
export function routineOtp(text:string):boolean {
 return /\b(sign.in code|verification code|authentication code|one.time (?:authentication )?(?:code|password)|finish signing in)\b/i.test(text)
  && !/\b(security alert|new sign.in|unrecognized (?:device|sign.in)|account (?:locked|suspended)|password (?:was )?changed|third.party app was added|recovery (?:email|phone).{0,20}changed|negative balance|overdrawn|insufficient funds)\b/i.test(text);
}
export const ACCOUNT_ACTIVATION=/\bactivate (?:your|the) (?:replacement )?(?:(?:debit|credit) )?card\b/i;

export const requiresCardActivation=(text:string):boolean=>ACCOUNT_ACTIVATION.test(text)
 || (/\b(?:your|the) (?:[a-z]+\s+){0,5}(?:[a-z]*card)\b/i.test(text) && /\bactivate it\b/i.test(text));

/** Product-discovery questions advertise a collection; a new personal request
 * in the preview takes precedence. Independent of sender/domain/brand spelling. */
export const marketingDiscovery=(subject:string,preview:string):boolean=>
 /\bhave you (?:seen|tried|discovered|explored|checked out|heard about)\b[^?!.]{0,80}\bour (?:new|latest)\b/i.test(subject)
 && !hasDirectRequest(preview);

/** Material card changes merit conditional review, not a reply or fraud assertion. */
export function cardChange(text:string):'linked'|'unlinked'|'added'|null {
 // A hypothetical "if a card was linked" footer is not an observed change.
 // Keep the subject and actual notice, but stop before conditional advice.
 const observed=text.split(/\bif (?:you|your|a|an|any|the|this)\b/i)[0];
 const event=observed.match(/\bcard\b[^.!?\n]{0,60}?\b(unlinked|linked)\b/i);
 if(event) return event[1].toLowerCase() as 'linked'|'unlinked';
 // A completed payment-card addition to the recipient's account/wallet is
 // an account event. Offers, future additions and cart/catalog items are not.
 return /\b(?:payment|credit|debit) card (?:was|has been) added to your (?:account|wallet)\b/i.test(observed) ? 'added' : null;
}
/** Observed recipient-account events merit conditional review, not an assertion
 * of compromise. Suggestions and hypothetical footer language are insufficient. */
export function accountSecurityEvent(text:string):'payment-method'|'application'|'sign-in-access'|null {
 const observed=text.split(/\bif (?:you|your|a|an|any|the|this)\b/i)[0];
 if(/\bpayment method (?:was|has been) added to your (?:account|wallet)\b/i.test(observed)) return 'payment-method';
 if(/\bthird.party (?:[a-z0-9'-]+\s+){0,5}(?:app|application) (?:was|has been) added to your account\b/i.test(observed)) return 'application';
 if(/\baccount(?:\s+\[redacted-email\])? can now sign in to your\b/i.test(observed)) return 'sign-in-access';
 return null;
}
export const jobPitch=(text:string):boolean=>/\b(?:campus ambassador|ambassador program|job|role|hiring|opportunity)\b/i.test(text)
 && /\bdo you (?:love|enjoy)\b[^?]*\?/i.test(text)
 && !hasDirectRequest(text.replace(/\bdo you (?:love|enjoy)\b[^?]*\?/gi,''));
