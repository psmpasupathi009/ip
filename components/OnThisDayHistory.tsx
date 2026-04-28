"use client";

import Image from "next/image";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type Item = {
  year: number | null;
  text: string;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  articleUrl: string;
  articleTitle: string;
};

type Props = {
  /** Local calendar `YYYY-MM-DD` (same as recipient quote day). */
  dateYmd: string;
  active: boolean;
};

export default function OnThisDayHistory({ dateYmd, active }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !dateYmd) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/on-this-day?date=${encodeURIComponent(dateYmd)}`, { cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json()) as { events?: Item[]; error?: string; source?: string };
        if (!r.ok) throw new Error(data.error || "Could not load history.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.events) ? data.events : []);
        setSource(typeof data.source === "string" ? data.source : null);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, dateYmd]);

  if (!active) return null;

  return (
    <div className="mx-auto mt-8 max-w-lg text-left">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80">This day in history</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Highlights from English Wikipedia for this calendar date.{" "}
        {source ? (
          <span className="text-muted-foreground/80">({source})</span>
        ) : null}
      </p>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
          Loading history…
        </div>
      ) : null}

      {err ? (
        <p className="mt-4 text-sm text-amber-200/90" role="status">
          {err} You can still read more on{" "}
          <a
            href={`https://en.wikipedia.org/wiki/Special:OnThisDay`}
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            Wikipedia — On this day
          </a>
          .
        </p>
      ) : null}

      {!loading && !err && items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No curated events returned for this date.</p>
      ) : null}

      <ul className="mt-5 space-y-5">
        {items.map((item) => (
          <li
            key={`${item.year ?? "y"}-${item.articleUrl}-${item.text.slice(0, 48)}`}
            className="overflow-hidden rounded-2xl border border-border/70 bg-card/40 ring-1 ring-primary/5"
          >
            <a
              href={item.articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col sm:flex-row sm:items-stretch"
            >
              {item.imageUrl ? (
                <div className="relative aspect-16/10 w-full shrink-0 bg-muted/40 sm:aspect-auto sm:h-auto sm:w-36">
                  <Image
                    src={item.imageUrl}
                    alt={item.articleTitle}
                    width={item.imageWidth ?? 320}
                    height={item.imageHeight ?? 200}
                    className="h-full w-full object-cover transition-opacity group-hover:opacity-95"
                    sizes="(max-width: 640px) 100vw, 144px"
                    unoptimized
                  />
                </div>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-4">
                {item.year != null ? (
                  <span className="text-xs font-semibold tabular-nums text-primary/90">{item.year}</span>
                ) : null}
                <p className="text-sm leading-snug text-foreground/95">{item.text}</p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  Read “{item.articleTitle}”
                  <ExternalLink className="h-3 w-3 opacity-80" aria-hidden />
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
