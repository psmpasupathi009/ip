/**
 * Calendar facts + “on this day” style notes for the recipient view (no network).
 * Dates use the viewer’s local calendar day string `YYYY-MM-DD`.
 */

export type DayHighlights = {
  /** 1-based day of year */
  dayOfYear: number;
  daysInYear: number;
  /** e.g. "ISO week 17 · 2026" */
  isoWeekLabel: string;
  /** Short lines: observances, seasons, or light historical notes */
  events: string[];
};

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function dayOfYearIndex(y: number, month0: number, day: number): number {
  const start = new Date(y, 0, 0);
  const d = new Date(y, month0, day);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

/** ISO 8601 week number for local date. */
function isoWeekLabelFor(y: number, month0: number, day: number): string {
  const d = new Date(y, month0, day);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yStart.getTime()) / 86_400_000 + 1) / 7);
  return `ISO week ${week} · ${y}`;
}

/** `MM-DD` → notable lines (public / cultural; not exhaustive). */
const FIXED_BY_MD: Record<string, string[]> = {
  "01-01": ["New Year’s Day in many countries.", "A common day for resolutions and fresh starts."],
  "01-26": ["India observes Republic Day.", "Australia Day is celebrated in Australia."],
  "02-14": ["Valentine’s Day — widely associated with friendship and affection."],
  "02-29": ["Leap day — an extra day in the calendar roughly every four years."],
  "03-08": ["International Women’s Day."],
  "03-17": ["St. Patrick’s Day — Irish culture celebrated in many places."],
  "03-20": ["Around the March equinox — spring in the north, autumn in the south."],
  "04-01": ["April Fools’ Day — light-hearted pranks in several cultures."],
  "04-07": ["World Health Day (WHO)."],
  "04-22": ["Earth Day — focus on the environment in many countries."],
  "04-28": ["World Day for Safety and Health at Work."],
  "05-01": ["Labour Day / May Day in many regions."],
  "05-04": ["Star Wars Day (“May the Fourth”) — pop-culture celebration."],
  "06-05": ["World Environment Day."],
  "06-21": ["Around the June solstice — longest day in the northern hemisphere."],
  "07-04": ["Independence Day in the United States."],
  "08-15": ["Independence Day in India.", "Assumption of Mary — a public holiday in several countries."],
  "09-22": ["Around the September equinox."],
  "10-02": ["Gandhi Jayanti in India.", "International Day of Non-Violence."],
  "10-31": ["Halloween in many Western countries."],
  "11-01": ["All Saints’ Day in several Christian traditions."],
  "11-14": ["Children’s Day in India (Nehru’s birth anniversary)."],
  "11-20": ["Universal Children’s Day."],
  "12-01": ["World AIDS Day."],
  "12-21": ["Around the December solstice — shortest day in the northern hemisphere."],
  "12-25": ["Christmas Day in many Christian and secular calendars."],
  "12-31": ["New Year’s Eve — celebrations into the next calendar year."],
};

const ROTATING_NOTES = [
  "Meteor showers peak on predictable dates — a quiet night sky can be worth a look.",
  "Many calendars split the year into four meteorological seasons by month.",
  "Historically, leap years keep our calendar aligned with Earth’s orbit.",
  "Full moons have traditional names in several cultures (e.g. Harvest, Wolf).",
  "Time zones mean “today” starts at different instants around the world.",
  "The Gregorian calendar is used internationally for civil dates.",
  "Weekday names in English come from Norse and Roman traditions.",
  "Solstices mark the longest and shortest days; equinoxes mark near-equal day and night.",
  "Some regions observe daylight saving time — clocks shift seasonally.",
  "Calendars often blend lunar months with solar years (e.g. many festival dates).",
  "The seven-day week is ancient; its exact origin blends Babylonian and Jewish practice.",
  "January is named for Janus; July and August honor Roman leaders.",
  "Paper calendars became common after the printing press.",
  "Digital calendars now sync across phones, watches, and the cloud.",
  "Many holidays move with the moon (Easter, Eid, Diwali dates vary by year).",
];

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickRotating(localYmd: string, count: number): string[] {
  const out: string[] = [];
  let h = hashSeed(`rot:${localYmd}`);
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ i, 2654435761) >>> 0;
    out.push(ROTATING_NOTES[h % ROTATING_NOTES.length]!);
  }
  return out;
}

function seasonHint(month0: number): string {
  if (month0 <= 1 || month0 === 11) return "Meteorological winter in the northern hemisphere.";
  if (month0 <= 4) return "Meteorological spring in the northern hemisphere.";
  if (month0 <= 7) return "Meteorological summer in the northern hemisphere.";
  return "Meteorological autumn in the northern hemisphere.";
}

export function getDayHighlights(localYmd: string): DayHighlights {
  const [ys, ms, ds] = localYmd.split("-");
  const y = Number(ys);
  const month0 = Number(ms) - 1;
  const day = Number(ds);
  const md = `${ms!.padStart(2, "0")}-${ds!.padStart(2, "0")}`;

  const daysInYear = isLeapYear(y) ? 366 : 365;
  const dayOfYear = dayOfYearIndex(y, month0, day);

  const fixed = FIXED_BY_MD[md] ?? [];
  const rotating = pickRotating(localYmd, fixed.length >= 2 ? 1 : 2);
  const events = [...fixed, seasonHint(month0), ...rotating];
  const unique: string[] = [];
  for (const e of events) {
    if (!unique.includes(e)) unique.push(e);
  }

  return {
    dayOfYear,
    daysInYear,
    isoWeekLabel: isoWeekLabelFor(y, month0, day),
    events: unique.slice(0, 6),
  };
}
