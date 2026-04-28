import { NextRequest, NextResponse } from "next/server";
import { fetchWikipediaOnThisDay } from "@/lib/wikipedia-on-this-day";

/**
 * Proxy + cache for Wikimedia "On this day" (avoids browser CORS).
 * Query: `date=YYYY-MM-DD` (uses month/day in UTC-neutral local parse) or `month=1-12&day=1-31`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get("date");
  let month: number;
  let day: number;

  if (date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
    if (!m) {
      return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 });
    }
    month = Number(m[2]);
    day = Number(m[3]);
  } else {
    const ms = searchParams.get("month");
    const ds = searchParams.get("day");
    if (!ms || !ds) {
      return NextResponse.json({ error: "Provide date=YYYY-MM-DD or month=&day=" }, { status: 400 });
    }
    month = Number(ms);
    day = Number(ds);
  }

  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
    return NextResponse.json({ error: "Invalid month or day." }, { status: 400 });
  }

  try {
    const events = await fetchWikipediaOnThisDay(month, day);
    return NextResponse.json(
      { events, source: "Wikimedia On This Day (English Wikipedia)" },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upstream error";
    return NextResponse.json({ error: message, events: [] }, { status: 502 });
  }
}
