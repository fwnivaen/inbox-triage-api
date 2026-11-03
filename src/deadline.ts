/** Extracts a deadline date from subject+preview text, relative to when the email arrived. */

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_ABBR = MONTHS.map((m) => m.slice(0, 3));

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthIndex(name: string): number {
  const lower = name.toLowerCase();
  const full = MONTHS.indexOf(lower);
  if (full !== -1) return full;
  return MONTH_ABBR.indexOf(lower.slice(0, 3));
}

/** Deadline-cue words used both for extraction and for the Deadline/urgency rules. */
export const DEADLINE_CUES =
  /\b(due|deadline|last day|expires?|closes?|closing|rsvp by|submit by|apply by|renew by|by\s)\b/i;

export function hasDeadlineCue(text: string): boolean {
  return DEADLINE_CUES.test(text);
}

export function extractDeadline(text: string, receivedAt: Date): string | null {
  // Bind a date to its own action cue rather than the first publication/history date.
  const cues=[...text.matchAll(/\b(?:due|deadline|last day|expires?|closes?|closing|rsvp by|submit by|apply by|renew by|by)\b/gi)];
  if(cues.length) {
    for(const cue of cues) {
      const tail=text.slice(cue.index!+cue[0].length).split(/[!?.\n]/)[0].slice(0,80);
      if(!/^\s*(?:(?:is|on|at|by|the|:|for)\s*)*(?:\d|today|tomorrow|this|in |jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sun|mon|tue|wed|thu|fri|sat)/i.test(tail)) continue;
      const relative=tail.match(/^\s*(?:(?:is|on|at|by|the|:|for)\s*)*(today|tomorrow)\b/i);
      const found=parseDate(relative ? relative[1] : cue[0]+tail,receivedAt);
      if(found) return found;
    }
    return null;
  }
  return parseDate(text,receivedAt);
}
function parseDate(text: string, receivedAt: Date): string | null {
  const eastern=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(receivedAt);
  const calendar=new Date(`${eastern}T12:00:00Z`);
  const lower = text.toLowerCase();

  // YYYY-MM-DD
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Month D[, YYYY]  e.g. "Nov 13", "November 13, 2026"
  const monthDay = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i,
  );
  if (monthDay) {
    const mIdx = monthIndex(monthDay[1]);
    const day = parseInt(monthDay[2], 10);
    let year = monthDay[3] ? parseInt(monthDay[3], 10) : calendar.getUTCFullYear();
    const candidate = new Date(Date.UTC(year, mIdx, day));
    // If no year given and the date already passed this year, assume next year.
    if (!monthDay[3] && candidate.getTime() < receivedAt.getTime() - 24 * 3600 * 1000) {
      year += 1;
    }
    return toISODate(new Date(Date.UTC(year, mIdx, day)));
  }

  // MM/DD[/YYYY]
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const month = parseInt(slash[1], 10) - 1;
    const day = parseInt(slash[2], 10);
    let year = slash[3]
      ? parseInt(slash[3].length === 2 ? `20${slash[3]}` : slash[3], 10)
      : calendar.getUTCFullYear();
    const candidate = new Date(Date.UTC(year, month, day));
    if (!slash[3] && candidate.getTime() < receivedAt.getTime() - 24 * 3600 * 1000) {
      year += 1;
    }
    return toISODate(new Date(Date.UTC(year, month, day)));
  }

  // "by/on the Nth [of this/next month]" — ordinal day with no explicit month
  const ordinalDay = lower.match(/\b(?:by|on)\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (ordinalDay) {
    const day = parseInt(ordinalDay[1], 10);
    let year = calendar.getUTCFullYear();
    let month = calendar.getUTCMonth();
    const candidate = new Date(Date.UTC(year, month, day));
    if (candidate.getTime() < receivedAt.getTime() - 24 * 3600 * 1000) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    return toISODate(new Date(Date.UTC(year, month, day)));
  }

  // "today" / "tomorrow"
  if (/\btoday\b/.test(lower)) return toISODate(calendar);
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(calendar);
    d.setUTCDate(d.getUTCDate() + 1);
    return toISODate(d);
  }

  // "by/this <weekday>"
  const weekday = lower.match(
    /\b(?:by|this)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1]);
    const d = new Date(calendar);
    const diff = (target - d.getUTCDay() + 7) % 7;
    d.setUTCDate(d.getUTCDate() + (diff === 0 ? 7 : diff));
    return toISODate(d);
  }

  // "this week" -> end of the current week (Friday)
  if (/\bthis week\b/.test(lower)) {
    const d = new Date(calendar);
    const diff = (5 - d.getUTCDay() + 7) % 7; // 5 = Friday
    d.setUTCDate(d.getUTCDate() + diff);
    return toISODate(d);
  }

  // "in N hours" / "in N days" / "48 hours" / countdown
  const inHours = lower.match(/\bin\s+(\d{1,3})\s+hours?\b/) ?? lower.match(/\b(\d{1,3})\s+hours?\b/);
  if (inHours) {
    const d = new Date(receivedAt.getTime() + parseInt(inHours[1], 10) * 3600 * 1000);
    return toISODate(d);
  }
  const inDays = lower.match(/\bin\s+(\d{1,3})\s+days?\b/);
  if (inDays) {
    const d = new Date(calendar);
    d.setUTCDate(d.getUTCDate() + parseInt(inDays[1], 10));
    return toISODate(d);
  }

  return null;
}
