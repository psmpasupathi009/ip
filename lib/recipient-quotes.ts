export type RecipientQuote = {
  text: string;
  attribution?: string;
};

/**
 * Local calendar date `YYYY-MM-DD` — use with session id so the same link gets a
 * new quote each day (stable within the day).
 */
export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Warm “today” wishes — picked per session + calendar day. */
const QUOTES: RecipientQuote[] = [
  { text: "Today might be one of your best days — walk into it like it chose you.", attribution: "Today’s wish" },
  { text: "You could meet someone unexpectedly kind today — stay open to small hellos.", attribution: "Good people" },
  { text: "Let today surprise you with one thing that feels meant for you.", attribution: "Bright moments" },
  { text: "The sun doesn’t ask permission — neither should your good mood.", attribution: "Shine on" },
  { text: "Hope you cross paths with someone who makes you smile without trying.", attribution: "Warm encounters" },
  { text: "Today is a fresh page — write something gentle on it.", attribution: "New day" },
  { text: "May ordinary moments turn oddly lucky for you today.", attribution: "Little magic" },
  { text: "You deserve a day that feels lighter than yesterday.", attribution: "Easier sky" },
  { text: "Somewhere today, something good is lining up with your name on it.", attribution: "In your favor" },
  { text: "Treat yourself like someone worth showing up for — because you are.", attribution: "Self-kindness" },
  { text: "May your conversations today leave you warmer than they found you.", attribution: "Good words" },
  { text: "Let traffic, queues, and waits be boring — let your mood stay soft.", attribution: "Easy pace" },
  { text: "Hope you notice one beautiful useless thing today — a shadow, a bird, a laugh.", attribution: "Small joys" },
  { text: "Good energy doesn’t need a reason — borrow some today.", attribution: "Positive drift" },
  { text: "May coincidence bring you a tiny win before sunset.", attribution: "Luck adjacent" },
  { text: "You’re allowed to enjoy today without earning it first.", attribution: "Freely given" },
  { text: "Hope someone remembers you fondly today, even if they don’t say it.", attribution: "Quiet care" },
  { text: "Let your coffee be hot, your jacket be enough, and your worries shrink.", attribution: "Comfort stack" },
  { text: "Today could hold a conversation you’ll think about later — in a good way.", attribution: "Meaningful chat" },
  { text: "May the right doors feel easy when you reach them.", attribution: "Smooth paths" },
  { text: "Send yourself one forgiving thought before noon.", attribution: "Soft heart" },
  { text: "Hope the sky looks generous wherever you stand today.", attribution: "Wide horizon" },
  { text: "You’re not behind — you’re arriving on today’s schedule.", attribution: "Your timing" },
  { text: "May kindness boomerang back to you once, quietly.", attribution: "Comes around" },
  { text: "Pause once; breathe twice; continue softer.", attribution: "Slow breath" },
  { text: "Hope dinner tastes like comfort and rest feels honest tonight.", attribution: "Homeward" },
  { text: "Tuesday or Thursday — you’re still allowed to enjoy ordinary.", attribution: "Plain good" },
  { text: "May green lights find you when you’re actually in a hurry.", attribution: "Go well" },
  { text: "Sending calm across whatever distance sits between hearts today.", attribution: "Across miles" },
  { text: "Hope someone holds the door, literally or figuratively.", attribution: "Held open" },
  { text: "You’re doing the thing — keep going at a humane speed.", attribution: "Onward" },
  { text: "May your playlist surprise you in a way that lifts your shoulders.", attribution: "Tune in" },
  { text: "You’re thought of more often than proof arrives.", attribution: "Quietly seen" },
  { text: "Have a peaceful day — you deserve gentle moments between the busy bits.", attribution: "With warmth" },
  { text: "May today bring you something unexpectedly kind — a text, a breeze, a memory.", attribution: "Best wishes" },
  { text: "You’re allowed to move slowly. The world can wait on you sometimes.", attribution: "Take care" },
  { text: "Small joys count — notice one on purpose today.", attribution: "Thinking of you" },
  { text: "You’re doing better than the voice in your head admits.", attribution: "Truly" },
  { text: "Let today have one moment that belongs only to you.", attribution: "Be well" },
  { text: "Rest isn’t wasted time — it’s how tomorrow gets built.", attribution: "Gently" },
  { text: "Hope you catch a laugh today, even a small one that sneaks up on you.", attribution: "Smiles" },
  { text: "Water your plants, your friendships, and your own nervous system.", attribution: "Care" },
  { text: "You’re stronger in quiet ways than stories usually tell.", attribution: "Rooting for you" },
  { text: "Hope someone opens the door for you — kindness loves company.", attribution: "Courtesy" },
];

/**
 * Stable hash → quote index from session id + local calendar day.
 * Same link shows a new quote when the date changes (user’s local timezone).
 */
export function pickQuoteForSessionAndDay(sessionId: string, localYmd: string): RecipientQuote {
  const seed = `${sessionId}:${localYmd}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h >>> 0) % QUOTES.length;
  return QUOTES[idx]!;
}

/** Backwards-compatible: today’s local date. Prefer `pickQuoteForSessionAndDay` + `formatLocalYmd` in UI for day rollovers. */
export function pickQuoteForSession(sessionId: string): RecipientQuote {
  return pickQuoteForSessionAndDay(sessionId, formatLocalYmd(new Date()));
}
