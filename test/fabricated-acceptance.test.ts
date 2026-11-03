import { expect,it } from "vitest";
import { classifyEmail } from "../src/pipeline.js";
const cases=[
  {
    "tag": "newsletter_question",
    "expected": "Review",
    "fromAddress": "editor@dispatch.example.com",
    "fromName": "Morgan Ellis",
    "subject": "Ready for a better commute?",
    "body": "Subscriber edition: six design links for your weekend. Explore our picks for trains and buses.",
    "id": "fabricated-acceptance-0",
    "receivedAt": "2026-11-03T03:29:18.100Z",
    "hasAttachment": false,
    "actual": "Needs Reply",
    "actualLabel": "Needs Reply",
    "actualPriority": "normal"
  },
  {
    "tag": "promotional_expiry",
    "expected": "Review",
    "fromAddress": "hello@trycooking.example.com",
    "fromName": "Cooking Club",
    "subject": "Your complimentary access expires tomorrow",
    "body": "Try a complimentary cooking trial. Your special introductory access expires tomorrow. Browse our courses.",
    "id": "fabricated-acceptance-1",
    "receivedAt": "2026-11-03T03:29:18.108Z",
    "hasAttachment": false,
    "actual": "Deadlines",
    "actualLabel": "Deadline",
    "actualPriority": "urgent"
  },
  {
    "tag": "conditional_security_otp",
    "expected": "Review",
    "fromAddress": "noreply@accounts.example.com",
    "fromName": "Example Account",
    "subject": "Your sign-in code",
    "body": "Use code 654321 to finish signing in. If this was not you, report unauthorized access.",
    "id": "fabricated-acceptance-2",
    "receivedAt": "2026-11-03T03:29:18.108Z",
    "hasAttachment": false,
    "actual": "Actions",
    "actualLabel": "Notifications/GitHub",
    "actualPriority": "urgent"
  },
  {
    "tag": "approved_flattened_quote",
    "expected": "Review",
    "fromAddress": "riley@campus.example.edu",
    "fromName": "Riley Brooks",
    "subject": "Re: Form request",
    "body": "Your request has been approved. No further action is required. Earlier message: could you send the form?",
    "id": "fabricated-acceptance-3",
    "receivedAt": "2026-11-03T03:29:18.108Z",
    "hasAttachment": false,
    "actual": "Needs Reply",
    "actualLabel": "Needs Reply",
    "actualPriority": "normal"
  },
  {
    "tag": "card_activation",
    "expected": "Actions",
    "fromAddress": "noreply@cards.example.com",
    "fromName": "Example Cards",
    "subject": "Activate your replacement card",
    "body": "Your replacement debit card has arrived. Activate your card before your first purchase.",
    "id": "fabricated-acceptance-4",
    "receivedAt": "2026-11-03T03:29:18.108Z",
    "hasAttachment": false,
    "actual": "Review",
    "actualLabel": "Spam/Promotions",
    "actualPriority": "low"
  },
  {
    "tag": "single_name_direct_request",
    "expected": "Needs Reply",
    "fromAddress": "alex@campus.example.edu",
    "fromName": "Professor",
    "subject": "A quick request",
    "body": "Could you send your availability for a short check-in?",
    "id": "fabricated-acceptance-5",
    "receivedAt": "2026-11-03T03:29:18.108Z",
    "hasAttachment": false,
    "actual": "Review",
    "actualLabel": "School",
    "actualPriority": "low"
  },
  {
    "tag": "eastern_deadline_today",
    "expected": "Deadlines",
    "expectedDeadline": "2026-11-02",
    "fromAddress": "noreply@campus.example.edu",
    "fromName": "Campus Office",
    "subject": "Document deadline today",
    "body": "Submit your document by today.",
    "receivedAt": "2026-11-03T03:00:00Z",
    "id": "fabricated-relative-date-0",
    "hasAttachment": false,
    "actual": "Deadlines",
    "actualDeadline": "2026-11-02",
    "actualPriority": "urgent"
  },
  {
    "tag": "eastern_deadline_tomorrow",
    "expected": "Deadlines",
    "expectedDeadline": "2026-11-03",
    "fromAddress": "noreply@campus.example.edu",
    "fromName": "Campus Office",
    "subject": "Document deadline tomorrow",
    "body": "Submit your document by tomorrow.",
    "receivedAt": "2026-11-03T03:00:00Z",
    "id": "fabricated-relative-date-1",
    "hasAttachment": false,
    "actual": "Deadlines",
    "actualDeadline": "2026-11-03",
    "actualPriority": "urgent"
  }
];
for(const item of cases) it(item.tag,async()=>{const result=await classifyEmail(item,undefined,new Date("2026-11-03T03:35:00Z"));expect(result.route).toBe(item.expected);if("expectedDeadline" in item)expect(result.deadline).toBe(item.expectedDeadline);});

it('retains a real security alert beside sign-in-code language',async()=>{
 const r=await classifyEmail({...cases[2],subject:'Security alert: new sign-in',body:'We detected a new sign-in from an unrecognized device. If not you, secure your account.'},undefined,new Date('2026-11-03T03:35:00Z'));
 expect(r.route).toBe('Actions');expect(r.priority).toBe('urgent');
});
it('retains a real document deadline without introductory promotion language',async()=>{
 const r=await classifyEmail({...cases[1],subject:'Your document upload access expires tomorrow',body:'Your document is required. Submit your form before access expires tomorrow.'},undefined,new Date('2026-11-03T03:35:00Z'));
 expect(r.route).toBe('Deadlines');
});
