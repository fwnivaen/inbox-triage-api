/** Latest message only: quoted history must not introduce requests or dates. */
export function latestText(body:string):string {
 return body.split(/\b(?:Earlier message|Previous message|Quoted message):/i)[0].split(/\n(?:On .+wrote:|[- ]*Original Message[- ]*|From:)/i)[0].split('\n').filter(line=>!/^\s*>/.test(line)).join('\n');
}
export const FINANCIAL_RISK=/\b(negative balance|below[- ]zero|balance (?:is |has (?:fallen|dropped) )?below|overdrawn|overdraft|insufficient funds|payment (?:failed|declined)|failed payment|unauthorized|unrecognized|security alert|account (?:locked|suspended)|password (?:was )?changed|third.party app was added|recovery (?:email|phone).{0,20}changed|verify your identity)\b/i;
export const RESOLVED=/\b(already approved|has been approved|is approved|approved your|no (?:further )?action (?:is )?(?:needed|required)|no (?:need to )?reply|resolved|recheck later|check (?:back |again )?later)\b/i;
export const BROADCAST=/\b(newsletter|exclusive offer|free drink|subscriber edition|complimentary (?:[a-z]+ )?trial|special introductory access|unsubscribe|weekly digest|daily digest|news roundup|puzzle|crossword|coupon|promo code|discount code|limited.time offer|\d+% off)\b/i;
export const DIRECT_REQUEST=/\b(can you|could you|would you|please (?:confirm|respond|reply|send|share|provide|upload|complete)|let me know|need your availability)\b/i;

/** OTP footers describe a hypothetical incident, not an observed security event. */
/** Courtesy invitations after a resolution are not new requests for action. */
export function requestText(text:string):string {
 return text.replace(/\b(?:please\s+)?let me know if you have any questions[.!?]?/gi,'');
}
export const hasDirectRequest=(text:string):boolean=>DIRECT_REQUEST.test(requestText(text));
/** Browser chrome is a publication signal only when no personal request remains. */
export const publicationNotice=(text:string):boolean=>/\bview (?:this email )?in (?:your )?browser\b/i.test(text) && !hasDirectRequest(text);
export function routineOtp(text:string):boolean {
 return /\b(sign.in code|verification code|authentication code|one.time (?:authentication )?(?:code|password)|finish signing in)\b/i.test(text)
  && !/\b(security alert|new sign.in|unrecognized (?:device|sign.in)|account (?:locked|suspended)|password (?:was )?changed|third.party app was added|recovery (?:email|phone).{0,20}changed|negative balance|overdrawn|insufficient funds)\b/i.test(text);
}
export const ACCOUNT_ACTIVATION=/\bactivate (?:your|the) (?:replacement )?(?:(?:debit|credit) )?card\b/i;
