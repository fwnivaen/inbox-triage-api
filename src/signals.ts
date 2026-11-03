/** Latest message only: quoted history must not introduce requests or dates. */
export function latestText(body:string):string {
 return body.split(/\n(?:On .+wrote:|[- ]*Original Message[- ]*|From:)/i)[0].split('\n').filter(line=>!/^\s*>/.test(line)).join('\n');
}
export const FINANCIAL_RISK=/\b(negative balance|below[- ]zero|balance (?:is |has (?:fallen|dropped) )?below|overdrawn|overdraft|insufficient funds|payment (?:failed|declined)|failed payment|unauthorized|unrecognized|security alert|account (?:locked|suspended)|verify your identity)\b/i;
export const RESOLVED=/\b(already approved|has been approved|is approved|approved your|no (?:further )?action (?:is )?(?:needed|required)|no (?:need to )?reply|resolved|recheck later|check (?:back |again )?later)\b/i;
export const BROADCAST=/\b(newsletter|unsubscribe|weekly digest|daily digest|news roundup|puzzle|crossword|coupon|promo code|discount code|limited.time offer|\d+% off)\b/i;
export const DIRECT_REQUEST=/\b(can you|could you|would you|please (?:confirm|respond|reply|send|upload|complete)|let me know|need your availability)\b/i;
