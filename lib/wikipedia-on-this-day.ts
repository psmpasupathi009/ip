/**
 * Wikimedia "On this day" feed (English Wikipedia).
 * @see https://api.wikimedia.org/wiki/Feed_API/Reference/On_this_day
 */

export type OnThisDayItem = {
  year: number | null;
  text: string;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  articleUrl: string;
  articleTitle: string;
};

type WikiPage = {
  title?: string;
  normalizedtitle?: string;
  thumbnail?: { source?: string; width?: number; height?: number };
  content_urls?: { desktop?: { page?: string }; mobile?: { page?: string } };
};

type WikiEvent = {
  text?: string;
  year?: number;
  pages?: WikiPage[];
};

type WikiFeed = {
  events?: WikiEvent[];
};

const WM_USER_AGENT =
  process.env.WIKIPEDIA_API_USER_AGENT ??
  "ip/0.1 (https://github.com; Wikimedia On This Day consumer — set WIKIPEDIA_API_USER_AGENT)";

function articleUrlFromPage(p: WikiPage): string | null {
  const desktop = p.content_urls?.desktop?.page;
  if (desktop && typeof desktop === "string") return desktop;
  const t = p.normalizedtitle ?? p.title;
  if (!t) return null;
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`;
}

/** Prefer a page with a thumbnail, then first page we can link. */
function pickLinkedPage(pages: WikiPage[] | undefined): WikiPage | null {
  if (!pages?.length) return null;
  const withThumb = pages.find((p) => p.thumbnail?.source && articleUrlFromPage(p));
  if (withThumb) return withThumb;
  for (const p of pages) {
    if (articleUrlFromPage(p)) return p;
  }
  return null;
}

export function normalizeOnThisDayFeed(json: unknown, limit = 6): OnThisDayItem[] {
  const feed = json as WikiFeed;
  const events = feed.events;
  if (!Array.isArray(events)) return [];

  const out: OnThisDayItem[] = [];
  for (const ev of events) {
    const text = typeof ev.text === "string" ? ev.text.trim() : "";
    if (!text) continue;
    const page = pickLinkedPage(ev.pages);
    if (!page) continue;
    const articleUrl = articleUrlFromPage(page);
    if (!articleUrl) continue;
    const articleTitle = (page.normalizedtitle ?? page.title ?? "Wikipedia").trim();

    const thumb = page.thumbnail;
    out.push({
      year: typeof ev.year === "number" && Number.isFinite(ev.year) ? ev.year : null,
      text,
      imageUrl: thumb?.source && typeof thumb.source === "string" ? thumb.source : null,
      imageWidth: typeof thumb?.width === "number" ? thumb.width : null,
      imageHeight: typeof thumb?.height === "number" ? thumb.height : null,
      articleUrl,
      articleTitle,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function fetchWikipediaOnThisDay(month: number, day: number): Promise<OnThisDayItem[]> {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/${mm}/${dd}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": WM_USER_AGENT,
    },
    next: { revalidate: 86_400 },
  });

  if (!res.ok) {
    throw new Error(`Wikimedia on-this-day failed: ${res.status}`);
  }

  const json: unknown = await res.json();
  return normalizeOnThisDayFeed(json, 6);
}
