import { FINANCIAL_RISK, requiresCardActivation, accountSecurityEvent } from "./signals.js";
import { extractDeadline } from './deadline.js';
import { computePriority } from './priority.js';
import type { ClassifiedEmail } from './types.js';
export const easternDate=(date:Date):string=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const MEETING=/\b(meeting|interview|appointment|scheduled call)\b/i;
const ACTION=/\b(missing (?:document|verification)|verification (?:requested|required)|action required|payment (?:failed|declined|due)|failed payment|unexpected charge|unauthorized|unrecognized|security alert|application (?:started|incomplete)|complete your application|set up your account to continue|confirm (?:your )?(?:attendance|availability)|submit (?:the |your )?(?:document|form)|please (?:upload|sign|complete))\b/i;
const BALANCE_ACTION=/\b(?:(?:outstanding|unpaid|overdue|past[- ]due) balance|balance (?:is )?(?:due|outstanding|overdue|past[- ]due))\b/i;
const REGISTRATION_ACTION=/\b(?:registration|course planning)\b/i;
export function attentionMetadata(text:string,receivedAt:Date) {
 let meetingDate:string|null=null;
 if(MEETING.test(text) && !/\b(cancelled|canceled|cancellation)\b/i.test(text)) {
  if(/\btoday\b/i.test(text)) meetingDate=easternDate(receivedAt);
  else if(/\btomorrow\b/i.test(text)) meetingDate=easternDate(new Date(receivedAt.getTime()+86400000));
  else if(/\b\d{4}-\d{2}-\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d/i.test(text)) meetingDate=extractDeadline(text,receivedAt);
 }
 return {meetingDate,actionRequired:Boolean(accountSecurityEvent(text)) || requiresCardActivation(text) || ACTION.test(text) || FINANCIAL_RISK.test(text) || BALANCE_ACTION.test(text)
  || (REGISTRATION_ACTION.test(text) && /\bplease (?:read|review)\b/i.test(text))
  || /\b(?:support (?:case|request)|case (?:open|pending)|ticket|financial (?:aid|support).{0,30}(?:review|required|pending))\b/i.test(text)};
}
/** Re-evaluate stored safe facts without retaining original mail or invoking AI. */
export function currentAttention(email:ClassifiedEmail,receivedAt:string,now:Date):ClassifiedEmail {
 const today=easternDate(now);
 if(email.attentionSuppressed) return {...email,route:"Review",deadline:null,priority:"low",suggested_reply:null};
 const fallback=attentionMetadata(email.summary,new Date(receivedAt));
 const meetingDate=email.meetingDate ?? (email.route==='Meetings Today' ? easternDate(new Date(receivedAt)) : fallback.meetingDate);
 const activeDeadline=email.deadline && email.deadline>=today ? email.deadline : null;
 const action=Boolean(email.actionRequired || fallback.actionRequired);
 const routine=email.label==='Newsletters' || (email.label==='Spam/Promotions' && !meetingDate && !action);
 const route= !routine && meetingDate===today ? 'Meetings Today' : email.label==='Needs Reply' ? 'Needs Reply' : !routine && activeDeadline ? 'Deadlines' : action ? 'Actions' : 'Review';
 const baseline=email.basePriority ?? computePriority(email.label,null,email.summary,now);
 const duePriority=computePriority(email.label,activeDeadline,'',now);
 return {...email,route,priority:route==='Meetings Today'||(activeDeadline && duePriority==='urgent') ? 'urgent' : route==='Actions' && baseline==='low' ? 'normal' : baseline};
}
