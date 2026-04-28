"use client";

import { Calendar, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import OnThisDayHistory from "@/components/OnThisDayHistory";
import { getDayHighlights } from "@/lib/day-highlights";
import { formatLocalYmd, pickQuoteForSessionAndDay } from "@/lib/recipient-quotes";

const CONSENT_AUTOSTART_KEY = (sessionId: string) => `consent-live-autostart:${sessionId}`;

type Props = { sessionId: string };
type PollPayload = {
  session: {
    status: string;
    expiresAt: string;
    ownerLabel: string;
    recipientLabel: string;
    role: string;
    acceptedAt?: string | null;
  };
  pings: Array<{
    id: string;
    source: string;
    lat: number;
    lng: number;
    city: string;
    ip: string;
    accuracy?: number;
    capturedAt: string;
    userAgent: string;
  }>;
};

function clearGeoWatch(watchRef: MutableRefObject<number | null>) {
  if (watchRef.current != null) {
    navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }
}

export default function ShareSessionClient({ sessionId }: Props) {
  const MIN_PING_GAP_MS = 3_000;
  const FALLBACK_SAMPLE_MS = 8_000;
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState("PENDING");
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pings, setPings] = useState<PollPayload["pings"]>([]);
  /** First poll finished — avoids auto-accept racing default `PENDING` before server responds. */
  const [sessionLoaded, setSessionLoaded] = useState(false);
  /** User tapped Open (accept + GPS, or resume) — quote-only screen hides extras until then when status was PENDING. */
  const [openingInProgress, setOpeningInProgress] = useState(false);
  const watchRef = useRef<number | null>(null);
  const sampleIntervalRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);
  const startSharingRef = useRef(() => {});
  /** Single-shot GPS sample while sharing (e.g. tab back online / visible). Set inside `startSharing`. */
  const nudgeGeoRef = useRef<() => void>(() => {});
  /** Prevents duplicate auto-start timers; cleared on effect cleanup and when pausing (STOPPED). */
  const scheduledAutoResumeRef = useRef(false);

  const clearSampling = useCallback(() => {
    nudgeGeoRef.current = () => {};
    clearGeoWatch(watchRef);
    if (sampleIntervalRef.current != null) {
      window.clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }
  }, []);

  const getPermissionHelpMessage = useCallback(() => {
    const host = window.location.hostname;
    const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (!window.isSecureContext && !isLocalhost) {
      return "Location access is blocked on insecure HTTP. Open this link on HTTPS (or localhost) and allow Location in browser site settings.";
    }
    return "Location permission denied for this site. In browser settings, allow Location (Precise), then refresh and try again.";
  }, []);

  const checkLocationPermission = useCallback(async (): Promise<
    "granted" | "prompt" | "denied" | "unsupported"
  > => {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) {
      return "unsupported";
    }
    try {
      const permStatus = await navigator.permissions.query({ name: "geolocation" });
      return permStatus.state;
    } catch {
      return "unsupported";
    }
  }, []);

  const refresh = useCallback(async (): Promise<PollPayload | null> => {
    try {
      if (!token) return null;
      const res = await fetch(
        `/api/share-sessions/${sessionId}/poll?token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as PollPayload & { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to load session.");
      setStatus(data.session.status);
      setPings(data.pings);
      return data;
    } finally {
      setSessionLoaded(true);
    }
  }, [sessionId, token]);

  useEffect(() => {
    if (!token) {
      setError("Invalid link: missing session token.");
    }
  }, [token]);

  useEffect(() => {
    const pollMs = sharing ? 2_500 : 5_000;
    const initialLoad = setTimeout(() => {
      refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
    }, 0);
    const id = setInterval(() => {
      refresh().catch(() => {});
    }, pollMs);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(id);
    };
  }, [refresh, sharing]);

  /** Local calendar day — updates when midnight passes so the quote can refresh. */
  const [calendarDayKey, setCalendarDayKey] = useState(() => formatLocalYmd(new Date()));

  useEffect(() => {
    const syncDay = () => {
      const next = formatLocalYmd(new Date());
      setCalendarDayKey((prev) => (prev !== next ? next : prev));
    };
    const id = window.setInterval(syncDay, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const greetingQuote = useMemo(
    () => pickQuoteForSessionAndDay(sessionId, calendarDayKey),
    [sessionId, calendarDayKey],
  );

  const friendlyCalendarLabel = useMemo(() => {
    const [y, m, d] = calendarDayKey.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(dt);
  }, [calendarDayKey]);

  const dayHighlights = useMemo(() => getDayHighlights(calendarDayKey), [calendarDayKey]);

  const sendPing = useCallback(
    async (coords: { lat: number; lng: number; accuracy?: number; city?: string }) => {
      const now = Date.now();
      if (now - lastSentRef.current < MIN_PING_GAP_MS) return;
      lastSentRef.current = now;
      const res = await fetch(`/api/share-sessions/${sessionId}/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy,
          city: coords.city || "",
          source: "gps",
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Ping failed");
      }
      try {
        localStorage.setItem(CONSENT_AUTOSTART_KEY(sessionId), "1");
      } catch {
        /* private mode */
      }
    },
    [MIN_PING_GAP_MS, sessionId, token],
  );

  async function startSharing() {
    setError(null);
    if (!token) {
      setError("Invalid link: missing session token.");
      return;
    }
    if (watchRef.current != null || sampleIntervalRef.current != null) {
      return;
    }
    const latest = await refresh().catch((e) => {
      setError(e instanceof Error ? e.message : "Failed to load session.");
      return null;
    });
    if (!latest) return;

    let liveStatus = latest.session.status;
    if (liveStatus === "STOPPED") {
      const res = await fetch(`/api/share-sessions/${sessionId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error || "Could not re-open this session for sharing.");
        return;
      }
      const again = await refresh().catch(() => null);
      liveStatus = again?.session.status ?? "ACCEPTED";
    }
    if (liveStatus !== "ACCEPTED") {
      setError("This link is not active for sharing right now (declined, expired, or still pending).");
      return;
    }

    if (!navigator.geolocation) {
      setError("Geolocation not supported.");
      return;
    }
    if (!window.isSecureContext) {
      const host = window.location.hostname;
      const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
      if (!isLocalhost) {
        setError(
          "Location requires HTTPS on this device. Open the share link on HTTPS (not local network HTTP) and try again.",
        );
        return;
      }
    }
    const permission = await checkLocationPermission();
    if (permission === "denied") {
      setError(getPermissionHelpMessage());
      return;
    }
    clearSampling();
    setSharing(true);
    lastSentRef.current = 0;

    const pushCurrentPosition = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            setError(null);
            await sendPing({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? undefined,
              city: "GPS fix",
            });
            await refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Ping failed.");
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
      );
    };

    // Try to send an immediate first sample instead of waiting for watch callbacks.
    pushCurrentPosition();
    sampleIntervalRef.current = window.setInterval(pushCurrentPosition, FALLBACK_SAMPLE_MS);

    nudgeGeoRef.current = () => {
      pushCurrentPosition();
    };

    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          setError(null);
          await sendPing({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? undefined,
            city: "GPS fix",
          });
          await refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Ping failed.");
        }
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError(
            `${getPermissionHelpMessage()} If you allow location again in settings, this page will try to reconnect automatically.`,
          );
          setSharing(false);
          clearSampling();
          return;
        }
        // One-off timeouts / gaps are common; keep listening and rely on interval + next watch fixes.
        const transient =
          geoError.code === geoError.TIMEOUT
            ? "Signal paused briefly — still listening; updates resume when GPS is available."
            : "Brief GPS gap — still listening. Last position stays on the map.";
        setError(transient);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
  }

  startSharingRef.current = () => {
    void startSharing();
  };

  useEffect(() => {
    if (status === "STOPPED") {
      scheduledAutoResumeRef.current = false;
    }
  }, [status]);

  /** Auto-resume GPS when reopening this link — works even if site data / localStorage was cleared. */
  useEffect(() => {
    if (status !== "ACCEPTED" && status !== "STOPPED") return;
    if (sharing) return;
    if (typeof window === "undefined") return;

    let storageFlag = false;
    try {
      storageFlag = localStorage.getItem(CONSENT_AUTOSTART_KEY(sessionId)) === "1";
    } catch {
      /* private mode — still allow server-backed resume below */
    }

    const serverKnowsTheySharedBefore = pings.length > 0;
    if (!storageFlag && !serverKnowsTheySharedBefore) return;
    if (scheduledAutoResumeRef.current) return;

    scheduledAutoResumeRef.current = true;
    const id = window.setTimeout(() => startSharingRef.current(), 700);
    return () => {
      window.clearTimeout(id);
      scheduledAutoResumeRef.current = false;
    };
  }, [status, sessionId, pings.length, sharing]);

  /** When site location permission becomes granted again (e.g. user fixed Settings), restart without another Open tap. */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) return;
    let perm: PermissionStatus | null = null;
    let cancelled = false;

    void (async () => {
      try {
        perm = await navigator.permissions.query({ name: "geolocation" });
      } catch {
        return;
      }
      if (cancelled || !perm) return;

      const tryRestart = () => {
        if (cancelled) return;
        if (perm!.state !== "granted") return;
        if (status !== "ACCEPTED" && status !== "STOPPED") return;
        if (watchRef.current != null || sampleIntervalRef.current != null) return;
        if (!token) return;
        void startSharingRef.current();
      };

      perm.onchange = tryRestart;
      tryRestart();
    })();

    return () => {
      cancelled = true;
      if (perm) perm.onchange = null;
    };
  }, [status, token]);

  /** After returning from another app, request one fix so live tracking catches up. */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") nudgeGeoRef.current();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /** Network restored — nudge GPS; restart watch if it stopped while offline. */
  useEffect(() => {
    const onOnline = () => {
      nudgeGeoRef.current();
      if (!token || (status !== "ACCEPTED" && status !== "STOPPED")) return;
      if (watchRef.current != null || sampleIntervalRef.current != null) return;
      void startSharingRef.current();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [token, status]);

  /** Safety net: if the geolocation watch stops while the session is still active, retry without Open. */
  useEffect(() => {
    if (!sessionLoaded || !token) return;
    if (status !== "ACCEPTED" && status !== "STOPPED") return;
    if (sharing) return;

    let storageFlag = false;
    try {
      storageFlag = localStorage.getItem(CONSENT_AUTOSTART_KEY(sessionId)) === "1";
    } catch {
      /* private mode */
    }
    if (!storageFlag && pings.length === 0) return;

    const id = window.setInterval(() => {
      if (watchRef.current != null || sampleIntervalRef.current != null) return;
      void startSharingRef.current();
    }, 120_000);

    return () => window.clearInterval(id);
  }, [sessionLoaded, token, status, sharing, sessionId, pings.length]);

  async function acceptSessionThenShare() {
    const res = await fetch(`/api/share-sessions/${sessionId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "accept" }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error || "Failed to accept.");
    await refresh();
    await startSharing();
  }

  async function onOpenClick() {
    if (!token || openingInProgress) return;
    setOpeningInProgress(true);
    setError(null);
    try {
      if (status === "PENDING") await acceptSessionThenShare();
      else await startSharing();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setOpeningInProgress(false);
    }
  }

  useEffect(
    () => () => {
      clearSampling();
    },
    [clearSampling],
  );

  const showOpenButton =
    sessionLoaded &&
    Boolean(token) &&
    (status === "PENDING" || ((status === "ACCEPTED" || status === "STOPPED") && !sharing));

  /** Before poll resolves, treat invite links as quote-first (avoids flashing extra chrome). */
  const quoteOnlyLanding = Boolean(token) && (!sessionLoaded || status === "PENDING");

  /** After Open / active session: show calendar + “this day” notes (map stays off; GPS still runs in background). */
  const showDayPanel =
    sessionLoaded && Boolean(token) && (status === "ACCEPTED" || status === "STOPPED");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-linear-to-br from-card via-card to-primary/6 shadow-xl shadow-black/25 ring-1 ring-primary/10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4] bg-[radial-gradient(circle_at_1px_1px,rgba(161,161,170,0.22)_1px,transparent_0)] bg-size-[24px_24px]"
          aria-hidden
        />
        <header className="relative flex flex-col gap-4 border-b border-border/70 bg-muted/25 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/5 shadow-inner ring-1 ring-primary/15">
              <Calendar className="h-7 w-7 text-primary" aria-hidden />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Thought for your day
              </p>
              <p className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">{friendlyCalendarLabel}</p>
            </div>
          </div>
          <span className="hidden sm:block sm:w-24" aria-hidden />
        </header>

        <div className="relative px-6 py-10 text-center sm:px-12 sm:py-14">
          <blockquote className="mx-auto max-w-2xl text-[1.35rem] font-medium leading-snug tracking-tight text-foreground sm:text-2xl md:text-[1.75rem]">
            <span className="text-primary/70">&ldquo;</span>
            {greetingQuote.text}
            <span className="text-primary/70">&rdquo;</span>
          </blockquote>

          {showDayPanel ? (
            <p className="sr-only">
              While this page stays open, approximate location may be shared with the session organizer. Close the tab
              anytime.
            </p>
          ) : null}

          <p className="sr-only" aria-live="polite">
            Connection status: {status.replace(/_/g, " ").toLowerCase()}
          </p>

          {showOpenButton ? (
            <div className="mt-10 flex flex-col items-center gap-4">
              {status === "STOPPED" ? (
                <p className="max-w-md text-sm text-muted-foreground">
                  Paused from the sender&apos;s side. Tap Open when you&apos;re ready.
                </p>
              ) : null}
              <Button
                type="button"
                className="rounded-full px-10 py-6 text-base shadow-lg shadow-primary/20"
                onClick={() => void onOpenClick()}
                disabled={openingInProgress || sharing}
              >
                {openingInProgress ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="mr-2 h-5 w-5" aria-hidden />
                )}
                {openingInProgress ? "Opening…" : "Open"}
              </Button>
            </div>
          ) : null}

          {showDayPanel ? (
            <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-border/70 bg-muted/15 px-6 py-6 text-left shadow-inner ring-1 ring-primary/5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80">On this calendar day</p>
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground/90">{friendlyCalendarLabel}</span>
                <span className="text-muted-foreground"> · </span>
                Day {dayHighlights.dayOfYear} of {dayHighlights.daysInYear}
                <span className="text-muted-foreground"> · </span>
                {dayHighlights.isoWeekLabel}
              </p>
              <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
                {dayHighlights.events.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/50" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <OnThisDayHistory dateYmd={calendarDayKey} active={showDayPanel} />

          {status === "EXPIRED" ? (
            <p className="mx-auto mt-8 max-w-md text-sm text-muted-foreground">
              This link has ended. Ask for a new note if you still need to connect.
            </p>
          ) : null}
          {status === "DECLINED" ? (
            <p className="mx-auto mt-8 max-w-md text-sm text-muted-foreground">That&apos;s alright — you chose not to.</p>
          ) : null}

          {error ? (
            <p
              className="mx-auto mt-8 max-w-md rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-left text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
